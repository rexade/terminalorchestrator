use tauri::command;

#[command]
pub async fn create_session() -> String { String::new() }
#[command]
pub async fn write_pty(_id: String, _data: String) {}
#[command]
pub async fn resize_pty(_id: String, _cols: u16, _rows: u16) {}
#[command]
pub async fn kill_session(_id: String) {}
#[command]
pub async fn rename_session(_id: String, _name: String) {}
#[command]
pub async fn load_state() -> String { "{}".into() }
#[command]
pub async fn save_state(_state: String) {}
#[command]
pub async fn check_wsl_available() -> bool { false }
