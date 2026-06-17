use tauri::{AppHandle, Manager};

use crate::{
    core::{
        error::AppResult,
        types::{ServicePayload, ServiceRuntime, ServiceWithRuntime},
    },
    db::service_repository::{
        delete_service as delete_service_record, get_service, get_runtime, list_services_with_runtime,
        upsert_service_from_payload,
    },
    service::service_manager,
};

#[tauri::command]
pub fn list_services(app_handle: AppHandle) -> AppResult<Vec<ServiceWithRuntime>> {
    service_manager::list_services(&app_handle)
}

#[tauri::command]
pub fn get_service_detail(app_handle: AppHandle, service_id: String) -> AppResult<ServiceWithRuntime> {
    let state = app_handle.state::<crate::core::app_state::AppState>();
    let service = get_service(&state.db_path, &service_id)?;
    let runtime = get_runtime(&state.db_path, &service_id)?;
    Ok(ServiceWithRuntime { service, runtime })
}

#[tauri::command]
pub fn create_custom_service(app_handle: AppHandle, payload: ServicePayload) -> AppResult<ServiceWithRuntime> {
    let state = app_handle.state::<crate::core::app_state::AppState>();
    let service = upsert_service_from_payload(&state.db_path, &payload)?;
    let runtime = get_runtime(&state.db_path, &service.id)?;
    Ok(ServiceWithRuntime { service, runtime })
}

#[tauri::command]
pub fn update_service(app_handle: AppHandle, payload: ServicePayload) -> AppResult<ServiceWithRuntime> {
    let state = app_handle.state::<crate::core::app_state::AppState>();
    let service = upsert_service_from_payload(&state.db_path, &payload)?;
    let runtime = get_runtime(&state.db_path, &service.id)?;
    Ok(ServiceWithRuntime { service, runtime })
}

#[tauri::command]
pub fn delete_service(app_handle: AppHandle, service_id: String) -> AppResult<bool> {
    let state = app_handle.state::<crate::core::app_state::AppState>();
    delete_service_record(&state.db_path, &service_id)
}

#[tauri::command]
pub fn start_service(app_handle: AppHandle, service_id: String) -> AppResult<ServiceRuntime> {
    service_manager::start_service(&app_handle, &service_id)
}

#[tauri::command]
pub fn stop_service(app_handle: AppHandle, service_id: String) -> AppResult<ServiceRuntime> {
    service_manager::stop_service(&app_handle, &service_id, false)
}

#[tauri::command]
pub fn restart_service(app_handle: AppHandle, service_id: String) -> AppResult<ServiceRuntime> {
    service_manager::restart_service(&app_handle, &service_id)
}

#[tauri::command]
pub fn force_kill_service(app_handle: AppHandle, service_id: String) -> AppResult<ServiceRuntime> {
    service_manager::stop_service(&app_handle, &service_id, true)
}

#[tauri::command]
pub fn get_service_runtime(app_handle: AppHandle, service_id: String) -> AppResult<ServiceRuntime> {
    service_manager::get_service_runtime(&app_handle, &service_id)
}

#[allow(dead_code)]
pub fn preload_services(app_handle: &AppHandle) -> AppResult<Vec<ServiceWithRuntime>> {
    let state = app_handle.state::<crate::core::app_state::AppState>();
    list_services_with_runtime(&state.db_path)
}
