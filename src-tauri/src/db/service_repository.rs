use std::collections::HashMap;

use rusqlite::{params, OptionalExtension};
use uuid::Uuid;

use crate::{
    core::{
        error::{AppResult, IntoAppResult},
        types::{ServiceDefinition, ServicePayload, ServiceRuntime, ServiceWithRuntime},
    },
    db::connection::open_connection,
};

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn service_exists(db_path: &str, service_id: &str) -> AppResult<bool> {
    let connection = open_connection(db_path)?;
    let existing = connection
        .query_row(
            "SELECT id FROM services WHERE id = ?1 LIMIT 1",
            params![service_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .into_app_result()?;

    Ok(existing.is_some())
}

fn default_runtime(service_id: &str) -> ServiceRuntime {
    ServiceRuntime {
        service_id: service_id.to_string(),
        pid: None,
        status: "unstarted".to_string(),
        started_at: None,
        stopped_at: None,
        exit_code: None,
        last_heartbeat_at: None,
        status_message: "服务尚未启动".to_string(),
    }
}

fn row_to_service(row: &rusqlite::Row<'_>) -> rusqlite::Result<ServiceDefinition> {
    let args_json: String = row.get("args_json")?;
    let env_json: String = row.get("env_json")?;

    Ok(ServiceDefinition {
        id: row.get("id")?,
        name: row.get("name")?,
        service_type: row.get("service_type")?,
        is_builtin: row.get::<_, i64>("is_builtin")? == 1,
        exec_path: row.get("exec_path")?,
        work_dir: row.get("work_dir")?,
        args: serde_json::from_str(&args_json).unwrap_or_default(),
        env: serde_json::from_str(&env_json).unwrap_or_default(),
        port: row.get("port")?,
        stop_strategy: row.get("stop_strategy")?,
        healthcheck_strategy: row.get("healthcheck_strategy")?,
        description: row.get("description")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

pub fn seed_builtin_services(db_path: &str) -> AppResult<()> {
    let now = now();
    let redis = ServiceDefinition {
        id: "builtin-redis".to_string(),
        name: "Redis".to_string(),
        service_type: "redis".to_string(),
        is_builtin: true,
        exec_path: String::new(),
        work_dir: String::new(),
        args: vec!["--port".to_string(), "6379".to_string()],
        env: HashMap::new(),
        port: Some(6379),
        stop_strategy: "taskkill".to_string(),
        healthcheck_strategy: "process_and_port".to_string(),
        description: "内置 Redis 模板，请在服务管理里填写实际 exe 路径。".to_string(),
        created_at: now.clone(),
        updated_at: now.clone(),
    };
    let mysql = ServiceDefinition {
        id: "builtin-mysql".to_string(),
        name: "MySQL".to_string(),
        service_type: "mysql".to_string(),
        is_builtin: true,
        exec_path: String::new(),
        work_dir: String::new(),
        args: vec!["--port".to_string(), "3306".to_string()],
        env: HashMap::new(),
        port: Some(3306),
        stop_strategy: "taskkill".to_string(),
        healthcheck_strategy: "process_and_port".to_string(),
        description: "内置 MySQL 模板，请在服务管理里填写实际 exe 路径。".to_string(),
        created_at: now.clone(),
        updated_at: now,
    };

    if !service_exists(db_path, &redis.id)? {
        upsert_service_definition(db_path, &redis)?;
    } else {
        ensure_runtime_row(db_path, &redis.id)?;
    }

    if !service_exists(db_path, &mysql.id)? {
        upsert_service_definition(db_path, &mysql)?;
    } else {
        ensure_runtime_row(db_path, &mysql.id)?;
    }

    Ok(())
}

pub fn upsert_service_from_payload(db_path: &str, payload: &ServicePayload) -> AppResult<ServiceDefinition> {
    let timestamp = now();
    let service = ServiceDefinition {
        id: payload
            .id
            .clone()
            .unwrap_or_else(|| format!("svc-{}", Uuid::new_v4())),
        name: payload.name.clone(),
        service_type: payload.service_type.clone(),
        is_builtin: matches!(payload.id.as_deref(), Some("builtin-redis" | "builtin-mysql")),
        exec_path: payload.exec_path.clone(),
        work_dir: payload.work_dir.clone(),
        args: payload.args.clone(),
        env: payload.env.clone(),
        port: payload.port,
        stop_strategy: payload.stop_strategy.clone(),
        healthcheck_strategy: payload.healthcheck_strategy.clone(),
        description: payload.description.clone(),
        created_at: timestamp.clone(),
        updated_at: timestamp,
    };

    upsert_service_definition(db_path, &service)?;
    ensure_runtime_row(db_path, &service.id)?;
    Ok(service)
}

pub fn upsert_service_definition(db_path: &str, service: &ServiceDefinition) -> AppResult<()> {
    let connection = open_connection(db_path)?;
    connection
        .execute(
            r#"
            INSERT INTO services (
              id, name, service_type, is_builtin, exec_path, work_dir, args_json, env_json,
              port, stop_strategy, healthcheck_strategy, description, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              service_type = excluded.service_type,
              is_builtin = excluded.is_builtin,
              exec_path = excluded.exec_path,
              work_dir = excluded.work_dir,
              args_json = excluded.args_json,
              env_json = excluded.env_json,
              port = excluded.port,
              stop_strategy = excluded.stop_strategy,
              healthcheck_strategy = excluded.healthcheck_strategy,
              description = excluded.description,
              updated_at = excluded.updated_at
            "#,
            params![
                service.id,
                service.name,
                service.service_type,
                if service.is_builtin { 1 } else { 0 },
                service.exec_path,
                service.work_dir,
                serde_json::to_string(&service.args).unwrap_or_else(|_| "[]".to_string()),
                serde_json::to_string(&service.env).unwrap_or_else(|_| "{}".to_string()),
                service.port,
                service.stop_strategy,
                service.healthcheck_strategy,
                service.description,
                service.created_at,
                service.updated_at,
            ],
        )
        .into_app_result()?;

    ensure_runtime_row(db_path, &service.id)?;
    Ok(())
}

pub fn delete_service(db_path: &str, service_id: &str) -> AppResult<bool> {
    let connection = open_connection(db_path)?;
    let changed = connection
        .execute("DELETE FROM services WHERE id = ?1 AND is_builtin = 0", params![service_id])
        .into_app_result()?;
    Ok(changed > 0)
}

pub fn ensure_runtime_row(db_path: &str, service_id: &str) -> AppResult<()> {
    let runtime = default_runtime(service_id);
    update_runtime(db_path, &runtime)
}

pub fn update_runtime(db_path: &str, runtime: &ServiceRuntime) -> AppResult<()> {
    let connection = open_connection(db_path)?;
    connection
        .execute(
            r#"
            INSERT INTO service_runtime (
              service_id, pid, status, started_at, stopped_at, exit_code, last_heartbeat_at, status_message
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            ON CONFLICT(service_id) DO UPDATE SET
              pid = excluded.pid,
              status = excluded.status,
              started_at = excluded.started_at,
              stopped_at = excluded.stopped_at,
              exit_code = excluded.exit_code,
              last_heartbeat_at = excluded.last_heartbeat_at,
              status_message = excluded.status_message
            "#,
            params![
                runtime.service_id,
                runtime.pid,
                runtime.status,
                runtime.started_at,
                runtime.stopped_at,
                runtime.exit_code,
                runtime.last_heartbeat_at,
                runtime.status_message,
            ],
        )
        .into_app_result()?;
    Ok(())
}

pub fn get_runtime(db_path: &str, service_id: &str) -> AppResult<ServiceRuntime> {
    let connection = open_connection(db_path)?;
    let runtime = connection
        .query_row(
            "SELECT * FROM service_runtime WHERE service_id = ?1",
            params![service_id],
            |row| {
                Ok(ServiceRuntime {
                    service_id: row.get("service_id")?,
                    pid: row.get("pid")?,
                    status: row.get("status")?,
                    started_at: row.get("started_at")?,
                    stopped_at: row.get("stopped_at")?,
                    exit_code: row.get("exit_code")?,
                    last_heartbeat_at: row.get("last_heartbeat_at")?,
                    status_message: row.get("status_message")?,
                })
            },
        )
        .optional()
        .into_app_result()?;

    Ok(runtime.unwrap_or_else(|| default_runtime(service_id)))
}

pub fn get_service(db_path: &str, service_id: &str) -> AppResult<ServiceDefinition> {
    let connection = open_connection(db_path)?;
    connection
        .query_row("SELECT * FROM services WHERE id = ?1", params![service_id], row_to_service)
        .into_app_result()
}

pub fn list_services(db_path: &str) -> AppResult<Vec<ServiceDefinition>> {
    let connection = open_connection(db_path)?;
    let mut statement = connection
        .prepare("SELECT * FROM services ORDER BY is_builtin DESC, name ASC")
        .into_app_result()?;
    let rows = statement
        .query_map([], row_to_service)
        .into_app_result()?
        .collect::<Result<Vec<_>, _>>()
        .into_app_result()?;
    Ok(rows)
}

pub fn list_services_with_runtime(db_path: &str) -> AppResult<Vec<ServiceWithRuntime>> {
    let services = list_services(db_path)?;
    services
        .into_iter()
        .map(|service| {
            let runtime = get_runtime(db_path, &service.id)?;
            Ok(ServiceWithRuntime { service, runtime })
        })
        .collect()
}
