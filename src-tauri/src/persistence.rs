// Persistence — implemented in Task 9

pub fn load() -> Result<String, String> {
    Ok("{}".into())
}

pub fn save(_json: &str) -> Result<(), String> {
    Ok(())
}
