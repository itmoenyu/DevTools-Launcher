use rusqlite::params;

use crate::{
    core::{
        error::{AppResult, IntoAppResult},
        types::AppSettings,
    },
    db::connection::open_connection,
};

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn default_settings() -> AppSettings {
    AppSettings {
        close_to_tray: true,
        launch_on_startup: false,
        minimize_on_launch: false,
        data_retention_days: 14,
        preferred_theme: "dark".to_string(),
    }
}

pub fn ensure_default_settings(db_path: &str) -> AppResult<()> {
    let settings = default_settings();
    save_settings(db_path, &settings)?;
    Ok(())
}

pub fn get_settings(db_path: &str) -> AppResult<AppSettings> {
    let connection = open_connection(db_path)?;
    let mut statement = connection
        .prepare("SELECT setting_key, setting_value FROM app_settings")
        .into_app_result()?;
    let pairs = statement
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
        .into_app_result()?
        .collect::<Result<Vec<_>, _>>()
        .into_app_result()?;

    let mut settings = default_settings();

    for (key, value) in pairs {
        match key.as_str() {
            "close_to_tray" => settings.close_to_tray = value == "true",
            "launch_on_startup" => settings.launch_on_startup = value == "true",
            "minimize_on_launch" => settings.minimize_on_launch = value == "true",
            "data_retention_days" => {
                settings.data_retention_days = value.parse::<i64>().unwrap_or(14)
            }
            "preferred_theme" => settings.preferred_theme = value,
            _ => {}
        }
    }

    // 桌面端生命周期已经固定为“关闭隐藏到托盘”。
    // 这里强制回写运行时结果，避免历史数据库里曾保存过 false 时，
    // 前端仍误以为可以通过设置关闭这个行为。
    settings.close_to_tray = true;

    Ok(settings)
}

pub fn save_settings(db_path: &str, settings: &AppSettings) -> AppResult<AppSettings> {
    let connection = open_connection(db_path)?;
    let timestamp = now();
    let entries = [
        // 关闭按钮最小化到托盘已经是固定产品规则，这里始终保存 true。
        ("close_to_tray", true.to_string()),
        ("launch_on_startup", settings.launch_on_startup.to_string()),
        ("minimize_on_launch", settings.minimize_on_launch.to_string()),
        ("data_retention_days", settings.data_retention_days.to_string()),
        ("preferred_theme", settings.preferred_theme.clone()),
    ];

    for (key, value) in entries {
        connection
            .execute(
                r#"
                INSERT INTO app_settings (setting_key, setting_value, updated_at)
                VALUES (?1, ?2, ?3)
                ON CONFLICT(setting_key) DO UPDATE SET
                  setting_value = excluded.setting_value,
                  updated_at = excluded.updated_at
                "#,
                params![key, value, timestamp],
            )
            .into_app_result()?;
    }

    let mut normalized = settings.clone();
    normalized.close_to_tray = true;

    Ok(normalized)
}
