use std::{
    io::Write,
    net::{TcpStream, ToSocketAddrs},
    time::Duration,
};

use tracing::debug;

use crate::{
    core::{
        error::{AppResult, IntoAppResult},
        types::ServiceDefinition,
    },
    port::process_lookup::kill_process,
};

pub fn stop_pid(pid: u32, force: bool) -> AppResult<bool> {
    debug!("停止进程 PID: {} force: {}", pid, force);
    kill_process(pid, force)
}

fn resolve_redis_port(service: &ServiceDefinition) -> Option<u16> {
    if let Some(port) = service.port {
        return Some(port);
    }

    let mut args = service.args.iter();
    while let Some(arg) = args.next() {
        if arg == "--port" {
            if let Some(value) = args.next() {
                if let Ok(port) = value.parse::<u16>() {
                    return Some(port);
                }
            }
        }

        if let Some(value) = arg.strip_prefix("--port=") {
            if let Ok(port) = value.parse::<u16>() {
                return Some(port);
            }
        }
    }

    None
}

pub fn stop_redis_service(service: &ServiceDefinition) -> AppResult<bool> {
    let Some(port) = resolve_redis_port(service) else {
        return Ok(false);
    };

    let mut addrs = ("127.0.0.1", port).to_socket_addrs().into_app_result()?;
    let Some(addr) = addrs.next() else {
        return Ok(false);
    };

    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(800)).into_app_result()?;
    stream
        .set_write_timeout(Some(Duration::from_millis(800)))
        .into_app_result()?;

    // 使用 Redis 自己的 SHUTDOWN 协议关闭服务，
    // 比直接 taskkill 更接近“优雅退出”。
    stream
        .write_all(b"*1\r\n$8\r\nSHUTDOWN\r\n")
        .into_app_result()?;
    let _ = stream.flush().into_app_result();

    Ok(true)
}
