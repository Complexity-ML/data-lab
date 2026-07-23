import { describe, expect, it } from 'vitest'
import { resolveAgentObjective } from './agent-objective'

describe('bounded agent objectives', () => {
  it('turns empty Play into a governed blank-workbench mission', () => {
    expect(resolveAgentObjective('', { hasGraph: false, matchedSource: false })).toMatchObject({
      accepted: true,
      defaulted: true,
      objective: expect.stringContaining('governed'),
    })
  })

  it('accepts data work and source-label matches while rejecting unrelated noise', () => {
    expect(resolveAgentObjective('Trace lineage for the billing table', { hasGraph: true, matchedSource: false }).accepted).toBe(true)
    expect(resolveAgentObjective('Customers 360', { hasGraph: true, matchedSource: true }).accepted).toBe(true)
    expect(resolveAgentObjective('tell me a joke about bananas', { hasGraph: true, matchedSource: false }).accepted).toBe(false)
  })
})
