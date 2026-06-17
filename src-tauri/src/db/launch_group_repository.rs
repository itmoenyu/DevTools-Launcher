use rusqlite::{params, OptionalExtension};
use uuid::Uuid;

use crate::{
    core::{
        error::{AppResult, IntoAppResult},
        types::{LaunchGroupDefinition, LaunchGroupItem},
    },
    db::connection::open_connection,
};

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

pub fn list_launch_groups(db_path: &str) -> AppResult<Vec<LaunchGroupDefinition>> {
    let connection = open_connection(db_path)?;
    let mut statement = connection
        .prepare("SELECT * FROM launch_groups ORDER BY name ASC")
        .into_app_result()?;
    let groups = statement
        .query_map([], |row| {
            Ok(LaunchGroupDefinition {
                id: row.get("id")?,
                name: row.get("name")?,
                description: row.get("description")?,
                items: vec![],
                created_at: row.get("created_at")?,
                updated_at: row.get("updated_at")?,
            })
        })
        .into_app_result()?
        .collect::<Result<Vec<_>, _>>()
        .into_app_result()?;

    groups
        .into_iter()
        .map(|mut group| {
            group.items = list_launch_group_items(db_path, &group.id)?;
            Ok(group)
        })
        .collect()
}

pub fn upsert_launch_group(db_path: &str, group: &LaunchGroupDefinition) -> AppResult<LaunchGroupDefinition> {
    let connection = open_connection(db_path)?;
    let group_id = if group.id.is_empty() {
        format!("group-{}", Uuid::new_v4())
    } else {
        group.id.clone()
    };
    let timestamp = now();
    let created_at = if group.created_at.is_empty() {
        timestamp.clone()
    } else {
        group.created_at.clone()
    };

    connection
        .execute(
            r#"
            INSERT INTO launch_groups (id, name, description, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              description = excluded.description,
              updated_at = excluded.updated_at
            "#,
            params![group_id, group.name, group.description, created_at, timestamp],
        )
        .into_app_result()?;

    connection
        .execute(
            "DELETE FROM launch_group_items WHERE group_id = ?1",
            params![group_id],
        )
        .into_app_result()?;

    for item in &group.items {
        connection
            .execute(
                "INSERT INTO launch_group_items (id, group_id, service_id, sort_order, depends_on_service_id) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    if item.id.is_empty() {
                        format!("group-item-{}", Uuid::new_v4())
                    } else {
                        item.id.clone()
                    },
                    group_id,
                    item.service_id,
                    item.sort_order,
                    item.depends_on_service_id,
                ],
            )
            .into_app_result()?;
    }

    get_launch_group(db_path, &group_id)
}

pub fn get_launch_group(db_path: &str, group_id: &str) -> AppResult<LaunchGroupDefinition> {
    let connection = open_connection(db_path)?;
    let mut group: LaunchGroupDefinition = connection
        .query_row(
            "SELECT * FROM launch_groups WHERE id = ?1",
            params![group_id],
            |row| {
                Ok(LaunchGroupDefinition {
                    id: row.get("id")?,
                    name: row.get("name")?,
                    description: row.get("description")?,
                    items: vec![],
                    created_at: row.get("created_at")?,
                    updated_at: row.get("updated_at")?,
                })
            },
        )
        .optional()
        .into_app_result()?
        .ok_or_else(|| "启动组不存在".to_string())?;

    group.items = list_launch_group_items(db_path, group_id)?;
    Ok(group)
}

fn list_launch_group_items(db_path: &str, group_id: &str) -> AppResult<Vec<LaunchGroupItem>> {
    let connection = open_connection(db_path)?;
    let mut statement = connection
        .prepare("SELECT * FROM launch_group_items WHERE group_id = ?1 ORDER BY sort_order ASC")
        .into_app_result()?;
    let rows = statement
        .query_map(params![group_id], |row| {
            Ok(LaunchGroupItem {
                id: row.get("id")?,
                group_id: row.get("group_id")?,
                service_id: row.get("service_id")?,
                sort_order: row.get("sort_order")?,
                depends_on_service_id: row.get("depends_on_service_id")?,
            })
        })
        .into_app_result()?
        .collect::<Result<Vec<_>, _>>()
        .into_app_result()?;
    Ok(rows)
}
