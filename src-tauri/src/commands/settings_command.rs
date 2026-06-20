use tauri::{AppHandle, Manager};

use crate::{
    core::{error::AppResult, types::AppSettings},
    db::settings_repository::{get_settings, save_settings},
    lifecycle::app_lifecycle_manager,
};

#[tauri::command]
pub fn get_app_settings(app_handle: AppHandle) -> AppResult<AppSettings> {
    let state = app_handle.state::<crate::core::app_state::AppState>();
    get_settings(&state.db_path)
}

#[tauri::command]
pub fn update_app_settings(app_handle: AppHandle, payload: AppSettings) -> AppResult<AppSettings> {
    let state = app_handle.state::<crate::core::app_state::AppState>();
    save_settings(&state.db_path, &payload)
}

#[tauri::command]
pub fn handle_close_decision(
    app_handle: AppHandle,
    action: String,
    dont_remind: bool,
) -> AppResult<()> {
    app_lifecycle_manager::persist_and_execute_close_action(&app_handle, &action, dont_remind)
}
