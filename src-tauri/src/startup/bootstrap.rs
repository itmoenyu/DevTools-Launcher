use tracing::info;

use crate::{
    core::{app_state::AppState, error::AppResult},
    db::{
        connection::resolve_db_path,
        migrations::run_migrations,
        service_repository::seed_builtin_services,
        settings_repository::ensure_default_settings,
    },
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
    Ok(AppState::new(db_path))
}
