use tauri::{AppHandle, Manager};

use crate::{
    core::{
        error::AppResult,
        types::{LaunchGroupDefinition, ServiceRuntime},
    },
    db::launch_group_repository::{list_launch_groups as list_groups, upsert_launch_group},
    service::service_manager,
};

#[tauri::command]
pub fn list_launch_groups(app_handle: AppHandle) -> AppResult<Vec<LaunchGroupDefinition>> {
    let state = app_handle.state::<crate::core::app_state::AppState>();
    list_groups(&state.db_path)
}

#[tauri::command]
pub fn create_launch_group(
    app_handle: AppHandle,
    payload: LaunchGroupDefinition,
) -> AppResult<LaunchGroupDefinition> {
    let state = app_handle.state::<crate::core::app_state::AppState>();
    upsert_launch_group(&state.db_path, &payload)
}

#[tauri::command]
pub fn update_launch_group(
    app_handle: AppHandle,
    payload: LaunchGroupDefinition,
) -> AppResult<LaunchGroupDefinition> {
    let state = app_handle.state::<crate::core::app_state::AppState>();
    upsert_launch_group(&state.db_path, &payload)
}

#[tauri::command]
pub fn run_launch_group(app_handle: AppHandle, group_id: String) -> AppResult<Vec<ServiceRuntime>> {
    service_manager::run_launch_group(&app_handle, &group_id)
}
