use crate::pty::manager::{spawn_pty, PtySpawnConfig};
use crate::session::{SessionRole, SessionType};
use crate::state::{AppState, PtyHandle};
use std::io::Write;
use tauri::{command, AppHandle, Emitter, State};
use uuid::Uuid;

#[derive(serde::Deserialize)]
pub struct CreateSessionArgs {
    pub name: String,
    pub role: SessionRole,
    pub session_type: SessionType,
    pub cwd: String,
    pub cols: u16,
    pub rows: u16,
}

#[command]
pub async fn create_session(
    args: CreateSessionArgs,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<String, String> {
    let session_id = Uuid::new_v4().to_string();
    let id_clone = session_id.clone();
    let app_clone = app.clone();

    let shell = match args.session_type {
        SessionType::Wsl => "wsl.exe".to_string(),
        _ => {
            #[cfg(target_os = "windows")]
            {
                "powershell.exe".to_string()
            }
            #[cfg(not(target_os = "windows"))]
            {
                std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
            }
        }
    };

    let config = PtySpawnConfig {
        cwd: args.cwd,
        shell,
        cols: args.cols,
        rows: args.rows,
    };

    let pty = spawn_pty(config, move |data| {
        let _ = app_clone.emit(&format!("pty_output_{}", id_clone), data);
    })?;

    let mut ptys = state.ptys.lock().map_err(|e| e.to_string())?;
    ptys.insert(session_id.clone(), PtyHandle { writer: pty.writer });

    Ok(session_id)
}

#[command]
pub async fn write_pty(
    id: String,
    data: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut ptys = state.ptys.lock().map_err(|e| e.to_string())?;
    if let Some(pty) = ptys.get_mut(&id) {
        pty.writer
            .write_all(data.as_bytes())
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[command]
pub async fn resize_pty(_id: String, _cols: u16, _rows: u16) -> Result<(), String> {
    // portable-pty resize via master.resize — deferred to v1.1
    Ok(())
}

#[command]
pub async fn kill_session(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut ptys = state.ptys.lock().map_err(|e| e.to_string())?;
    ptys.remove(&id);
    Ok(())
}

#[command]
pub async fn rename_session(_id: String, _name: String) -> Result<(), String> {
    // name is frontend-only state; nothing to do in Rust
    Ok(())
}

#[command]
pub async fn load_state() -> Result<String, String> {
    crate::persistence::load()
}

#[command]
pub async fn save_state(state: String) -> Result<(), String> {
    crate::persistence::save(&state)
}

#[command]
pub async fn check_wsl_available() -> bool {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("wsl")
            .arg("--status")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}
