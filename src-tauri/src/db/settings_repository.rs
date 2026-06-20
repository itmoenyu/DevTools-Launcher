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
        auto_update_enabled: false,
        latest_release_notes: String::new(),
        latest_checked_version: String::new(),
        close_action: "minimize".to_string(),
        close_reminder_disabled: false,
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
            "auto_update_enabled" => settings.auto_update_enabled = value == "true",
            "latest_release_notes" => settings.latest_release_notes = value,
            "latest_checked_version" => settings.latest_checked_version = value,
            "close_action" => settings.close_action = value,
            "close_reminder_disabled" => settings.close_reminder_disabled = value == "true",
            _ => {}
        }
    }

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
        ("auto_update_enabled", settings.auto_update_enabled.to_string()),
        ("latest_release_notes", settings.latest_release_notes.clone()),
        ("latest_checked_version", settings.latest_checked_version.clone()),
        ("close_action", settings.close_action.clone()),
        ("close_reminder_disabled", settings.close_reminder_disabled.to_string()),
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

    Ok(settings.clone())
}
