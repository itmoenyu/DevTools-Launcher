use rusqlite::params;
use uuid::Uuid;

use crate::{
    core::{
        error::{AppResult, IntoAppResult},
        types::OperationHistoryItem,
    },
    db::connection::open_connection,
};

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

pub fn append_history(
    db_path: &str,
    service_id: &str,
    service_name: &str,
    operation_type: &str,
    result: &str,
    message: &str,
) -> AppResult<()> {
    let connection = open_connection(db_path)?;
    connection
        .execute(
            "INSERT INTO operation_history (id, service_id, service_name, operation_type, result, message, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                Uuid::new_v4().to_string(),
                service_id,
                service_name,
                operation_type,
                result,
                message,
                now(),
            ],
        )
        .into_app_result()?;
    Ok(())
}

pub fn list_history(db_path: &str) -> AppResult<Vec<OperationHistoryItem>> {
    let connection = open_connection(db_path)?;
    let mut statement = connection
        .prepare("SELECT * FROM operation_history ORDER BY created_at DESC LIMIT 200")
        .into_app_result()?;
    let rows = statement
        .query_map([], |row| {
            Ok(OperationHistoryItem {
                id: row.get("id")?,
                service_id: row.get("service_id")?,
                service_name: row.get("service_name")?,
                operation_type: row.get("operation_type")?,
                result: row.get("result")?,
                message: row.get("message")?,
                created_at: row.get("created_at")?,
            })
        })
        .into_app_result()?
        .collect::<Result<Vec<_>, _>>()
        .into_app_result()?;
    Ok(rows)
}
