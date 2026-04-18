use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use std::io::Read;
use std::thread;

pub struct SpawnedPty {
    pub writer: Box<dyn std::io::Write + Send>,
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
pub fn spawn_pty<F>(config: PtySpawnConfig, on_output: F) -> Result<SpawnedPty, String>
where
    F: Fn(Vec<u8>) + Send + 'static,
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

    let _child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => on_output(buf[..n].to_vec()),
            }
        }
    });

    Ok(SpawnedPty {
        writer: Box::new(writer),
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
}
