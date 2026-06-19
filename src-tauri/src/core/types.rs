use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceDefinition {
    pub id: String,
    pub name: String,
    pub service_type: String,
    pub is_builtin: bool,
    pub exec_path: String,
    pub work_dir: String,
    pub args: Vec<String>,
    pub env: std::collections::HashMap<String, String>,
    pub port: Option<u16>,
    pub stop_strategy: String,
    pub healthcheck_strategy: String,
    pub description: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceRuntime {
    pub service_id: String,
    pub pid: Option<u32>,
    pub status: String,
    pub started_at: Option<String>,
    pub stopped_at: Option<String>,
    pub exit_code: Option<i32>,
    pub last_heartbeat_at: Option<String>,
    pub status_message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceWithRuntime {
    pub service: ServiceDefinition,
    pub runtime: ServiceRuntime,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServicePayload {
    pub id: Option<String>,
    pub name: String,
    pub service_type: String,
    pub exec_path: String,
    pub work_dir: String,
    pub args: Vec<String>,
    pub env: std::collections::HashMap<String, String>,
    pub port: Option<u16>,
    pub stop_strategy: String,
    pub healthcheck_strategy: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub id: String,
    pub service_id: String,
    pub log_level: String,
    pub stream_type: String,
    pub content: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortInspectionItem {
    pub port: u16,
    pub occupied: bool,
    pub pid: Option<u32>,
    pub process_name: Option<String>,
    pub process_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchGroupItem {
    pub id: String,
    pub group_id: String,
    pub service_id: String,
    pub sort_order: i64,
    pub depends_on_service_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchGroupDefinition {
    pub id: String,
    pub name: String,
    pub description: String,
    pub items: Vec<LaunchGroupItem>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationHistoryItem {
    pub id: String,
    pub service_id: String,
    pub service_name: String,
    pub operation_type: String,
    pub result: String,
    pub message: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub close_to_tray: bool,
    pub launch_on_startup: bool,
    pub minimize_on_launch: bool,
    pub data_retention_days: i64,
    pub preferred_theme: String,
    pub auto_update_enabled: bool,
}
