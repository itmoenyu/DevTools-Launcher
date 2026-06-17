use tauri::AppHandle;

use crate::{
    core::{error::AppResult, types::LogEntry},
    logs::log_repository::{clear_logs_by_service as clear_logs, query_logs as query_logs_impl},
};

#[tauri::command]
pub fn query_logs(
    _app_handle: AppHandle,
    service_id: Option<String>,
    keyword: Option<String>,
) -> AppResult<Vec<LogEntry>> {
    let service_id = service_id.as_deref();
    let keyword = keyword.as_deref();
    let db_path = crate::startup::bootstrap::resolve_app_db_path()?;
    query_logs_impl(&db_path, service_id, keyword)
}

#[tauri::command]
pub fn clear_logs_by_service(_app_handle: AppHandle, service_id: String) -> AppResult<bool> {
    let db_path = crate::startup::bootstrap::resolve_app_db_path()?;
    clear_logs(&db_path, &service_id)
}
