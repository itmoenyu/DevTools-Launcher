use std::path::PathBuf;

use rusqlite::Connection;

use crate::core::error::{AppResult, IntoAppResult};

pub fn resolve_db_path() -> AppResult<String> {
    let base_dir = dirs::data_local_dir()
        .ok_or_else(|| "无法获取本地数据目录".to_string())?
        .join("DevToolsLauncher");

    std::fs::create_dir_all(&base_dir).into_app_result()?;

    Ok(base_dir.join("launcher.db").to_string_lossy().to_string())
}

pub fn open_connection(db_path: &str) -> AppResult<Connection> {
    let path = PathBuf::from(db_path);

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).into_app_result()?;
    }

    Connection::open(path).into_app_result()
}
