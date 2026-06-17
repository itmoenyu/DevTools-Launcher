use tauri::AppHandle;

use crate::{
    core::{error::AppResult, types::PortInspectionItem},
    port::{port_detector::inspect_ports as inspect_ports_impl, process_lookup::kill_process},
};

#[tauri::command]
pub fn inspect_ports(_app_handle: AppHandle, ports: Vec<u16>) -> AppResult<Vec<PortInspectionItem>> {
    inspect_ports_impl(ports)
}

#[tauri::command]
pub fn kill_process_by_pid(_app_handle: AppHandle, pid: u32) -> AppResult<bool> {
    kill_process(pid, true)
}
