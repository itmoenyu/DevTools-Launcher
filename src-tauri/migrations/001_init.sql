CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  service_type TEXT NOT NULL,
  is_builtin INTEGER NOT NULL DEFAULT 0,
  exec_path TEXT NOT NULL,
  work_dir TEXT NOT NULL,
  args_json TEXT NOT NULL,
  env_json TEXT NOT NULL,
  port INTEGER,
  stop_strategy TEXT NOT NULL,
  healthcheck_strategy TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS service_runtime (
  service_id TEXT PRIMARY KEY,
  pid INTEGER,
  status TEXT NOT NULL,
  started_at TEXT,
  stopped_at TEXT,
  exit_code INTEGER,
  last_heartbeat_at TEXT,
  status_message TEXT NOT NULL DEFAULT '',
  FOREIGN KEY(service_id) REFERENCES services(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS logs (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL,
  log_level TEXT NOT NULL,
  stream_type TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(service_id) REFERENCES services(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS operation_history (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL,
  service_name TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  result TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS launch_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS launch_group_items (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  depends_on_service_id TEXT,
  FOREIGN KEY(group_id) REFERENCES launch_groups(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
