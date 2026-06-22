use crate::core::{error::AppResult, types::PortInspectionItem};

use super::ip_helper::list_tcp_listening;
use super::process_lookup::inspect_port;

pub fn inspect_ports(ports: Vec<u16>) -> AppResult<Vec<PortInspectionItem>> {
    ports.into_iter().map(inspect_port).collect()
}

/// 列出系统所有 LISTENING TCP 端口（新版本，替代 inspect_ports 的手工输入模式）
///
/// 通过 Windows IP Helper API 单次 syscall 拿全表，性能优于逐端口 netstat。
pub fn list_listening_ports() -> AppResult<Vec<PortInspectionItem>> {
    list_tcp_listening()
}
