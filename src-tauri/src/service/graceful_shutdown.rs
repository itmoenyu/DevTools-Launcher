use tracing::debug;

use crate::{
    core::error::AppResult,
    port::process_lookup::kill_process,
};

pub fn stop_pid(pid: u32, force: bool) -> AppResult<bool> {
    debug!("停止进程 PID: {} force: {}", pid, force);
    kill_process(pid, force)
}
