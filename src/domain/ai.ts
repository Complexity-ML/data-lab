import type { Edge } from '@xyflow/react'
import type { AgentProposal, CardKind, PipelineNode, PipelineNodeData } from './pipeline'

export type ApiProvider = 'openai' | 'anthropic' | 'moonshot'
export type AiModel = string
export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type Verbosity = 'low' | 'medium' | 'high'
export type ServiceTier = 'auto' | 'priority'

export interface AiSettings {
  provider: ApiProvider
  model: AiModel
  reasoningEffort: ReasoningEffort
  verbosity: Verbosity
  serviceTier: ServiceTier
}

export interface AiStatus {
  connected: boolean
  credentialSource: 'environment' | 'encrypted' | 'none'
  selectedProvider: ApiProvider
  providers: Record<ApiProvider, { connected: boolean; credentialSource: 'environment' | 'encrypted' | 'none'; model: string }>
  encryptionAvailable: boolean
  settings: AiSettings
}

export interface ChatGPTModelOption { id: string; label: string; description?: string; efforts: string[]; defaultEffort?: string; isDefault: boolean }
export interface ChatGPTSessionStatus { available: boolean; connected: boolean; email?: string; planType?: string; models?: ChatGPTModelOption[]; selectedModel?: string; selectedEffort?: string; error?: string }

interface AiAction {
  type: 'add_card' | 'update_card' | 'add_edge' | 'remove_edge'
  node_id: string | null
  kind: CardKind | null
  label: string | null
  description: string | null
  owner: string | null
  rule: string | null
  source: string | null
  target: string | null
  source_handle: string | null
  reason: string
}

interface AiProposalContract {
  title: string
  summary: string
  rationale: string
  requires_human_review: boolean
  confidence: number
  writeback: string
  evidence: string[]
  actions: AiAction[]
}

export interface AiProposalResponse {
  proposal: AiProposalContract
  model: string
  usage?: unknown
}

const kinds = new Set<CardKind>(['source', 'analysis', 'split', 'decision', 'transform', 'review', 'validation', 'output'])

function identifier(value: string, fallback: string) {
  const clean = value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
  return clean || fallback
}

function text(value: unknown, fallback = '', limit = 800) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : fallback
}

function nodePatch(action: AiAction): Partial<PipelineNodeData> {
  const patch: Partial<PipelineNodeData> = { status: 'draft', agentAdded: true }
  if (action.kind && kinds.has(action.kind)) patch.kind = action.kind
  if (text(action.label)) patch.label = text(action.label, '', 120)
  if (text(action.description)) patch.description = text(action.description, '', 500)
  if (text(action.owner)) patch.owner = text(action.owner, '', 120)
  if (text(action.rule)) patch.rule = text(action.rule, '', 2_000)
  return patch
}

export function materializeAiProposal(response: AiProposalResponse, nodes: PipelineNode[], edges: Edge[]): AgentProposal {
  const contract = response.proposal
  if (!contract || !Array.isArray(contract.actions)) throw new Error('The AI response does not match the DATA LAB proposal contract')

  const knownNodeIds = new Set(nodes.map((node) => node.id))
  const knownEdgeIds = new Set(edges.map((edge) => edge.id))
  const idAliases = new Map<string, string>()
  const addedNodes: PipelineNode[] = []
  const updatedNodes: AgentProposal['updatedNodes'] = []
  const addedEdges: Edge[] = []
  const removedEdgeIds: string[] = []
  const rightmost = nodes.reduce((maximum, node) => Math.max(maximum, node.position.x), 0)

  for (const [index, action] of contract.actions.slice(0, 20).entries()) {
    if (action.type !== 'add_card') continue
    if (!action.kind || !kinds.has(action.kind)) continue
    const alias = text(action.node_id, `agent-card-${index + 1}`, 80)
    let id = identifier(alias, `agent-card-${index + 1}`)
    while (knownNodeIds.has(id)) id = `${id}-${index + 1}`
    knownNodeIds.add(id)
    idAliases.set(alias, id)
    addedNodes.push({
      id,
      type: 'pipeline',
      position: { x: rightmost + 300 + (index % 3) * 285, y: 90 + Math.floor(index / 3) * 190 },
      data: {
        kind: action.kind,
        label: text(action.label, `Agent ${action.kind}`, 120),
        description: text(action.description, 'Agent-proposed card awaiting human review.', 500),
        owner: text(action.owner, 'LABO Agent', 120),
        rule: text(action.rule, undefined, 2_000) || undefined,
        status: 'draft',
        schema: [],
        agentAdded: true,
      },
    })
  }

  const resolveNode = (value: string | null) => {
    const candidate = text(value, '', 80)
    return idAliases.get(candidate) ?? (knownNodeIds.has(candidate) ? candidate : undefined)
  }

  for (const [index, action] of contract.actions.slice(0, 20).entries()) {
    if (action.type === 'update_card') {
      const nodeId = resolveNode(action.node_id)
      if (nodeId && nodes.some((node) => node.id === nodeId)) {
        updatedNodes.push({ nodeId, patch: nodePatch(action), reason: text(action.reason, 'AI-proposed card revision.', 500) })
      }
    }
    if (action.type === 'add_edge') {
      const source = resolveNode(action.source)
      const target = resolveNode(action.target)
      if (source && target && source !== target) {
        const base = `e-${identifier(source, 'source')}-${identifier(target, 'target')}`
        let id = base
        let suffix = index + 1
        while (knownEdgeIds.has(id)) id = `${base}-${suffix++}`
        knownEdgeIds.add(id)
        addedEdges.push({ id, source, target, sourceHandle: text(action.source_handle) || undefined, type: 'elastic' })
      }
    }
    if (action.type === 'remove_edge') {
      const edgeId = text(action.node_id, '', 120)
      if (knownEdgeIds.has(edgeId)) removedEdgeIds.push(edgeId)
    }
  }

  const includesHumanReviewCard = addedNodes.some((node) => node.data.kind === 'review')
    || updatedNodes.some((update) => update.patch.kind === 'review')
  if (contract.requires_human_review && !includesHumanReviewCard) {
    throw new Error('The agent requested Human Review without adding the required Human Review card. The graph was left unchanged.')
  }

  return {
    id: `ai-proposal-${Date.now()}`,
    title: text(contract.title, 'AI graph proposal', 160),
    summary: text(contract.summary, 'The connected model proposed a reviewed graph change.', 800),
    rationale: text(contract.rationale, 'Review the complete diff before applying it.', 1_600),
    requiresHumanReview: Boolean(contract.requires_human_review),
    confidence: typeof contract.confidence === 'number' ? Math.max(0, Math.min(1, contract.confidence)) : undefined,
    model: response.model,
    datahubReads: Array.isArray(contract.evidence) ? contract.evidence.map((item) => text(item, '', 500)).filter(Boolean).slice(0, 12) : [],
    writeback: text(contract.writeback, 'Record the approved decision and lineage in DataHub.', 800),
    addedNodes,
    updatedNodes,
    addedEdges,
    removedEdgeIds,
  }
}

export function compactGraph(nodes: PipelineNode[], edges: Edge[]) {
  return {
    nodes: nodes.map((node) => ({ id: node.id, kind: node.data.kind, label: node.data.label, description: node.data.description, owner: node.data.owner, rule: node.data.rule, datahubUrn: node.data.datahubUrn, schema: node.data.schema })),
    edges: edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle })),
  }
}
