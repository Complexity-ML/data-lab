import type { DataHubAssetSummary, DataHubEvidence } from './datahub'
import type { CatalogDatasetCheckpoint, CatalogExplorationProgress } from './pipeline'

export interface CatalogInspection {
  asset: DataHubAssetSummary
  evidence: DataHubEvidence[]
}

const dataIncidentIssues = new Set(['quality failing'])
const governanceIssues = new Set(['owner missing', 'tags missing'])
export const defaultCatalogRetryLimit = 3
export const defaultCatalogRetryCooldownMs = 30_000

export function hasDataIncident(checkpoint: CatalogDatasetCheckpoint) {
  return checkpoint.issues.some((issue) => dataIncidentIssues.has(issue))
}

export function hasGovernanceGap(checkpoint: CatalogDatasetCheckpoint) {
  return checkpoint.issues.some((issue) => governanceIssues.has(issue))
}

export function shouldOpenCatalogConnectivityIncident(progress: CatalogExplorationProgress) {
  return (progress.state === 'failed' || progress.pauseReason === 'connector_unavailable' || progress.pauseReason === 'retry_exhausted') && progress.failed > 0
}

export function resetCatalogRetryState(progress: CatalogExplorationProgress): CatalogExplorationProgress {
  return {
    ...progress,
    state: progress.state === 'complete' ? 'complete' : 'idle',
    pauseReason: undefined,
    connectorRetryCount: 0,
    connectorRecoveryStreak: 0,
    connectorFailureFingerprint: undefined,
    nextRetryAt: undefined,
    checkpointAt: new Date().toISOString(),
  }
}

function preferCheckpoint(left: CatalogDatasetCheckpoint, right: CatalogDatasetCheckpoint) {
  return Date.parse(right.capturedAt) >= Date.parse(left.capturedAt) ? right : left
}

export function mergeCatalogProgress(
  left: CatalogExplorationProgress | undefined,
  right: CatalogExplorationProgress | undefined,
): CatalogExplorationProgress | undefined {
  if (!left) return right
  if (!right) return left
  const byUrn = new Map(left.datasets.map((checkpoint) => [checkpoint.urn, checkpoint]))
  right.datasets.forEach((checkpoint) => {
    const previous = byUrn.get(checkpoint.urn)
    byUrn.set(checkpoint.urn, previous ? preferCheckpoint(previous, checkpoint) : checkpoint)
  })
  const datasets = [...byUrn.values()]
  const latest = Date.parse(right.checkpointAt) >= Date.parse(left.checkpointAt) ? right : left
  const total = Math.max(left.total, right.total, datasets.length)
  return {
    ...latest,
    total,
    discovered: Math.max(left.discovered, right.discovered, datasets.length),
    inspected: datasets.length,
    failed: datasets.filter((checkpoint) => checkpoint.status === 'unavailable').length,
    incidents: datasets.filter(hasDataIncident).length,
    governanceGaps: datasets.filter(hasGovernanceGap).length,
    connectorRetryCount: latest.connectorRetryCount ?? 0,
    connectorRetryLimit: latest.connectorRetryLimit ?? defaultCatalogRetryLimit,
    remaining: Math.max(0, total - datasets.length),
    datasets,
  }
}

export function isInspectionUnavailable(inspection: CatalogInspection) {
  return inspection.evidence.length === 0
    || inspection.evidence.every((read) => read.status !== 'ok' || read.stale)
}

export async function inspectWithBoundedRetry(
  urn: string,
  inspect: (urn: string, force?: boolean) => Promise<CatalogInspection>,
  options: { retryUnavailable?: boolean } = {},
) {
  const first = await inspect(urn, false)
  if (!isInspectionUnavailable(first) || options.retryUnavailable === false) return first
  return inspect(urn, true)
}

const clampConcurrency = (value: number) => Math.max(1, Math.min(8, Math.floor(value)))

export function resolveAdaptiveCatalogConcurrency(
  previous?: CatalogExplorationProgress,
  initialConcurrency = 4,
) {
  if (!previous) return clampConcurrency(initialConcurrency)
  const current = clampConcurrency(previous.concurrency || initialConcurrency)
  const failed = previous.batchFailed ?? 0
  if (previous.pauseReason === 'connector_unavailable' || failed > 0) return 1
  if (current === 1 && (previous.connectorRecoveryStreak ?? 0) < 2) return 1
  if (current === 1 && (previous.connectorRecoveryStreak ?? 0) >= 2) return Math.min(clampConcurrency(initialConcurrency), 2)
  if (!previous.batchDurationMs) return current
  const processed = previous.batchProcessed ?? 0
  const cached = previous.batchCached ?? 0
  // A cached batch measures local SQLite/cache speed, not connector capacity.
  // Do not use it to increase pressure on the MCP transport.
  if (processed > 0 && cached >= Math.ceil(processed / 2)) return current
  if (previous.batchDurationMs <= 8_000) return Math.min(clampConcurrency(initialConcurrency), current + 1)
  if (previous.batchDurationMs >= 15_000) return Math.max(1, current - 1)
  return current
}
export function shouldCallAgentForCatalog(
  previous: CatalogExplorationProgress | undefined,
  current: CatalogExplorationProgress,
  profileRisk = false,
) {
  if (current.state === 'failed' || current.pauseReason === 'connector_unavailable' || current.pauseReason === 'retry_exhausted') return false
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
  const collectionFailures = unavailable
    ? evidence
      .filter((read) => read.status !== 'ok' || read.stale)
      .slice(0, 4)
      .map((read) => `${read.tool}: ${read.summary}`)
    : []
  const issues = [
    ...(unavailable ? ['metadata unavailable'] : []),
    ...collectionFailures,
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
    attemptCount: 1,
    lastAttemptAt: capturedAt,
  }
}

export async function inspectCatalogInParallel(
  assets: DataHubAssetSummary[],
  inspect: (urn: string) => Promise<CatalogInspection>,
  options: {
    batchSize?: number
    cacheMode?: 'prefer' | 'refresh'
    concurrency?: number
    mode?: 'dataset' | 'catalog'
    previous?: CatalogDatasetCheckpoint[]
    previousProgress?: CatalogExplorationProgress
    isCancelled?(): boolean
    maxInspections?: number
    onCheckpoint?(progress: CatalogExplorationProgress, inspections: CatalogInspection[]): void
    query?: string
    retryCooldownMs?: number
    retryLimit?: number
  } = {},
) {
  const requestedConcurrency = Math.max(1, Math.min(8, Math.floor(options.concurrency ?? 4)))
  const configuredBatchSize = Math.max(1, Math.min(32, Math.floor(options.batchSize ?? options.maxInspections ?? (assets.length || 1))))
  const inspections: CatalogInspection[] = []
  const previous = new Map((options.previous ?? []).map((checkpoint) => [checkpoint.urn, checkpoint]))
  const checkpoints: CatalogDatasetCheckpoint[] = assets.flatMap((asset) => {
    const checkpoint = previous.get(asset.urn)
    return checkpoint ? [checkpoint] : []
  })
  // New catalog entries must not queue behind one pathological entity forever.
  // Unavailable checkpoints remain retryable, but only after every never-read
  // dataset has received its first bounded inspection.
  const uninspected = assets.filter((asset) => !previous.has(asset.urn))
  const expired = assets.filter((asset) => {
    const checkpoint = previous.get(asset.urn)
    return checkpoint && checkpoint.status !== 'unavailable' && Date.parse(checkpoint.expiresAt) <= Date.now()
  })
  const retryable = assets.filter((asset) => previous.get(asset.urn)?.status === 'unavailable')
  const pending = [...uninspected, ...expired, ...retryable]
  const inspectionBudget = Math.max(1, Math.min(configuredBatchSize, Math.floor(options.maxInspections ?? configuredBatchSize), pending.length || 1))
  const scheduled = pending.slice(0, inspectionBudget)
  const assetOrder = new Map(assets.map((asset, index) => [asset.urn, index]))
  const orderedCheckpoints = () => [...checkpoints].sort((left, right) => (assetOrder.get(left.urn) ?? 0) - (assetOrder.get(right.urn) ?? 0))
  let batchDurationMs = 0
  let batchFailed = 0
  let batchProcessed = 0
  let batchCached = 0
  let connectorRecoveryStreak = options.previousProgress?.connectorRecoveryStreak ?? 0
  const connectorRetryLimit = Math.max(1, Math.min(10, Math.floor(options.retryLimit ?? options.previousProgress?.connectorRetryLimit ?? defaultCatalogRetryLimit)))
  let connectorRetryCount = options.previousProgress?.connectorRetryCount ?? 0
  let connectorFailureFingerprint = options.previousProgress?.connectorFailureFingerprint
  let nextRetryAt = options.previousProgress?.nextRetryAt
  let effectiveConcurrency = requestedConcurrency

  const upsertCheckpoint = (checkpoint: CatalogDatasetCheckpoint) => {
    const index = checkpoints.findIndex((candidate) => candidate.urn === checkpoint.urn)
    if (index < 0) checkpoints.push(checkpoint)
    else checkpoints[index] = checkpoint
  }

  const emit = (state: CatalogExplorationProgress['state'], pauseReason?: CatalogExplorationProgress['pauseReason']) => {
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
      concurrency: effectiveConcurrency,
      batchSize: configuredBatchSize,
      batchDurationMs,
      batchFailed,
      batchProcessed,
      batchCached,
      connectorRecoveryStreak,
      connectorRetryCount,
      connectorRetryLimit,
      connectorFailureFingerprint,
      nextRetryAt,
      remaining: Math.max(0, assets.length - checkpoints.length),
      mode: options.mode ?? 'catalog',
      cacheMode: options.cacheMode ?? 'prefer',
      phase: state === 'complete' || state === 'paused' || state === 'failed' ? 'checkpoint' : 'inspect',
      state,
      pauseReason,
      checkpointAt: new Date().toISOString(),
      datasets: orderedCheckpoints(),
    }, [...inspections])
  }

  if (options.previousProgress?.pauseReason === 'retry_exhausted' || connectorRetryCount >= connectorRetryLimit) {
    emit('paused', 'retry_exhausted')
    return { inspections, progress: {
      ...options.previousProgress,
      query: options.query ?? options.previousProgress?.query ?? '*',
      total: assets.length,
      discovered: assets.length,
      inspected: checkpoints.length,
      failed: checkpoints.filter((item) => item.status === 'unavailable').length,
      incidents: checkpoints.filter(hasDataIncident).length,
      governanceGaps: checkpoints.filter(hasGovernanceGap).length,
      concurrency: 1,
      connectorRetryCount,
      connectorRetryLimit,
      connectorFailureFingerprint,
      nextRetryAt,
      remaining: Math.max(0, assets.length - checkpoints.length),
      phase: 'checkpoint',
      state: 'paused',
      pauseReason: 'retry_exhausted',
      checkpointAt: new Date().toISOString(),
      datasets: orderedCheckpoints(),
    } satisfies CatalogExplorationProgress }
  }

  emit('inspecting')
  let connectorUnavailable = false
  let consecutiveUnavailable = 0
  const runStartedAt = Date.now()
  const inspectBatch = async (batch: DataHubAssetSummary[]) => {
    const results = await Promise.all(batch.map(async (asset) => {
      try {
        const inspection = await inspect(asset.urn)
        inspections.push(inspection)
        const checkpoint = checkpointForInspection(inspection)
        const prior = previous.get(asset.urn)
        checkpoint.attemptCount = (prior?.attemptCount ?? 0) + 1
        checkpoint.lastAttemptAt = checkpoint.capturedAt
        return { checkpoint, inspection }
      } catch (error) {
        const capturedAt = new Date().toISOString()
        return { checkpoint: {
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
          attemptCount: (previous.get(asset.urn)?.attemptCount ?? 0) + 1,
          lastAttemptAt: capturedAt,
        } }
      }
    }))
    const batchCheckpoints = results.map((result) => result.checkpoint)
    batchDurationMs = Math.max(0, Date.now() - runStartedAt)
    batchFailed += batchCheckpoints.filter((checkpoint) => checkpoint.status === 'unavailable').length
    batchProcessed += results.length
    batchCached += results.filter((result) => result.inspection?.evidence.length && result.inspection.evidence.every((read) => read.cached)).length
    batchCheckpoints.forEach(upsertCheckpoint)
    emit('inspecting')
    return batchCheckpoints
  }

  for (let offset = 0; offset < scheduled.length && !options.isCancelled?.(); offset += requestedConcurrency) {
    const batchCheckpoints = await inspectBatch(scheduled.slice(offset, offset + requestedConcurrency))
    // A single slow or malformed entity is partial catalog evidence, not proof
    // that the whole connector is offline. A complete concurrent batch (or two
    // consecutive singleton probes) is enough to open the circuit.
    if (batchCheckpoints.length > 0 && batchCheckpoints.every((checkpoint) => checkpoint.status === 'unavailable')) {
      consecutiveUnavailable += batchCheckpoints.length
      connectorUnavailable = batchCheckpoints.length > 1 || consecutiveUnavailable >= 2
      if (connectorUnavailable) {
        effectiveConcurrency = 1
        break
      }
    } else {
      consecutiveUnavailable = 0
    }
  }
  if (connectorUnavailable) connectorRecoveryStreak = 0
  if (!connectorUnavailable && batchProcessed > 0 && batchFailed === 0) {
    connectorRetryCount = 0
    connectorFailureFingerprint = undefined
    nextRetryAt = undefined
    connectorRecoveryStreak = options.previousProgress?.pauseReason === 'connector_unavailable'
      ? 1
      : Math.min(100, (options.previousProgress?.connectorRecoveryStreak ?? 0) + 1)
  } else if (batchFailed > 0) {
    connectorRecoveryStreak = 0
    if (connectorUnavailable) {
      connectorRetryCount += 1
      connectorFailureFingerprint = fingerprint(checkpoints
        .filter((checkpoint) => checkpoint.status === 'unavailable')
        .map((checkpoint) => `${checkpoint.urn}:${checkpoint.fingerprint}`)
        .sort()
        .join('|'))
      nextRetryAt = new Date(Date.now() + Math.max(1_000, options.retryCooldownMs ?? defaultCatalogRetryCooldownMs)).toISOString()
    }
  }
  const hasMore = scheduled.length < pending.length
  const cancelled = options.isCancelled?.() === true
  const state: CatalogExplorationProgress['state'] = cancelled
    ? 'paused'
    : connectorUnavailable
      ? 'paused'
      : hasMore
        ? 'inspecting'
        : 'complete'
  const pauseReason: CatalogExplorationProgress['pauseReason'] = cancelled
    ? 'cancelled'
    : connectorUnavailable
      ? connectorRetryCount >= connectorRetryLimit ? 'retry_exhausted' : 'connector_unavailable'
      : undefined
  emit(state, pauseReason)
  return { inspections, progress: {
    query: options.query ?? '*',
    total: assets.length,
    discovered: assets.length,
    inspected: checkpoints.length,
    failed: checkpoints.filter((item) => item.status === 'unavailable').length,
    incidents: checkpoints.filter(hasDataIncident).length,
    governanceGaps: checkpoints.filter(hasGovernanceGap).length,
    concurrency: effectiveConcurrency,
    batchSize: configuredBatchSize,
    batchDurationMs,
    batchFailed,
    batchProcessed,
    batchCached,
    connectorRecoveryStreak,
    connectorRetryCount,
    connectorRetryLimit,
    connectorFailureFingerprint,
    nextRetryAt,
    remaining: Math.max(0, assets.length - checkpoints.length),
    mode: options.mode ?? 'catalog',
    cacheMode: options.cacheMode ?? 'prefer',
    phase: 'checkpoint',
    state,
    pauseReason,
    checkpointAt: new Date().toISOString(),
    datasets: orderedCheckpoints(),
  } satisfies CatalogExplorationProgress }
}
