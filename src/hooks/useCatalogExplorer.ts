import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react'
import { hasDataIncident, inspectCatalogInParallel } from '../domain/catalog-explorer'
import type { DataHubAssetSummary, DataHubEvidence } from '../domain/datahub'
import type { CatalogInspection } from '../domain/catalog-connectors'
import type { IncidentEventInput } from '../domain/incidents'
import type { AgentProposal, CatalogExplorationProgress, PipelineNode } from '../domain/pipeline'

export function useCatalogExplorer(options: {
  inspectAsset(urn: string): Promise<CatalogInspection>
  logIncident(event: IncidentEventInput): Promise<void>
  setActivity(value: string): void
  setNodes: Dispatch<SetStateAction<PipelineNode[]>>
}) {
  const { inspectAsset, logIncident, setActivity, setNodes } = options
  const catalogAssets = useRef(new Map<string, DataHubAssetSummary[]>())
  const updateProgress = useCallback((explorer: PipelineNode, progress: CatalogExplorationProgress, isCurrent: () => boolean) => {
    if (!isCurrent()) return
    const phase = progress.state === 'failed' ? 'Catalog audit paused' : progress.state === 'complete' ? 'Complete connected-catalog audit' : 'Connected-catalog audit running'
    setNodes((current) => current.map((node) => node.id === explorer.id ? {
      ...node,
      data: {
        ...node.data,
        exploration: progress,
        description: `${phase} · ${progress.inspected}/${progress.total || '?'} datasets inspected · ${progress.incidents} data incident(s) · ${progress.governanceGaps} governance gap(s) · ${progress.failed} connector read(s) unavailable.`,
        status: progress.state === 'failed' || progress.failed > 0 ? 'warning' : progress.state === 'complete' ? 'healthy' : 'draft',
        runState: progress.state === 'complete' ? 'completed' : progress.state === 'paused' ? 'stopped' : progress.state === 'failed' ? 'failed' : 'running',
      },
    } : node))
    setActivity(progress.state === 'failed'
      ? `Catalog Explorer paused · catalog connection unavailable after ${progress.inspected}/${progress.total || '?'} inspections`
      : `Catalog Explorer · ${progress.inspected}/${progress.total || '?'} datasets inspected · ${progress.incidents} data incident(s) · ${progress.governanceGaps} governance gap(s)`)
  }, [setActivity, setNodes])

  const explore = useCallback(async (input: {
    assets: DataHubAssetSummary[]
    explorer: PipelineNode
    isCurrent(): boolean
    query: string
  }) => {
    catalogAssets.current.set(input.explorer.id, input.assets)
    const previousProgress = input.explorer.data.exploration
    updateProgress(input.explorer, {
      query: input.query,
      total: input.assets.length,
      discovered: input.assets.length,
      inspected: previousProgress?.inspected ?? 0,
      failed: previousProgress?.failed ?? 0,
      incidents: previousProgress?.incidents ?? 0,
      governanceGaps: previousProgress?.governanceGaps ?? 0,
      concurrency: 4,
      state: 'inspecting',
      checkpointAt: new Date().toISOString(),
      datasets: previousProgress?.datasets ?? [],
    }, input.isCurrent)

    const explored = await inspectCatalogInParallel(input.assets, async (urn) => {
      const inspection = await inspectAsset(urn)
      return {
        asset: inspection.asset,
        evidence: inspection.evidence.map((read) => ({
          tool: read.tool,
          urn,
          capturedAt: read.capturedAt,
          expiresAt: read.expiresAt,
          status: read.status,
          summary: read.summary,
          cached: read.cached,
          stale: read.stale,
        })),
      }
    }, {
      concurrency: 4,
      maxInspections: 4,
      previous: input.explorer.data.exploration?.datasets,
      query: input.query,
      isCancelled: () => !input.isCurrent(),
      onCheckpoint: (progress) => updateProgress(input.explorer, progress, input.isCurrent),
    })

    const evidence: DataHubEvidence[] = explored.inspections.flatMap((inspection) => inspection.evidence)
    const byUrn = new Map(input.assets.map((asset) => [asset.urn, asset]))
    const inspectedByUrn = new Map(explored.inspections.map((inspection) => [inspection.asset.urn, inspection.asset]))
    const ranked = explored.progress.datasets.filter((dataset) => dataset.status !== 'unavailable' && inspectedByUrn.has(dataset.urn)).sort((left, right) => {
      const rank = (value: typeof left) => (value.status === 'healthy' ? 1_000 : value.status === 'warning' ? 100 : 0) + value.ownerCount * 10 + value.fieldCount
      return rank(right) - rank(left)
    })
    let candidate = ranked.length ? inspectedByUrn.get(ranked[0]!.urn) ?? byUrn.get(ranked[0]!.urn) : undefined
    if (candidate && !inspectedByUrn.has(candidate.urn)) {
      try {
        const hydrated = await inspectAsset(candidate.urn)
        candidate = hydrated.asset
        evidence.push(...hydrated.evidence.map((read) => ({
          tool: read.tool,
          urn: candidate!.urn,
          capturedAt: read.capturedAt,
          expiresAt: read.expiresAt,
          status: read.status,
          summary: read.summary,
          cached: read.cached,
          stale: read.stale,
        })))
      } catch {
        candidate = undefined
      }
    }
    if (input.isCurrent()) {
      const unavailable = explored.progress.datasets.filter((dataset) => dataset.status === 'unavailable')
      const connectorGroups = new Map<string, typeof unavailable>()
      unavailable.forEach((dataset) => {
        const asset = byUrn.get(dataset.urn)
        const key = asset?.connectorId ?? asset?.sourceSystem ?? 'catalog'
        connectorGroups.set(key, [...(connectorGroups.get(key) ?? []), dataset])
      })
      await Promise.all([
        ...[...connectorGroups.entries()].map(([connector, datasets]) => logIncident({
          incidentKey: `catalog-explorer:connectivity:${connector}`,
          transition: 'opened' as const,
          severity: 'critical' as const,
          title: `Catalog connection unavailable · ${byUrn.get(datasets[0]!.urn)?.sourceSystem ?? connector}`,
          detail: `${datasets.length} bounded inspection read(s) failed. The audit stopped before classifying unavailable metadata as dataset health.`,
          sourceSystem: byUrn.get(datasets[0]!.urn)?.sourceSystem ?? 'DATA LAB connectivity',
          sourceRef: connector,
          fingerprint: datasets.map((dataset) => dataset.fingerprint).join(':'),
          cardId: input.explorer.id,
          branchId: connector,
        })),
        ...explored.progress.datasets.filter(hasDataIncident).map((dataset) => logIncident({
        incidentKey: `catalog-explorer:${dataset.urn}`,
        transition: 'opened',
        severity: 'warning',
        title: `Governance attention · ${dataset.name}`,
        detail: dataset.issues.join(', ') || 'Catalog Explorer detected a metadata signal requiring attention.',
        sourceSystem: byUrn.get(dataset.urn)?.sourceSystem ?? 'Catalog',
        sourceRef: dataset.urn,
        fingerprint: dataset.fingerprint,
        cardId: input.explorer.id,
        branchId: dataset.urn,
        })),
      ])
    }
    return {
      candidate,
      evidence,
      progress: explored.progress,
      summaries: [
        `Catalog Explorer checkpoint ${explored.progress.inspected}/${explored.progress.total}; ${explored.progress.incidents} data incidents, ${explored.progress.governanceGaps} governance gaps and ${explored.progress.failed} unavailable reads. Continue from the versioned checkpoint in the next atomic iteration.`,
        ...explored.inspections.slice(0, 4).map((inspection) => {
          const dataset = explored.progress.datasets.find((item) => item.urn === inspection.asset.urn)!
          return `${dataset.name} · ${dataset.status} · fields=${dataset.fieldCount} · owners=${dataset.ownerCount} · upstream=${dataset.upstreamCount} · downstream=${dataset.downstreamCount} · issues=${dataset.issues.join(', ') || 'none'}`
        }),
      ],
    }
  }, [inspectAsset, logIncident, updateProgress])

  const attachProgress = useCallback((proposal: AgentProposal, explorer: PipelineNode, progress: CatalogExplorationProgress) => {
    const existingUpdate = proposal.updatedNodes.find((update) => update.nodeId === explorer.id)
    const patch = {
      exploration: progress,
      description: `Complete connected-catalog audit · ${progress.inspected}/${progress.total} datasets inspected · ${progress.incidents} data incident(s) · ${progress.governanceGaps} governance gap(s) · ${progress.failed} unavailable.`,
      status: progress.failed > 0 ? 'warning' as const : 'healthy' as const,
      runState: progress.state === 'complete' ? 'completed' as const : progress.state === 'inspecting' ? 'running' as const : 'stopped' as const,
    }
    if (existingUpdate) existingUpdate.patch = { ...existingUpdate.patch, ...patch }
    else proposal.updatedNodes.push({ nodeId: explorer.id, patch, reason: 'Persist the complete, resumable multi-connector catalog exploration checkpoint.' })
  }, [])

  const markDiscoveryFailed = useCallback((explorer: PipelineNode, query: string, isCurrent: () => boolean) => {
    updateProgress(explorer, {
      query,
      total: 0,
      discovered: 0,
      inspected: 0,
      failed: 1,
      incidents: 0,
      governanceGaps: 0,
      concurrency: 4,
      state: 'failed',
      checkpointAt: new Date().toISOString(),
      datasets: [],
    }, isCurrent)
  }, [updateProgress])

  const assetsFor = useCallback((explorerId: string) => catalogAssets.current.get(explorerId) ?? [], [])

  return { assetsFor, attachProgress, explore, markDiscoveryFailed, updateProgress }
}
