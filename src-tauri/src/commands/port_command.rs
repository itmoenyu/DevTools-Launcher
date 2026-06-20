use tauri::AppHandle;

use crate::{
    core::{error::AppResult, types::PortInspectionItem},
    port::{
        port_detector::{inspect_ports as inspect_ports_impl, list_listening_ports as list_listening_ports_impl},
        process_lookup::kill_process,
    },
    services::browser::open_in_browser,
};

#[tauri::command]
pub fn inspect_ports(_app_handle: AppHandle, ports: Vec<u16>) -> AppResult<Vec<PortInspectionItem>> {
    inspect_ports_impl(ports)
}

#[tauri::command]
pub fn kill_process_by_pid(_app_handle: AppHandle, pid: u32) -> AppResult<bool> {
    kill_process(pid, true)
}

#[tauri::command]
pub fn list_listening_ports_cmd(_app_handle: AppHandle) -> AppResult<Vec<PortInspectionItem>> {
    list_listening_ports_impl()
}

#[tauri::command]
pub fn open_in_browser_cmd(
    app_handle: AppHandle,
    port: u16,
    address: String,
) -> AppResult<()> {
    open_in_browser(&app_handle, port, &address)
}
