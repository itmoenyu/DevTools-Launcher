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

#[cfg(test)]
mod tests {
    use std::{
        collections::HashMap,
        io::Read,
        net::TcpListener,
        sync::mpsc,
        thread,
        time::Duration,
    };

    use super::{resolve_redis_port, stop_redis_service};
    use crate::core::types::ServiceDefinition;

    fn build_redis_service(port: Option<u16>, args: Vec<&str>) -> ServiceDefinition {
        ServiceDefinition {
            id: "test-redis".to_string(),
            name: "Test Redis".to_string(),
            service_type: "redis".to_string(),
            is_builtin: false,
            exec_path: "redis-server.exe".to_string(),
            work_dir: ".".to_string(),
            args: args.into_iter().map(str::to_string).collect(),
            env: HashMap::new(),
            port,
            stop_strategy: "taskkill".to_string(),
            healthcheck_strategy: "process_and_port".to_string(),
            description: "用于 Redis 停止逻辑回归测试".to_string(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn resolve_redis_port_prefers_service_port_field() {
        let service = build_redis_service(Some(6379), vec!["--port", "6380"]);

        assert_eq!(resolve_redis_port(&service), Some(6379));
    }

    #[test]
    fn resolve_redis_port_supports_both_argument_styles() {
        let separated_arg_service = build_redis_service(None, vec!["--save", "", "--port", "6381"]);
        let inline_arg_service = build_redis_service(None, vec!["--port=6382"]);
        let missing_port_service = build_redis_service(None, vec!["--appendonly", "yes"]);

        assert_eq!(resolve_redis_port(&separated_arg_service), Some(6381));
        assert_eq!(resolve_redis_port(&inline_arg_service), Some(6382));
        assert_eq!(resolve_redis_port(&missing_port_service), None);
    }

    #[test]
    fn stop_redis_service_sends_shutdown_protocol() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("测试端口监听失败");
        let port = listener.local_addr().expect("读取测试端口失败").port();
        let (payload_sender, payload_receiver) = mpsc::channel();

        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("测试服务未收到连接");
            stream
                .set_read_timeout(Some(Duration::from_secs(1)))
                .expect("设置读取超时失败");

            let mut buffer = [0_u8; 64];
            let size = stream.read(&mut buffer).expect("读取 Redis 指令失败");
            payload_sender
                .send(buffer[..size].to_vec())
                .expect("回传 Redis 指令失败");
        });

        let service = build_redis_service(Some(port), vec![]);

        assert!(stop_redis_service(&service).expect("发送 Redis SHUTDOWN 指令失败"));
        assert_eq!(
            payload_receiver
                .recv_timeout(Duration::from_secs(2))
                .expect("没有收到 Redis SHUTDOWN 指令"),
            b"*1\r\n$8\r\nSHUTDOWN\r\n".to_vec()
        );

        server.join().expect("测试服务线程退出失败");
    }
}
