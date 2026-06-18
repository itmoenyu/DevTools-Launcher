use tauri::{AppHandle, Manager};
use tracing::{info, warn};

use crate::{
    core::{app_state::AppState, error::AppResult, types::AppSettings},
    db::settings_repository::get_settings,
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

pub fn hide_main_window(app_handle: &AppHandle) {
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.hide();
    }
}

pub fn apply_launch_window_behavior(app_handle: &AppHandle) -> AppResult<()> {
    let settings = read_settings(app_handle)?;

    // 这里只处理“启动后是否隐藏主窗口”，不改动服务运行态。
    // 这样关闭窗口、托盘显示、真正退出都能复用同一套托管规则。
    if settings.minimize_on_launch {
        info!("检测到 minimize_on_launch=true，启动后将主窗口隐藏到托盘");
        hide_main_window(app_handle);
    }

    Ok(())
}

pub fn handle_main_window_close(app_handle: &AppHandle) -> AppResult<()> {
    // 桌面端固定为常驻托盘模式：
    // 点窗口右上角关闭时只隐藏主窗口，不真正结束进程。
    // 真正退出统一交给托盘菜单里的“退出应用”。
    info!("主窗口收到关闭请求，改为隐藏到托盘");
    hide_main_window(app_handle);
    Ok(())
}

pub fn request_app_exit(app_handle: &AppHandle, reason: &str) {
    let state = app_handle.state::<AppState>();
    if !state.begin_exit() {
        return;
    }

    info!("应用准备退出，触发来源: {}", reason);

    // 退出前统一走停服逻辑。
    // 即使个别服务停止失败，也继续退出，让下次启动时的残留校正继续兜底。
    if let Err(error) = shutdown_managed_services(app_handle) {
        warn!("应用退出前自动处理托管服务时出现问题: {}", error);
    }

    app_handle.exit(0);
}
