import type { Edge, Node } from '@xyflow/react'

export type CardKind = 'source' | 'analysis' | 'split' | 'decision' | 'transform' | 'review' | 'validation' | 'output'
export type PipelineStatus = 'healthy' | 'warning' | 'blocked' | 'draft'

export interface SchemaField {
  name: string
  type: 'string' | 'number' | 'boolean' | 'timestamp'
  tags?: string[]
}

export interface PipelineNodeData extends Record<string, unknown> {
  kind: CardKind
  label: string
  description: string
  owner: string
  status: PipelineStatus
  schema: SchemaField[]
  datahubUrn?: string
  rule?: string
  agentAdded?: boolean
  runState?: 'idle' | 'running' | 'completed' | 'waiting' | 'failed'
  runSequence?: number
}

export type PipelineNode = Node<PipelineNodeData, 'pipeline'>

export interface AgentRunTraceStep {
  nodeId: string
  label: string
  role: string
  state: 'completed' | 'waiting' | 'failed'
  summary: string
}

export interface AgentProposal {
  id: string
  title: string
  summary: string
  rationale: string
  addedNodes: PipelineNode[]
  updatedNodes: { nodeId: string; patch: Partial<PipelineNodeData>; reason: string }[]
  addedEdges: Edge[]
  removedEdgeIds: string[]
  datahubReads: string[]
  writeback: string
  runTrace?: AgentRunTraceStep[]
}

export const cardLabels: Record<CardKind, string> = {
  source: 'Data Source',
  analysis: 'Data Analysis',
  split: 'Split',
  decision: 'Agent Decision',
  transform: 'Transform',
  review: 'Human Review',
  validation: 'Validation',
  output: 'Output',
}

export const initialNodes: PipelineNode[] = [
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
      datahubUrn: 'urn:li:dataset:(urn:li:dataPlatform:snowflake,analytics.customers_360,PROD)',
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

export const initialEdges: Edge[] = [
  { id: 'e-source-analysis', source: 'customers-source', target: 'schema-analysis', type: 'smoothstep' },
  { id: 'e-analysis-split', source: 'schema-analysis', target: 'region-split', type: 'smoothstep' },
  { id: 'e-split-normalize', source: 'region-split', target: 'normalize-customer', sourceHandle: 'approved', type: 'smoothstep', label: 'approved' },
  { id: 'e-split-quarantine', source: 'region-split', target: 'quarantine-output', sourceHandle: 'quarantine', type: 'smoothstep', label: 'quarantine' },
  { id: 'e-normalize-decision', source: 'normalize-customer', target: 'agent-decision', type: 'smoothstep' },
  { id: 'e-decision-validation', source: 'agent-decision', target: 'consent-validation', type: 'smoothstep' },
  { id: 'e-validation-output', source: 'consent-validation', target: 'activation-output', type: 'smoothstep' },
]

export function createGovernanceProposal(nodes: PipelineNode[], edges: Edge[], options: { uncertain?: boolean } = {}): AgentProposal {
  const source = nodes.find((node) => node.data.kind === 'source')
  const sensitiveFields = (source?.data.schema ?? [])
    .filter((field) => field.tags?.some((tag) => /pii|sensitive|confidential/i.test(tag)))
    .map((field) => field.name)
  const decision = nodes.find((node) => node.data.kind === 'decision')
  const target = nodes.find((node) => node.id === 'consent-validation')
  const incomingDecision = decision ? edges.find((edge) => edge.target === decision.id) : undefined
  const incomingTarget = target ? edges.find((edge) => edge.target === target.id) : undefined
  const previousNodeId = incomingDecision?.source ?? incomingTarget?.source ?? 'normalize-customer'
  const position = decision ? { x: decision.position.x - 285, y: decision.position.y } : target ? { x: target.position.x - 325, y: target.position.y + 150 } : { x: 900, y: 230 }
  const fieldSummary = sensitiveFields.join(', ')
  const protectionRule = sensitiveFields.map((field) => `sha256(lower(trim(${field}))) AS ${field}_hash; drop ${field}`).join('\n')
  const needsProtection = sensitiveFields.length > 0 && !options.uncertain
  const transformNode: PipelineNode = {
    id: 'protect-sensitive-fields',
    type: 'pipeline',
    position,
    data: {
      kind: 'transform',
      label: `Protect ${fieldSummary}`,
      description: 'Agent-proposed sensitive-field protection using deterministic SHA-256',
      owner: 'Data Governance',
      status: 'draft',
      schema: [],
      rule: protectionRule,
      agentAdded: true,
    },
  }
  return {
    id: 'proposal-mask-pii',
    title: options.uncertain ? 'Review incomplete DataHub evidence' : `Protect ${fieldSummary} before activation`,
    summary: options.uncertain ? 'Pause the flow because the agent could not collect enough trusted context.' : `Insert deterministic protection for ${fieldSummary} before the governance gate.`,
    rationale: options.uncertain ? 'One or more MCP reads failed or returned incomplete evidence. The agent cannot safely change the graph alone.' : `DataHub classifies ${fieldSummary} as sensitive and shows an activation output downstream. The current graph forwards the raw field${sensitiveFields.length === 1 ? '' : 's'}.`,
    datahubReads: ['get_entities · customers_360', 'list_schema_fields · tag:PII', 'get_lineage · downstream 3 hops'],
    writeback: 'Save the approved masking decision as a DataHub context document and append the pipeline lineage.',
    removedEdgeIds: needsProtection ? [incomingDecision?.id ?? incomingTarget?.id].filter((id): id is string => Boolean(id)) : [],
    updatedNodes: decision ? [{
      nodeId: decision.id,
      patch: {
        kind: 'review',
        label: 'Human review asked',
        description: options.uncertain ? 'The agent lacks enough trusted evidence to continue alone' : `The agent is changing sensitive fields: ${fieldSummary}`,
        owner: 'Data Governance',
        rule: options.uncertain ? 'Approval required: incomplete MCP evidence' : 'Approval required: sensitive transformation and schema change',
        status: 'draft',
        agentAdded: true,
      },
      reason: options.uncertain ? 'Confidence policy: request Human Review when evidence is incomplete.' : 'Confidence policy: request Human Review for a sensitive schema change.',
    }] : [],
    addedNodes: needsProtection ? [transformNode] : [],
    addedEdges: needsProtection ? decision ? [
      { id: 'e-previous-protection', source: previousNodeId, target: transformNode.id, type: 'smoothstep' },
      { id: 'e-protection-human-review', source: transformNode.id, target: decision.id, type: 'smoothstep' },
    ] : [
      { id: 'e-previous-protection', source: previousNodeId, target: transformNode.id, type: 'smoothstep' },
      { id: 'e-protection-validation', source: transformNode.id, target: target?.id ?? 'consent-validation', type: 'smoothstep' },
    ] : [],
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

export function createCardReworkProposal(node: PipelineNode): AgentProposal {
  const rules: Record<CardKind, string> = {
    source: 'Refresh schema, ownership, tags and quality signals from the bound DataHub URN',
    analysis: 'Inspect schema drift, nullability, PII tags, assertions and downstream lineage',
    split: 'marketing_consent = true AND customer_id IS NOT NULL',
    decision: 'Choose the highest-priority correction or request human review when confidence is insufficient',
    transform: 'upper(trim(country)) AS country; nullif(trim(customer_id), \'\') AS customer_id',
    review: 'Require named approval when the agent changes sensitive fields, schemas or downstream contracts',
    validation: 'assert customer_id IS NOT NULL; assert raw PII fields = 0',
    output: 'Publish only after all governance and schema checks pass',
  }
  return {
    id: `rework-${node.id}`,
    title: `Rework ${node.data.label}`,
    summary: 'Update this card from its current DataHub context and make the agent decision explicit.',
    rationale: `The agent inspected the card as a ${cardLabels[node.data.kind]} and selected a bounded rule compatible with its position in the lineage.`,
    datahubReads: ['get_entities · card URN/context', 'list_schema_fields · full schema', 'get_lineage · adjacent paths', 'datahub-quality · health signals'],
    writeback: 'Append the approved card decision and rule to the relevant DataHub context document.',
    addedNodes: [],
    updatedNodes: [{
      nodeId: node.id,
      patch: {
        rule: rules[node.data.kind],
        description: `${node.data.description.replace(/\.$/, '')}. Reworked from DataHub context.`,
        status: 'draft',
        agentAdded: true,
      },
      reason: 'Make the card executable from catalog evidence rather than a generic placeholder.',
    }],
    addedEdges: [],
    removedEdgeIds: [],
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
      rule: kind === 'split' ? 'condition = true' : undefined,
    },
  }
}
