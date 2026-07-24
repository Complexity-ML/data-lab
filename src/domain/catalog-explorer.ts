import type { DataHubAssetSummary, DataHubEvidence } from './datahub'
import type { CatalogDatasetCheckpoint, CatalogExplorationProgress } from './pipeline'

export interface CatalogInspection {
  asset: DataHubAssetSummary
  evidence: DataHubEvidence[]
}

const dataIncidentIssues = new Set(['quality failing'])
const governanceIssues = new Set(['owner missing', 'tags missing'])

export function hasDataIncident(checkpoint: CatalogDatasetCheckpoint) {
  return checkpoint.issues.some((issue) => dataIncidentIssues.has(issue))
}

export function hasGovernanceGap(checkpoint: CatalogDatasetCheckpoint) {
  return checkpoint.issues.some((issue) => governanceIssues.has(issue))
}

export function isInspectionUnavailable(inspection: CatalogInspection) {
  return inspection.evidence.length === 0
    || inspection.evidence.every((read) => read.status !== 'ok' || read.stale)
}

export async function inspectWithBoundedRetry(
  urn: string,
  inspect: (urn: string, force?: boolean) => Promise<CatalogInspection>,
) {
  const first = await inspect(urn, false)
  if (!isInspectionUnavailable(first)) return first
  return inspect(urn, true)
}

export function shouldCallAgentForCatalog(
  previous: CatalogExplorationProgress | undefined,
  current: CatalogExplorationProgress,
  profileRisk = false,
) {
  if (current.state === 'failed') return false
  if (current.state === 'complete') return true
  return profileRisk
    || current.incidents > (previous?.incidents ?? 0)
    || current.failed > (previous?.failed ?? 0)
}

function fingerprint(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function checkpointForInspection(inspection: CatalogInspection): CatalogDatasetCheckpoint {
  const { asset, evidence } = inspection
  const unavailable = isInspectionUnavailable(inspection)
  const issues = [
    ...(unavailable ? ['metadata unavailable'] : []),
    ...(asset.freshness.stale ? ['stale evidence'] : []),
    ...(asset.owners.length === 0 ? ['owner missing'] : []),
    ...(asset.tags.length === 0 ? ['tags missing'] : []),
    ...(asset.qualityStatus === 'failing' ? ['quality failing'] : []),
  ]
  const status: CatalogDatasetCheckpoint['status'] = unavailable ? 'unavailable' : issues.length ? 'warning' : 'healthy'
  const capturedAt = evidence.map((read) => read.capturedAt).sort().at(-1) ?? asset.freshness.capturedAt
  const expiresAt = evidence.filter((read) => read.status === 'ok' && !read.stale).map((read) => read.expiresAt).sort()[0] ?? capturedAt
  return {
    urn: asset.urn,
    name: asset.name,
    status,
    fieldCount: asset.fields.length,
    ownerCount: asset.owners.length,
    upstreamCount: asset.upstream.length,
    downstreamCount: asset.downstream.length,
    issues,
    fingerprint: fingerprint([
      asset.urn,
      asset.fields.map((field) => `${field.name}:${field.type}:${field.tags?.join(',') ?? ''}`).join('|'),
      asset.owners.join('|'),
      asset.tags.join('|'),
      asset.qualityStatus,
      asset.upstream.map((item) => item.urn).join('|'),
      asset.downstream.map((item) => item.urn).join('|'),
      evidence.map((read) => `${read.tool}:${read.status}:${read.stale}:${read.summary}`).join('|'),
    ].join('::')),
    capturedAt,
    expiresAt,
  }
}

export async function inspectCatalogInParallel(
  assets: DataHubAssetSummary[],
  inspect: (urn: string) => Promise<CatalogInspection>,
  options: {
    concurrency?: number
    previous?: CatalogDatasetCheckpoint[]
    isCancelled?(): boolean
    maxInspections?: number
    onCheckpoint?(progress: CatalogExplorationProgress, inspections: CatalogInspection[]): void
    query?: string
  } = {},
) {
  const concurrency = Math.max(1, Math.min(8, Math.floor(options.concurrency ?? 4)))
  const inspections: CatalogInspection[] = []
  const previous = new Map((options.previous ?? []).map((checkpoint) => [checkpoint.urn, checkpoint]))
  const reusable = assets.flatMap((asset) => {
    const checkpoint = previous.get(asset.urn)
    return checkpoint && checkpoint.status !== 'unavailable' && Date.parse(checkpoint.expiresAt) > Date.now() ? [checkpoint] : []
  })
  const checkpoints: CatalogDatasetCheckpoint[] = [...reusable]
  const pending = assets.filter((asset) => !reusable.some((checkpoint) => checkpoint.urn === asset.urn))
  const inspectionBudget = Math.max(1, Math.min(32, Math.floor(options.maxInspections ?? pending.length)))
  const scheduled = pending.slice(0, inspectionBudget)
  const assetOrder = new Map(assets.map((asset, index) => [asset.urn, index]))
  const orderedCheckpoints = () => [...checkpoints].sort((left, right) => (assetOrder.get(left.urn) ?? 0) - (assetOrder.get(right.urn) ?? 0))

  const emit = (state: CatalogExplorationProgress['state']) => {
    const failed = checkpoints.filter((item) => item.status === 'unavailable').length
    // Collection failures and governance gaps are not evidence that the
    // underlying dataset is unhealthy.
    const incidents = checkpoints.filter(hasDataIncident).length
    const governanceGaps = checkpoints.filter(hasGovernanceGap).length
    options.onCheckpoint?.({
      query: options.query ?? '*',
      total: assets.length,
      discovered: assets.length,
      inspected: checkpoints.length,
      failed,
      incidents,
      governanceGaps,
      concurrency,
      state,
      checkpointAt: new Date().toISOString(),
      datasets: orderedCheckpoints(),
    }, [...inspections])
  }

  emit('inspecting')
  let connectorUnavailable = false
  for (let offset = 0; offset < scheduled.length && !options.isCancelled?.(); offset += concurrency) {
    const batch = scheduled.slice(offset, offset + concurrency)
    const batchCheckpoints = await Promise.all(batch.map(async (asset) => {
      try {
        const inspection = await inspect(asset.urn)
        inspections.push(inspection)
        return checkpointForInspection(inspection)
      } catch (error) {
        const capturedAt = new Date().toISOString()
        return {
          urn: asset.urn,
          name: asset.name,
          status: 'unavailable' as const,
          fieldCount: asset.fields.length,
          ownerCount: asset.owners.length,
          upstreamCount: asset.upstream.length,
          downstreamCount: asset.downstream.length,
          issues: [`inspection failed: ${error instanceof Error ? error.message : String(error)}`],
          fingerprint: fingerprint(`${asset.urn}:inspection-failed`),
          capturedAt,
          expiresAt: capturedAt,
        }
      }
    }))
    checkpoints.push(...batchCheckpoints)
    emit('inspecting')

    if (batchCheckpoints.length > 0 && batchCheckpoints.every((checkpoint) => checkpoint.status === 'unavailable')) {
      connectorUnavailable = true
      break
    }
  }
  const hasMore = scheduled.length < pending.length
  const state: CatalogExplorationProgress['state'] = options.isCancelled?.()
    ? 'paused'
    : connectorUnavailable
      ? 'failed'
      : hasMore
        ? 'inspecting'
        : 'complete'
  emit(state)
  return { inspections, progress: {
    query: options.query ?? '*',
    total: assets.length,
    discovered: assets.length,
    inspected: checkpoints.length,
    failed: checkpoints.filter((item) => item.status === 'unavailable').length,
    incidents: checkpoints.filter(hasDataIncident).length,
    governanceGaps: checkpoints.filter(hasGovernanceGap).length,
    concurrency,
    state,
    checkpointAt: new Date().toISOString(),
    datasets: orderedCheckpoints(),
  } satisfies CatalogExplorationProgress }
}
