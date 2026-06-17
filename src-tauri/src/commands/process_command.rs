use tauri::{AppHandle, Manager};

use crate::{
    core::{error::AppResult, types::OperationHistoryItem},
    db::history_repository::list_history,
};

#[tauri::command]
pub fn query_operation_history(app_handle: AppHandle) -> AppResult<Vec<OperationHistoryItem>> {
    let state = app_handle.state::<crate::core::app_state::AppState>();
    list_history(&state.db_path)
}
