interface IncidentOnboardingInput {
  aiConnected: boolean
  catalogConnected: boolean
  dataHubConnected: boolean
}

interface CapabilityReadiness {
  ready: boolean
  missing: string[]
}

export interface IncidentOnboarding {
  demo: {
    ready: boolean
    action: 'Start incident demo'
    requires: string[]
  }
  liveMonitor: CapabilityReadiness
  agentCorrections: CapabilityReadiness
}

export function incidentOnboarding(input: IncidentOnboardingInput): IncidentOnboarding {
  return {
    demo: {
      ready: input.dataHubConnected,
      action: 'Start incident demo',
      requires: input.dataHubConnected ? [] : ['DataHub OSS in Docker'],
    },
    liveMonitor: {
      ready: input.catalogConnected,
      missing: input.catalogConnected ? [] : ['Catalog connection'],
    },
    agentCorrections: {
      ready: input.aiConnected,
      missing: input.aiConnected ? [] : ['AI provider'],
    },
  }
}
