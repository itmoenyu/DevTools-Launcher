use crate::core::{error::AppResult, types::PortInspectionItem};

use super::process_lookup::inspect_port;

pub fn inspect_ports(ports: Vec<u16>) -> AppResult<Vec<PortInspectionItem>> {
    ports.into_iter().map(inspect_port).collect()
}
