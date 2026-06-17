use crate::{
    core::{
        error::AppResult,
        types::{PortInspectionItem, ServiceDefinition},
    },
    port::process_lookup::inspect_port,
};

pub fn check_service_health(service: &ServiceDefinition) -> AppResult<Option<PortInspectionItem>> {
    match service.port {
        Some(port) => Ok(Some(inspect_port(port)?)),
        None => Ok(None),
    }
}
