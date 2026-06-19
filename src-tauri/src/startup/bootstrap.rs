use tracing::{info, warn};

use crate::{
    core::{app_state::AppState, error::AppResult},
    db::{
        connection::resolve_db_path,
        history_repository::delete_history_before,
        migrations::run_migrations,
        service_repository::seed_builtin_services,
        settings_repository::{ensure_default_settings, get_settings},
    },
    logs::log_repository::delete_logs_before,
};

pub fn resolve_app_db_path() -> AppResult<String> {
    resolve_db_path()
}

pub fn initialize_app_state() -> AppResult<AppState> {
    let db_path = resolve_db_path()?;
    info!("数据库路径: {}", db_path);
    run_migrations(&db_path)?;
    info!("数据库迁移完成");
    seed_builtin_services(&db_path)?;
    info!("内置服务已播种");
    ensure_default_settings(&db_path)?;
    info!("默认设置已确保");

    // 数据保留期此前只是设置项里的一个数字，没有任何地方真正按它清理，
    // 日志和操作历史会无限增长。这里在每次启动时按设置清理一次过期数据。
    prune_expired_data(&db_path);

    Ok(AppState::new(db_path))
}

/// 按设置里的 `data_retention_days` 清理过期的日志和操作历史。
///
/// 清理失败不应阻断应用启动，因此只记录 warn，不向上抛错。
fn prune_expired_data(db_path: &str) {
    let retention_days = match get_settings(db_path) {
        Ok(settings) => settings.data_retention_days,
        Err(error) => {
            warn!("读取数据保留期设置失败，跳过过期数据清理：{}", error);
            return;
        }
    };

    // 保留期设为非正数视为“不自动清理”，把控制权交给用户。
    if retention_days <= 0 {
        info!("数据保留期为 {}（非正数），跳过过期数据清理", retention_days);
        return;
    }

    let cutoff = chrono::Utc::now()
        - chrono::Duration::try_days(retention_days).unwrap_or(chrono::Duration::days(14));
    let cutoff_rfc3339 = cutoff.to_rfc3339();

    match delete_logs_before(db_path, &cutoff_rfc3339) {
        Ok(deleted) => info!("已清理 {} 条过期日志（截止 {}）", deleted, cutoff_rfc3339),
        Err(error) => warn!("清理过期日志失败：{}", error),
    }

    match delete_history_before(db_path, &cutoff_rfc3339) {
        Ok(deleted) => info!("已清理 {} 条过期操作历史（截止 {}）", deleted, cutoff_rfc3339),
        Err(error) => warn!("清理过期操作历史失败：{}", error),
    }
}
