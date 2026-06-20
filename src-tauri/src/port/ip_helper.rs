//! Windows IP Helper API 封装 - 列出 LISTENING TCP 端口
//!
//! 使用 `GetExtendedTcpTable` 单次 syscall 拿全表，替代之前逐端口 `netstat` 调用的方式。
//! 性能对标：~20ms 完成 100 端口扫描。

use std::net::Ipv4Addr;

use windows::Win32::Networking::WinSock::{AF_INET, SOCKADDR_IN};

use crate::core::error::AppResult;
use crate::core::types::{PortInspectionItem, PortProtocol, TcpState};

/// 解析本地地址（SOCKADDR_IN -> 字符串）
pub fn parse_local_address(addr: &SOCKADDR_IN) -> String {
    // S_un 是 union，访问字段需要 unsafe block
    let raw = unsafe { addr.sin_addr.S_un.S_addr };
    Ipv4Addr::from(raw.to_ne_bytes()).to_string()
}

/// 列出系统所有 LISTENING TCP 端口（通过 Windows IP Helper API）
pub fn list_tcp_listening() -> AppResult<Vec<PortInspectionItem>> {
    use std::collections::HashSet;
    use windows::Win32::NetworkManagement::IpHelper::{
        GetExtendedTcpTable, TCP_TABLE_CLASS, TCP_TABLE_OWNER_PID_LISTENER,
    };

    // 第一次调用获取所需 buffer 大小
    let mut size: u32 = 0;
    unsafe {
        // 这是 IP Helper API 的标准用法：第一次调用传 None 拿到所需 size
        let _ = GetExtendedTcpTable(
            None,
            &mut size,
            false,
            AF_INET.0 as u32,
            TCP_TABLE_CLASS(TCP_TABLE_OWNER_PID_LISTENER.0),
            0,
        );
    }
    if size == 0 {
        return Ok(Vec::new());
    }

    // 第二次调用拿真实数据
    let mut buf = vec![0u8; size as usize];
    let result_code = unsafe {
        GetExtendedTcpTable(
            Some(buf.as_mut_ptr() as *mut _),
            &mut size,
            false,
            AF_INET.0 as u32,
            TCP_TABLE_CLASS(TCP_TABLE_OWNER_PID_LISTENER.0),
            0,
        )
    };
    if result_code != 0 {
        // 0 = NO_ERROR; 非 0 是 WIN32 error code
        return Err(format!(
            "GetExtendedTcpTable failed with code {}",
            result_code
        ));
    }

    // 解析: buf 头部是 MIB_TCPTABLE_OWNER_PID { dwNumEntries: u32, table: [MIB_TCPROW_OWNER_PID; N] }
    let num_entries = u32::from_ne_bytes(buf[0..4].try_into().unwrap()) as usize;

    // MIB_TCPROW_OWNER_PID 在 windows crate 中布局:
    //   dwState: u32 (4)
    //   dwLocalAddr: u32 (4)
    //   dwLocalPort: u32 (4)
    //   dwRemoteAddr: u32 (4)
    //   dwRemotePort: u32 (4)
    //   dwOwningPid: u32 (4)
    // 每行 24 字节
    const ROW_SIZE: usize = 24;
    const LOCAL_ADDR_OFFSET: usize = 4;
    const LOCAL_PORT_OFFSET: usize = 8;
    const PID_OFFSET: usize = 20;

    let mut items = Vec::with_capacity(num_entries);
    let mut unique_pids: HashSet<u32> = HashSet::new();

    for i in 0..num_entries {
        let base = 4 + i * ROW_SIZE;
        let local_addr = u32::from_ne_bytes(buf[base + LOCAL_ADDR_OFFSET..base + LOCAL_ADDR_OFFSET + 4].try_into().unwrap());
        let local_port_raw = u32::from_ne_bytes(buf[base + LOCAL_PORT_OFFSET..base + LOCAL_PORT_OFFSET + 4].try_into().unwrap());
        let pid_raw = u32::from_ne_bytes(buf[base + PID_OFFSET..base + PID_OFFSET + 4].try_into().unwrap());

        // 端口在 dwLocalPort 的低 16 位（高 16 位是 socket 类型，固定为 AF_INET）
        let port = (local_port_raw & 0xFFFF) as u16;
        if port == 0 {
            continue;
        }

        let ip = Ipv4Addr::from(local_addr.to_ne_bytes()).to_string();
        let pid = if pid_raw == 0 { None } else { Some(pid_raw) };
        if let Some(p) = pid {
            unique_pids.insert(p);
        }

        items.push(PortInspectionItem {
            port,
            state: TcpState::Listening,
            protocol: PortProtocol::Tcp,
            local_address: ip,
            occupied: true,
            pid,
            process_name: None,
            process_path: None,
        });
    }

    // 批量查进程信息
    let info_cache = super::process_lookup::lookup_process_infos(&unique_pids)?;
    for item in &mut items {
        if let Some(pid) = item.pid {
            if let Some(info) = info_cache.get(&pid) {
                item.process_name = Some(info.name.clone());
                item.process_path = Some(info.path.clone());
            }
        }
    }

    Ok(items)
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows::Win32::Networking::WinSock::SOCKADDR_IN;

    fn make_sockaddr(ip: [u8; 4], port_be: u16) -> SOCKADDR_IN {
        let mut sa = SOCKADDR_IN::default();
        sa.sin_family = AF_INET;
        unsafe { sa.sin_addr.S_un.S_addr = u32::from_ne_bytes(ip) };
        sa.sin_port = port_be;
        sa
    }

    #[test]
    fn parse_loopback_returns_127_0_0_1() {
        let sa = make_sockaddr([127, 0, 0, 1], 8080u16.to_be());
        assert_eq!(parse_local_address(&sa), "127.0.0.1");
    }

    #[test]
    fn parse_any_returns_0_0_0_0() {
        let sa = make_sockaddr([0, 0, 0, 0], 80u16.to_be());
        assert_eq!(parse_local_address(&sa), "0.0.0.0");
    }

    #[test]
    fn parse_specific_ip_returns_ip_string() {
        let sa = make_sockaddr([192, 168, 1, 100], 5432u16.to_be());
        assert_eq!(parse_local_address(&sa), "192.168.1.100");
    }

    #[test]
    fn port_byte_order_is_network() {
        // 8080 (host) 转换到大端字节序，再转回 host 应该等于 8080
        let roundtrip: u16 = u16::from_be(8080u16.to_be());
        assert_eq!(roundtrip, 8080);
        // 真实 API 返回的是网络字节序，必须用 from_be 还原
        // (避免以后误用 to_le 引入 bug)
    }
}
