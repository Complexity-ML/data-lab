import type { Edge } from '@xyflow/react'
import type { PipelineNode, PipelineNodeData, CardKind, CatalogExplorationProgress, DataProfileSnapshot, SchemaField } from './pipeline'
import type { PipelineVersion } from './versioning'
import type { DataHubEvidence } from './datahub'

export const pipelineExportSchema = 'data-lab.pipeline'
export const pipelineExportVersion = 1
const kinds = new Set<CardKind>(['control', 'explorer', 'source', 'profile', 'analysis', 'impact', 'risk', 'patch', 'monitor', 'parallel', 'diagram', 'split', 'decision', 'transform', 'review', 'validation', 'output'])

function redactExportText(value: string) {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/((?:api[_-]?key|access[_-]?token|token|secret|password)\s*[=:]\s*["']?)[^\s,"'}&]+/gi, '$1[REDACTED]')
    .replace(/(?:\/Users\/[^\s"']+|[A-Za-z]:\\Users\\[^\s"']+)/g, '[LOCAL_PATH_REMOVED]')
}

export interface PipelineExport {
  schema: typeof pipelineExportSchema
  schemaVersion: typeof pipelineExportVersion
  exportedAt: string
  projectTitle: string
  graph: { nodes: PipelineNode[]; edges: Edge[] }
  versions: PipelineVersion[]
}

function cleanFields(value: unknown): SchemaField[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 500).flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const source = item as Record<string, unknown>
    if (typeof source.name !== 'string' || !['string', 'number', 'boolean', 'timestamp'].includes(String(source.type))) return []
    return [{ name: source.name.slice(0, 240), type: source.type as SchemaField['type'], tags: Array.isArray(source.tags) ? source.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 50) : undefined }]
  })
}

function cleanProfile(value: unknown): DataProfileSnapshot | undefined {
  if (!value || typeof value !== 'object') return undefined
  const source = value as Record<string, unknown>
  if (typeof source.sourceUrn !== 'string' || !source.sourceUrn.startsWith('urn:li:') || typeof source.capturedAt !== 'string' || typeof source.expiresAt !== 'string') return undefined
  const quality = ['healthy', 'failing', 'unavailable'].includes(String(source.quality)) ? source.quality as DataProfileSnapshot['quality'] : 'unavailable'
  const profiledFields = cleanFields(source.profiledFields).slice(0, 32).map((field, index) => {
    const raw = Array.isArray(source.profiledFields) ? source.profiledFields[index] as Record<string, unknown> : undefined
    return { ...field, nullRate: typeof raw?.nullRate === 'number' && raw.nullRate >= 0 && raw.nullRate <= 1 ? raw.nullRate : undefined, distinctCount: Number.isInteger(raw?.distinctCount) && Number(raw?.distinctCount) >= 0 ? Number(raw?.distinctCount) : undefined }
  })
  return {
    sourceUrn: source.sourceUrn.slice(0, 2_000), capturedAt: source.capturedAt, expiresAt: source.expiresAt, stale: source.stale === true,
    platform: typeof source.platform === 'string' ? source.platform.slice(0, 160) : '', environment: typeof source.environment === 'string' ? source.environment.slice(0, 80) : '', quality,
    fieldCount: Math.max(0, Math.min(100_000, Number.isInteger(source.fieldCount) ? Number(source.fieldCount) : profiledFields.length)), profiledFields,
    sensitiveFieldCount: Math.max(0, Math.min(100_000, Number.isInteger(source.sensitiveFieldCount) ? Number(source.sensitiveFieldCount) : 0)),
    upstreamCount: Math.max(0, Math.min(100_000, Number.isInteger(source.upstreamCount) ? Number(source.upstreamCount) : 0)), downstreamCount: Math.max(0, Math.min(100_000, Number.isInteger(source.downstreamCount) ? Number(source.downstreamCount) : 0)),
    anomalies: Array.isArray(source.anomalies) ? source.anomalies.filter((item): item is string => typeof item === 'string').map((item) => redactExportText(item).slice(0, 240)).slice(0, 8) : [],
    tokenEstimate: Math.max(1, Math.min(100_000, Number.isInteger(source.tokenEstimate) ? Number(source.tokenEstimate) : 1)),
  }
}

function cleanExploration(value: unknown): CatalogExplorationProgress | undefined {
  if (!value || typeof value !== 'object') return undefined
  const source = value as Record<string, unknown>
  const state = ['idle', 'discovering', 'inspecting', 'complete', 'paused', 'failed'].includes(String(source.state))
    ? source.state as CatalogExplorationProgress['state']
    : 'idle'
  const bounded = (field: string, maximum = 100_000) => Math.max(0, Math.min(maximum, Number.isInteger(source[field]) ? Number(source[field]) : 0))
  const datasets = Array.isArray(source.datasets) ? source.datasets.slice(0, 2_000).flatMap((value) => {
    if (!value || typeof value !== 'object') return []
    const item = value as Record<string, unknown>
    if (typeof item.urn !== 'string' || !item.urn.startsWith('urn:li:dataset:')) return []
    const itemStatus = ['healthy', 'warning', 'unavailable'].includes(String(item.status))
      ? item.status as 'healthy' | 'warning' | 'unavailable'
      : 'unavailable'
    return [{
      urn: item.urn.slice(0, 2_000),
      name: typeof item.name === 'string' ? redactExportText(item.name).slice(0, 240) : item.urn.slice(0, 240),
      status: itemStatus,
      fieldCount: Math.max(0, Math.min(100_000, Number.isInteger(item.fieldCount) ? Number(item.fieldCount) : 0)),
      ownerCount: Math.max(0, Math.min(100_000, Number.isInteger(item.ownerCount) ? Number(item.ownerCount) : 0)),
      upstreamCount: Math.max(0, Math.min(100_000, Number.isInteger(item.upstreamCount) ? Number(item.upstreamCount) : 0)),
      downstreamCount: Math.max(0, Math.min(100_000, Number.isInteger(item.downstreamCount) ? Number(item.downstreamCount) : 0)),
      issues: Array.isArray(item.issues) ? item.issues.filter((issue): issue is string => typeof issue === 'string').map((issue) => redactExportText(issue).slice(0, 160)).slice(0, 12) : [],
      fingerprint: typeof item.fingerprint === 'string' ? item.fingerprint.slice(0, 120) : '',
      capturedAt: typeof item.capturedAt === 'string' ? item.capturedAt : new Date(0).toISOString(),
      expiresAt: typeof item.expiresAt === 'string' ? item.expiresAt : new Date(0).toISOString(),
    }]
  }) : []
  return {
    query: typeof source.query === 'string' ? redactExportText(source.query).slice(0, 500) : '*',
    total: bounded('total'),
    discovered: bounded('discovered'),
    inspected: bounded('inspected'),
    failed: bounded('failed'),
    incidents: bounded('incidents'),
    concurrency: Math.max(1, Math.min(16, bounded('concurrency', 16) || 4)),
    state,
    checkpointAt: typeof source.checkpointAt === 'string' ? source.checkpointAt : new Date(0).toISOString(),
    datasets,
  }
}

function cleanNodeData(data: Record<string, unknown>): PipelineNodeData {
  const kind = kinds.has(data.kind as CardKind) ? data.kind as CardKind : 'analysis'
  const quality = ['healthy', 'failing', 'unavailable'].includes(String(data.datahubQuality)) ? data.datahubQuality as PipelineNodeData['datahubQuality'] : undefined
  return {
    kind,
    label: typeof data.label === 'string' ? redactExportText(data.label).slice(0, 160) : `Imported ${kind}`,
    description: typeof data.description === 'string' ? redactExportText(data.description).slice(0, 2_000) : '',
    owner: typeof data.owner === 'string' ? redactExportText(data.owner).slice(0, 160) : 'Unassigned',
    status: ['healthy', 'warning', 'blocked', 'draft'].includes(String(data.status)) ? data.status as PipelineNodeData['status'] : 'draft',
    schema: cleanFields(data.schema),
    rule: typeof data.rule === 'string' ? redactExportText(data.rule).slice(0, 8_000) : undefined,
    datahubUrn: typeof data.datahubUrn === 'string' && data.datahubUrn.startsWith('urn:li:') ? data.datahubUrn.slice(0, 2_000) : undefined,
    datahubPlatform: typeof data.datahubPlatform === 'string' ? data.datahubPlatform.slice(0, 160) : undefined,
    datahubEnvironment: typeof data.datahubEnvironment === 'string' ? data.datahubEnvironment.slice(0, 80) : undefined,
    datahubDomain: typeof data.datahubDomain === 'string' ? data.datahubDomain.slice(0, 160) : undefined,
    datahubTags: Array.isArray(data.datahubTags) ? data.datahubTags.filter((tag): tag is string => typeof tag === 'string').slice(0, 100) : undefined,
    datahubQuality: quality,
    profile: cleanProfile(data.profile),
    exploration: cleanExploration(data.exploration),
    patchScope: kind === 'patch' ? 'graph-only' : undefined,
    monitorMode: kind === 'monitor' ? 'event-loop' : undefined,
    parallelMode: kind === 'parallel' ? 'branch-fanout' : undefined,
    diagramMode: kind === 'diagram' ? 'incident-workstream' : undefined,
    controlMode: kind === 'control' ? 'autonomous-player' : undefined,
    explorerMode: kind === 'explorer' ? 'catalog-fanout' : undefined,
    pinned: data.pinned === true,
  }
}

function cleanNodes(value: unknown): PipelineNode[] {
  if (!Array.isArray(value) || value.length > 2_000) throw new Error('Pipeline cards must be an array of at most 2,000 items')
  const ids = new Set<string>()
  return value.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`Card ${index + 1} is invalid`)
    const source = item as Record<string, unknown>
    const id = typeof source.id === 'string' ? source.id.slice(0, 180) : ''
    if (!id || ids.has(id)) throw new Error(`Card ${index + 1} has a missing or duplicate ID`)
    ids.add(id)
    const position = source.position && typeof source.position === 'object' ? source.position as Record<string, unknown> : {}
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) throw new Error(`Card ${id} has an invalid XY position`)
    if (!source.data || typeof source.data !== 'object' || !kinds.has((source.data as Record<string, unknown>).kind as CardKind)) throw new Error(`Card ${id} has an unsupported kind`)
    return { id, type: 'pipeline', position: { x: Number(position.x), y: Number(position.y) }, data: cleanNodeData(source.data as Record<string, unknown>) }
  })
}

function cleanEdges(value: unknown, nodeIds: Set<string>): Edge[] {
  if (!Array.isArray(value) || value.length > 4_000) throw new Error('Pipeline edges must be an array of at most 4,000 items')
  const ids = new Set<string>()
  return value.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`Edge ${index + 1} is invalid`)
    const source = item as Record<string, unknown>
    const id = typeof source.id === 'string' ? source.id.slice(0, 180) : ''
    const from = typeof source.source === 'string' ? source.source : ''
    const target = typeof source.target === 'string' ? source.target : ''
    if (!id || ids.has(id)) throw new Error(`Edge ${index + 1} has a missing or duplicate ID`)
    if (!nodeIds.has(from) || !nodeIds.has(target)) throw new Error(`Edge ${id} references a missing card`)
    ids.add(id)
    const sourceHandle = source.sourceHandle === 'approved' || source.sourceHandle === 'quarantine' || source.sourceHandle === 'feedback' ? source.sourceHandle : undefined
    return { id, source: from, target, type: 'elastic', sourceHandle, label: sourceHandle === 'feedback' ? 'next iteration' : undefined }
  })
}

function cleanGraph(nodes: unknown, edges: unknown) {
  const clean = cleanNodes(nodes)
  return { nodes: clean, edges: cleanEdges(edges, new Set(clean.map((node) => node.id))) }
}

function cleanEvidence(value: unknown): DataHubEvidence[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.slice(0, 50).flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const source = item as Record<string, unknown>
    if (typeof source.tool !== 'string' || typeof source.urn !== 'string' || typeof source.capturedAt !== 'string' || typeof source.expiresAt !== 'string') return []
    const summary = typeof source.summary === 'string' ? redactExportText(source.summary).slice(0, 500) : ''
    return [{ tool: source.tool.slice(0, 120), urn: source.urn.slice(0, 2_000), capturedAt: source.capturedAt, expiresAt: source.expiresAt, status: ['ok', 'unavailable', 'error'].includes(String(source.status)) ? source.status as DataHubEvidence['status'] : 'unavailable', summary, cached: source.cached === true, stale: source.stale === true }]
  })
}

function cleanVersion(value: unknown, index: number): PipelineVersion {
  if (!value || typeof value !== 'object') throw new Error(`Version ${index + 1} is invalid`)
  const source = value as Record<string, unknown>
  const graph = cleanGraph(source.nodes, source.edges)
  if (typeof source.id !== 'string' || typeof source.label !== 'string' || typeof source.createdAt !== 'string') throw new Error(`Version ${index + 1} metadata is invalid`)
  return { id: source.id.slice(0, 180), label: redactExportText(source.label).slice(0, 180), createdAt: source.createdAt, origin: ['initial', 'agent', 'manual'].includes(String(source.origin)) ? source.origin as PipelineVersion['origin'] : 'manual', nodes: graph.nodes, edges: graph.edges, blockingIssues: Number.isInteger(source.blockingIssues) ? Number(source.blockingIssues) : 0, status: ['committed', 'pending-review', 'rejected'].includes(String(source.status)) ? source.status as PipelineVersion['status'] : 'committed', description: typeof source.description === 'string' ? redactExportText(source.description).slice(0, 4_000) : undefined, evidence: cleanEvidence(source.evidence) }
}

export function createPipelineExport(projectTitle: string, nodes: PipelineNode[], edges: Edge[], versions: PipelineVersion[]): PipelineExport {
  const graph = cleanGraph(nodes, edges)
  return { schema: pipelineExportSchema, schemaVersion: pipelineExportVersion, exportedAt: new Date().toISOString(), projectTitle: redactExportText(projectTitle).slice(0, 180), graph, versions: versions.slice(-20).map((version, index) => cleanVersion(version, index)) }
}

export function parsePipelineExport(serialized: string): PipelineExport {
  if (serialized.length > 8_000_000) throw new Error('Import exceeds the 8 MB safety limit')
  let value: unknown
  try { value = JSON.parse(serialized) } catch { throw new Error('Import is not valid JSON') }
  if (!value || typeof value !== 'object') throw new Error('Import root must be an object')
  const source = value as Record<string, unknown>
  if (source.schema !== pipelineExportSchema) throw new Error('This file is not a DATA LAB pipeline export')
  if (source.schemaVersion !== pipelineExportVersion) throw new Error(`Unsupported DATA LAB schema version ${String(source.schemaVersion)}. This app supports version ${pipelineExportVersion}.`)
  if (!source.graph || typeof source.graph !== 'object') throw new Error('Import is missing its graph')
  const graphSource = source.graph as Record<string, unknown>
  const graph = cleanGraph(graphSource.nodes, graphSource.edges)
  const versions = Array.isArray(source.versions) ? source.versions.map(cleanVersion) : []
  return { schema: pipelineExportSchema, schemaVersion: pipelineExportVersion, exportedAt: typeof source.exportedAt === 'string' ? source.exportedAt : new Date().toISOString(), projectTitle: typeof source.projectTitle === 'string' ? source.projectTitle.slice(0, 180) : 'Imported pipeline', graph, versions }
}
