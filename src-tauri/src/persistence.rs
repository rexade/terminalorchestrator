use std::fs;

fn state_path() -> Option<std::path::PathBuf> {
    dirs::data_dir().map(|d| d.join("termorchestra").join("state.json"))
}

fn load_from(path: &std::path::Path) -> Result<String, String> {
    if !path.exists() {
        return Ok("{}".into());
    }
    fs::read_to_string(path).map_err(|e| e.to_string())
}

fn save_to(path: &std::path::Path, json: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, json).map_err(|e| e.to_string())
}

pub fn load() -> Result<String, String> {
    let path = state_path().ok_or("no data dir")?;
    load_from(&path)
}

pub fn save(json: &str) -> Result<(), String> {
    let path = state_path().ok_or("no data dir")?;
    save_to(&path, json)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn load_from_returns_empty_object_when_file_missing() {
        let path = std::env::temp_dir().join("termorchestra_test_missing_xyz.json");
        let _ = fs::remove_file(&path); // ensure it doesn't exist
        assert_eq!(load_from(&path).unwrap(), "{}");
    }

    #[test]
    fn save_to_and_load_from_roundtrip() {
        let path = std::env::temp_dir().join("termorchestra_test_roundtrip_xyz.json");
        let json = r#"{"workspaces":[]}"#;
        save_to(&path, json).unwrap();
        assert_eq!(load_from(&path).unwrap(), json);
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn save_to_creates_parent_directories() {
        let path = std::env::temp_dir()
            .join("termorchestra_test_nested_xyz")
            .join("deep")
            .join("state.json");
        save_to(&path, "{}").unwrap();
        assert!(path.exists());
        let _ = fs::remove_dir_all(path.parent().unwrap().parent().unwrap());
    }
}
