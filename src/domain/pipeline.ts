import type { Edge, Node } from '@xyflow/react'
import type { DataHubEvidence } from './datahub'
import { scenarioPresets } from './presets'
import { defaultRiskAssessmentRule } from './risk-assessment'

export type CardKind = 'control' | 'source' | 'profile' | 'analysis' | 'impact' | 'risk' | 'patch' | 'monitor' | 'parallel' | 'diagram' | 'split' | 'decision' | 'transform' | 'review' | 'validation' | 'output'
export type PipelineStatus = 'healthy' | 'warning' | 'blocked' | 'draft'

export interface SchemaField {
  name: string
  type: 'string' | 'number' | 'boolean' | 'timestamp'
  tags?: string[]
}

export interface DataProfileField extends SchemaField {
  nullRate?: number
  distinctCount?: number
}

export interface DataProfileSnapshot {
  sourceUrn: string
  capturedAt: string
  expiresAt: string
  stale: boolean
  platform: string
  environment: string
  quality: 'healthy' | 'failing' | 'unavailable'
  fieldCount: number
  profiledFields: DataProfileField[]
  sensitiveFieldCount: number
  upstreamCount: number
  downstreamCount: number
  anomalies: string[]
  tokenEstimate: number
}

export interface PipelineNodeData extends Record<string, unknown> {
  kind: CardKind
  label: string
  description: string
  owner: string
  status: PipelineStatus
  schema: SchemaField[]
  datahubUrn?: string
  datahubPlatform?: string
  datahubEnvironment?: string
  datahubDomain?: string
  datahubTags?: string[]
  datahubQuality?: 'healthy' | 'failing' | 'unavailable'
  datahubFreshness?: { capturedAt: string; expiresAt: string; stale: boolean }
  datahubUpstream?: { urn: string; name: string; sensitive: boolean }[]
  datahubDownstream?: { urn: string; name: string; sensitive: boolean }[]
  profile?: DataProfileSnapshot
  patchScope?: 'graph-only'
  monitorMode?: 'event-loop'
  parallelMode?: 'branch-fanout'
  diagramMode?: 'incident-workstream'
  controlMode?: 'autonomous-player'
  rule?: string
  agentAdded?: boolean
  pinned?: boolean
  runState?: 'idle' | 'running' | 'completed' | 'waiting' | 'failed' | 'stopped'
  runSequence?: number
}

export type PipelineNode = Node<PipelineNodeData, 'pipeline'>

export interface AgentRunTraceStep {
  nodeId: string
  label: string
  role: string
  state: 'completed' | 'waiting' | 'failed' | 'stopped'
  summary: string
}

export interface AgentProposal {
  id: string
  incidentKey?: string
  title: string
  summary: string
  rationale: string
  addedNodes: PipelineNode[]
  updatedNodes: { nodeId: string; patch: Partial<PipelineNodeData>; reason: string }[]
  addedEdges: Edge[]
  removedEdgeIds: string[]
  datahubReads: string[]
  evidence?: DataHubEvidence[]
  writeback: string
  requiresHumanReview?: boolean
  confidence?: number
  model?: string
  runTrace?: AgentRunTraceStep[]
  toolTrace?: { tool: string; status: 'read' | 'accepted' | 'rejected'; summary: string }[]
}

export const cardLabels: Record<CardKind, string> = {
  control: 'DATA LAB Control',
  source: 'Data Source',
  profile: 'Data Profile',
  analysis: 'Data Analysis',
  impact: 'Impact Analysis',
  risk: 'Risk Assessment',
  patch: 'Compatibility Patch',
  monitor: 'Live Monitor',
  parallel: 'Parallel Agents',
  diagram: 'Incident Diagram',
  split: 'Split',
  decision: 'Agent Decision',
  transform: 'Transform',
  review: 'Human Review',
  validation: 'Validation',
  output: 'Output',
}

export const customerActivationNodes: PipelineNode[] = [
  {
    id: 'customers-source',
    type: 'pipeline',
    position: { x: 30, y: 190 },
    data: {
      kind: 'source',
      label: 'Customers 360',
      description: 'Curated customer table from Snowflake',
      owner: 'Growth Data',
      status: 'healthy',
      datahubUrn: 'urn:li:dataset:(urn:li:dataPlatform:snowflake,b2fd91.order_entry_db.order_entry.customers,PROD)',
      schema: [
        { name: 'customer_id', type: 'string' },
        { name: 'email', type: 'string', tags: ['PII'] },
        { name: 'country', type: 'string' },
        { name: 'lifetime_value', type: 'number' },
      ],
    },
  },
  {
    id: 'schema-analysis',
    type: 'pipeline',
    position: { x: 340, y: 190 },
    data: {
      kind: 'analysis',
      label: 'Analyze data context',
      description: 'Reads schema, tags, quality and downstream lineage from DataHub',
      owner: 'LABO Agent',
      status: 'healthy',
      schema: [],
      rule: 'schema + tags + ownership + quality + lineage',
    },
  },
  {
    id: 'region-split',
    type: 'pipeline',
    position: { x: 650, y: 190 },
    data: {
      kind: 'split',
      label: 'Route by consent',
      description: 'Separates activation-ready rows from quarantine',
      owner: 'Growth Data',
      status: 'healthy',
      schema: [],
      rule: 'marketing_consent = true',
    },
  },
  {
    id: 'normalize-customer',
    type: 'pipeline',
    position: { x: 960, y: 70 },
    data: {
      kind: 'transform',
      label: 'Normalize profile',
      description: 'Normalizes country codes and customer identifiers',
      owner: 'Analytics Engineering',
      status: 'warning',
      schema: [],
      rule: 'upper(country), trim(customer_id)',
    },
  },
  {
    id: 'agent-decision',
    type: 'pipeline',
    position: { x: 1270, y: 70 },
    data: {
      kind: 'decision',
      label: 'Agent decision',
      description: 'The agent chooses a correction or requests human review from the analysis findings',
      owner: 'LABO Agent',
      status: 'draft',
      schema: [],
      rule: 'Awaiting an agent correction plan',
    },
  },
  {
    id: 'consent-validation',
    type: 'pipeline',
    position: { x: 1580, y: 70 },
    data: {
      kind: 'validation',
      label: 'Governance gate',
      description: 'Validates consent and PII handling rules',
      owner: 'Data Governance',
      status: 'warning',
      schema: [],
      rule: 'PII fields must be masked before activation',
    },
  },
  {
    id: 'activation-output',
    type: 'pipeline',
    position: { x: 1890, y: 70 },
    data: {
      kind: 'output',
      label: 'CRM activation',
      description: 'Audience sync consumed by the CRM platform',
      owner: 'Lifecycle Marketing',
      status: 'blocked',
      datahubUrn: 'urn:li:dataset:(urn:li:dataPlatform:snowflake,activation.crm_customers,PROD)',
      schema: [],
    },
  },
  {
    id: 'quarantine-output',
    type: 'pipeline',
    position: { x: 960, y: 330 },
    data: {
      kind: 'output',
      label: 'Consent quarantine',
      description: 'Rows held for data steward review',
      owner: 'Data Governance',
      status: 'healthy',
      datahubUrn: 'urn:li:dataset:(urn:li:dataPlatform:snowflake,governance.consent_quarantine,PROD)',
      schema: [],
    },
  },
]

export const customerActivationEdges: Edge[] = [
  { id: 'e-source-analysis', source: 'customers-source', target: 'schema-analysis', type: 'elastic' },
  { id: 'e-analysis-split', source: 'schema-analysis', target: 'region-split', type: 'elastic' },
  { id: 'e-split-normalize', source: 'region-split', target: 'normalize-customer', sourceHandle: 'approved', type: 'elastic', label: 'approved' },
  { id: 'e-split-quarantine', source: 'region-split', target: 'quarantine-output', sourceHandle: 'quarantine', type: 'elastic', label: 'quarantine' },
  { id: 'e-normalize-decision', source: 'normalize-customer', target: 'agent-decision', type: 'elastic' },
  { id: 'e-decision-validation', source: 'agent-decision', target: 'consent-validation', type: 'elastic' },
  { id: 'e-validation-output', source: 'consent-validation', target: 'activation-output', type: 'elastic' },
]

export const initialNodes: PipelineNode[] = []
export const initialEdges: Edge[] = []

export type PipelinePresetId = 'empty' | 'customer-activation' | 'pii-masking' | 'schema-drift' | 'broken-governance'

export function loadPipelinePreset(preset: PipelinePresetId): { title: string; nodes: PipelineNode[]; edges: Edge[] } {
  if (preset === 'empty') return { title: 'Untitled pipeline', nodes: [], edges: [] }
  const selected = preset === 'customer-activation'
    ? { title: 'Customer activation', nodes: customerActivationNodes, edges: customerActivationEdges }
    : scenarioPresets[preset]
  return {
    title: selected.title,
    nodes: selected.nodes.map((node) => ({
      ...node,
      position: { ...node.position },
      data: { ...node.data, schema: node.data.schema.map((field) => ({ ...field, tags: field.tags ? [...field.tags] : undefined })) },
    })),
    edges: selected.edges.map((edge) => ({ ...edge })),
  }
}

export function applyProposal(nodes: PipelineNode[], edges: Edge[], proposal: AgentProposal): { nodes: PipelineNode[]; edges: Edge[] } {
  const removed = new Set(proposal.removedEdgeIds)
  const updates = new Map(proposal.updatedNodes.map((update) => [update.nodeId, update.patch]))
  const updated = nodes.map((node) => {
    const patch = updates.get(node.id)
    return patch ? { ...node, data: { ...node.data, ...patch, status: 'healthy' as const, agentAdded: false } } : node
  })
  return {
    nodes: [...updated.filter((node) => !proposal.addedNodes.some((added) => added.id === node.id)), ...proposal.addedNodes.map((node) => ({ ...node, data: { ...node.data, status: 'healthy' as const, agentAdded: false } }))],
    edges: [...edges.filter((edge) => !removed.has(edge.id) && !proposal.addedEdges.some((added) => added.id === edge.id)), ...proposal.addedEdges],
  }
}

export function newCard(kind: CardKind, index: number): PipelineNode {
  const id = `${kind}-${Date.now()}-${index}`
  return {
    id,
    type: 'pipeline',
    position: { x: 120 + (index % 3) * 290, y: 120 + Math.floor(index / 3) * 190 },
    data: {
      kind,
      label: `New ${cardLabels[kind]}`,
      description: 'Configure this card in the inspector.',
      owner: 'Unassigned',
      status: 'draft',
      schema: [],
      rule: kind === 'split'
        ? 'condition = true'
        : kind === 'impact'
          ? 'scope(change) → DataHub lineage → ranked risks → recommended actions'
          : kind === 'risk'
            ? defaultRiskAssessmentRule
          : kind === 'patch'
            ? 'graph_only: map incompatible fields without mutating the source dataset'
            : kind === 'monitor'
              ? 'on_change(metadata_fingerprint) | cooldown=60s | max_iterations=10 | alert=severity_increase'
              : kind === 'parallel'
                ? 'max_concurrency=3 | context=branch_only | merge=atomic'
                : kind === 'diagram'
                  ? 'group=incident | inputs=parallel_diffs | merge=atomic'
                  : kind === 'control'
                    ? 'objective=maintain governed graph | mode=autonomous | on_review=checkpoint_and_resume | on_idle=monitor'
            : undefined,
      patchScope: kind === 'patch' ? 'graph-only' : undefined,
      monitorMode: kind === 'monitor' ? 'event-loop' : undefined,
      parallelMode: kind === 'parallel' ? 'branch-fanout' : undefined,
      diagramMode: kind === 'diagram' ? 'incident-workstream' : undefined,
      controlMode: kind === 'control' ? 'autonomous-player' : undefined,
    },
  }
}
