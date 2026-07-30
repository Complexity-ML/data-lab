import { describe, expect, it } from 'vitest'
import { advancedCardKinds, incidentResponseCardKinds, visibleCardKinds } from './product-scope'

describe('focused product surface', () => {
  it('opens on the incident-response cards instead of the complete pipeline grammar', () => {
    expect(visibleCardKinds('incident-response')).toEqual(incidentResponseCardKinds)
    expect(incidentResponseCardKinds).toEqual([
      'source',
      'profile',
      'impact',
      'risk',
      'patch',
      'review',
      'validation',
      'monitor',
    ])
  })

  it('keeps the broader pipeline builder behind an explicit advanced mode', () => {
    expect(advancedCardKinds).toContain('parallel')
    expect(advancedCardKinds).toContain('worker')
    expect(advancedCardKinds).not.toContain('source')
    expect(visibleCardKinds('advanced')).toHaveLength(19)
  })
})
