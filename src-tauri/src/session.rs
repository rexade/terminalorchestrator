use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SessionType {
    Local,
    Wsl,
    Ssh,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SessionRole {
    Claude,
    Shell,
    Server,
    Logs,
    Git,
    Ssh,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SessionStatus {
    Active,
    Idle,
    Exited,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub session_type: SessionType,
    pub role: SessionRole,
    pub status: SessionStatus,
    pub cwd: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub sessions: Vec<Session>,
    pub last_opened_session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PersistedState {
    pub workspaces: Vec<Workspace>,
    pub active_workspace_id: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_serializes_to_json() {
        let s = Session {
            id: "abc".into(),
            name: "Claude".into(),
            session_type: SessionType::Local,
            role: SessionRole::Claude,
            status: SessionStatus::Active,
            cwd: "~".into(),
            created_at: 0,
        };
        let json = serde_json::to_string(&s).unwrap();
        assert!(json.contains("\"type\":\"local\""));
        assert!(json.contains("\"role\":\"claude\""));
        assert!(json.contains("\"status\":\"active\""));
    }

    #[test]
    fn session_type_deserializes() {
        let json = r#""wsl""#;
        let t: SessionType = serde_json::from_str(json).unwrap();
        assert_eq!(t, SessionType::Wsl);
    }
}
