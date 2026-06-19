use rusqlite::params;
use uuid::Uuid;

use crate::{
    core::{
        error::{AppResult, IntoAppResult},
        types::LogEntry,
    },
    db::connection::open_connection,
};

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

pub fn append_log(
    db_path: &str,
    service_id: &str,
    log_level: &str,
    stream_type: &str,
    content: &str,
) -> AppResult<LogEntry> {
    let entry = LogEntry {
        id: Uuid::new_v4().to_string(),
        service_id: service_id.to_string(),
        log_level: log_level.to_string(),
        stream_type: stream_type.to_string(),
        content: content.to_string(),
        created_at: now(),
    };
    let connection = open_connection(db_path)?;
    connection
        .execute(
            "INSERT INTO logs (id, service_id, log_level, stream_type, content, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                entry.id,
                entry.service_id,
                entry.log_level,
                entry.stream_type,
                entry.content,
                entry.created_at,
            ],
        )
        .into_app_result()?;
    Ok(entry)
}

pub fn query_logs(db_path: &str, service_id: Option<&str>, keyword: Option<&str>) -> AppResult<Vec<LogEntry>> {
    let connection = open_connection(db_path)?;
    let sql = match (service_id, keyword) {
        (Some(_), Some(_)) => {
            "SELECT * FROM logs WHERE service_id = ?1 AND content LIKE ?2 ORDER BY created_at DESC LIMIT 500"
        }
        (Some(_), None) => "SELECT * FROM logs WHERE service_id = ?1 ORDER BY created_at DESC LIMIT 500",
        (None, Some(_)) => "SELECT * FROM logs WHERE content LIKE ?1 ORDER BY created_at DESC LIMIT 500",
        (None, None) => "SELECT * FROM logs ORDER BY created_at DESC LIMIT 500",
    };
    let mut statement = connection.prepare(sql).into_app_result()?;
    let like_keyword = keyword.map(|value| format!("%{}%", value));

    let rows = match (service_id, like_keyword.as_deref()) {
        (Some(service_id), Some(keyword)) => statement
            .query_map(params![service_id, keyword], map_log_row)
            .into_app_result()?,
        (Some(service_id), None) => statement
            .query_map(params![service_id], map_log_row)
            .into_app_result()?,
        (None, Some(keyword)) => statement
            .query_map(params![keyword], map_log_row)
            .into_app_result()?,
        (None, None) => statement.query_map([], map_log_row).into_app_result()?,
    }
    .collect::<Result<Vec<_>, _>>()
    .into_app_result()?;

    Ok(rows)
}

pub fn clear_logs_by_service(db_path: &str, service_id: &str) -> AppResult<bool> {
    let connection = open_connection(db_path)?;
    let deleted = connection
        .execute("DELETE FROM logs WHERE service_id = ?1", params![service_id])
        .into_app_result()?;
    Ok(deleted > 0)
}

/// 删除 `created_at` 早于 `cutoff_rfc3339` 的日志。
///
/// `created_at` 列以 RFC3339（UTC）字符串写入，RFC3339 的字典序与时间顺序一致，
/// 因此直接用字符串比较即可，无需把每一行都解析成时间类型。
/// 返回被删除的行数，供调用方记录。
pub fn delete_logs_before(db_path: &str, cutoff_rfc3339: &str) -> AppResult<usize> {
    let connection = open_connection(db_path)?;
    let deleted = connection
        .execute(
            "DELETE FROM logs WHERE created_at < ?1",
            params![cutoff_rfc3339],
        )
        .into_app_result()?;
    Ok(deleted)
}

fn map_log_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<LogEntry> {
    Ok(LogEntry {
        id: row.get("id")?,
        service_id: row.get("service_id")?,
        log_level: row.get("log_level")?,
        stream_type: row.get("stream_type")?,
        content: row.get("content")?,
        created_at: row.get("created_at")?,
    })
}
