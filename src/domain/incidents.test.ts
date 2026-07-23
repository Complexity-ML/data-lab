import { describe, expect, it } from 'vitest'
import { summarizeIncidentEvents, type IncidentEvent } from './incidents'
import { evaluateMonitorObservation, findBoundLiveMonitors, observeDataHubAudit, parseLiveMonitorPolicy } from './live-monitor'
import type { PipelineNode } from './pipeline'

function incident(id: string, transition: IncidentEvent['transition'], severity: IncidentEvent['severity'], createdAt: string): IncidentEvent {
  return { id, incidentKey: 'dataset-health', transition, severity, title: `Incident ${id}`, detail: `Detail ${id}`, createdAt }
}

describe('continuous incident lifecycle', () => {
  it('summarizes recurrence, review, mitigation and recovery from durable events', () => {
    const summaries = summarizeIncidentEvents([
      incident('5', 'recovered', 'info', '2026-07-23T00:05:00.000Z'),
      incident('4', 'agent-action', 'info', '2026-07-23T00:04:00.000Z'),
      incident('3', 'human-review', 'warning', '2026-07-23T00:03:00.000Z'),
      incident('2', 'opened', 'critical', '2026-07-23T00:02:00.000Z'),
      incident('1', 'recovered', 'info', '2026-07-23T00:01:00.000Z'),
      incident('0', 'opened', 'warning', '2026-07-23T00:00:00.000Z'),
    ])
    expect(summaries[0]).toMatchObject({ status: 'resolved', severity: 'info', occurrenceCount: 2, eventCount: 6 })
  })

  it('fingerprints stable evidence, opens once and recovers', () => {
    const audit = {
      urn: 'urn:li:dataset:test',
      transport: 'stdio' as const,
      reads: [
        { name: 'get_entities' as const, status: 'error' as const, summary: 'timeout', capturedAt: 'a', expiresAt: 'b', cached: false, stale: true },
        { name: 'list_schema_fields' as const, status: 'ok' as const, summary: '4 fields', capturedAt: 'a', expiresAt: 'b', cached: false, stale: false },
      ],
    }
    const observation = observeDataHubAudit(audit)
    const policy = parseLiveMonitorPolicy('on_change(metadata_fingerprint) | cooldown=30s | max_iterations=2')
    const opened = evaluateMonitorObservation(undefined, observation, policy)
    expect(opened).toMatchObject({ transition: 'opened', triggerAgent: true, next: { open: true, iterations: 1 } })
    expect(evaluateMonitorObservation(opened.next, observation, policy)).toMatchObject({ triggerAgent: false })
    const healthy = { ...observation, fingerprint: 'healthy', severity: 'info' as const, failedReads: 0 }
    expect(evaluateMonitorObservation(opened.next, healthy, policy)).toMatchObject({ transition: 'recovered', triggerAgent: false, next: { open: false, iterations: 0 } })
  })

  it('binds a monitor to its upstream governed source and ignores feedback edges', () => {
    const nodes = [
      { id: 'source', data: { kind: 'source', label: 'Orders', datahubUrn: 'urn:orders', description: '', owner: '', status: 'healthy', schema: [] }, position: { x: 0, y: 0 }, type: 'pipeline' },
      { id: 'monitor', data: { kind: 'monitor', label: 'Watch orders', description: '', owner: '', status: 'healthy', schema: [], rule: 'on_change(metadata_fingerprint) | cooldown=60s | max_iterations=10' }, position: { x: 1, y: 0 }, type: 'pipeline' },
      { id: 'output', data: { kind: 'output', label: 'Output', description: '', owner: '', status: 'healthy', schema: [] }, position: { x: 2, y: 0 }, type: 'pipeline' },
    ] as PipelineNode[]
    expect(findBoundLiveMonitors(nodes, [
      { id: 'source-monitor', source: 'source', target: 'monitor' },
      { id: 'feedback', source: 'output', target: 'monitor', sourceHandle: 'feedback' },
    ])).toMatchObject([{ monitorId: 'monitor', sourceId: 'source', urn: 'urn:orders', policy: { cooldownMs: 60_000, maxIterations: 10 } }])
  })
})
