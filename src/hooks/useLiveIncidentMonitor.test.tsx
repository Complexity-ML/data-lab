// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DataHubMcpAudit } from '../electron-api'
import { newCard } from '../domain/pipeline'
import { useLiveIncidentMonitor } from './useLiveIncidentMonitor'

const audit: DataHubMcpAudit = {
  urn: 'urn:li:dataset:(urn:li:dataPlatform:snowflake,customers,PROD)',
  transport: 'stdio',
  reads: [{
    name: 'get_entities',
    status: 'error',
    summary: 'Metadata read failed',
    capturedAt: '2026-07-23T20:00:00.000Z',
    expiresAt: '2026-07-23T20:01:00.000Z',
    cached: false,
    stale: false,
  }],
}

describe('live incident monitor lifecycle', () => {
  it('drops a deferred trigger when the player becomes inactive', async () => {
    const source = {
      ...newCard('source', 0),
      id: 'source',
      data: { ...newCard('source', 0).data, datahubUrn: audit.urn },
    }
    const monitor = { ...newCard('monitor', 1), id: 'monitor' }
    const nodes = [source, monitor]
    const edges = [{ id: 'source-monitor', source: source.id, target: monitor.id }]
    const readAudit = vi.fn(async () => audit)
    const onIncident = vi.fn(async () => undefined)
    const onTrigger = vi.fn(async () => undefined)

    const { rerender } = renderHook(
      ({ active, blocked }) => useLiveIncidentMonitor({
        active,
        agentBlocked: blocked,
        nodes,
        edges,
        audit: readAudit,
        onIncident,
        onTrigger,
      }),
      { initialProps: { active: true, blocked: true } },
    )

    await waitFor(() => expect(onIncident).toHaveBeenCalledTimes(1))
    expect(onTrigger).not.toHaveBeenCalled()

    rerender({ active: false, blocked: true })
    rerender({ active: true, blocked: false })
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 25)) })

    expect(onTrigger).not.toHaveBeenCalled()
  })

  it('reports an unreachable network as connector reliability instead of a dataset anomaly', async () => {
    const source = {
      ...newCard('source', 0),
      id: 'source',
      data: { ...newCard('source', 0).data, label: 'Customers', datahubUrn: audit.urn },
    }
    const monitor = { ...newCard('monitor', 1), id: 'monitor' }
    const onIncident = vi.fn(async () => undefined)

    renderHook(() => useLiveIncidentMonitor({
      active: true,
      agentBlocked: false,
      nodes: [source, monitor],
      edges: [{ id: 'source-monitor', source: source.id, target: monitor.id }],
      audit: vi.fn(async () => { throw new Error('connect ENETUNREACH datahub.internal') }),
      onIncident,
      onTrigger: vi.fn(async () => undefined),
    }))

    await waitFor(() => expect(onIncident).toHaveBeenCalledTimes(1))
    expect(onIncident).toHaveBeenCalledWith(expect.objectContaining({
      title: expect.stringContaining('No network'),
      sourceSystem: 'DATA LAB connectivity',
      fingerprint: 'connectivity:offline',
      detail: expect.stringContaining('Dataset health was not evaluated'),
    }))
  })
})
