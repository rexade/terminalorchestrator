use crate::pty::manager::{spawn_pty, PtySpawnConfig};
use crate::session::{SessionRole, SessionType};
use crate::state::{AppState, PtyHandle};
use std::io::Write;
use std::sync::Arc;
use tauri::{command, AppHandle, Emitter, State};
use uuid::Uuid;

#[command]
pub async fn create_session(
    name: String,
    role: SessionRole,
    session_type: SessionType,
    cwd: String,
    cols: u16,
    rows: u16,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<String, String> {
    let _ = name;
    let session_id = Uuid::new_v4().to_string();
    let id_clone = session_id.clone();
    let app_clone = app.clone();

    let (shell, args, spawn_cwd) = match session_type {
        SessionType::Wsl => (
            "wsl.exe".to_string(),
            vec!["--cd".to_string(), cwd.clone()],
            "~".to_string(), // WSL handles cwd via --cd arg
        ),
        SessionType::PowerShell => (
            "powershell.exe".to_string(),
            vec![],
            cwd.clone(),
        ),
        _ => {
            #[cfg(target_os = "windows")]
            { ("cmd.exe".to_string(), vec![], cwd.clone()) }
            #[cfg(not(target_os = "windows"))]
            { (std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string()), vec![], cwd.clone()) }
        }
    };

    let config = PtySpawnConfig {
        cwd: spawn_cwd,
        shell,
        args,
        cols,
        rows,
    };

    let ptys_for_exit = Arc::clone(&state.ptys);
    let id_for_exit = session_id.clone();
    let app_for_exit = app.clone();

    let pty = spawn_pty(
        config,
        move |data| {
            let _ = app_clone.emit(&format!("pty_output_{}", id_clone), data);
        },
        move || {
            // Remove dead handle first, then notify frontend
            if let Ok(mut ptys) = ptys_for_exit.lock() {
                ptys.remove(&id_for_exit);
            }
            let _ = app_for_exit.emit("session_exited", id_for_exit.clone());
        },
    )?;

    let mut writer = pty.writer;
    if role == SessionRole::Claude {
        let _ = writer.write_all(b"claude\r\n");
    }

    let mut ptys = state.ptys.lock().map_err(|e| e.to_string())?;
    ptys.insert(session_id.clone(), PtyHandle { writer, master: pty.master });

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
pub async fn resize_pty(id: String, cols: u16, rows: u16, state: State<'_, AppState>) -> Result<(), String> {
    let ptys = state.ptys.lock().map_err(|e| e.to_string())?;
    if let Some(pty) = ptys.get(&id) {
        pty.master.resize(portable_pty::PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        }).map_err(|e| e.to_string())?;
    }
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
