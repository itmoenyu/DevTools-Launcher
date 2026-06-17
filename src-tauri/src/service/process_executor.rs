use std::{
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Arc,
};

use parking_lot::Mutex;
use tracing::info;

use crate::core::{
    error::{AppResult, IntoAppResult},
    types::ServiceDefinition,
};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x08000000;

fn normalize_launch_args(service: &ServiceDefinition) -> Vec<String> {
    if service.service_type != "mysql" {
        return service.args.clone();
    }

    let mut prioritized = Vec::new();
    let mut remaining = Vec::new();
    let mut index = 0;

    while index < service.args.len() {
        let current = &service.args[index];

        // MySQL 要求 defaults-file 这类参数必须出现在最前面，否则会忽略自定义配置，
        // 然后回退到基于安装目录推导出来的默认 data 目录，最终导致进程刚启动就退出。
        if current == "--defaults-file" || current == "--defaults-extra-file" {
            prioritized.push(current.clone());

            if let Some(next) = service.args.get(index + 1) {
                prioritized.push(next.clone());
                index += 2;
                continue;
            }

            index += 1;
            continue;
        }

        if current.starts_with("--defaults-file=")
            || current.starts_with("--defaults-extra-file=")
            || current == "--no-defaults"
        {
            prioritized.push(current.clone());
            index += 1;
            continue;
        }

        remaining.push(current.clone());
        index += 1;
    }

    // 对于 Windows 上的 MySQL，默认会把日志写到 my.ini 里配置的 log-error 文件中。
    // 这会导致 Launcher 无法通过 stdout/stderr 捕获到日志。
    // 追加 --console 参数强制 MySQL 把日志输出到控制台，从而让 Launcher 能正常采集并展示在界面上。
    if !prioritized.contains(&"--console".to_string()) && !remaining.contains(&"--console".to_string()) {
        remaining.push("--console".to_string());
    }

    prioritized.extend(remaining);
    prioritized
}

fn extract_mysql_defaults_file(args: &[String]) -> Option<String> {
    let mut index = 0;

    while index < args.len() {
        let current = &args[index];

        if current == "--defaults-file" || current == "--defaults-extra-file" {
            return args.get(index + 1).cloned();
        }

        if let Some(value) = current.strip_prefix("--defaults-file=") {
            return Some(value.to_string());
        }

        if let Some(value) = current.strip_prefix("--defaults-extra-file=") {
            return Some(value.to_string());
        }

        index += 1;
    }

    None
}

fn resolve_launch_work_dir(service: &ServiceDefinition, normalized_args: &[String]) -> PathBuf {
    if service.service_type == "mysql" {
        if let Some(defaults_file) = extract_mysql_defaults_file(normalized_args) {
            if let Some(parent) = Path::new(&defaults_file).parent() {
                // MySQL 的 my.ini 里常见 log-error、log-bin、general_log_file 都会写成相对路径。
                // 如果工作目录落在 Program Files\...\bin，这些文件就会尝试写到 bin 目录里，
                // 进而因为系统目录权限受限而启动失败。这里优先把工作目录切到 my.ini 所在目录。
                return parent.to_path_buf();
            }
        }
    }

    PathBuf::from(&service.work_dir)
}

pub fn spawn_service_process(service: &ServiceDefinition) -> AppResult<Arc<Mutex<Child>>> {
    let args = normalize_launch_args(service);
    let work_dir = resolve_launch_work_dir(service, &args);
    info!("正在拉起进程: {} 工作目录: {:?}", service.exec_path, work_dir);
    let mut command = Command::new(&service.exec_path);
    command
        .current_dir(work_dir)
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    for (key, value) in &service.env {
        command.env(key, value);
    }

    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);

    let child = command.spawn().into_app_result()?;
    info!("进程已启动, PID: {}", child.id());
    Ok(Arc::new(Mutex::new(child)))
}
