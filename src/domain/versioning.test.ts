import { describe, expect, it } from 'vitest'
import { customerActivationEdges as initialEdges, customerActivationNodes as initialNodes } from './pipeline'
import { appendPipelineVersion, buildVersionProvenanceExport, commitPendingVersion, createPipelineVersion, readPipelineVersions, rejectPendingVersion, resolveVersionSelection, restorePipelineVersion } from './versioning'

describe('pipeline versioning', () => {
  it('creates an isolated graph snapshot', () => {
    const version = createPipelineVersion(initialNodes, initialEdges, 'Initial', 'initial', [])
    const restored = restorePipelineVersion(version)
    restored.nodes[0].data.label = 'Changed'
    expect(version.nodes[0].data.label).toBe('Customers 360')
  })

  it('keeps a bounded version history', () => {
    const versions = Array.from({ length: 4 }, (_, index) => createPipelineVersion(initialNodes, initialEdges, `${index}`, 'manual', []))
    expect(appendPipelineVersion(versions.slice(0, 3), versions[3], 2)).toHaveLength(2)
  })

  it('rejects malformed persisted history', () => {
    expect(readPipelineVersions('{broken')).toEqual([])
  })

  it('keeps pending, committed and rejected revisions distinct', () => {
    const pending = { ...createPipelineVersion(initialNodes, initialEdges, 'Review', 'agent', []), status: 'pending-review' as const, description: 'Upgrade: mask email' }
    const committed = createPipelineVersion(initialNodes, initialEdges, 'Mask email', 'agent', [])
    const approved = commitPendingVersion([pending], pending.id, committed)
    expect(approved[0]).toMatchObject({ id: pending.id, createdAt: pending.createdAt, status: 'committed', description: pending.description })

    const rejected = rejectPendingVersion([pending], pending.id)
    expect(rejected[0].status).toBe('rejected')
    expect(pending.status).toBe('pending-review')
  })

  it('selects the exact notification revision before falling back to pending review', () => {
    const committed = createPipelineVersion(initialNodes, initialEdges, 'Committed', 'manual', [])
    const pending = { ...createPipelineVersion(initialNodes, initialEdges, 'Review', 'agent', []), status: 'pending-review' as const }
    expect(resolveVersionSelection([committed, pending], committed.id)).toBe(committed.id)
    expect(resolveVersionSelection([committed, pending], 'missing')).toBe(pending.id)
  })

  it('exports exact evidence provenance without credential-shaped values or graph data', () => {
    const version = createPipelineVersion(initialNodes, initialEdges, 'Governed revision', 'agent', [])
    version.evidence = [{ tool: 'get_entities', urn: 'urn:li:dataset:test', capturedAt: '2026-07-22T20:00:00.000Z', expiresAt: '2026-07-22T20:05:00.000Z', status: 'ok', summary: 'owner=Growth token=private-token', cached: false, stale: false }]
    const exported = buildVersionProvenanceExport(version)
    expect(exported.evidence[0].summary).toBe('owner=Growth token=[REDACTED]')
    expect(JSON.stringify(exported)).not.toContain('private-token')
    expect(exported.revision).not.toHaveProperty('nodes')
  })
})
