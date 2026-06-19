use std::io::Cursor;

use png::Decoder;
use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    AppHandle, Manager, WindowEvent,
};
use tracing::warn;

use crate::{core::error::AppResult, lifecycle::app_lifecycle_manager};

fn load_tray_icon() -> AppResult<Image<'static>> {
    let bytes = include_bytes!("../../icons/32x32.png");
    let decoder = Decoder::new(Cursor::new(bytes));
    let mut reader = decoder.read_info().map_err(|e| e.to_string())?;
    let (width, height) = reader.info().size();
    let buf_size = reader.output_buffer_size();
    let mut buf = vec![0; buf_size];
    reader.next_frame(&mut buf).map_err(|e| e.to_string())?;

    let color_type = reader.info().color_type;
    let expected = (width * height * 4) as usize;

    let rgba = if color_type == png::ColorType::Rgba && buf_size >= expected {
        buf
    } else {
        let step = match color_type {
            png::ColorType::Rgb => 3,
            png::ColorType::GrayscaleAlpha => 2,
            png::ColorType::Grayscale => 1,
            _ => 4,
        };
        let mut pixels = Vec::with_capacity(expected);
        for chunk in buf.chunks(step).take((width * height) as usize) {
            pixels.extend_from_slice(&chunk[..step.min(3)]);
            pixels.push(match step {
                2 => chunk.get(1).copied().unwrap_or(255),
                4 => chunk.get(3).copied().unwrap_or(255),
                _ => 255,
            });
        }
        pixels
    };

    Ok(Image::new_owned(rgba, width, height))
}

pub fn setup_tray(app_handle: &AppHandle) -> AppResult<()> {
    let show = MenuItemBuilder::new("显示主窗口").id("show").build(app_handle).map_err(|e| e.to_string())?;
    let quit = MenuItemBuilder::new("退出应用").id("quit").build(app_handle).map_err(|e| e.to_string())?;
    let menu = MenuBuilder::new(app_handle).items(&[&show, &quit]).build().map_err(|e| e.to_string())?;

    let icon = load_tray_icon()?;

    TrayIconBuilder::new()
        .icon(icon)
        .tooltip(if cfg!(debug_assertions) {
            "DevTools Launcher - 开发工具启动器（开发）"
        } else {
            "DevTools Launcher - 开发工具启动器"
        })
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                app_lifecycle_manager::show_main_window(app);
            }
            "quit" => {
                app_lifecycle_manager::request_app_exit(app, "tray-menu-quit");
            }
            _ => {}
        })
        .build(app_handle)
        .map_err(|error| error.to_string())?;

    let app = app_handle.clone();
    if let Some(window) = app.get_webview_window("main") {
        window.on_window_event(move |event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let state = app.state::<crate::core::app_state::AppState>();
                if state.exiting.load(std::sync::atomic::Ordering::SeqCst) {
                    return;
                }

                api.prevent_close();
                if let Err(error) = app_lifecycle_manager::handle_main_window_close(&app) {
                    warn!("处理主窗口关闭事件失败，将回退为退出应用: {}", error);
                    app_lifecycle_manager::request_app_exit(&app, "main-window-close-fallback");
                }
            }
        });
    }

    Ok(())
}
