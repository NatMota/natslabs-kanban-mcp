import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';

const DATA_DIR = process.env.KANBAN_DATA_DIR
  ? path.resolve(process.env.KANBAN_DATA_DIR)
  : path.join(os.homedir(), '.kanban-mcp');
const DB_PATH = path.join(DATA_DIR, 'kanban.db');

fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });

const db = new Database(DB_PATH);

db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

const migrations = `
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  repo_path TEXT,
  knowledge_project_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS columns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  wip_limit INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, name)
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  column_id INTEGER NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  estimate INTEGER,
  status TEXT NOT NULL DEFAULT 'open',
  progress_state TEXT NOT NULL DEFAULT 'in_progress',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS epics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, name)
);

CREATE TABLE IF NOT EXISTS ticket_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author TEXT,
  body TEXT NOT NULL,
  file_refs TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS copilot_pending_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  resolved_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_pending_actions_project_status ON copilot_pending_actions(project_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_columns_project ON columns(project_id, order_index);
CREATE INDEX IF NOT EXISTS idx_tickets_project ON tickets(project_id);
CREATE INDEX IF NOT EXISTS idx_tickets_column ON tickets(column_id, created_at);

CREATE TABLE IF NOT EXISTS docs_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
  doc_path TEXT NOT NULL,
  docs_project_id TEXT,
  link_type TEXT NOT NULL DEFAULT 'references',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, ticket_id, doc_path, link_type)
);

CREATE INDEX IF NOT EXISTS idx_docs_links_project_ticket ON docs_links(project_id, ticket_id);
CREATE INDEX IF NOT EXISTS idx_docs_links_project_path ON docs_links(project_id, doc_path);

CREATE TABLE IF NOT EXISTS integration_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_integration_events_created ON integration_events(created_at);
CREATE INDEX IF NOT EXISTS idx_integration_events_direction ON integration_events(direction, id);

CREATE TABLE IF NOT EXISTS ticket_batches (
  id TEXT PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  trace_id TEXT,
  thread_id TEXT,
  planning_payload TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ticket_batches_project_created ON ticket_batches(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ticket_batch_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT NOT NULL REFERENCES ticket_batches(id) ON DELETE CASCADE,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  wave_index INTEGER NOT NULL DEFAULT 0,
  order_index INTEGER NOT NULL DEFAULT 0,
  planning_state TEXT,
  blocked_by_ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(batch_id, ticket_id)
);

CREATE INDEX IF NOT EXISTS idx_ticket_batch_items_batch_wave_order ON ticket_batch_items(batch_id, wave_index, order_index, id);
CREATE INDEX IF NOT EXISTS idx_ticket_batch_items_ticket ON ticket_batch_items(ticket_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ticket_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  batch_id TEXT REFERENCES ticket_batches(id) ON DELETE SET NULL,
  batch_item_id INTEGER REFERENCES ticket_batch_items(id) ON DELETE SET NULL,
  handoff_id TEXT NOT NULL UNIQUE,
  thread_id TEXT,
  executor_backend TEXT,
  run_status TEXT NOT NULL,
  resume_state TEXT,
  bundle_present INTEGER NOT NULL DEFAULT 0,
  patch_applied INTEGER NOT NULL DEFAULT 0,
  deploy_url TEXT,
  terminal_reason TEXT,
  prompt_id TEXT,
  prompt_version TEXT,
  prompt_manifest_version TEXT,
  runtime_commit_sha TEXT,
  validation_required INTEGER NOT NULL DEFAULT 0,
  validation_checks TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ticket_runs_ticket_created ON ticket_runs(ticket_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_runs_batch_created ON ticket_runs(batch_id, created_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS idx_ticket_runs_status_updated ON ticket_runs(run_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS ticket_run_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES ticket_runs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  message TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ticket_run_events_run_created ON ticket_run_events(run_id, created_at ASC, id ASC);

CREATE TABLE IF NOT EXISTS ticket_run_artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES ticket_runs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  mime_type TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ticket_run_artifacts_run_created ON ticket_run_artifacts(run_id, created_at ASC, id ASC);

CREATE TABLE IF NOT EXISTS staging_leases (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'staging' CHECK (environment = 'staging'),
  owner_id TEXT,
  ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
  run_id INTEGER REFERENCES ticket_runs(id) ON DELETE SET NULL,
  candidate_ref TEXT,
  baseline_ref TEXT,
  lease_token TEXT,
  fencing_token INTEGER NOT NULL DEFAULT 0,
  acquired_at TEXT,
  heartbeat_at TEXT,
  expires_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, environment)
);

CREATE INDEX IF NOT EXISTS idx_staging_leases_expiry ON staging_leases(expires_at);
`;

db.exec(migrations);

function getColumnNames(table: string): string[] {
  const rows = db.prepare(`PRAGMA table_info('${table}')`).all() as { name: string }[];
  return rows.map((row) => row.name);
}

function ensureColumn(table: string, column: string, definition: string): boolean {
  const names = getColumnNames(table);
  if (names.includes(column)) {
    return false;
  }
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  return true;
}

function renameColumnIfExists(table: string, from: string, to: string): boolean {
  const names = getColumnNames(table);
  if (names.includes(to)) {
    return false;
  }
  if (!names.includes(from)) {
    return false;
  }
  db.exec(`ALTER TABLE ${table} RENAME COLUMN "${from}" TO "${to}"`);
  return true;
}

renameColumnIfExists('tickets', 'INTEGER', 'epic_id');

ensureColumn('tickets', 'epic_id', 'epic_id INTEGER REFERENCES epics(id) ON DELETE SET NULL');
ensureColumn('tickets', 'completed_at', 'completed_at TEXT');
const addedPriorityColumn = ensureColumn('tickets', 'priority', 'priority INTEGER');
ensureColumn('tickets', 'progress_state', "progress_state TEXT NOT NULL DEFAULT 'in_progress'");
ensureColumn('tickets', 'completion_summary', 'completion_summary TEXT');
ensureColumn('tickets', 'deployment_proof', 'deployment_proof TEXT');
ensureColumn('tickets', 'completion_evidence', 'completion_evidence TEXT');
ensureColumn('projects', 'repo_path', 'repo_path TEXT');
ensureColumn('projects', 'knowledge_project_id', 'knowledge_project_id TEXT');
ensureColumn('projects', 'automation_settings', 'automation_settings TEXT');

if (getColumnNames('tickets').includes('epic_id')) {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tickets_epic ON tickets(epic_id)`);
}

db.exec(`CREATE INDEX IF NOT EXISTS idx_tickets_column_priority ON tickets(column_id, priority, created_at)`);

if (addedPriorityColumn) {
  db.exec(`
    WITH ordered AS (
      SELECT id,
             ROW_NUMBER() OVER (PARTITION BY column_id ORDER BY created_at, id) - 1 AS new_priority
      FROM tickets
    )
    UPDATE tickets
    SET priority = (SELECT new_priority FROM ordered WHERE ordered.id = tickets.id)
    WHERE priority IS NULL
  `);
}

db.exec(`
  WITH ordered AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY column_id ORDER BY priority, created_at, id) - 1 AS new_priority
    FROM tickets
  )
  UPDATE tickets
  SET priority = (SELECT new_priority FROM ordered WHERE ordered.id = tickets.id)
  WHERE priority IS NULL
`);

export default db;
