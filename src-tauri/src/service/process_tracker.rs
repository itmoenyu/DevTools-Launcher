use std::sync::Arc;

use parking_lot::Mutex;

use crate::core::app_state::{AppState, ManagedChild};

pub fn register_child(
    state: &AppState,
    service_id: &str,
    child: Arc<Mutex<std::process::Child>>,
) {
    state.children.lock().insert(
        service_id.to_string(),
        ManagedChild {
            service_id: service_id.to_string(),
            child,
        },
    );
}

pub fn unregister_child(state: &AppState, service_id: &str) {
    state.children.lock().remove(service_id);
}

pub fn get_child(
    state: &AppState,
    service_id: &str,
) -> Option<Arc<Mutex<std::process::Child>>> {
    state
        .children
        .lock()
        .get(service_id)
        .map(|managed| managed.child.clone())
}
