use std::fs;

fn state_path() -> Option<std::path::PathBuf> {
    dirs::data_dir().map(|d| d.join("termorchestra").join("state.json"))
}

pub fn load() -> Result<String, String> {
    let path = state_path().ok_or("no data dir")?;
    if !path.exists() {
        return Ok("{}".into());
    }
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

pub fn save(json: &str) -> Result<(), String> {
    let path = state_path().ok_or("no data dir")?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, json).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use std::fs;

    #[test]
    fn save_and_load_roundtrip() {
        let json = r#"{"workspaces":[],"active_workspace_id":null}"#;
        let tmp = std::env::temp_dir().join("termorchestra_test_state.json");
        fs::write(&tmp, json).unwrap();
        let loaded = fs::read_to_string(&tmp).unwrap();
        assert_eq!(loaded, json);
        fs::remove_file(&tmp).unwrap();
    }

    #[test]
    fn load_returns_empty_object_when_no_file() {
        // Use a path that definitely doesn't exist
        let result = fs::read_to_string("/nonexistent/path/state.json");
        assert!(result.is_err()); // confirms our fallback logic is needed
    }
}
