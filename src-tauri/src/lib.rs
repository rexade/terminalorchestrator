mod commands;
mod session;
mod state;
mod pty;
mod persistence;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::create_session,
            commands::write_pty,
            commands::resize_pty,
            commands::kill_session,
            commands::rename_session,
            commands::load_state,
            commands::save_state,
            commands::check_wsl_available,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
