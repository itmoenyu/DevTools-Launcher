//! 在系统默认浏览器中打开 URL

use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

/// 在系统默认浏览器中打开 `http://<host>:<port>`。
///
/// - `0.0.0.0` / `127.0.0.1` / `[::]` / 空字符串都视为回环，替换为 `localhost`
/// - 其他地址原样拼接
pub fn open_in_browser(app: &AppHandle, port: u16, address: &str) -> Result<(), String> {
    let host = if address == "0.0.0.0" || address == "127.0.0.1" || address == "[::]" || address.is_empty() {
        "localhost"
    } else {
        address
    };
    let url = format!("http://{}:{}", host, port);

    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| format!("failed to open browser: {}", e))
}
