import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react'
import { hasDataIncident, inspectCatalogInParallel, inspectWithBoundedRetry, isInspectionUnavailable, resolveAdaptiveCatalogConcurrency, shouldOpenCatalogConnectivityIncident } from '../domain/catalog-explorer'
import { parseCatalogExplorerPolicy } from '../domain/catalog-explorer-policy'
import type { DataHubAssetSummary, DataHubEvidence } from '../domain/datahub'
import type { CatalogInspection } from '../domain/catalog-connectors'
import type { IncidentEventInput, IncidentSummary } from '../domain/incidents'
import type { AgentProposal, CatalogExplorationProgress, PipelineNode } from '../domain/pipeline'

export function useCatalogExplorer(options: {
  incidentSummaries: IncidentSummary[]
  inspectAsset(urn: string, force?: boolean): Promise<CatalogInspection>
  logIncident(event: IncidentEventInput): Promise<void>
  setActivity(value: string): void
  setNodes: Dispatch<SetStateAction<PipelineNode[]>>
}) {
  const { incidentSummaries, inspectAsset, logIncident, setActivity, setNodes } = options
  const catalogAssets = useRef(new Map<string, DataHubAssetSummary[]>())
  const updateProgress = useCallback((explorer: PipelineNode, progress: CatalogExplorationProgress, isCurrent: () => boolean) => {
    if (!isCurrent()) return
    const connectorPaused = progress.pauseReason === 'connector_unavailable'
    const scopeLabel = progress.mode === 'dataset' ? 'Focused dataset audit' : 'Connected-catalog audit'
    const phase = progress.state === 'failed' || connectorPaused ? `${scopeLabel} paused for connector recovery` : progress.state === 'complete' ? `${scopeLabel} complete` : `${scopeLabel} running`
    setNodes((current) => current.map((node) => node.id === explorer.id ? {
      ...node,
      data: {
        ...node.data,
        exploration: progress,
        description: `${phase} · ${progress.inspected}/${progress.total || '?'} inspected · ${progress.remaining ?? Math.max(0, progress.total - progress.inspected)} queued · ${progress.concurrency} worker(s) · ${progress.incidents} data incident(s) · ${progress.governanceGaps} governance gap(s) · ${progress.failed} connector read(s) unavailable.`,
        status: progress.state === 'failed' || progress.failed > 0 ? 'warning' : progress.state === 'complete' ? 'healthy' : 'draft',
        runState: progress.state === 'complete' ? 'completed' : progress.state === 'paused' ? 'waiting' : progress.state === 'failed' ? 'failed' : 'running',
      },
    } : node))
    setActivity(progress.state === 'failed' || connectorPaused
      ? `Catalog Explorer checkpoint saved · connector unavailable after ${progress.inspected}/${progress.total || '?'} inspections · retry scheduled`
      : `Catalog Explorer · ${progress.inspected}/${progress.total || '?'} inspected · ${progress.remaining ?? 0} queued · ${progress.concurrency} adaptive worker(s) · ${progress.incidents} data incident(s) · ${progress.governanceGaps} governance gap(s)`)
  }, [setActivity, setNodes])

  const explore = useCallback(async (input: {
    assets: DataHubAssetSummary[]
    explorer: PipelineNode
    isCurrent(): boolean
    query: string
  }) => {
    const policy = parseCatalogExplorerPolicy(input.explorer.data.rule)
    const focusedAsset = policy.scope === 'dataset' && policy.datasetUrn
      ? input.assets.find((asset) => asset.urn === policy.datasetUrn) ?? {
          urn: policy.datasetUrn,
          assetRef: policy.datasetUrn,
          connectorId: 'datahub',
          sourceSystem: 'DataHub',
          name: policy.datasetUrn.split(',').at(-2)?.split('.').at(-1) ?? 'Focused dataset',
          platform: 'unknown',
          environment: 'PROD',
          description: 'Focused dataset selected in Catalog Explorer.',
          owners: [],
          tags: [],
          fields: [],
          qualityStatus: 'unavailable' as const,
          upstream: [],
          downstream: [],
          freshness: { capturedAt: new Date(0).toISOString(), expiresAt: new Date(0).toISOString(), stale: true },
        }
      : undefined
    const assets = focusedAsset ? [focusedAsset] : input.assets
    catalogAssets.current.set(input.explorer.id, assets)
    const previousProgress = input.explorer.data.exploration
    const configuredConcurrency = policy.scope === 'dataset' ? 1 : policy.concurrency
    const concurrency = policy.scope === 'dataset'
      ? 1
      : resolveAdaptiveCatalogConcurrency(previousProgress, configuredConcurrency)
    updateProgress(input.explorer, {
      query: input.query,
      total: assets.length,
      discovered: assets.length,
      inspected: previousProgress?.inspected ?? 0,
      failed: previousProgress?.failed ?? 0,
      incidents: previousProgress?.incidents ?? 0,
      governanceGaps: previousProgress?.governanceGaps ?? 0,
      concurrency,
      batchSize: policy.scope === 'dataset' ? 1 : policy.batchSize,
      remaining: Math.max(0, assets.length - (previousProgress?.inspected ?? 0)),
      mode: policy.scope === 'dataset' ? 'dataset' : 'catalog',
      cacheMode: policy.cacheMode,
      phase: 'inspect',
      state: 'inspecting',
      checkpointAt: new Date().toISOString(),
      datasets: previousProgress?.datasets ?? [],
    }, input.isCurrent)

    const explored = await inspectCatalogInParallel(assets, async (urn) => {
      // A failed catalog read is retried from the versioned checkpoint. Repeating
      // the whole four-tool inspection immediately can double a 20-second MCP
      // timeout and amplify an already overloaded connector.
      const inspection = policy.cacheMode === 'refresh'
        ? await inspectAsset(urn, true)
        : await inspectWithBoundedRetry(urn, inspectAsset, { retryUnavailable: policy.scope === 'dataset' })
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
      concurrency,
      batchSize: policy.scope === 'dataset' ? 1 : policy.batchSize,
      cacheMode: policy.cacheMode,
      mode: policy.scope === 'dataset' ? 'dataset' : 'catalog',
      maxInspections: policy.scope === 'dataset' ? 1 : policy.batchSize,
      previous: input.explorer.data.exploration?.datasets,
      query: input.query,
      isCancelled: () => !input.isCurrent(),
      onCheckpoint: (progress) => updateProgress(input.explorer, progress, input.isCurrent),
    })

    const evidence: DataHubEvidence[] = explored.inspections.flatMap((inspection) => inspection.evidence)
    const byUrn = new Map(assets.map((asset) => [asset.urn, asset]))
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
      const freshlyAvailableConnectors = new Map<string, { sourceSystem: string; cardId: string }>()
      explored.inspections.filter((inspection) => !isInspectionUnavailable(inspection)).forEach((inspection) => {
        const asset = inspection.asset
        const key = asset?.connectorId ?? asset?.sourceSystem ?? 'catalog'
        freshlyAvailableConnectors.set(key, {
          sourceSystem: asset?.sourceSystem ?? 'Catalog',
          cardId: input.explorer.id,
        })
      })
      unavailable.forEach((dataset) => {
        const asset = byUrn.get(dataset.urn)
        const key = asset?.connectorId ?? asset?.sourceSystem ?? 'catalog'
        connectorGroups.set(key, [...(connectorGroups.get(key) ?? []), dataset])
      })
      const catalogConnectionUnavailable = shouldOpenCatalogConnectivityIncident(explored.progress)
      const recoveredConnectors = [...freshlyAvailableConnectors.entries()].filter(([connector]) => {
        if (catalogConnectionUnavailable && connectorGroups.has(connector)) return false
        return incidentSummaries.some((incident) => incident.incidentKey === `catalog-explorer:connectivity:${connector}` && incident.status !== 'resolved')
      })
      const failedConnectorGroups = catalogConnectionUnavailable ? connectorGroups : new Map<string, typeof unavailable>()
      await Promise.all([
        ...[...failedConnectorGroups.entries()].map(([connector, datasets]) => {
          const firstErrors = datasets
            .flatMap((dataset) => dataset.issues)
            .filter((issue) => issue !== 'metadata unavailable')
            .slice(0, 3)
          return logIncident({
            incidentKey: `catalog-explorer:connectivity:${connector}`,
            transition: 'opened' as const,
            severity: 'critical' as const,
            title: `Catalog connection unavailable · ${byUrn.get(datasets[0]!.urn)?.sourceSystem ?? connector}`,
            detail: `${datasets.length} dataset inspection(s) failed. The audit stopped before classifying unavailable metadata as dataset health.${firstErrors.length ? ` First errors: ${firstErrors.join(' | ')}` : ''}`,
            sourceSystem: byUrn.get(datasets[0]!.urn)?.sourceSystem ?? 'DATA LAB connectivity',
            sourceRef: connector,
            fingerprint: datasets.map((dataset) => dataset.fingerprint).join(':'),
            cardId: input.explorer.id,
            branchId: connector,
          })
        }),
        ...recoveredConnectors.map(([connector, source]) => logIncident({
          incidentKey: `catalog-explorer:connectivity:${connector}`,
          transition: 'recovered' as const,
          severity: 'info' as const,
          title: `Catalog connection restored · ${source.sourceSystem}`,
          detail: 'A fresh bounded catalog inspection completed successfully. Dataset health classification may resume from the saved checkpoint.',
          sourceSystem: source.sourceSystem,
          sourceRef: connector,
          cardId: source.cardId,
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
        `Catalog Explorer checkpoint ${explored.progress.inspected}/${explored.progress.total}; ${explored.progress.incidents} data incidents, ${explored.progress.governanceGaps} governance gaps and ${explored.progress.failed} unavailable reads. Last batch used ${explored.progress.concurrency} workers in ${explored.progress.batchDurationMs ?? 0}ms. Continue from the versioned checkpoint in the next atomic iteration.`,
        ...explored.inspections.slice(0, 4).map((inspection) => {
          const dataset = explored.progress.datasets.find((item) => item.urn === inspection.asset.urn)!
          return `${dataset.name} · ${dataset.status} · fields=${dataset.fieldCount} · owners=${dataset.ownerCount} · upstream=${dataset.upstreamCount} · downstream=${dataset.downstreamCount} · issues=${dataset.issues.join(', ') || 'none'}`
        }),
      ],
    }
  }, [incidentSummaries, inspectAsset, logIncident, updateProgress])

  const attachProgress = useCallback((proposal: AgentProposal, explorer: PipelineNode, progress: CatalogExplorationProgress) => {
    const existingUpdate = proposal.updatedNodes.find((update) => update.nodeId === explorer.id)
    const patch = {
      exploration: progress,
      description: `${progress.mode === 'dataset' ? 'Focused dataset audit' : 'Connected-catalog audit'} · ${progress.inspected}/${progress.total} inspected · ${progress.incidents} data incident(s) · ${progress.governanceGaps} governance gap(s) · ${progress.failed} unavailable.`,
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
      batchSize: 8,
      remaining: 0,
      mode: 'catalog',
      cacheMode: 'prefer',
      phase: 'checkpoint',
      state: 'failed',
      checkpointAt: new Date().toISOString(),
      datasets: [],
    }, isCurrent)
  }, [updateProgress])

  const assetsFor = useCallback((explorerId: string) => catalogAssets.current.get(explorerId) ?? [], [])

  return { assetsFor, attachProgress, explore, markDiscoveryFailed, updateProgress }
}
