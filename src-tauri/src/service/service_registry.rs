use crate::{
    core::{error::AppResult, types::ServiceDefinition},
    db::service_repository::list_services,
};

pub fn list_registered_services(db_path: &str) -> AppResult<Vec<ServiceDefinition>> {
    list_services(db_path)
}
