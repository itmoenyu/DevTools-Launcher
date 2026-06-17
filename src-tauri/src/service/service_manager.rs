use std::{path::Path, sync::Arc, thread, time::Duration};

use parking_lot::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tracing::{error, info, warn};

use crate::{
    core::{
        app_state::AppState,
        error::{AppResult, IntoAppResult},
        event_bus::{
            PORT_CONFLICT_DETECTED, SERVICE_LOG_APPENDED, SERVICE_OPERATION_FINISHED,
            SERVICE_STATUS_CHANGED,
        },
        types::{LaunchGroupDefinition, ServiceRuntime},
    },
    db::{
        history_repository::append_history,
        launch_group_repository::get_launch_group,
        service_repository::{get_runtime, get_service, list_services_with_runtime, update_runtime},
    },
    logs::{
        log_repository::append_log,
        log_streamer::stream_process_logs,
    },
    port::process_lookup::{inspect_port, process_exists, process_matches_path},
    service::{
        graceful_shutdown::{stop_pid, stop_redis_service},
        process_executor::spawn_service_process,
        process_tracker::{get_child, register_child, unregister_child},
    },
};

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn emit_runtime(app_handle: &AppHandle, runtime: &ServiceRuntime) {
    let _ = app_handle.emit(SERVICE_STATUS_CHANGED, runtime);
}

fn append_system_log(
    app_handle: &AppHandle,
    db_path: &str,
    service_id: &str,
    log_level: &str,
    message: &str,
) {
    if let Ok(entry) = append_log(db_path, service_id, log_level, "system", message) {
        let _ = app_handle.emit(SERVICE_LOG_APPENDED, entry);
    }
}

fn persist_runtime(db_path: &str, runtime: &ServiceRuntime) -> AppResult<ServiceRuntime> {
    update_runtime(db_path, runtime)?;
    Ok(runtime.clone())
}

fn restore_running_runtime(
    db_path: &str,
    app_handle: &AppHandle,
    service_id: &str,
    pid: u32,
    started_at: Option<String>,
    message: &str,
) -> AppResult<ServiceRuntime> {
    let runtime = ServiceRuntime {
        service_id: service_id.to_string(),
        pid: Some(pid),
        status: "running".to_string(),
        started_at,
        stopped_at: None,
        exit_code: None,
        last_heartbeat_at: Some(now()),
        status_message: message.to_string(),
    };
    let runtime = persist_runtime(db_path, &runtime)?;
    emit_runtime(app_handle, &runtime);
    Ok(runtime)
}

fn mark_runtime_stopped(
    db_path: &str,
    app_handle: &AppHandle,
    service_id: &str,
    message: &str,
) -> AppResult<ServiceRuntime> {
    let runtime = ServiceRuntime {
        service_id: service_id.to_string(),
        pid: None,
        status: "stopped".to_string(),
        started_at: None,
        stopped_at: Some(now()),
        exit_code: None,
        last_heartbeat_at: Some(now()),
        status_message: message.to_string(),
    };
    let runtime = persist_runtime(db_path, &runtime)?;
    emit_runtime(app_handle, &runtime);
    Ok(runtime)
}

fn mark_runtime_error(
    db_path: &str,
    app_handle: &AppHandle,
    service_id: &str,
    pid: Option<u32>,
    started_at: Option<String>,
    exit_code: Option<i32>,
    message: &str,
) -> AppResult<ServiceRuntime> {
    let runtime = ServiceRuntime {
        service_id: service_id.to_string(),
        pid,
        status: "error".to_string(),
        started_at,
        stopped_at: if pid.is_some() { None } else { Some(now()) },
        exit_code,
        last_heartbeat_at: Some(now()),
        status_message: message.to_string(),
    };
    let runtime = persist_runtime(db_path, &runtime)?;
    emit_runtime(app_handle, &runtime);
    Ok(runtime)
}

fn runtime_belongs_to_service(
    service: &crate::core::types::ServiceDefinition,
    pid: u32,
) -> AppResult<bool> {
    if !process_exists(pid)? {
        return Ok(false);
    }

    if !process_matches_path(pid, &service.exec_path)? {
        return Ok(false);
    }

    if let Some(port) = service.port {
        let port_info = inspect_port(port)?;
        return Ok(
            port_info.occupied
                && port_info.pid == Some(pid)
                && port_info
                    .process_path
                    .as_deref()
                    .map(|path| path.eq_ignore_ascii_case(&service.exec_path))
                    .unwrap_or(false),
        );
    }

    Ok(true)
}

fn rollback_runtime_after_stop_failure(
    db_path: &str,
    app_handle: &AppHandle,
    service_id: &str,
    pid: Option<u32>,
    started_at: Option<String>,
    message: &str,
) -> AppResult<ServiceRuntime> {
    let runtime = ServiceRuntime {
        service_id: service_id.to_string(),
        pid,
        status: if pid.is_some() { "error".to_string() } else { "stopped".to_string() },
        started_at,
        stopped_at: if pid.is_some() { None } else { Some(now()) },
        exit_code: None,
        last_heartbeat_at: Some(now()),
        status_message: message.to_string(),
    };
    let runtime = persist_runtime(db_path, &runtime)?;
    emit_runtime(app_handle, &runtime);
    Ok(runtime)
}

fn wait_for_process_exit(pid: u32, attempts: usize, wait_ms: u64) -> AppResult<bool> {
    for _ in 0..attempts {
        if !process_exists(pid)? {
            return Ok(true);
        }

        thread::sleep(Duration::from_millis(wait_ms));
    }

    Ok(!process_exists(pid)?)
}

fn should_force_stop_by_default(service: &crate::core::types::ServiceDefinition) -> bool {
    service.stop_strategy == "taskkill_force"
}

fn try_graceful_stop(service: &crate::core::types::ServiceDefinition, pid: u32) -> AppResult<bool> {
    if service.service_type == "redis" {
        match stop_redis_service(service) {
            Ok(true) => {
                info!("已向 Redis 发送 SHUTDOWN 指令，等待 PID {} 自行退出", pid);
                return wait_for_process_exit(pid, 15, 200);
            }
            Ok(false) => {
                warn!("Redis 缺少可用端口信息，无法发送 SHUTDOWN，回退到进程结束策略");
            }
            Err(error) => {
                warn!("Redis 优雅停止失败，将回退为进程结束策略: {}", error);
            }
        }
    }

    let graceful = stop_pid(pid, false)?;
    if !graceful {
        return Ok(false);
    }

    wait_for_process_exit(pid, 8, 200)
}

fn ensure_process_survives_startup(
    db_path: &str,
    app_handle: &AppHandle,
    service_id: &str,
    service_name: &str,
    child: &Arc<Mutex<std::process::Child>>,
) -> AppResult<()> {
    for _ in 0..8 {
        thread::sleep(Duration::from_millis(150));

        let exit_status = {
            let mut child_guard = child.lock();
            child_guard.try_wait().into_app_result()?
        };

        if let Some(status) = exit_status {
            let exit_code = status.code();
            let exit_text = exit_code
                .map(|code| format!("退出码 {}", code))
                .unwrap_or_else(|| "未返回退出码".to_string());
            let message = format!(
                "服务启动失败，进程在初始化阶段立即退出（{}）。请查看实时日志中的 stderr 详情。",
                exit_text
            );

            error!("{}", message);
            let _ = mark_runtime_error(
                db_path,
                app_handle,
                service_id,
                None,
                None,
                exit_code,
                &message,
            )?;
            append_history(db_path, service_id, service_name, "start", "failed", &message)?;
            append_system_log(app_handle, db_path, service_id, "error", &message);
            let _ = app_handle.emit(SERVICE_OPERATION_FINISHED, "start-failed");

            return Err(message);
        }
    }

    Ok(())
}

fn spawn_exit_watcher(
    app_handle: AppHandle,
    db_path: String,
    service_id: String,
    service_name: String,
    child: Arc<Mutex<std::process::Child>>,
) {
    let children = app_handle.state::<AppState>().children.clone();
    let emit_handle = app_handle.clone();

    thread::spawn(move || {
        let exit_status = child.lock().wait();
        children.lock().remove(&service_id);

        if let Ok(status) = exit_status {
            info!("服务 {} (ID: {}) 已自然退出, 退出码: {:?}", service_name, service_id, status.code());
            let previous_runtime = get_runtime(&db_path, &service_id).ok();
            let was_stopping = previous_runtime
                .as_ref()
                .map(|runtime| runtime.status == "stopping")
                .unwrap_or(false);
            let exit_code = status.code();
            let is_abnormal_exit = !was_stopping && exit_code.unwrap_or_default() != 0;
            let status_message = if was_stopping {
                "服务已停止".to_string()
            } else if is_abnormal_exit {
                format!(
                    "服务异常退出（{}）",
                    exit_code
                        .map(|code| format!("退出码 {}", code))
                        .unwrap_or_else(|| "未返回退出码".to_string())
                )
            } else {
                "进程已退出".to_string()
            };
            let runtime = ServiceRuntime {
                service_id: service_id.clone(),
                pid: None,
                status: if is_abnormal_exit {
                    "error".to_string()
                } else {
                    "stopped".to_string()
                },
                started_at: previous_runtime.as_ref().and_then(|runtime| runtime.started_at.clone()),
                stopped_at: Some(now()),
                exit_code,
                last_heartbeat_at: Some(now()),
                status_message: status_message.clone(),
            };

            let _ = update_runtime(&db_path, &runtime);
            let _ = append_history(
                &db_path,
                &service_id,
                &service_name,
                "exit",
                if is_abnormal_exit { "failed" } else { "success" },
                &status_message,
            );
            append_system_log(
                &emit_handle,
                &db_path,
                &service_id,
                if is_abnormal_exit { "error" } else { "info" },
                &status_message,
            );
            let _ = emit_handle.emit(SERVICE_OPERATION_FINISHED, "exit");
            let _ = emit_handle.emit(SERVICE_STATUS_CHANGED, runtime);
        } else {
            error!("等待服务 {} 退出时出错", service_id);
        }
    });
}

pub fn list_services(app_handle: &AppHandle) -> AppResult<Vec<crate::core::types::ServiceWithRuntime>> {
    let state = app_handle.state::<AppState>();
    list_services_with_runtime(&state.db_path)
}

pub fn start_service(app_handle: &AppHandle, service_id: &str) -> AppResult<ServiceRuntime> {
    info!("正在启动服务: {}", service_id);
    let state = app_handle.state::<AppState>();
    let service = get_service(&state.db_path, service_id)?;
    let current_runtime = get_runtime(&state.db_path, service_id)?;

    if service.exec_path.trim().is_empty() || service.work_dir.trim().is_empty() {
        let message = "服务缺少 exe 路径或工作目录，请先在服务管理里补充配置".to_string();
        warn!("服务配置不完整: {} (exe或工作目录为空)", service_id);
        let _ = mark_runtime_error(&state.db_path, app_handle, service_id, None, None, None, &message);
        let _ = append_history(&state.db_path, service_id, &service.name, "start", "failed", &message);
        append_system_log(app_handle, &state.db_path, service_id, "error", &message);
        let _ = app_handle.emit(SERVICE_OPERATION_FINISHED, "start-failed");
        return Err(message);
    }

    if !Path::new(&service.exec_path).exists() {
        let message = format!("可执行文件不存在：{}", service.exec_path);
        warn!("可执行文件不存在: {}", service.exec_path);
        let _ = mark_runtime_error(&state.db_path, app_handle, service_id, None, None, None, &message);
        let _ = append_history(&state.db_path, service_id, &service.name, "start", "failed", &message);
        append_system_log(app_handle, &state.db_path, service_id, "error", &message);
        let _ = app_handle.emit(SERVICE_OPERATION_FINISHED, "start-failed");
        return Err(message);
    }

    if let Some(existing_child) = get_child(&state, service_id) {
        let pid = existing_child.lock().id();
        return restore_running_runtime(
            &state.db_path,
            app_handle,
            service_id,
            pid,
            current_runtime.started_at.clone().or_else(|| Some(now())),
            "服务已经在运行",
        );
    }

    if let Some(pid) = current_runtime.pid {
        if runtime_belongs_to_service(&service, pid)? {
            info!("检测到服务 {} 的旧托管实例仍在运行，PID: {}", service.name, pid);
            return restore_running_runtime(
                &state.db_path,
                app_handle,
                service_id,
                pid,
                current_runtime.started_at.clone().or_else(|| Some(now())),
                "检测到 Launcher 上次托管的实例仍在运行，已恢复接管",
            );
        }
    }

    if let Some(port) = service.port {
        let port_info = inspect_port(port)?;
        if port_info.occupied {
            let message = format!("端口 {} 已被占用，请先处理端口冲突", port);
            warn!("端口 {} 已被占用，服务 {} 启动失败", port, service_id);
            let _ = app_handle.emit(PORT_CONFLICT_DETECTED, &port_info);
            let _ = mark_runtime_error(&state.db_path, app_handle, service_id, None, None, None, &message);
            let _ = append_history(&state.db_path, service_id, &service.name, "start", "failed", &message);
            append_system_log(app_handle, &state.db_path, service_id, "error", &message);
            let _ = app_handle.emit(SERVICE_OPERATION_FINISHED, "start-failed");
            return Err(message);
        }
        info!("端口 {} 可用", port);
    }

    let mut starting = ServiceRuntime {
        service_id: service_id.to_string(),
        pid: None,
        status: "starting".to_string(),
        started_at: Some(now()),
        stopped_at: None,
        exit_code: None,
        last_heartbeat_at: Some(now()),
        status_message: "正在静默拉起服务进程".to_string(),
    };
    starting = persist_runtime(&state.db_path, &starting)?;
    emit_runtime(app_handle, &starting);
    append_system_log(
        app_handle,
        &state.db_path,
        service_id,
        "info",
        "开始启动服务，Launcher 正在等待进程完成初始化",
    );

    let child = match spawn_service_process(&service) {
        Ok(child) => child,
        Err(error) => {
            let message = format!("服务进程创建失败：{}", error);
            error!("{}", message);
            let _ = mark_runtime_error(
                &state.db_path,
                app_handle,
                service_id,
                None,
                starting.started_at.clone(),
                None,
                &message,
            );
            let _ = append_history(&state.db_path, service_id, &service.name, "start", "failed", &message);
            append_system_log(app_handle, &state.db_path, service_id, "error", &message);
            let _ = app_handle.emit(SERVICE_OPERATION_FINISHED, "start-failed");
            return Err(message);
        }
    };
    let mut child_guard = child.lock();
    let pid = child_guard.id();
    let stdout = child_guard.stdout.take();
    let stderr = child_guard.stderr.take();
    drop(child_guard);

    stream_process_logs(
        app_handle.clone(),
        state.db_path.clone(),
        service_id.to_string(),
        stdout,
        stderr,
    );

    ensure_process_survives_startup(
        &state.db_path,
        app_handle,
        service_id,
        &service.name,
        &child,
    )?;

    register_child(&state, service_id, child.clone());
    spawn_exit_watcher(
        app_handle.clone(),
        state.db_path.clone(),
        service_id.to_string(),
        service.name.clone(),
        child,
    );

    info!("服务 {} 已启动, PID: {}", service.name, pid);
    let runtime = ServiceRuntime {
        service_id: service_id.to_string(),
        pid: Some(pid),
        status: "running".to_string(),
        started_at: Some(now()),
        stopped_at: None,
        exit_code: None,
        last_heartbeat_at: Some(now()),
        status_message: "运行中".to_string(),
    };
    let runtime = persist_runtime(&state.db_path, &runtime)?;
    append_history(
        &state.db_path,
        service_id,
        &service.name,
        "start",
        "success",
        "服务启动成功",
    )?;
    append_system_log(
        app_handle,
        &state.db_path,
        service_id,
        "info",
        &format!("服务启动成功，当前 PID 为 {}", pid),
    );
    let _ = app_handle.emit(SERVICE_OPERATION_FINISHED, "start");
    emit_runtime(app_handle, &runtime);
    Ok(runtime)
}

pub fn stop_service(app_handle: &AppHandle, service_id: &str, force: bool) -> AppResult<ServiceRuntime> {
    info!("正在{}服务: {}", if force { "强制停止" } else { "停止" }, service_id);
    let state = app_handle.state::<AppState>();
    let service = get_service(&state.db_path, service_id)?;
    let current = get_runtime(&state.db_path, service_id)?;
    let managed_child = get_child(&state, service_id);
    let pid_to_stop = current
        .pid
        .or_else(|| managed_child.as_ref().map(|child| child.lock().id()));

    let mut runtime = ServiceRuntime {
        service_id: service_id.to_string(),
        pid: pid_to_stop,
        status: if force {
            "stopping".to_string()
        } else {
            "stopping".to_string()
        },
        started_at: current.started_at.clone(),
        stopped_at: None,
        exit_code: None,
        last_heartbeat_at: Some(now()),
        status_message: if force {
            "正在强制结束进程".to_string()
        } else {
            "正在优雅停止服务".to_string()
        },
    };
    runtime = persist_runtime(&state.db_path, &runtime)?;
    emit_runtime(app_handle, &runtime);
    append_system_log(
        app_handle,
        &state.db_path,
        service_id,
        "info",
        if force {
            "正在强制结束服务进程"
        } else {
            "正在尝试优雅停止服务"
        },
    );

    if let Some(pid) = pid_to_stop {
        let stop_result = (|| {
            let prefer_force = force || should_force_stop_by_default(&service);
            info!(
                "正在{}进程 PID: {}",
                if prefer_force { "强制结束" } else { "优雅停止" },
                pid
            );

            if prefer_force {
                let forced = stop_pid(pid, true)?;
                if !forced && process_exists(pid)? {
                    error!("未能强制结束进程 PID {}", pid);
                    return Err(format!("未能强制结束进程 PID {}，请检查权限或确认该进程是否仍在运行", pid));
                }

                if !wait_for_process_exit(pid, 10, 200)? {
                    return Err(format!("强制停止后进程 PID {} 仍未退出", pid));
                }
                return Ok(());
            }

            if try_graceful_stop(&service, pid)? {
                return Ok(());
            }

            let forced = stop_pid(pid, true)?;
            if !forced && process_exists(pid)? {
                return Err(format!("普通停止失败，尝试强制结束 PID {} 也失败", pid));
            }

            if !wait_for_process_exit(pid, 10, 200)? {
                return Err(format!("强制停止后进程 PID {} 仍未退出", pid));
            }
            Ok(())
        })();

        if let Err(message) = stop_result {
            let still_exists = process_exists(pid).unwrap_or(true);
            let rollback_message = if still_exists {
                format!("停止失败：{}。服务仍在运行。", message)
            } else {
                "停止过程中进程已退出，但状态同步失败，请刷新后确认。".to_string()
            };

            let _ = append_history(
                &state.db_path,
                service_id,
                &service.name,
                if force { "kill" } else { "stop" },
                "failed",
                &rollback_message,
            );
            let _ = app_handle.emit(
                SERVICE_OPERATION_FINISHED,
                if force { "kill-failed" } else { "stop-failed" },
            );
            append_system_log(app_handle, &state.db_path, service_id, "error", &rollback_message);

            let _ = rollback_runtime_after_stop_failure(
                &state.db_path,
                app_handle,
                service_id,
                if still_exists { Some(pid) } else { None },
                if still_exists {
                    current.started_at.clone()
                } else {
                    None
                },
                &rollback_message,
            );

            return Err(message);
        }
    } else {
        let rollback_message = "当前服务没有记录到可停止的进程 PID，请先刷新状态后再试".to_string();
        let _ = append_history(
            &state.db_path,
            service_id,
            &service.name,
            if force { "kill" } else { "stop" },
            "failed",
            &rollback_message,
        );
        append_system_log(app_handle, &state.db_path, service_id, "error", &rollback_message);
        let _ = app_handle.emit(
            SERVICE_OPERATION_FINISHED,
            if force { "kill-failed" } else { "stop-failed" },
        );
        let _ = rollback_runtime_after_stop_failure(
            &state.db_path,
            app_handle,
            service_id,
            current.pid,
            current.started_at.clone(),
            &rollback_message,
        );
        return Err("当前服务没有记录到可停止的进程 PID，请先刷新状态后再试".to_string());
    }

    unregister_child(&state, service_id);

    let runtime = ServiceRuntime {
        service_id: service_id.to_string(),
        pid: None,
        status: "stopped".to_string(),
        started_at: None,
        stopped_at: Some(now()),
        exit_code: None,
        last_heartbeat_at: Some(now()),
        status_message: if force {
            "服务已强制结束".to_string()
        } else {
            "服务已停止".to_string()
        },
    };
    let runtime = persist_runtime(&state.db_path, &runtime)?;
    append_history(
        &state.db_path,
        service_id,
        &service.name,
        if force { "kill" } else { "stop" },
        "success",
        &runtime.status_message,
    )?;
    append_system_log(
        app_handle,
        &state.db_path,
        service_id,
        "info",
        &runtime.status_message,
    );
    let _ = app_handle.emit(SERVICE_OPERATION_FINISHED, if force { "kill" } else { "stop" });
    emit_runtime(app_handle, &runtime);
    Ok(runtime)
}

pub fn restart_service(app_handle: &AppHandle, service_id: &str) -> AppResult<ServiceRuntime> {
    info!("正在重启服务: {}", service_id);
    let _ = stop_service(app_handle, service_id, false);
    let runtime = start_service(app_handle, service_id)?;
    let state = app_handle.state::<AppState>();
    let service = get_service(&state.db_path, service_id)?;
    append_history(
        &state.db_path,
        service_id,
        &service.name,
        "restart",
        "success",
        "服务已完成重启",
    )?;
    Ok(runtime)
}

pub fn get_service_runtime(app_handle: &AppHandle, service_id: &str) -> AppResult<ServiceRuntime> {
    let state = app_handle.state::<AppState>();
    get_runtime(&state.db_path, service_id)
}

pub fn reconcile_managed_services_on_startup(app_handle: &AppHandle) -> AppResult<()> {
    let state = app_handle.state::<AppState>();
    let services = list_services_with_runtime(&state.db_path)?;

    for record in services {
        let Some(pid) = record.runtime.pid else {
            if matches!(record.runtime.status.as_str(), "running" | "starting" | "stopping") {
                let _ = mark_runtime_stopped(
                    &state.db_path,
                    app_handle,
                    &record.service.id,
                    "应用重新启动后未找到有效 PID，已清理残留运行态",
                );
            }
            continue;
        };

        if runtime_belongs_to_service(&record.service, pid)? {
            let _ = restore_running_runtime(
                &state.db_path,
                app_handle,
                &record.service.id,
                pid,
                record.runtime.started_at.clone(),
                "检测到 Launcher 上次托管的实例仍在运行，已自动恢复状态",
            );
            continue;
        }

        let _ = mark_runtime_stopped(
            &state.db_path,
            app_handle,
            &record.service.id,
            "应用启动时发现旧运行态已失效，已自动清理",
        );
    }

    Ok(())
}

pub fn shutdown_managed_services(app_handle: &AppHandle) -> AppResult<()> {
    let state = app_handle.state::<AppState>();
    let services = list_services_with_runtime(&state.db_path)?;
    let mut failed = Vec::new();

    for record in services {
        let Some(pid) = record.runtime.pid else {
            continue;
        };

        if !runtime_belongs_to_service(&record.service, pid)? {
            let _ = mark_runtime_stopped(
                &state.db_path,
                app_handle,
                &record.service.id,
                "应用退出时发现旧运行态已失效，已自动清理",
            );
            continue;
        }

        if let Err(error) = stop_service(app_handle, &record.service.id, false) {
            failed.push(format!("{}：{}", record.service.name, error));
        }
    }

    if failed.is_empty() {
        return Ok(());
    }

    Err(format!("应用退出前有服务未能自动停止：{}", failed.join("；")))
}

pub fn run_launch_group(app_handle: &AppHandle, group_id: &str) -> AppResult<Vec<ServiceRuntime>> {
    info!("正在执行启动组: {}", group_id);
    let state = app_handle.state::<AppState>();
    let group: LaunchGroupDefinition = get_launch_group(&state.db_path, group_id)?;
    let mut started_ids = Vec::new();
    let mut runtimes = Vec::new();
    info!("启动组 {} 包含 {} 个服务", group.name, group.items.len());

    for item in group.items {
        match start_service(app_handle, &item.service_id) {
            Ok(runtime) => {
                started_ids.push(item.service_id);
                runtimes.push(runtime);
            }
            Err(error) => {
                for started_id in started_ids {
                    let _ = stop_service(app_handle, &started_id, true);
                }
                return Err(format!("启动组执行失败，已回滚：{}", error));
            }
        }
    }

    Ok(runtimes)
}
