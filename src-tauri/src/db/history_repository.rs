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

/// 删除 `created_at` 早于 `cutoff_rfc3339` 的操作历史。
///
/// 与日志清理同理，`created_at` 是 RFC3339 字符串，可直接用字典序比较。
/// 返回被删除的行数。
pub fn delete_history_before(db_path: &str, cutoff_rfc3339: &str) -> AppResult<usize> {
    let connection = open_connection(db_path)?;
    let deleted = connection
        .execute(
            "DELETE FROM operation_history WHERE created_at < ?1",
            params![cutoff_rfc3339],
        )
        .into_app_result()?;
    Ok(deleted)
}
