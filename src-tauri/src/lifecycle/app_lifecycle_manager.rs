use tauri::{AppHandle, Emitter, Manager};
use tracing::{info, warn};

use crate::{
    core::{app_state::AppState, error::AppResult, types::AppSettings},
    db::settings_repository::{get_settings, save_settings},
    service::service_manager::shutdown_managed_services,
};

fn read_settings(app_handle: &AppHandle) -> AppResult<AppSettings> {
    let state = app_handle.state::<AppState>();
    get_settings(&state.db_path)
}

pub fn show_main_window(app_handle: &AppHandle) {
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn hide_main_window(app_handle: &AppHandle) {
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.hide();
    }
}

pub fn apply_launch_window_behavior(app_handle: &AppHandle) -> AppResult<()> {
    let settings = read_settings(app_handle)?;

    if settings.minimize_on_launch {
        info!("检测到 minimize_on_launch=true，启动后将主窗口隐藏到托盘");
        hide_main_window(app_handle);
    }

    Ok(())
}

pub fn handle_main_window_close(app_handle: &AppHandle) -> AppResult<()> {
    let settings = read_settings(app_handle)?;

    if settings.close_reminder_disabled {
        match settings.close_action.as_str() {
            "quit" => {
                info!("关闭窗口时根据用户偏好直接退出应用");
                request_app_exit(app_handle, "main-window-close-auto-quit");
            }
            _ => {
                info!("关闭窗口时根据用户偏好最小化到托盘");
                hide_main_window(app_handle);
            }
        }
        return Ok(());
    }

    info!("关闭窗口时弹出二次确认弹窗");
    let _ = app_handle.emit("close-requested", ());

    Ok(())
}

pub fn persist_and_execute_close_action(
    app_handle: &AppHandle,
    action: &str,
    dont_remind: bool,
) -> AppResult<()> {
    let mut settings = read_settings(app_handle)?;
    settings.close_action = action.to_string();
    settings.close_reminder_disabled = dont_remind;
    save_settings(&app_handle.state::<AppState>().db_path, &settings)?;

    match action {
        "quit" => {
            info!("用户选择关闭窗口时退出应用");
            request_app_exit(app_handle, "main-window-close-modal-quit");
        }
        _ => {
            info!("用户选择关闭窗口时最小化到托盘");
            hide_main_window(app_handle);
        }
    }

    Ok(())
}

pub fn request_app_exit(app_handle: &AppHandle, reason: &str) {
    let state = app_handle.state::<AppState>();
    if !state.begin_exit() {
        return;
    }

    info!("应用准备退出，触发来源: {}", reason);

    if let Err(error) = shutdown_managed_services(app_handle) {
        warn!("应用退出前自动处理托管服务时出现问题: {}", error);
    }

    app_handle.exit(0);
}
