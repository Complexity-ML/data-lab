import { describe, expect, it } from 'vitest'
import { incidentOnboarding } from './onboarding'

describe('incident onboarding', () => {
  it('blocks the hackathon demo until DataHub OSS is running in Docker and connected', () => {
    const onboarding = incidentOnboarding({ aiConnected: false, catalogConnected: false, dataHubConnected: false })

    expect(onboarding.demo.ready).toBe(false)
    expect(onboarding.demo.action).toBe('Start incident demo')
    expect(onboarding.demo.requires).toEqual(['DataHub OSS in Docker'])
  })

  it('allows the hackathon demo once DataHub is connected without requiring an AI provider', () => {
    const onboarding = incidentOnboarding({ aiConnected: false, catalogConnected: true, dataHubConnected: true })

    expect(onboarding.demo.ready).toBe(true)
    expect(onboarding.demo.requires).toEqual([])
  })

  it('keeps AI as an optional progressive capability', () => {
    const onboarding = incidentOnboarding({ aiConnected: false, catalogConnected: true, dataHubConnected: true })

    expect(onboarding.liveMonitor).toEqual({ ready: true, missing: [] })
    expect(onboarding.agentCorrections).toEqual({ ready: false, missing: ['AI provider'] })
  })
})
