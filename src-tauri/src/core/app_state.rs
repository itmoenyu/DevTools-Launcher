use std::{
    collections::HashMap,
    process::Child,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};

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
    pub exiting: Arc<AtomicBool>,
}

impl AppState {
    pub fn new(db_path: String) -> Self {
        Self {
            db_path,
            children: Arc::new(Mutex::new(HashMap::new())),
            exiting: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn begin_exit(&self) -> bool {
        !self.exiting.swap(true, Ordering::SeqCst)
    }
}
