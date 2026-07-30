import { describe, expect, it } from 'vitest'
import { normalizeBackgroundMonitoringPreference, windowCloseDisposition } from './background-monitoring.js'

describe('background incident monitoring lifecycle', () => {
  it('keeps monitoring alive by default when the operator closes the window', () => {
    expect(normalizeBackgroundMonitoringPreference(undefined)).toBe(true)
    expect(windowCloseDisposition({ enabled: true, isQuitting: false })).toBe('hide')
  })

  it('still allows an explicit quit or an operator opt-out', () => {
    expect(windowCloseDisposition({ enabled: true, isQuitting: true })).toBe('close')
    expect(windowCloseDisposition({ enabled: false, isQuitting: false })).toBe('close')
  })
})
