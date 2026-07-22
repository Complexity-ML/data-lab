import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'

let database: DatabaseSync | undefined

function db(userDataDirectory: string) {
  if (database) return database
  database = new DatabaseSync(join(userDataDirectory, 'data-lab.sqlite'))
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS workspace_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)
  return database
}

export function loadSavedWorkspace(userDataDirectory: string): unknown | null {
  const row = db(userDataDirectory).prepare('SELECT payload FROM workspace_state WHERE id = 1').get() as { payload?: unknown } | undefined
  if (typeof row?.payload !== 'string') return null
  try { return JSON.parse(row.payload) } catch { return null }
}

export function saveWorkspace(userDataDirectory: string, payload: unknown) {
  const serialized = JSON.stringify(payload)
  if (serialized.length > 8_000_000) throw new Error('Workspace exceeds the 8 MB SQLite safety limit')
  db(userDataDirectory).prepare(`
    INSERT INTO workspace_state (id, payload, updated_at) VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
  `).run(serialized, new Date().toISOString())
  return { saved: true }
}

export function loadAppSetting(userDataDirectory: string, key: string): string | null {
  if (!/^[a-z0-9-]{1,80}$/.test(key)) throw new Error('Invalid application setting key')
  const row = db(userDataDirectory).prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value?: unknown } | undefined
  return typeof row?.value === 'string' ? row.value : null
}

export function saveAppSetting(userDataDirectory: string, key: string, value: string) {
  if (!/^[a-z0-9-]{1,80}$/.test(key) || value.length > 4_000) throw new Error('Invalid application setting')
  db(userDataDirectory).prepare(`
    INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value, new Date().toISOString())
}

export function closeWorkspaceDatabase() { database?.close(); database = undefined }
