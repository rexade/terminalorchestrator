use std::collections::HashMap;
use std::io::Write;
use std::sync::{Arc, Mutex};

pub struct PtyHandle {
    pub writer: Box<dyn Write + Send>,
    pub master: Box<dyn portable_pty::MasterPty + Send>,
}

#[derive(Default)]
pub struct AppState {
    pub ptys: Arc<Mutex<HashMap<String, PtyHandle>>>,
}
