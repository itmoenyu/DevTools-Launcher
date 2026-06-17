use std::process::Command;

use crate::core::{
    error::{AppResult, IntoAppResult},
    types::PortInspectionItem,
};

pub fn inspect_port(port: u16) -> AppResult<PortInspectionItem> {
    let output = Command::new("netstat")
        .args(["-ano", "-p", "tcp"])
        .output()
        .into_app_result()?;
    let content = String::from_utf8_lossy(&output.stdout);

    for line in content.lines() {
        if !line.contains(&format!(":{}", port)) || !line.contains("LISTENING") {
            continue;
        }

        let columns: Vec<&str> = line.split_whitespace().collect();
        if columns.len() < 5 {
            continue;
        }

        let pid = columns[4].parse::<u32>().ok();
        let process_name = pid.and_then(|pid| lookup_process_name(pid).ok());
        let process_path = pid.and_then(|pid| lookup_process_path(pid).ok());

        return Ok(PortInspectionItem {
            port,
            occupied: true,
            pid,
            process_name,
            process_path,
        });
    }

    Ok(PortInspectionItem {
        port,
        occupied: false,
        pid: None,
        process_name: None,
        process_path: None,
    })
}

pub fn lookup_process_name(pid: u32) -> AppResult<String> {
    let filter = format!("PID eq {}", pid);
    let output = Command::new("tasklist")
        .args(["/FI", &filter, "/FO", "CSV", "/NH"])
        .output()
        .into_app_result()?;
    let content = String::from_utf8_lossy(&output.stdout);
    let first_line = content.lines().next().unwrap_or_default().trim();

    // `tasklist /FO CSV /NH` 在中文 Windows 下，查不到进程时会返回
    // “信息: 没有运行的任务符合指定标准。” 这类本地化文本，而不是英文的 "No tasks"。
    // 旧逻辑只判断英文提示，导致进程明明已经退出，仍被误判成“还活着”。
    if first_line.is_empty() || !first_line.starts_with('"') || !first_line.ends_with('"') {
        return Ok(String::new());
    }

    let trimmed = first_line.trim_matches('"');
    let columns: Vec<&str> = trimmed.split("\",\"").collect();

    if columns.len() < 2 {
        return Ok(String::new());
    }

    let parsed_pid = columns
        .get(1)
        .and_then(|raw| raw.replace(',', "").parse::<u32>().ok());

    if parsed_pid != Some(pid) {
        return Ok(String::new());
    }

    Ok(columns.first().copied().unwrap_or_default().to_string())
}

pub fn lookup_process_path(pid: u32) -> AppResult<String> {
    let command = format!(
        "(Get-CimInstance Win32_Process -Filter \"ProcessId = {pid}\").ExecutablePath"
    );
    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", &command])
        .output()
        .into_app_result()?;

    if !output.status.success() {
        return Ok(String::new());
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

pub fn process_exists(pid: u32) -> AppResult<bool> {
    Ok(!lookup_process_name(pid)?.trim().is_empty())
}

pub fn process_matches_path(pid: u32, expected_path: &str) -> AppResult<bool> {
    let actual_path = lookup_process_path(pid)?;
    if actual_path.trim().is_empty() || expected_path.trim().is_empty() {
        return Ok(false);
    }

    Ok(actual_path.eq_ignore_ascii_case(expected_path))
}

pub fn kill_process(pid: u32, force: bool) -> AppResult<bool> {
    let mut command = Command::new("taskkill");
    command.args(["/PID", &pid.to_string(), "/T"]);

    if force {
        command.arg("/F");
    }

    let output = command.output().into_app_result()?;
    Ok(output.status.success())
}
