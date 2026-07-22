import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const MAX_EVENTS = 500
const MAX_STRING_LENGTH = 500
const RETENTION_MS = 7 * 24 * 60 * 60 * 1_000
const categories = new Set(['mcp', 'provider', 'validation', 'revision', 'renderer', 'workspace'])
const statuses = new Set(['info', 'success', 'warning', 'error'])
const secretKeyPattern = /authorization|api[-_]?key|password|secret|token|credential|cookie/i

export interface DiagnosticEvent {
  action: string
  category: 'mcp' | 'provider' | 'validation' | 'revision' | 'renderer' | 'workspace'
  detail?: unknown
  id: string
  status: 'info' | 'success' | 'warning' | 'error'
  timestamp: string
}

export interface DiagnosticBundle {
  events: DiagnosticEvent[]
  generatedAt: string
  retention: { days: 7; maximumEvents: 500 }
  schemaVersion: 1
  telemetryEnabled: false
}

export function diagnosticLogPath(userDataDirectory: string) {
  return join(userDataDirectory, 'data-lab-diagnostics.json')
}

function redactString(value: string) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|gho|ghp|glpat|dht)[-_][A-Za-z0-9_-]{8,}\b/g, '[REDACTED]')
    .replace(/([?&](?:token|api_key|key|secret)=)[^&\s]+/gi, '$1[REDACTED]')
    .slice(0, MAX_STRING_LENGTH)
}

export function sanitizeDiagnosticValue(value: unknown, depth = 0, parentSensitive = false): unknown {
  if (depth > 6) return '[TRUNCATED]'
  if (typeof value === 'string') return parentSensitive ? '[REDACTED]' : redactString(value)
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeDiagnosticValue(item, depth + 1, parentSensitive))
  if (!value || typeof value !== 'object') return String(value).slice(0, MAX_STRING_LENGTH)
  const source = value as Record<string, unknown>
  const sensitive = parentSensitive || source.sensitive === true
  return Object.fromEntries(Object.entries(source).slice(0, 50).map(([key, entry]) => {
    const redact = secretKeyPattern.test(key) || (sensitive && /prompt|content|value|text/i.test(key))
    return [key.slice(0, 80), redact ? '[REDACTED]' : sanitizeDiagnosticValue(entry, depth + 1, sensitive)]
  }))
}

function readEvents(userDataDirectory: string) {
  const path = diagnosticLogPath(userDataDirectory)
  if (!existsSync(path)) return []
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    return Array.isArray(parsed) ? parsed.filter((event): event is DiagnosticEvent => Boolean(event && typeof event === 'object' && typeof event.timestamp === 'string')) : []
  } catch { return [] }
}

function retained(events: DiagnosticEvent[], now = Date.now()) {
  return events.filter((event) => {
    const timestamp = Date.parse(event.timestamp)
    return Number.isFinite(timestamp) && now - timestamp <= RETENTION_MS
  }).slice(-MAX_EVENTS)
}

function writeEvents(userDataDirectory: string, events: DiagnosticEvent[]) {
  const path = diagnosticLogPath(userDataDirectory)
  const temporaryPath = `${path}.tmp`
  writeFileSync(temporaryPath, JSON.stringify(events), { encoding: 'utf8', mode: 0o600 })
  renameSync(temporaryPath, path)
}

export function recordDiagnosticEvent(userDataDirectory: string, input: unknown) {
  if (!input || typeof input !== 'object') throw new Error('Invalid diagnostic event')
  const candidate = input as Record<string, unknown>
  if (typeof candidate.category !== 'string' || !categories.has(candidate.category)) throw new Error('Invalid diagnostic category')
  if (typeof candidate.status !== 'string' || !statuses.has(candidate.status)) throw new Error('Invalid diagnostic status')
  if (typeof candidate.action !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,79}$/.test(candidate.action)) throw new Error('Invalid diagnostic action')
  const event: DiagnosticEvent = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    category: candidate.category as DiagnosticEvent['category'],
    status: candidate.status as DiagnosticEvent['status'],
    action: candidate.action,
    detail: sanitizeDiagnosticValue(candidate.detail),
  }
  const events = retained([...readEvents(userDataDirectory), event])
  writeEvents(userDataDirectory, events)
  return event
}

export function exportDiagnosticBundle(userDataDirectory: string): DiagnosticBundle {
  const events = retained(readEvents(userDataDirectory)).map((event) => ({ ...event, detail: sanitizeDiagnosticValue(event.detail) }))
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), telemetryEnabled: false, retention: { days: 7, maximumEvents: 500 }, events }
}

export function ensureDiagnosticLog(userDataDirectory: string) {
  const path = diagnosticLogPath(userDataDirectory)
  if (!existsSync(path)) writeEvents(userDataDirectory, [])
  return path
}
