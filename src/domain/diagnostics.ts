export type DiagnosticCategory = 'mcp' | 'provider' | 'validation' | 'revision' | 'renderer' | 'workspace'
export type DiagnosticStatus = 'info' | 'success' | 'warning' | 'error'

export interface DiagnosticInput {
  action: string
  category: DiagnosticCategory
  detail?: unknown
  status: DiagnosticStatus
}

export interface DiagnosticBundle {
  events: Array<DiagnosticInput & { id: string; timestamp: string }>
  generatedAt: string
  retention: { days: number; maximumEvents: number }
  schemaVersion: 1
  telemetryEnabled: false
}

export function recordDiagnostic(event: DiagnosticInput) {
  if (!window.dataLab?.recordDiagnostic) return
  void window.dataLab.recordDiagnostic(event).catch(() => undefined)
}
