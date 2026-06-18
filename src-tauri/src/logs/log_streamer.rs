use std::{
    io::{BufRead, BufReader},
    process::{ChildStderr, ChildStdout},
    thread,
};

use tauri::{AppHandle, Emitter};

use crate::{
    core::event_bus::SERVICE_LOG_APPENDED,
    logs::log_repository::append_log,
};

fn spawn_reader<T>(app_handle: AppHandle, db_path: String, service_id: String, reader: T, stream_type: &'static str)
where
    T: std::io::Read + Send + 'static,
{
    thread::spawn(move || {
        let buffered = BufReader::new(reader);

        let log_level = if stream_type == "stderr" { "error" } else { "info" };

        for line in buffered.lines().map_while(Result::ok) {
            let content = line.trim();

            if content.is_empty() {
                continue;
            }

            if let Ok(entry) = append_log(&db_path, &service_id, log_level, stream_type, content) {
                let _ = app_handle.emit(SERVICE_LOG_APPENDED, entry);
            }
        }
    });
}

pub fn stream_process_logs(
    app_handle: AppHandle,
    db_path: String,
    service_id: String,
    stdout: Option<ChildStdout>,
    stderr: Option<ChildStderr>,
) {
    if let Some(stdout) = stdout {
        spawn_reader(app_handle.clone(), db_path.clone(), service_id.clone(), stdout, "stdout");
    }

    if let Some(stderr) = stderr {
        spawn_reader(app_handle, db_path, service_id, stderr, "stderr");
    }
}
