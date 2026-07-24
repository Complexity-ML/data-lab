import { describe, expect, it, vi } from 'vitest'
import { checkpointForInspection, inspectCatalogInParallel, inspectWithBoundedRetry, resolveAdaptiveCatalogConcurrency, shouldCallAgentForCatalog, shouldOpenCatalogConnectivityIncident, type CatalogInspection } from './catalog-explorer'
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
    tags: ['governed'],
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

    expect(result.progress).toMatchObject({ inspected: 5, failed: 1, incidents: 0, state: 'complete' })
    expect(result.progress.datasets.find((dataset) => dataset.urn.endsWith('2'))).toMatchObject({
      status: 'unavailable',
      issues: ['inspection failed: connector timed out'],
    })
  })

  it('separates governance gaps from data incidents', async () => {
    const governanceAsset = { ...asset(1), owners: [], tags: [] }
    const failingAsset = { ...asset(2), qualityStatus: 'failing' as const }

    const result = await inspectCatalogInParallel(
      [governanceAsset, failingAsset],
      async (urn) => inspection(urn === governanceAsset.urn ? governanceAsset : failingAsset),
      { concurrency: 2 },
    )

    expect(result.progress).toMatchObject({
      incidents: 1,
      governanceGaps: 1,
      failed: 0,
      state: 'complete',
    })
  })

  it('pauses the connector circuit after a complete unavailable batch and preserves the checkpoint', async () => {
    const assets = Array.from({ length: 12 }, (_, index) => asset(index))
    const inspect = vi.fn(async () => { throw new Error('MCP unavailable') })

    const result = await inspectCatalogInParallel(assets, inspect, { concurrency: 4 })

    expect(inspect).toHaveBeenCalledTimes(4)
    expect(result.progress).toMatchObject({
      total: 12,
      inspected: 4,
      failed: 4,
      incidents: 0,
      state: 'paused',
      pauseReason: 'connector_unavailable',
    })
  })

  it('retries one unavailable inspection with a forced fresh read', async () => {
    const value = asset(1)
    const unavailable = {
      asset: value,
      evidence: [{
        ...inspection(value).evidence[0]!,
        status: 'error' as const,
        stale: true,
      }],
    }
    const inspect = vi.fn(async (_urn: string, force = false) => force ? inspection(value) : unavailable)

    const result = await inspectWithBoundedRetry(value.urn, inspect)

    expect(result).toEqual(inspection(value))
    expect(inspect).toHaveBeenNthCalledWith(1, value.urn, false)
    expect(inspect).toHaveBeenNthCalledWith(2, value.urn, true)
  })

  it('never retries a healthy inspection or exceeds one unavailable retry', async () => {
    const value = asset(1)
    const healthyInspect = vi.fn(async () => inspection(value))
    await inspectWithBoundedRetry(value.urn, healthyInspect)
    expect(healthyInspect).toHaveBeenCalledTimes(1)

    const unavailable = {
      asset: value,
      evidence: [{
        ...inspection(value).evidence[0]!,
        status: 'error' as const,
        stale: true,
      }],
    }
    const unavailableInspect = vi.fn(async () => unavailable)
    expect(await inspectWithBoundedRetry(value.urn, unavailableInspect)).toEqual(unavailable)
    expect(unavailableInspect).toHaveBeenCalledTimes(2)
  })

  it('defers unavailable catalog retries to the next versioned checkpoint', async () => {
    const value = asset(1)
    const unavailable = {
      asset: value,
      evidence: [{
        ...inspection(value).evidence[0]!,
        status: 'error' as const,
        stale: true,
      }],
    }
    const inspect = vi.fn(async () => unavailable)

    expect(await inspectWithBoundedRetry(value.urn, inspect, { retryUnavailable: false })).toEqual(unavailable)
    expect(inspect).toHaveBeenCalledTimes(1)
  })

  it('adapts workers between one and eight from batch latency and failures', () => {
    const base = {
      query: '*',
      total: 67,
      discovered: 67,
      inspected: 4,
      failed: 0,
      incidents: 0,
      governanceGaps: 0,
      concurrency: 4,
      batchSize: 4,
      batchDurationMs: 4_000,
      batchFailed: 0,
      batchProcessed: 4,
      batchCached: 0,
      state: 'inspecting' as const,
      checkpointAt: capturedAt,
      datasets: [],
    }

    expect(resolveAdaptiveCatalogConcurrency()).toBe(4)
    expect(resolveAdaptiveCatalogConcurrency(base)).toBe(6)
    expect(resolveAdaptiveCatalogConcurrency({ ...base, concurrency: 7 })).toBe(8)
    expect(resolveAdaptiveCatalogConcurrency({ ...base, batchDurationMs: 20_000 })).toBe(3)
    expect(resolveAdaptiveCatalogConcurrency({ ...base, batchFailed: 1 })).toBe(2)
    expect(resolveAdaptiveCatalogConcurrency({ ...base, batchCached: 4 })).toBe(4)
    expect(resolveAdaptiveCatalogConcurrency({ ...base, batchCached: 2 })).toBe(4)
    expect(resolveAdaptiveCatalogConcurrency({ ...base, concurrency: 1, state: 'paused', pauseReason: 'connector_unavailable' })).toBe(1)
  })

  it('records whether the latest adaptive batch was served from cache', async () => {
    const assets = Array.from({ length: 3 }, (_, index) => asset(index))
    const inspect = async (urn: string) => {
      const value = inspection(assets.find((candidate) => candidate.urn === urn)!)
      return { ...value, evidence: value.evidence.map((read) => ({ ...read, cached: true })) }
    }

    const result = await inspectCatalogInParallel(assets, inspect, { concurrency: 4 })

    expect(result.progress).toMatchObject({ batchProcessed: 3, batchCached: 3, batchFailed: 0 })
  })

  it('pauses the connector circuit after a later unavailable batch', async () => {
    const assets = Array.from({ length: 12 }, (_, index) => asset(index))
    let calls = 0
    const inspect = vi.fn(async (urn: string) => {
      calls += 1
      if (calls > 4) throw new Error('MCP unavailable')
      return inspection(assets.find((candidate) => candidate.urn === urn)!)
    })

    const result = await inspectCatalogInParallel(assets, inspect, { concurrency: 4 })

    expect(inspect).toHaveBeenCalledTimes(8)
    expect(result.progress).toMatchObject({
      total: 12,
      inspected: 8,
      failed: 4,
      incidents: 0,
      state: 'paused',
      pauseReason: 'connector_unavailable',
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

  it('checkpoints four assets per autonomous iteration and resumes the remainder', async () => {
    const assets = Array.from({ length: 10 }, (_, index) => asset(index))
    const firstInspect = vi.fn(async (urn: string) => inspection(assets.find((candidate) => candidate.urn === urn)!))

    const first = await inspectCatalogInParallel(assets, firstInspect, { concurrency: 4, maxInspections: 4 })

    expect(firstInspect).toHaveBeenCalledTimes(4)
    expect(first.progress).toMatchObject({ inspected: 4, total: 10, state: 'inspecting' })

    const secondInspect = vi.fn(async (urn: string) => inspection(assets.find((candidate) => candidate.urn === urn)!))
    const second = await inspectCatalogInParallel(assets, secondInspect, {
      concurrency: 4,
      maxInspections: 4,
      previous: first.progress.datasets,
    })

    expect(secondInspect).toHaveBeenCalledTimes(4)
    expect(second.progress).toMatchObject({ inspected: 8, total: 10, state: 'inspecting' })
  })

  it('calls the model only for useful catalog checkpoints', () => {
    const base = {
      query: '*',
      total: 12,
      discovered: 12,
      inspected: 4,
      failed: 0,
      incidents: 0,
      governanceGaps: 4,
      concurrency: 4,
      state: 'inspecting' as const,
      checkpointAt: capturedAt,
      datasets: [],
    }

    expect(shouldCallAgentForCatalog(undefined, base)).toBe(false)
    expect(shouldCallAgentForCatalog(base, { ...base, inspected: 8, governanceGaps: 8 })).toBe(false)
    expect(shouldCallAgentForCatalog(base, { ...base, inspected: 8, incidents: 1 })).toBe(true)
    expect(shouldCallAgentForCatalog(base, { ...base, inspected: 8 }, true)).toBe(true)
    expect(shouldCallAgentForCatalog(base, { ...base, inspected: 12, state: 'complete' })).toBe(true)
    expect(shouldCallAgentForCatalog(base, { ...base, state: 'failed', failed: 4 })).toBe(false)
    expect(shouldCallAgentForCatalog(base, { ...base, state: 'paused', pauseReason: 'connector_unavailable', failed: 4 })).toBe(false)
  })

  it('opens a connector incident only after the catalog circuit actually fails', () => {
    const base = {
      query: '*',
      total: 67,
      discovered: 67,
      inspected: 4,
      failed: 2,
      incidents: 0,
      governanceGaps: 2,
      concurrency: 4,
      state: 'inspecting' as const,
      checkpointAt: capturedAt,
      datasets: [],
    }

    expect(shouldOpenCatalogConnectivityIncident(base)).toBe(false)
    expect(shouldOpenCatalogConnectivityIncident({ ...base, state: 'failed' })).toBe(true)
    expect(shouldOpenCatalogConnectivityIncident({ ...base, state: 'paused', pauseReason: 'connector_unavailable' })).toBe(true)
    expect(shouldOpenCatalogConnectivityIncident({ ...base, state: 'paused', pauseReason: 'cancelled' })).toBe(false)
  })

  it('opens a connector incident only after the catalog circuit actually fails', () => {
    const base = {
      query: '*',
      total: 67,
      discovered: 67,
      inspected: 4,
      failed: 2,
      incidents: 0,
      governanceGaps: 2,
      concurrency: 4,
      state: 'inspecting' as const,
      checkpointAt: capturedAt,
      datasets: [],
    }

    expect(shouldOpenCatalogConnectivityIncident(base)).toBe(false)
    expect(shouldOpenCatalogConnectivityIncident({ ...base, state: 'failed' })).toBe(true)
  })
})
