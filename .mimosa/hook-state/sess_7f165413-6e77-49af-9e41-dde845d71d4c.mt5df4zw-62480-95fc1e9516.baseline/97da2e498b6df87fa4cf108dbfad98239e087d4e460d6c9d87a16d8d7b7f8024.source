//! Owns a Windows Job Object for one spawned agent process tree.
//!
//! Closing the job handle is the failure path: Windows terminates every
//! process assigned to the job when `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` is
//! set. No arbitrary PID is accepted, so cleanup cannot affect unrelated
//! processes.

use std::process::Child;

#[cfg(windows)]
use std::mem::size_of;
#[cfg(windows)]
use std::os::windows::io::AsRawHandle;

#[cfg(windows)]
use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, HANDLE};
#[cfg(windows)]
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
    SetInformationJobObject, JOBOBJECT_BASIC_LIMIT_INFORMATION,
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};

pub struct ProcessSupervisor {
    #[cfg(windows)]
    job: HANDLE,
}

// A Job Object handle is an owned kernel handle. It is safe to move the
// owner between threads; only the owner closes it, and Windows applies the
// kill-on-close policy to the assigned process tree at that point.
#[cfg(windows)]
unsafe impl Send for ProcessSupervisor {}
#[cfg(windows)]
unsafe impl Sync for ProcessSupervisor {}

impl ProcessSupervisor {
    pub fn attach(child: &Child) -> Result<Self, String> {
        #[cfg(windows)]
        {
            // SAFETY: null security attributes/name asks Windows for a private
            // unnamed job owned by this process. The returned handle is closed
            // by Drop below.
            let job = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
            if job.is_null() {
                return Err(format!("CreateJobObjectW failed: {}", unsafe {
                    GetLastError()
                }));
            }

            let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
                BasicLimitInformation: JOBOBJECT_BASIC_LIMIT_INFORMATION {
                    LimitFlags: JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
                    ..unsafe { std::mem::zeroed() }
                },
                ..unsafe { std::mem::zeroed() }
            };
            // SAFETY: `limits` is initialized above and the size matches the
            // structure Windows expects for this information class.
            let configured = unsafe {
                SetInformationJobObject(
                    job,
                    JobObjectExtendedLimitInformation,
                    (&mut limits as *mut JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
                    size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                )
            };
            if configured == 0 {
                let error = unsafe { GetLastError() };
                unsafe { CloseHandle(job) };
                return Err(format!("SetInformationJobObject failed: {error}"));
            }

            let assigned =
                unsafe { AssignProcessToJobObject(job, child.as_raw_handle() as HANDLE) };
            if assigned == 0 {
                let error = unsafe { GetLastError() };
                unsafe { CloseHandle(job) };
                return Err(format!("AssignProcessToJobObject failed: {error}"));
            }
            return Ok(Self { job });
        }

        #[cfg(not(windows))]
        {
            let _ = child;
            Ok(Self {})
        }
    }
}

#[cfg(windows)]
impl Drop for ProcessSupervisor {
    fn drop(&mut self) {
        // SAFETY: `job` was returned by CreateJobObjectW and is owned by this
        // instance. Closing it triggers kill-on-close for assigned processes.
        unsafe { CloseHandle(self.job) };
    }
}

#[cfg(test)]
mod tests {
    use super::ProcessSupervisor;
    use std::process::{Command, Stdio};
    use std::thread;
    use std::time::{Duration, Instant};

    #[cfg(windows)]
    #[test]
    fn closing_the_supervisor_terminates_its_owned_process_tree() {
        let mut child = Command::new("cmd.exe")
            .args(["/C", "timeout /T 30 /NOBREAK >NUL"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn test child");
        let supervisor = ProcessSupervisor::attach(&child).expect("assign test child to job");
        drop(supervisor);

        let deadline = Instant::now() + Duration::from_secs(3);
        loop {
            if child.try_wait().expect("poll test child").is_some() {
                return;
            }
            if Instant::now() >= deadline {
                let _ = child.kill();
                let _ = child.wait();
                panic!("job close did not terminate the child promptly");
            }
            thread::sleep(Duration::from_millis(25));
        }
    }

    #[test]
    fn attaches_to_a_spawned_process() {
        let mut child = if cfg!(windows) {
            Command::new("cmd.exe")
                .args(["/C", "exit 0"])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .expect("spawn windows test child")
        } else {
            Command::new("sh")
                .args(["-c", "exit 0"])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .expect("spawn unix test child")
        };
        let supervisor = ProcessSupervisor::attach(&child).expect("attach process supervisor");
        let _ = child.wait();
        drop(supervisor);
    }
}
