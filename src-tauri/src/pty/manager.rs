use portable_pty::{CommandBuilder, MasterPty, NativePtySystem, PtySize, PtySystem};
use std::io::Read;
use std::sync::{Arc, Once};
use std::thread;

pub struct SpawnedPty {
    pub writer: Box<dyn std::io::Write + Send>,
    pub master: Box<dyn MasterPty + Send>,
}

pub struct PtySpawnConfig {
    pub cwd: String,
    pub shell: String,
    pub cols: u16,
    pub rows: u16,
}

impl Default for PtySpawnConfig {
    fn default() -> Self {
        #[cfg(target_os = "windows")]
        let shell = "powershell.exe".to_string();
        #[cfg(not(target_os = "windows"))]
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());

        Self {
            cwd: "~".to_string(),
            shell,
            cols: 220,
            rows: 50,
        }
    }
}

pub fn resolve_cwd(cwd: &str) -> std::path::PathBuf {
    if cwd == "~" {
        dirs::home_dir().unwrap_or_else(|| std::path::PathBuf::from("/"))
    } else {
        std::path::PathBuf::from(cwd)
    }
}

/// Spawns a PTY and returns the writer handle.
/// Output is forwarded via the provided callback on a background thread.
/// `on_exit` is called once when the child process exits or the reader loop terminates.
pub fn spawn_pty<F, G>(config: PtySpawnConfig, on_output: F, on_exit: G) -> Result<SpawnedPty, String>
where
    F: Fn(Vec<u8>) + Send + 'static,
    G: Fn() + Send + Sync + 'static,
{
    let pty_system = NativePtySystem::default();
    let pair = pty_system
        .openpty(PtySize {
            rows: config.rows,
            cols: config.cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new(&config.shell);
    cmd.cwd(resolve_cwd(&config.cwd));

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    // Use Once so on_exit is called exactly once regardless of which thread fires first.
    let once = Arc::new(Once::new());
    let on_exit = Arc::new(on_exit);

    // Reader thread: forwards output and fires on_exit when the pipe closes.
    let once_reader = once.clone();
    let on_exit_reader = on_exit.clone();
    thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => on_output(buf[..n].to_vec()),
            }
        }
        once_reader.call_once(|| on_exit_reader());
    });

    // Child-watcher thread: fires on_exit as soon as the child process exits.
    // On Windows, ConPTY does not send EOF to the reader pipe until ClosePseudoConsole
    // is called, so we need this watcher to reliably detect shell exit.
    let once_watcher = once.clone();
    let on_exit_watcher = on_exit.clone();
    thread::spawn(move || {
        let mut child = child;
        let _ = child.wait();
        once_watcher.call_once(|| on_exit_watcher());
    });

    Ok(SpawnedPty {
        writer: Box::new(writer),
        master: pair.master,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_tilde_returns_home() {
        let p = resolve_cwd("~");
        assert!(p.exists(), "home dir should exist: {:?}", p);
    }

    #[test]
    fn resolve_absolute_path_passes_through() {
        #[cfg(target_os = "windows")]
        let expected = std::path::PathBuf::from("C:\\Windows");
        #[cfg(not(target_os = "windows"))]
        let expected = std::path::PathBuf::from("/tmp");

        #[cfg(target_os = "windows")]
        let result = resolve_cwd("C:\\Windows");
        #[cfg(not(target_os = "windows"))]
        let result = resolve_cwd("/tmp");

        assert_eq!(result, expected);
    }

    #[test]
    fn spawn_config_has_sane_defaults() {
        let cfg = PtySpawnConfig::default();
        assert!(cfg.cols > 0);
        assert!(cfg.rows > 0);
        assert!(!cfg.shell.is_empty());
    }

    #[test]
    fn spawned_pty_exposes_master_for_resize() {
        let config = PtySpawnConfig::default();
        let spawned = spawn_pty(config, |_| {}, || {}).expect("spawn failed");
        let result = spawned.master.resize(portable_pty::PtySize {
            rows: 30,
            cols: 100,
            pixel_width: 0,
            pixel_height: 0,
        });
        assert!(result.is_ok(), "resize should succeed: {:?}", result);
    }

    #[test]
    fn on_exit_called_when_shell_exits() {
        use std::io::Write;
        use std::sync::mpsc;

        let (tx, rx) = mpsc::channel::<()>();

        let config = PtySpawnConfig::default();
        let mut spawned = spawn_pty(
            config,
            |_| {},
            move || {
                let _ = tx.send(());
            },
        )
        .expect("spawn_pty failed");

        // Send exit command and flush
        spawned.writer.write_all(b"exit\r\n").unwrap();
        spawned.writer.flush().unwrap();

        rx.recv_timeout(std::time::Duration::from_secs(10))
            .expect("on_exit was not called within 10s after shell exit");
    }
}
