export type WindowCloseDisposition = 'hide' | 'close'

export function normalizeBackgroundMonitoringPreference(value: unknown): boolean {
  if (value === 'false' || value === false || value === 0) return false
  return true
}

export function windowCloseDisposition(input: { enabled: boolean; isQuitting: boolean }): WindowCloseDisposition {
  return input.enabled && !input.isQuitting ? 'hide' : 'close'
}
