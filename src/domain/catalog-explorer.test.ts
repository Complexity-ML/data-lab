import { describe, expect, it, vi } from 'vitest'
import { checkpointForInspection, inspectCatalogInParallel, type CatalogInspection } from './catalog-explorer'
import type { DataHubAssetSummary } from './datahub'

const capturedAt = '2026-07-24T08:00:00.000Z'
const freshExpiry = '2099-07-24T08:05:00.000Z'

function asset(index: number): DataHubAssetSummary {
  return {
    urn: `urn:li:dataset:test-${index}`,
    name: `dataset-${index}`,
    platform: 'test',
    environment: 'PROD',
    description: '',
    owners: ['Data Team'],
    tags: [],
    fields: [{ name: 'id', type: 'string' }],
    qualityStatus: 'healthy',
    upstream: [],
    downstream: [],
    freshness: { capturedAt, expiresAt: freshExpiry, stale: false },
  }
}

function inspection(value: DataHubAssetSummary): CatalogInspection {
  return {
    asset: value,
    evidence: [{
      tool: 'get_entities',
      urn: value.urn,
      capturedAt,
      expiresAt: freshExpiry,
      status: 'ok',
      summary: 'fresh',
      cached: false,
      stale: false,
    }],
  }
}

describe('Catalog Explorer', () => {
  it('audits the complete catalog with bounded concurrency', async () => {
    const assets = Array.from({ length: 17 }, (_, index) => asset(index))
    let active = 0
    let maximumActive = 0
    const inspect = vi.fn(async (urn: string) => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await new Promise((resolve) => setTimeout(resolve, 2))
      active -= 1
      return inspection(assets.find((candidate) => candidate.urn === urn)!)
    })

    const result = await inspectCatalogInParallel(assets, inspect, { concurrency: 4 })

    expect(inspect).toHaveBeenCalledTimes(17)
    expect(maximumActive).toBeLessThanOrEqual(4)
    expect(result.progress).toMatchObject({ total: 17, discovered: 17, inspected: 17, state: 'complete' })
    expect(result.progress.datasets.map((dataset) => dataset.urn)).toEqual(assets.map((candidate) => candidate.urn))
  })

  it('isolates a failed dataset instead of aborting the remaining audit', async () => {
    const assets = Array.from({ length: 5 }, (_, index) => asset(index))
    const result = await inspectCatalogInParallel(assets, async (urn) => {
      if (urn.endsWith('2')) throw new Error('connector timed out')
      return inspection(assets.find((candidate) => candidate.urn === urn)!)
    }, { concurrency: 3 })

    expect(result.progress).toMatchObject({ inspected: 5, failed: 1, incidents: 1, state: 'complete' })
    expect(result.progress.datasets.find((dataset) => dataset.urn.endsWith('2'))).toMatchObject({
      status: 'unavailable',
      issues: ['inspection failed: connector timed out'],
    })
  })

  it('resumes from fresh versioned checkpoints and retries unavailable reads', async () => {
    const assets = Array.from({ length: 3 }, (_, index) => asset(index))
    const fresh = checkpointForInspection(inspection(assets[0]!))
    const unavailable = { ...checkpointForInspection(inspection(assets[1]!)), status: 'unavailable' as const }
    const inspect = vi.fn(async (urn: string) => inspection(assets.find((candidate) => candidate.urn === urn)!))

    const result = await inspectCatalogInParallel(assets, inspect, { previous: [fresh, unavailable] })

    expect(inspect).toHaveBeenCalledTimes(2)
    expect(inspect).not.toHaveBeenCalledWith(assets[0]!.urn)
    expect(result.progress).toMatchObject({ inspected: 3, failed: 0, state: 'complete' })
  })
})
