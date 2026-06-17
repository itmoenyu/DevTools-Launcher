pub mod commands {
    pub mod launch_group_command;
    pub mod log_command;
    pub mod port_command;
    pub mod process_command;
    pub mod service_command;
    pub mod settings_command;
}

pub mod core {
    pub mod app_state;
    pub mod error;
    pub mod event_bus;
    pub mod types;
}

pub mod db {
    pub mod connection;
    pub mod history_repository;
    pub mod launch_group_repository;
    pub mod migrations;
    pub mod service_repository;
    pub mod settings_repository;
}

pub mod logs {
    pub mod log_repository;
    pub mod log_streamer;
}

pub mod port {
    pub mod port_detector;
    pub mod process_lookup;
}

pub mod service {
    pub mod graceful_shutdown;
    pub mod health_checker;
    pub mod process_executor;
    pub mod process_tracker;
    pub mod service_manager;
    pub mod service_registry;
}

pub mod startup {
    pub mod bootstrap;
}

pub mod tray {
    pub mod tray_manager;
}

use startup::bootstrap::initialize_app_state;
use tauri::Manager;
use tracing::info;
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info"));

    tracing_subscriber::registry()
        .with(filter)
        .with(fmt::layer().pretty())
        .init();

    info!("DevTools Launcher 启动中...");

    let app_state = initialize_app_state().expect("failed to initialize app state");
    info!("应用状态初始化完成");

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::service_command::list_services,
            commands::service_command::get_service_detail,
            commands::service_command::create_custom_service,
            commands::service_command::update_service,
            commands::service_command::delete_service,
            commands::service_command::start_service,
            commands::service_command::stop_service,
            commands::service_command::restart_service,
            commands::service_command::force_kill_service,
            commands::service_command::get_service_runtime,
            commands::port_command::inspect_ports,
            commands::port_command::kill_process_by_pid,
            commands::log_command::query_logs,
            commands::log_command::clear_logs_by_service,
            commands::launch_group_command::list_launch_groups,
            commands::launch_group_command::create_launch_group,
            commands::launch_group_command::update_launch_group,
            commands::launch_group_command::run_launch_group,
            commands::process_command::query_operation_history,
            commands::settings_command::get_app_settings,
            commands::settings_command::update_app_settings,
        ])
        .setup(|app| {
            info!("Tauri setup 开始");
            tray::tray_manager::setup_tray(&app.handle())?;
            info!("系统托盘初始化完成");

            service::service_manager::reconcile_managed_services_on_startup(&app.handle())?;
            info!("托管服务运行态校正完成");

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title("DevTools Launcher");
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
