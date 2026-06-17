use crate::core::error::{AppResult, IntoAppResult};

use super::connection::open_connection;

const INIT_SQL: &str = include_str!("../../migrations/001_init.sql");

pub fn run_migrations(db_path: &str) -> AppResult<()> {
    let connection = open_connection(db_path)?;
    connection.execute_batch(INIT_SQL).into_app_result()?;
    Ok(())
}
