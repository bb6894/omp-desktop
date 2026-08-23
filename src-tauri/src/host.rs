use std::collections::HashMap;
use std::env;
use std::io::{BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};

use crate::local_frame::{encode_local_frame, read_local_frame};
use crate::process_supervisor::ProcessSupervisor;

const HOST_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

struct HostInner {
    gen: u64,
    stdin: Option<Arc<Mutex<ChildStdin>>>,
    supervisor: Option<ProcessSupervisor>,
    child: Option<Child>,
}

type Pending = Arc<Mutex<HashMap<String, Sender<Result<Value, String>>>>>;

/// Tauri's process boundary. It owns one compiled TypeScript Host per tab;
/// the Host owns the verified OMP Runtime process tree.
pub struct HostBridge {
    sessions: Arc<Mutex<HashMap<String, HostInner>>>,
    last_errors: Arc<Mutex<HashMap<String, String>>>,
    pending: Pending,
    command_ids: Arc<Mutex<HashMap<String, (String, String)>>>,
    next_gen: AtomicU64,
    next_request: AtomicU64,
}

impl HostBridge {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            last_errors: Arc::new(Mutex::new(HashMap::new())),
            pending: Arc::new(Mutex::new(HashMap::new())),
            command_ids: Arc::new(Mutex::new(HashMap::new())),
            next_gen: AtomicU64::new(1),
            next_request: AtomicU64::new(1),
        }
    }

    pub fn start_session(
        &self,
        session_id: String,
        cwd: Option<&str>,
        app: AppHandle,
    ) -> Result<(), String> {
        let cwd = cwd
            .map(PathBuf::from)
            .unwrap_or_else(|| env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));
        if !cwd.is_absolute() {
            let error = "project path must be absolute".to_string();
            self.cache_error(&session_id, error.clone());
            return Err(error);
        }

        let mut child = match spawn_host(&app, &cwd) {
            Ok(child) => child,
            Err(error) => {
                self.cache_error(&session_id, error.clone());
                return Err(error);
            }
        };
        let supervisor = match ProcessSupervisor::attach(&child) {
            Ok(supervisor) => supervisor,
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                self.cache_error(&session_id, error.clone());
                return Err(error);
            }
        };
        let stdin = child.stdin.take().expect("host stdin piped");
        let stdout = child.stdout.take().expect("host stdout piped");
        let stderr = child.stderr.take().expect("host stderr piped");
        let stdin = Arc::new(Mutex::new(stdin));
        let gen = self.next_gen.fetch_add(1, Ordering::SeqCst);

        let previous = {
            let mut sessions = self
                .sessions
                .lock()
                .map_err(|_| "host session lock poisoned".to_string())?;
            sessions.insert(
                session_id.clone(),
                HostInner {
                    gen,
                    stdin: Some(stdin),
                    supervisor: Some(supervisor),
                    child: Some(child),
                },
            )
        };
        if let Some(previous) = previous {
            reap_host(previous);
        }

        self.clear_error(&session_id);
        spawn_stdout_reader(
            self.sessions.clone(),
            self.pending.clone(),
            self.command_ids.clone(),
            session_id.clone(),
            gen,
            app.clone(),
            stdout,
        );
        spawn_stderr_reader(session_id, stderr);
        Ok(())
    }

    pub fn stop_session(&self, session_id: &str) {
        let removed = self
            .sessions
            .lock()
            .ok()
            .and_then(|mut sessions| sessions.remove(session_id));
        if let Some(inner) = removed {
            reap_host(inner);
        }
        self.clear_error(session_id);
    }

    /// Adapt the existing renderer command surface to the Host protocol.
    /// The renderer still sends a JSON OMP command, but it never reaches OMP
    /// directly: Rust wraps it as an allowlisted `agent.command` request.
    pub fn send_command(&self, session_id: &str, json_command: &str) -> Result<(), String> {
        let command: Value = serde_json::from_str(json_command)
            .map_err(|_| "frontend command is not valid JSON".to_string())?;
        if !command.is_object() {
            return Err("frontend command must be a JSON object".to_string());
        }
        let request_id = self.new_request_id();
        let client_id = command
            .get("id")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned);
        let request = json!({
            "type": "agent.command",
            "requestId": request_id,
            "sessionId": session_id,
            "command": command
        });
        if let Some(client_id) = client_id {
            self.command_ids
                .lock()
                .map_err(|_| "host command id lock poisoned".to_string())?
                .insert(
                    request_id.clone(),
                    (
                        client_id,
                        command
                            .get("type")
                            .and_then(Value::as_str)
                            .unwrap_or("unknown")
                            .to_string(),
                    ),
                );
        }
        if let Err(error) = self.write_request(session_id, &request) {
            if let Ok(mut ids) = self.command_ids.lock() {
                ids.remove(&request_id);
            }
            return Err(error);
        }
        Ok(())
    }

    pub fn request(
        &self,
        session_id: &str,
        request_type: &str,
        args: Value,
    ) -> Result<Value, String> {
        let request_id = self.new_request_id();
        let mut request = match args {
            Value::Object(object) => Value::Object(object),
            _ => return Err("host request arguments must be an object".to_string()),
        };
        let object = request.as_object_mut().expect("object checked above");
        object.insert("type".to_string(), Value::String(request_type.to_string()));
        object.insert("requestId".to_string(), Value::String(request_id.clone()));
        let (tx, rx) = mpsc::channel();
        self.pending
            .lock()
            .map_err(|_| "host pending lock poisoned".to_string())?
            .insert(request_id.clone(), tx);
        if let Err(error) = self.write_request(session_id, &request) {
            let _ = self
                .pending
                .lock()
                .map(|mut pending| pending.remove(&request_id));
            return Err(error);
        }
        match rx.recv_timeout(HOST_REQUEST_TIMEOUT) {
            Ok(result) => result,
            Err(_) => {
                let _ = self
                    .pending
                    .lock()
                    .map(|mut pending| pending.remove(&request_id));
                Err("HOST_REQUEST_TIMEOUT".to_string())
            }
        }
    }

    pub fn last_error(&self, session_id: &str) -> Option<String> {
        self.last_errors
            .lock()
            .ok()
            .and_then(|errors| errors.get(session_id).cloned())
    }

    fn write_request(&self, session_id: &str, request: &Value) -> Result<(), String> {
        let stdin = {
            let sessions = self
                .sessions
                .lock()
                .map_err(|_| "host session lock poisoned".to_string())?;
            sessions
                .get(session_id)
                .and_then(|inner| inner.stdin.clone())
                .ok_or_else(|| {
                    self.last_error(session_id)
                        .unwrap_or_else(|| format!("session '{session_id}' not found"))
                })?
        };
        let bytes = encode_local_frame(request)?;
        let mut stdin = stdin
            .lock()
            .map_err(|_| "host stdin lock poisoned".to_string())?;
        stdin.write_all(&bytes).map_err(|error| error.to_string())?;
        stdin.flush().map_err(|error| error.to_string())
    }

    fn new_request_id(&self) -> String {
        format!(
            "tauri-{}",
            self.next_request.fetch_add(1, Ordering::Relaxed)
        )
    }

    fn cache_error(&self, session_id: &str, error: String) {
        if let Ok(mut errors) = self.last_errors.lock() {
            errors.insert(session_id.to_string(), error);
        }
    }

    fn clear_error(&self, session_id: &str) {
        if let Ok(mut errors) = self.last_errors.lock() {
            errors.remove(session_id);
        }
    }
}

impl Default for HostBridge {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for HostBridge {
    fn drop(&mut self) {
        if let Ok(mut sessions) = self.sessions.lock() {
            for (_, inner) in sessions.drain() {
                reap_host(inner);
            }
        }
    }
}

fn spawn_stdout_reader(
    sessions: Arc<Mutex<HashMap<String, HostInner>>>,
    pending: Pending,
    command_ids: Arc<Mutex<HashMap<String, (String, String)>>>,
    session_id: String,
    gen: u64,
    app: AppHandle,
    stdout: ChildStdout,
) {
    thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        let mut exit_reason = String::new();
        loop {
            match read_local_frame(&mut reader) {
                Ok(Some(frame)) => {
                    handle_host_frame(&pending, &command_ids, &session_id, &app, frame)
                }
                Ok(None) => break,
                Err(error) => {
                    exit_reason = error;
                    break;
                }
            }
        }
        if let Ok(mut sessions) = sessions.lock() {
            if sessions
                .get(&session_id)
                .is_some_and(|inner| inner.gen == gen)
            {
                sessions.remove(&session_id);
            }
        }
        let event = format!("agent://exit/{session_id}");
        let _ = app.emit(&event, exit_reason);
    });
}

fn handle_host_frame(
    pending: &Pending,
    command_ids: &Arc<Mutex<HashMap<String, (String, String)>>>,
    session_id: &str,
    app: &AppHandle,
    frame: Value,
) {
    if frame.get("type").and_then(Value::as_str) == Some("response") {
        if let Some(request_id) = frame.get("requestId").and_then(Value::as_str) {
            if let Ok(mut pending) = pending.lock() {
                if let Some(sender) = pending.remove(request_id) {
                    let result = if frame.get("ok").and_then(Value::as_bool) == Some(true) {
                        Ok(frame.get("value").cloned().unwrap_or(Value::Null))
                    } else {
                        Err(frame
                            .get("message")
                            .and_then(Value::as_str)
                            .unwrap_or("HOST_REQUEST_FAILED")
                            .to_string())
                    };
                    let _ = sender.send(result);
                }
            }
            let client_id = command_ids
                .lock()
                .ok()
                .and_then(|mut ids| ids.remove(request_id));
            if let Some((client_id, command_type)) = client_id {
                let value = frame.get("value").cloned().unwrap_or(Value::Null);
                let runtime_success = value
                    .get("success")
                    .and_then(Value::as_bool)
                    .unwrap_or(frame.get("ok").and_then(Value::as_bool) == Some(true));
                let command = value
                    .get("command")
                    .cloned()
                    .unwrap_or(Value::String(command_type));
                let data = value.get("data").cloned().unwrap_or_else(|| value.clone());
                let error = value
                    .get("error")
                    .cloned()
                    .or_else(|| frame.get("message").cloned())
                    .unwrap_or(Value::String("HOST_REQUEST_FAILED".to_string()));
                let legacy = json!({
                    "type": "response",
                    "id": client_id,
                    "success": runtime_success,
                    "command": command,
                    "data": data,
                    "error": error
                });
                let event = format!("agent://line/{session_id}");
                let _ = app.emit(&event, legacy.to_string());
            }
        }
        let event = format!("host://response/{session_id}");
        let _ = app.emit(&event, frame);
        return;
    }
    if frame.get("type").and_then(Value::as_str) == Some("event") {
        if frame.get("name").and_then(Value::as_str) == Some("runtime.frame") {
            if let Some(payload) = frame.get("payload") {
                let event = format!("agent://line/{session_id}");
                let _ = app.emit(&event, payload.to_string());
            }
        } else {
            let event = format!("host://event/{session_id}");
            let _ = app.emit(&event, frame);
        }
    }
}

fn spawn_stderr_reader(session_id: String, stderr: impl Read + Send + 'static) {
    thread::spawn(move || {
        let mut reader = BufReader::new(stderr);
        let mut line = String::new();
        loop {
            line.clear();
            match std::io::BufRead::read_line(&mut reader, &mut line) {
                Ok(0) => break,
                Ok(_) => eprintln!("[host/{session_id}] {}", line.trim_end()),
                Err(_) => break,
            }
        }
    });
}

fn reap_host(mut inner: HostInner) {
    inner.stdin = None;
    let supervisor = inner.supervisor.take();
    if let Some(mut child) = inner.child.take() {
        thread::spawn(move || {
            drop(supervisor);
            let _ = child.kill();
            let _ = child.wait();
        });
    }
}

fn spawn_host(app: &AppHandle, cwd: &Path) -> Result<Child, String> {
    let host = resolve_artifact(app, "omp-desktop-host.exe", "OMP_DESKTOP_HOST_PATH")?;
    let runtime = resolve_artifact(app, "omp-windows-x64.exe", "OMP_DESKTOP_RUNTIME_PATH")?;
    let mut command = Command::new(&host);
    command
        .args(["--serve", "--cwd"])
        .arg(cwd)
        .args(["--runtime"])
        .arg(runtime)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .current_dir(cwd);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    command
        .spawn()
        .map_err(|error| format!("failed to spawn compiled Host '{host:?}': {error}"))
}

fn resolve_artifact(app: &AppHandle, name: &str, env_name: &str) -> Result<PathBuf, String> {
    let mut candidates = Vec::new();
    if let Ok(value) = env::var(env_name) {
        candidates.push(PathBuf::from(value));
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join(name));
    }
    if let Ok(current_exe) = env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            candidates.push(parent.join(name));
            if let Some(grandparent) = parent.parent() {
                candidates.push(grandparent.join("artifacts").join(name));
            }
        }
    }
    let manifest_artifacts = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("artifacts")
        .join(name);
    candidates.push(manifest_artifacts);
    candidates.push(PathBuf::from("artifacts").join(name));
    candidates
        .into_iter()
        .find(|path| path.is_file())
        .ok_or_else(|| format!("{name} not found; set {env_name} to an absolute path"))
}
