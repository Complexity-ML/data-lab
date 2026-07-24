import type { Edge } from '@xyflow/react'
import type { AgentRunTraceStep, CardKind, PipelineNode } from './pipeline'

export interface CardRoleContract {
  role: string
  mission: string
  input: string
  output: string
  allowedTools: string[]
}

export const cardRoleContracts: Record<CardKind, CardRoleContract> = {
  control: {
    role: 'DATA LAB autonomous controller',
    mission: 'Persist the operator objective, start the governed route, resume after approved reviews, and enter monitoring when the graph is stable.',
    input: 'OperatorPolicy + VersionMemory + PlayerState',
    output: 'BoundedAgentObjective',
    allowedTools: [],
  },
  explorer: {
    role: 'Catalog exploration coordinator',
    mission: 'Use one adjustable host-owned sidecar to inspect a focused dataset directly or audit a catalog in bounded batches, persist coverage checkpoints, and emit evidence without entering dataset lineage.',
    input: 'ConnectorCatalog + PreviousCatalogCheckpoint',
    output: 'CatalogCoverage + DatasetEvidenceFingerprints + IncidentCandidates',
    allowedTools: ['catalog.search', 'entity.read', 'schema.read', 'lineage.read'],
  },
  worker: {
    role: 'Bounded execution worker',
    mission: 'Process one deterministic batch with branch-only context, preserve a replayable checkpoint, and return an atomically mergeable result for exploration, risk, incident or patch workflows.',
    input: 'TypedWorkItems + PreviousWorkerCheckpoint',
    output: 'CompletedItems + FailedItems + WorkerCheckpoint',
    allowedTools: [],
  },
  query: {
    role: 'Registered query verifier',
    mission: 'Verify one host-registered GraphQL operation before downstream cards depend on it. Reads return bounded metadata; writes remain dry-run proposals until Human Review approves the versioned mutation.',
    input: 'ConnectorManifest + RegisteredOperation + HostValidatedVariables',
    output: 'VerifiedQueryContract | QueryFailure | ReviewedMutationReceipt',
    allowedTools: ['catalog.search', 'entity.read', 'schema.read', 'lineage.read', 'document.write', 'metadata.update'],
  },
  source: {
    role: 'Catalog loader',
    mission: 'Resolve the governed dataset and expose a trusted schema envelope.',
    input: 'DataHub dataset URN',
    output: 'DatasetContext',
    allowedTools: ['entity.read', 'schema.read'],
  },
  profile: {
    role: 'Profile memory keeper',
    mission: 'Persist a bounded, reusable summary of schema, quality, freshness and anomalies without storing raw rows.',
    input: 'Trusted DataHub metadata and optional aggregate statistics',
    output: 'CompactDataProfile',
    allowedTools: ['entity.read', 'schema.read', 'lineage.read'],
  },
  analysis: {
    role: 'Context analyst',
    mission: 'Inspect metadata, classifications and downstream impact before deciding.',
    input: 'DatasetContext',
    output: 'AnalysisFindings',
    allowedTools: ['entity.read', 'schema.read', 'lineage.read'],
  },
  impact: {
    role: 'Lineage impact analyst',
    mission: 'Trace a dataset or schema change through DataHub lineage, rank affected datasets, features, pipelines, models and deployments, then recommend the smallest safe response.',
    input: 'ChangeEvent + DatasetContext + DataHubLineage',
    output: 'RankedImpactReport + RecommendedActions',
    allowedTools: ['entity.read', 'schema.read', 'lineage.read'],
  },
  risk: {
    role: 'Evidence-backed risk assessor',
    mission: 'Classify the operational and ML risk from versioned lineage evidence while keeping connector collection failures separate from data anomalies.',
    input: 'VersionedImpactReport + EvidenceFreshness + CollectionReliability',
    output: 'RiskContext + Severity + Confidence + AffectedAssets + RecommendedAction',
    allowedTools: ['entity.read', 'schema.read', 'lineage.read'],
  },
  patch: {
    role: 'Compatibility patcher',
    mission: 'Apply a deterministic, reversible compatibility overlay to the DATA LAB graph without mutating the source dataset.',
    input: 'VersionedDataProfile + ImpactFindings',
    output: 'GraphCompatibilityView',
    allowedTools: [],
  },
  monitor: {
    role: 'Evidence change monitor',
    mission: 'Start a new bounded atomic iteration only when a versioned connector evidence fingerprint changes or severity increases.',
    input: 'CurrentEvidence + PreviousEvidenceFingerprint',
    output: 'NoChange | BoundedIterationTrigger | HumanAlert',
    allowedTools: ['entity.read', 'schema.read', 'lineage.read'],
  },
  parallel: {
    role: 'Parallel branch orchestrator',
    mission: 'Delegate independent graph branches with branch-only context, observe usage, and merge proposal diffs only after atomic validation.',
    input: 'CompletedPredecessor + ImmutableSharedEvidence',
    output: 'ReviewedBranchDiff[]',
    allowedTools: [],
  },
  diagram: {
    role: 'Incident branch merger',
    mission: 'Relate parallel incident subgraphs, surface conflicts, and expose one atomically reviewable merged diagram.',
    input: 'ReviewedBranchDiff[] + IncidentTimeline',
    output: 'IncidentWorkstreamDiagram',
    allowedTools: [],
  },
  split: {
    role: 'Policy router',
    mission: 'Choose the governed branch from an explicit, inspectable rule.',
    input: 'AnalysisFindings',
    output: 'ApprovedBranch | QuarantineBranch',
    allowedTools: [],
  },
  decision: {
    role: 'Decision agent',
    mission: 'Choose the smallest supported correction or request a human when confidence is insufficient.',
    input: 'ApprovedBranch + AnalysisFindings',
    output: 'ReviewedChangeProposal',
    allowedTools: ['entity.read', 'schema.read', 'lineage.read'],
  },
  transform: {
    role: 'Schema transformer',
    mission: 'Apply a deterministic transformation while preserving the declared contract.',
    input: 'TypedRows',
    output: 'TransformedRows',
    allowedTools: [],
  },
  review: {
    role: 'Human approval gate',
    mission: 'Pause autonomous execution until a named human approves the complete diff.',
    input: 'ReviewedChangeProposal',
    output: 'ApprovedChange | RejectedChange',
    allowedTools: [],
  },
  validation: {
    role: 'Atomic validator',
    mission: 'Run every independent contract and stop on any blocking finding.',
    input: 'TransformedRows + GovernancePolicy',
    output: 'ValidationResult',
    allowedTools: [],
  },
  output: {
    role: 'Governed publisher',
    mission: 'Publish only a fully validated artifact and its lineage.',
    input: 'ValidatedRows',
    output: 'PublishedAsset',
    allowedTools: [],
  },
}

function edgePriority(edge: Edge) {
  if (edge.sourceHandle === 'feedback') return 3
  if (edge.sourceHandle === 'approved') return 0
  if (edge.sourceHandle === 'quarantine') return 2
  return 1
}

export function planPrimaryAgentRoute(nodes: PipelineNode[], edges: Edge[]): PipelineNode[] {
  const executableNodes = nodes.filter((node) => node.data.kind !== 'profile' && node.data.kind !== 'control')
  const iterationEdges = edges.filter((edge) => edge.sourceHandle !== 'feedback')
  const byId = new Map(executableNodes.map((node) => [node.id, node]))
  const incoming = new Set(iterationEdges.map((edge) => edge.target))
  const sources = executableNodes
    .filter((node) => node.data.kind === 'source' || !incoming.has(node.id))
    .sort((left, right) => left.position.x - right.position.x || left.position.y - right.position.y)
  const route: PipelineNode[] = []
  const visited = new Set<string>()
  let current: PipelineNode | undefined = sources[0]

  while (current && !visited.has(current.id)) {
    route.push(current)
    visited.add(current.id)
    const currentId: string = current.id
    const nextEdge: Edge | undefined = iterationEdges
      .filter((edge) => edge.source === currentId && byId.has(edge.target))
      .sort((left, right) => edgePriority(left) - edgePriority(right)
        || (byId.get(left.target)?.position.x ?? 0) - (byId.get(right.target)?.position.x ?? 0)
        || (byId.get(left.target)?.position.y ?? 0) - (byId.get(right.target)?.position.y ?? 0))[0]
    current = nextEdge ? byId.get(nextEdge.target) : undefined
  }

  return route
}

export function traceStep(node: PipelineNode, state: AgentRunTraceStep['state'], summary: string): AgentRunTraceStep {
  return { nodeId: node.id, label: node.data.label, role: cardRoleContracts[node.data.kind].role, state, summary }
}
