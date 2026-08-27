// Tauri's `#[command]` macro requires arguments by value (owned `String`,
// `State<'_, _>`, `AppHandle`) for deserialization from the frontend
// invoke payload. Suppress the related pedantic lints at module scope so
// command signatures stay idiomatic for the Tauri API.
#![allow(clippy::needless_pass_by_value)]

mod git;
mod git_watcher;
mod host;
mod local_frame;
mod process_supervisor;

#[tauri::command]
fn snapshot_take(
    session_id: String,
    turn_number: u32,
    bridge: State<'_, HostBridge>,
) -> Result<serde_json::Value, String> {
    bridge.request(
        &session_id,
        "snapshot.take",
        serde_json::json!({ "sessionId": session_id, "turnNumber": turn_number }),
    )
}

#[tauri::command]
fn snapshot_list(
    session_id: String,
    bridge: State<'_, HostBridge>,
) -> Result<serde_json::Value, String> {
    bridge.request(
        &session_id,
        "snapshot.list",
        serde_json::json!({ "sessionId": session_id }),
    )
}

#[tauri::command]
fn snapshot_rollback(
    session_id: String,
    commit_hash: String,
    bridge: State<'_, HostBridge>,
) -> Result<serde_json::Value, String> {
    bridge.request(
        &session_id,
        "snapshot.rollback",
        serde_json::json!({ "sessionId": session_id, "commitHash": commit_hash }),
    )
}

#[cfg(test)]
mod contract_vectors;

use git_watcher::GitWatcherState;
use host::HostBridge;
use tauri::{Manager, State};

/// Route a renderer command through the compiled Host and its local protocol.
#[tauri::command]
fn send_command(
    session_id: String,
    json: String,
    bridge: State<'_, HostBridge>,
) -> Result<(), String> {
    bridge.send_command(&session_id, &json)
}

/// Start an omp process for a new tab session.
/// `cwd`: absolute path to the project folder (empty string = omp's default).
#[tauri::command]
fn start_session(
    session_id: String,
    cwd: String,
    bridge: State<'_, HostBridge>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let cwd_opt = if cwd.is_empty() { None } else { Some(cwd) };
    bridge.start_session(session_id, cwd_opt.as_deref(), app)
}

/// Kill the omp process for a tab session.
#[tauri::command]
fn stop_session(session_id: String, bridge: State<'_, HostBridge>) {
    bridge.stop_session(&session_id);
}

/// Query a session's last error. Returns `None` if the session is
/// running (or has never been started under this id), `Some(reason)`
/// if its last `start_session` attempt failed.
///
/// This replaces a previous timing-fragile pattern that emitted a
/// delayed `agent://exit/{id}` after a fixed sleep, hoping the
/// frontend listener was attached in time. The frontend can now query
/// this synchronously on activation and surface the real reason.
#[tauri::command]
fn session_status(session_id: String, bridge: State<'_, HostBridge>) -> Option<String> {
    bridge.last_error(&session_id)
}

/// Native folder picker — returns the chosen path or null.
///
/// On macOS, `AppKit` requires all `NSOpenPanel` calls to originate from
/// the main thread. `blocking_pick_folder` invokes the dialog directly
/// on the calling command-handler thread — an `AppKit` threading-model
/// violation that causes an indefinite hang (spinning beach ball + high CPU).
///
/// The callback-based `pick_folder` dispatches the dialog to the main
/// thread correctly. We bridge the callback to our async context with
/// an `mpsc` channel + `spawn_blocking` so the async executor is never
/// stalled.
#[tauri::command]
async fn open_project(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = std::sync::mpsc::channel();
    // Use into_path() rather than to_string() so we get a real PathBuf
    // and convert through to_string_lossy(). Avoids platform-specific
    // FilePath::to_string formatting (URL encoding, UNC prefix quirks)
    // that could diverge from what std::fs and the rest of the app
    // expect downstream.
    app.dialog()
        .file()
        .set_title("Open Project Folder")
        .pick_folder(move |result| {
            let _ = tx.send(result);
        });
    let picked = tauri::async_runtime::spawn_blocking(move || rx.recv())
        .await
        .map_err(|e| format!("join error: {e}"))?
        .map_err(|e| format!("channel error: {e}"))?;
    let Some(picked) = picked else {
        return Ok(None);
    };
    let path = picked
        .into_path()
        .map_err(|e| format!("invalid picked path: {e}"))?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

/// Start watching `.git/HEAD` for a session's project path.
///
/// Returns the short branch name at call time, or `None` when `path` is
/// not inside a git repo or HEAD is detached.  The watcher fires
/// `"git://branch/{session_id}"` events on every subsequent HEAD change.
/// Watcher errors are silently ignored — the branch chip simply won't
/// update live.
#[tauri::command]
fn start_git_watch(
    session_id: String,
    path: String,
    watcher: State<'_, GitWatcherState>,
    app: tauri::AppHandle,
) -> Option<String> {
    let p = std::path::Path::new(&path);
    let (branch, head) = git::probe(p);
    if let Some(h) = head {
        let _ = watcher.start(&session_id, p, h, app);
    }
    branch
}

/// Stop the HEAD watcher for a session.  No-op when none is active.
#[tauri::command]
fn stop_git_watch(session_id: String, watcher: State<'_, GitWatcherState>) {
    watcher.stop(&session_id);
}

/// Open a URL in the system default browser.
/// Uses the `open` crate (`ShellExecute` on Windows, `xdg-open` on Linux, `open` on macOS).
/// `window.open(url, "_blank")` creates a Tauri webview instead — this is the correct
/// path for OAuth flows and any external URL that must open in the user's real browser.
#[tauri::command]
fn open_url_external(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_sessions(
    session_id: String,
    bridge: State<'_, HostBridge>,
) -> Result<serde_json::Value, String> {
    bridge.request(&session_id, "session.list", serde_json::json!({}))
}

#[tauri::command]
fn load_session_messages(
    session_id: String,
    target_session_id: String,
    cursor: Option<String>,
    limit: u32,
    bridge: State<'_, HostBridge>,
) -> Result<serde_json::Value, String> {
    bridge.request(
        &session_id,
        "session.messages",
        serde_json::json!({ "sessionId": target_session_id, "cursor": cursor, "limit": limit }),
    )
}

#[tauri::command]
fn get_messages_page(
    session_id: String,
    target_session_id: String,
    cursor: Option<String>,
    limit: u32,
    bridge: State<'_, HostBridge>,
) -> Result<serde_json::Value, String> {
    bridge.request(
        &session_id,
        "get_messages_page",
        serde_json::json!({ "sessionId": target_session_id, "cursor": cursor, "limit": limit }),
    )
}
#[tauri::command]
fn fork_session(
    session_id: String,
    target_session_id: String,
    bridge: State<'_, HostBridge>,
) -> Result<serde_json::Value, String> {
    bridge.request(
        &session_id,
        "session.fork",
        serde_json::json!({ "sessionId": target_session_id }),
    )
}

#[tauri::command]
fn session_views(
    session_id: String,
    bridge: State<'_, HostBridge>,
) -> Result<serde_json::Value, String> {
    bridge.request(&session_id, "session.views", serde_json::json!({}))
}

#[tauri::command]
fn session_metadata_set(
    session_id: String,
    target_session_id: String,
    patch: serde_json::Value,
    bridge: State<'_, HostBridge>,
) -> Result<serde_json::Value, String> {
    bridge.request(
        &session_id,
        "session.metadata.set",
        serde_json::json!({ "sessionId": target_session_id, "patch": patch }),
    )
}

#[tauri::command]
fn session_open_runtime(
    session_id: String,
    target_session_id: String,
    bridge: State<'_, HostBridge>,
) -> Result<serde_json::Value, String> {
    bridge.request(
        &session_id,
        "session.open_runtime",
        serde_json::json!({
            "routeSessionId": session_id,
            "sessionId": target_session_id,
        }),
    )
}

#[tauri::command]
fn workspace_changes(
    session_id: String,
    bridge: State<'_, HostBridge>,
) -> Result<serde_json::Value, String> {
    bridge.request(&session_id, "workspace.status", serde_json::json!({}))
}

#[tauri::command]
fn workspace_apply(
    session_id: String,
    path: String,
    action: String,
    bridge: State<'_, HostBridge>,
) -> Result<serde_json::Value, String> {
    bridge.request(
        &session_id,
        "workspace.apply",
        serde_json::json!({ "path": path, "action": action }),
    )
}

#[tauri::command]
fn workspace_diff(
    session_id: String,
    path: String,
    bridge: State<'_, HostBridge>,
) -> Result<serde_json::Value, String> {
    bridge.request(
        &session_id,
        "workspace.diff",
        serde_json::json!({ "path": path }),
    )
}

#[tauri::command]
fn events_replay(
    session_id: String,
    after_seq: f64,
    bridge: State<'_, HostBridge>,
) -> Result<serde_json::Value, String> {
    bridge.request(
        &session_id,
        "events.replay",
        serde_json::json!({ "afterSeq": after_seq }),
    )
}

#[tauri::command]
fn approval_rules_list(
    session_id: String,
    bridge: State<'_, HostBridge>,
) -> Result<serde_json::Value, String> {
    bridge.request(&session_id, "approval.rules.list", serde_json::json!({}))
}

#[tauri::command]
fn approval_rules_add(
    session_id: String,
    target_session_id: String,
    tool: String,
    scope: String,
    source_interaction_id: Option<String>,
    bridge: State<'_, HostBridge>,
) -> Result<serde_json::Value, String> {
    bridge.request(
        &session_id,
        "approval.rules.add",
        serde_json::json!({
            "sessionId": target_session_id,
            "tool": tool,
            "scope": scope,
            "sourceInteractionId": source_interaction_id,
        }),
    )
}

#[tauri::command]
fn approval_rules_remove(
    session_id: String,
    rule_id: String,
    bridge: State<'_, HostBridge>,
) -> Result<serde_json::Value, String> {
    bridge.request(
        &session_id,
        "approval.rules.remove",
        serde_json::json!({ "id": rule_id }),
    )
}

fn harness_inspection_request() -> (&'static str, serde_json::Value) {
    ("harness.inspect", serde_json::json!({}))
}

#[tauri::command]
fn inspect_harness(
    session_id: String,
    bridge: State<'_, HostBridge>,
) -> Result<serde_json::Value, String> {
    let (request_type, args) = harness_inspection_request();
    bridge.request(&session_id, request_type, args)
}

/// Fixed wire shape for the human-governed preview request. The renderer
/// supplies only operation/title/content (+ targetId for replace); project
/// binding, scope, compatibility, timestamps, and evidence are derived by the
/// Desktop Host.
fn harness_preview_request(
    operation: &str,
    title: &str,
    content: &str,
    target_id: Option<&str>,
) -> (&'static str, serde_json::Value) {
    let args = match target_id {
        Some(target) => serde_json::json!({
            "operation": operation,
            "title": title,
            "content": content,
            "targetId": target
        }),
        None => serde_json::json!({ "operation": operation, "title": title, "content": content }),
    };
    ("harness.preview", args)
}

#[tauri::command]
fn preview_harness_memory(
    session_id: String,
    operation: String,
    title: String,
    content: String,
    target_id: Option<String>,
    bridge: State<'_, HostBridge>,
) -> Result<serde_json::Value, String> {
    let (request_type, args) =
        harness_preview_request(&operation, &title, &content, target_id.as_deref());
    bridge.request(&session_id, request_type, args)
}

/// The exact Host-built preview travels back unchanged next to an explicit
/// approval object; no project context is accepted or re-derived here.
fn harness_apply_request(
    preview: serde_json::Value,
    approved_by: &str,
    reason: &str,
) -> (&'static str, serde_json::Value) {
    (
        "harness.apply",
        serde_json::json!({
            "preview": preview,
            "approval": { "approvedBy": approved_by, "reason": reason }
        }),
    )
}

#[tauri::command]
fn apply_harness_memory(
    session_id: String,
    preview: serde_json::Value,
    approved_by: String,
    reason: String,
    bridge: State<'_, HostBridge>,
) -> Result<serde_json::Value, String> {
    let (request_type, args) = harness_apply_request(preview, &approved_by, &reason);
    bridge.request(&session_id, request_type, args)
}

fn harness_rollback_request(reason: &str) -> (&'static str, serde_json::Value) {
    ("harness.rollback", serde_json::json!({ "reason": reason }))
}

#[tauri::command]
fn rollback_harness(
    session_id: String,
    reason: String,
    bridge: State<'_, HostBridge>,
) -> Result<serde_json::Value, String> {
    let (request_type, args) = harness_rollback_request(&reason);
    bridge.request(&session_id, request_type, args)
}

/// Run the Tauri application. Panics if the runtime fails to initialise.
///
/// # Panics
///
/// Panics if `tauri::Builder::run` returns an error (e.g. the webview
/// runtime cannot be initialised). This is a fatal startup condition;
/// there is no meaningful recovery from inside `main`.
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(HostBridge::new())
        .manage(GitWatcherState::new())
        .invoke_handler(tauri::generate_handler![
            send_command,
            start_session,
            stop_session,
            session_status,
            list_sessions,
            get_messages_page,
            load_session_messages,
            fork_session,
            session_views,
            session_metadata_set,
            session_open_runtime,
            workspace_changes,
            workspace_apply,
            workspace_diff,
            snapshot_take,
            snapshot_list,
            snapshot_rollback,
            events_replay,
            approval_rules_list,
            approval_rules_add,
            approval_rules_remove,
            inspect_harness,
            preview_harness_memory,
            apply_harness_memory,
            rollback_harness,
            open_project,
            start_git_watch,
            stop_git_watch,
            open_url_external,
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            if let Some(win) = app.get_webview_window("main") {
                win.open_devtools();
            }
            // Start the default session (no cwd = omp's working directory).
            // The renderer binds this route before loading session views.
            //
            // Failure handling: the bridge caches the spawn error keyed
            // by session_id. The renderer's initial route activation queries
            // session_status on attach and surfaces the cached reason
            // if any — no event timing race, no delayed emit thread.
            let bridge = app.state::<HostBridge>();
            if let Err(e) = bridge.start_session("default".into(), None, app.handle().clone()) {
                eprintln!("[omp-desktop] failed to start default Host session: {e}");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod harness_command_tests {
    use super::{
        harness_apply_request, harness_inspection_request, harness_preview_request,
        harness_rollback_request,
    };

    #[test]
    fn exposes_a_dedicated_read_only_harness_command() {
        let (request_type, args) = harness_inspection_request();
        assert_eq!(request_type, "harness.inspect");
        assert_eq!(args, serde_json::json!({}));
    }

    #[test]
    fn preview_request_carries_only_the_minimal_fields() {
        let (request_type, replace) =
            harness_preview_request("memory.replace", "T", "C", Some("memory-existing"));
        assert_eq!(request_type, "harness.preview");
        assert_eq!(
            replace,
            serde_json::json!({
                "operation": "memory.replace",
                "title": "T",
                "content": "C",
                "targetId": "memory-existing"
            })
        );
        let (_, add) = harness_preview_request("memory.add", "T", "C", None);
        assert_eq!(
            add,
            serde_json::json!({ "operation": "memory.add", "title": "T", "content": "C" })
        );
    }

    #[test]
    fn apply_request_wraps_an_explicit_approval_without_context_fields() {
        let preview =
            serde_json::json!({ "operation": "memory.add", "digest": { "sha256": "ab" } });
        let (request_type, args) =
            harness_apply_request(preview, "human-reviewer", "Approved after review");
        assert_eq!(request_type, "harness.apply");
        assert_eq!(
            args,
            serde_json::json!({
                "preview": { "operation": "memory.add", "digest": { "sha256": "ab" } },
                "approval": { "approvedBy": "human-reviewer", "reason": "Approved after review" }
            })
        );
    }

    #[test]
    fn rollback_request_carries_only_the_reason() {
        let (request_type, args) = harness_rollback_request("user requested revert");
        assert_eq!(request_type, "harness.rollback");
        assert_eq!(
            args,
            serde_json::json!({ "reason": "user requested revert" })
        );
    }
}
