use std::{collections::HashMap, process::Child, sync::Arc};

use parking_lot::Mutex;

#[derive(Debug)]
pub struct ManagedChild {
    pub service_id: String,
    pub child: Arc<Mutex<Child>>,
}

#[derive(Debug)]
pub struct AppState {
    pub db_path: String,
    pub children: Arc<Mutex<HashMap<String, ManagedChild>>>,
}

impl AppState {
    pub fn new(db_path: String) -> Self {
        Self {
            db_path,
            children: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}
