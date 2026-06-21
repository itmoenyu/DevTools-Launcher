use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Windows `CREATE_NO_WINDOW` 标志，阻止 spawn 子进程时闪现控制台窗口。
/// 发行版用户双击桌面快捷方式运行应用，不应看到 netstat / taskkill 等后台命令的终端闪烁。
const CREATE_NO_WINDOW: u32 = 0x08000000;

use crate::core::{
    error::{AppResult, IntoAppResult},
    types::{PortInspectionItem, PortProtocol, TcpState},
};

pub fn inspect_port(port: u16) -> AppResult<PortInspectionItem> {
    let output = Command::new("netstat")
        .args(["-ano", "-p", "tcp"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .into_app_result()?;
    let content = String::from_utf8_lossy(&output.stdout);

    // 把"从 netstat 输出里找到监听指定端口的 PID"这一纯逻辑单独抽出来，
    // 既能被单元测试覆盖，也避免原先用 `line.contains(":637")` 判断端口时，
    // 把 6379、63700 等端口误判成 637 的 bug。
    let Some(pid) = find_listening_pid_by_port(&content, port) else {
        return Ok(PortInspectionItem {
            port,
            state: TcpState::Unknown,
            protocol: PortProtocol::Tcp,
            local_address: String::new(),
            occupied: false,
            pid: None,
            process_name: None,
            process_path: None,
        });
    };

    let process_name = lookup_process_name(pid).ok();
    let process_path = lookup_process_path(pid).ok();

    Ok(PortInspectionItem {
        port,
        state: TcpState::Listening,
        protocol: PortProtocol::Tcp,
        local_address: String::new(),
        occupied: true,
        pid: Some(pid),
        process_name,
        process_path,
    })
}

/// 从 `netstat -ano -p tcp` 的完整输出里，找出正在监听 `port` 的进程 PID。
///
/// netstat 每行形如：
/// ```text
///   TCP    0.0.0.0:6379           0.0.0.0:0              LISTENING       1234
/// ```
/// Local Address（第二列）可能是 `0.0.0.0:6379`、`127.0.0.1:6379`、`[::]:6379`
/// 或 `[2001:db8::1]:6379`。端口是地址里最后一个 `:` 之后的部分，必须精确解析，
/// 不能用 `line.contains(":637")` 这种子串匹配，否则会把 6379 当成 637。
fn find_listening_pid_by_port(netstat_output: &str, port: u16) -> Option<u32> {
    for line in netstat_output.lines() {
        if !line.contains("LISTENING") {
            continue;
        }

        let columns: Vec<&str> = line.split_whitespace().collect();
        // TCP 行至少 5 列：Proto / Local / Foreign / State / PID
        if columns.len() < 5 {
            continue;
        }

        let local_address = columns[1];
        if extract_port(local_address) != Some(port) {
            continue;
        }

        if let Ok(pid) = columns[4].parse::<u32>() {
            return Some(pid);
        }
    }

    None
}

/// 从一个 socket 地址串里解析出端口。
///
/// - `0.0.0.0:6379`            → `Some(6379)`
/// - `127.0.0.1:6379`          → `Some(6379)`
/// - `[::]:6379`               → `Some(6379)`
/// - `[2001:db8::1]:6379`      → `Some(6379)`
/// - `0.0.0.0:63790`           → `Some(63790)`（不再误匹配成 6379）
fn extract_port(address: &str) -> Option<u16> {
    // IPv6 形如 `[::]:6379`，端口在 `]` 之后；IPv4 形如 `0.0.0.0:6379`，
    // 直接取最后一个 `:` 之后的部分即可。两者都用 rfind(':') 统一处理，
    // 这样不会把 IPv6 地址内部的冒号当成端口分隔符。
    let port_str = address.rfind(':').map(|idx| &address[idx + 1..])?;
    port_str.parse::<u16>().ok()
}

pub fn lookup_process_name(pid: u32) -> AppResult<String> {
    let filter = format!("PID eq {}", pid);
    let output = Command::new("tasklist")
        .args(["/FI", &filter, "/FO", "CSV", "/NH"])
        .creation_flags(CREATE_NO_WINDOW)
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
        .creation_flags(CREATE_NO_WINDOW)
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
    command.creation_flags(CREATE_NO_WINDOW);
    command.args(["/PID", &pid.to_string(), "/T"]);

    if force {
        command.arg("/F");
    }

    let output = command.output().into_app_result()?;
    Ok(output.status.success())
}

/// 进程信息（名称 + 路径）
#[derive(Debug, Clone, serde::Deserialize)]
pub struct ProcessInfo {
    pub name: String,
    pub path: String,
}

/// PowerShell 单次查询返回的进程结构（CimInstance 序列化格式）
#[derive(Debug, serde::Deserialize)]
struct CimProcess {
    #[serde(rename = "ProcessId")]
    process_id: u32,
    #[serde(rename = "Name")]
    name: Option<String>,
    #[serde(rename = "ExecutablePath")]
    executable_path: Option<String>,
}

/// 单次 PowerShell 调用批量查询所有进程的 name + path
///
/// 替代原来的逐 PID 调 tasklist / Get-CimInstance，将 N*2 次进程创建降为 1 次。
fn query_all_processes_batch() -> AppResult<Vec<CimProcess>> {
    let command = r#"
Get-CimInstance Win32_Process -Property ProcessId, Name, ExecutablePath | ConvertTo-Json -Compress
"#.trim().to_string();

    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", &command])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .into_app_result()?;

    if !output.status.success() {
        return Ok(Vec::new());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let trimmed = stdout.trim();

    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    // PowerShell 单条结果返回的是对象而非数组，统一成数组解析
    let deserialized: Vec<CimProcess> = if trimmed.starts_with('[') {
        serde_json::from_str(trimmed).map_err(|e| format!("解析进程 JSON 数组失败: {}", e))?
    } else {
        let single: CimProcess = serde_json::from_str(trimmed).map_err(|e| format!("解析进程 JSON 对象失败: {}", e))?;
        vec![single]
    };

    Ok(deserialized)
}

/// 批量查多个 PID 的进程名和路径
///
/// 单次 PowerShell 查询所有进程并过滤，避免逐 PID 拉起进程。
pub fn lookup_process_infos(
    pids: &std::collections::HashSet<u32>,
) -> AppResult<std::collections::HashMap<u32, ProcessInfo>> {
    if pids.is_empty() {
        return Ok(std::collections::HashMap::new());
    }

    let all_processes = query_all_processes_batch()?;
    let mut cache = std::collections::HashMap::new();

    for proc in all_processes {
        if !pids.contains(&proc.process_id) {
            continue;
        }
        if let Some(name) = proc.name {
            if name.is_empty() {
                continue;
            }
            cache.insert(proc.process_id, ProcessInfo {
                name,
                path: proc.executable_path.unwrap_or_default(),
            });
        }
    }

    Ok(cache)
}

#[cfg(test)]
mod tests {
    use super::{extract_port, find_listening_pid_by_port};

    const NETSTAT_SAMPLE: &str = "\
活动连接

  协议  本地地址                外部地址        状态           PID
  TCP    0.0.0.0:6379           0.0.0.0:0              LISTENING       1111
  TCP    0.0.0.0:63790          0.0.0.0:0              LISTENING       2222
  TCP    127.0.0.1:3306         0.0.0.0:0              LISTENING       3333
  TCP    [::]:6379              [::]:0                 LISTENING       4444
  TCP    0.0.0.0:8080           0.0.0.0:0              LISTENING       5555
  TCP    192.168.1.10:49200     20.42.65.91:443        ESTABLISHED     6666
";

    #[test]
    fn extract_port_parses_ipv4_address() {
        assert_eq!(extract_port("0.0.0.0:6379"), Some(6379));
        assert_eq!(extract_port("127.0.0.1:3306"), Some(3306));
    }

    #[test]
    fn extract_port_parses_ipv6_address() {
        // 带方括号的 IPv6，端口在最后一个冒号之后
        assert_eq!(extract_port("[::]:6379"), Some(6379));
        assert_eq!(extract_port("[2001:db8::1]:6379"), Some(6379));
    }

    #[test]
    fn extract_port_returns_none_for_invalid_input() {
        assert_eq!(extract_port("0.0.0.0"), None);
        assert_eq!(extract_port("0.0.0.0:abc"), None);
    }

    #[test]
    fn find_pid_does_not_match_prefix_port() {
        // 旧 bug 的回归测试：查 637 时不能命中 6379 / 63790。
        assert_eq!(find_listening_pid_by_port(NETSTAT_SAMPLE, 637), None);
        assert_eq!(find_listening_pid_by_port(NETSTAT_SAMPLE, 80), None);
        assert_eq!(find_listening_pid_by_port(NETSTAT_SAMPLE, 808), None);
    }

    #[test]
    fn find_pid_matches_exact_port_only() {
        assert_eq!(
            find_listening_pid_by_port(NETSTAT_SAMPLE, 6379),
            Some(1111)
        );
        assert_eq!(
            find_listening_pid_by_port(NETSTAT_SAMPLE, 63790),
            Some(2222)
        );
        assert_eq!(
            find_listening_pid_by_port(NETSTAT_SAMPLE, 3306),
            Some(3333)
        );
    }

    #[test]
    fn find_pid_picks_first_match_and_ignores_non_listening() {
        // 49200 是 ESTABLISHED 而非 LISTENING，即便端口存在也不应被返回
        assert_eq!(find_listening_pid_by_port(NETSTAT_SAMPLE, 49200), None);
        assert_eq!(find_listening_pid_by_port(NETSTAT_SAMPLE, 8080), Some(5555));
    }

    #[test]
    fn find_pid_returns_none_when_port_absent() {
        assert_eq!(find_listening_pid_by_port(NETSTAT_SAMPLE, 1), None);
    }
}
