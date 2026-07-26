import type { Edge } from '@xyflow/react'
import type { AgentRunTraceStep, CardKind, PipelineNode } from './pipeline'

export interface CardRoleContract {
  role: string
  mission: string
  activation: string
  completion: string
  input: string
  output: string
  allowedTools: string[]
}

export const cardRoleContracts: Record<CardKind, CardRoleContract> = {
  control: {
    role: 'DATA LAB autonomous controller',
    mission: 'Persist the operator objective, start the governed route, resume after approved reviews, and enter monitoring when the graph is stable.',
    activation: 'Host-owned whenever the autonomous player exists; keep exactly one controller outside dataset lineage.',
    completion: 'The objective, review-resume policy and idle-monitor policy are versioned and inspectable.',
    input: 'OperatorPolicy + VersionMemory + PlayerState',
    output: 'BoundedAgentObjective',
    allowedTools: [],
  },
  explorer: {
    role: 'Catalog exploration coordinator',
    mission: 'Use one adjustable host-owned sidecar to inspect a focused dataset directly or audit a catalog in bounded batches, persist coverage checkpoints, and emit evidence without entering dataset lineage.',
    activation: 'Use when no governed source is bound, when the operator requests catalog coverage, or when an explicit refresh/new monitor event reopens discovery.',
    completion: 'A focused source is selected or a versioned terminal coverage checkpoint records every bounded inspection outcome.',
    input: 'ConnectorCatalog + PreviousCatalogCheckpoint',
    output: 'CatalogCoverage + DatasetEvidenceFingerprints + IncidentCandidates',
    allowedTools: ['catalog.search', 'entity.read', 'schema.read', 'lineage.read'],
  },
  worker: {
    role: 'Bounded execution worker',
    mission: 'Process one deterministic batch with branch-only context, preserve a replayable checkpoint, and return an atomically mergeable result for exploration, risk, incident or patch workflows.',
    activation: 'Use when at least two independent deterministic work items can execute without sharing mutable branch state.',
    completion: 'Every work item is completed, failed with evidence, or checkpointed for bounded retry before one atomic merge.',
    input: 'TypedWorkItems + PreviousWorkerCheckpoint',
    output: 'CompletedItems + FailedItems + WorkerCheckpoint',
    allowedTools: [],
  },
  query: {
    role: 'Registered dataset query verifier',
    mission: 'Verify one host-registered GraphQL operation before downstream cards depend on it. Aggregate reads expose bounded row, null, uniqueness and distribution evidence without raw values; writes remain dry-run proposals until Human Review approves the versioned mutation.',
    activation: 'Use when schema metadata is insufficient and a registered aggregate profile, assertion result, dry-run or governed mutation receipt is required.',
    completion: 'The registered operation and variables are host-validated and produce bounded evidence, an explicit failure, or a reviewed mutation receipt.',
    input: 'ConnectorManifest + RegisteredOperation + HostValidatedVariables',
    output: 'BoundedAggregateProfile | VerifiedMetadata | QueryFailure | ReviewedMutationReceipt',
    allowedTools: ['catalog.search', 'profile.read', 'entity.read', 'schema.read', 'lineage.read', 'document.write', 'metadata.update'],
  },
  source: {
    role: 'Catalog loader',
    mission: 'Resolve the governed dataset and expose a trusted schema envelope.',
    activation: 'Use once a specific governed dataset identity is selected from a connector or explicit operator scope.',
    completion: 'Dataset identity, platform, environment and schema envelope are bound to a fresh versioned source reference.',
    input: 'DataHub dataset URN',
    output: 'DatasetContext',
    allowedTools: ['entity.read', 'schema.read'],
  },
  profile: {
    role: 'Dataset evidence memory keeper',
    mission: 'Persist a bounded, replayable summary of schema plus aggregate row counts, null rates, uniqueness, distributions and detected value-risk signals without reading or storing raw rows.',
    activation: 'Use after a Data Source or Query Check yields evidence that later cards would otherwise reread or mentally reconstruct.',
    completion: 'A host-verified metadata-only snapshot records freshness, coverage, anomalies and aggregate signals without raw rows.',
    input: 'TrustedSchema + BoundedAggregateProfile',
    output: 'VersionedDataProfile',
    allowedTools: ['profile.read', 'entity.read', 'schema.read', 'lineage.read'],
  },
  analysis: {
    role: 'Dataset evidence analyst',
    mission: 'Interpret schema, aggregate value signals, classifications and lineage before deciding whether a finding is a data anomaly, governance gap or collection failure.',
    activation: 'Use when a Data Profile contains signals or evidence gaps that require classification before routing, risk scoring or remediation.',
    completion: 'Every finding is classified as data anomaly, governance gap, collection failure or healthy evidence with an explicit rationale.',
    input: 'VersionedDataProfile + DatasetContext',
    output: 'EvidenceBackedAnalysisFindings',
    allowedTools: ['profile.read', 'entity.read', 'schema.read', 'lineage.read'],
  },
  impact: {
    role: 'Lineage impact analyst',
    mission: 'Trace a dataset or schema change through DataHub lineage, rank affected datasets, features, pipelines, models and deployments, then recommend the smallest safe response.',
    activation: 'Use when a material finding, proposed change or anomaly has fresh upstream/downstream lineage evidence.',
    completion: 'Affected assets are bounded, ranked and tied to the observed change; unsupported impacts remain explicitly unknown.',
    input: 'ChangeEvent + DatasetContext + DataHubLineage',
    output: 'RankedImpactReport + RecommendedActions',
    allowedTools: ['entity.read', 'schema.read', 'lineage.read'],
  },
  risk: {
    role: 'Evidence-backed risk assessor',
    mission: 'Classify data, privacy, operational and ML risk from a versioned aggregate profile and lineage evidence while keeping connector collection failures separate from data anomalies.',
    activation: 'Use after Analysis or Impact exposes a material anomaly, sensitive signal, governed change or collection-reliability concern.',
    completion: 'Scope, risk domain/type, severity, confidence, evidence freshness, affected assets and recommended action are all declared.',
    input: 'VersionedDataProfile + VersionedImpactReport + EvidenceFreshness + CollectionReliability',
    output: 'RiskContext + Severity + Confidence + AffectedAssets + RecommendedAction',
    allowedTools: ['profile.read', 'entity.read', 'schema.read', 'lineage.read'],
  },
  patch: {
    role: 'Compatibility patcher',
    mission: 'Apply a deterministic, reversible compatibility overlay to the DATA LAB graph without mutating the source dataset.',
    activation: 'Use only when a concrete schema, protection or contract mismatch has a reversible graph-only mitigation supported by Analysis, Impact or Risk.',
    completion: 'The versioned overlay states its exact mapping and a later Validation can prove the post-condition without claiming source mutation.',
    input: 'VersionedDataProfile + ImpactFindings',
    output: 'GraphCompatibilityView',
    allowedTools: [],
  },
  monitor: {
    role: 'Evidence change monitor',
    mission: 'Start a new bounded atomic iteration only when a versioned connector evidence fingerprint changes or severity increases.',
    activation: 'Use after a stable validated branch has an Output whose evidence should be watched for later change.',
    completion: 'The monitor is armed with a fingerprint, cooldown and maximum iterations; unchanged evidence remains idle.',
    input: 'CurrentEvidence + PreviousEvidenceFingerprint',
    output: 'NoChange | BoundedIterationTrigger | HumanAlert',
    allowedTools: ['entity.read', 'schema.read', 'lineage.read'],
  },
  parallel: {
    role: 'Parallel branch orchestrator',
    mission: 'Delegate independent graph branches with branch-only context, observe usage, and merge proposal diffs only after atomic validation.',
    activation: 'Use when two or more sources, incidents or independent work groups can progress without waiting on the same branch state.',
    completion: 'Every branch returns a reviewed diff or bounded failure and the merge preserves conflicts instead of silently choosing one result.',
    input: 'CompletedPredecessor + ImmutableSharedEvidence',
    output: 'ReviewedBranchDiff[]',
    allowedTools: [],
  },
  diagram: {
    role: 'Incident branch merger',
    mission: 'Relate parallel incident subgraphs, surface conflicts, and expose one atomically reviewable merged diagram.',
    activation: 'Use when at least two incident or parallel-agent branches must be understood together on the same canvas.',
    completion: 'The diagram names every input branch, preserves conflicts and exposes one reviewable merged workstream.',
    input: 'ReviewedBranchDiff[] + IncidentTimeline',
    output: 'IncidentWorkstreamDiagram',
    allowedTools: [],
  },
  split: {
    role: 'Policy router',
    mission: 'Choose the governed branch from an explicit, inspectable rule.',
    activation: 'Use when one evidence result must follow mutually exclusive approved and quarantine outcomes.',
    completion: 'Both approved and quarantine handles are connected to explicit, valid downstream behavior.',
    input: 'AnalysisFindings',
    output: 'ApprovedBranch | QuarantineBranch',
    allowedTools: [],
  },
  decision: {
    role: 'Decision agent',
    mission: 'Choose the smallest supported correction or request a human when confidence is insufficient.',
    activation: 'Use when evidence supports multiple bounded actions, a correction-vs-escalation choice, or an uncertainty threshold.',
    completion: 'Exactly one supported correction path or one Human Review checkpoint is selected with its evidence.',
    input: 'ApprovedBranch + AnalysisFindings',
    output: 'ReviewedChangeProposal',
    allowedTools: ['entity.read', 'schema.read', 'lineage.read'],
  },
  transform: {
    role: 'Versioned deterministic transformer',
    mission: 'Declare a deterministic derived-data or metadata transformation while preserving source identity and never mutating the governed source implicitly.',
    activation: 'Use when the correction genuinely requires a new derived contract such as cast, normalization, mask, tokenization or aggregation beyond a graph-only alias patch.',
    completion: 'Inputs, outputs, invariants and rollback behavior are versioned and ready for atomic post-condition validation.',
    input: 'VersionedInputContract + ApprovedTransformRule',
    output: 'VersionedDerivedContract',
    allowedTools: [],
  },
  review: {
    role: 'Human approval gate',
    mission: 'Pause autonomous execution until a named human approves the complete diff.',
    activation: 'Use for high/critical risk, sensitive-data boundary changes, external mutations or material uncertainty; block only the affected branch.',
    completion: 'The human decision, rationale and approved diff identity are persisted so approval resumes and rejection repairs the same branch.',
    input: 'ReviewedChangeProposal',
    output: 'ApprovedChange | RejectedChange',
    allowedTools: [],
  },
  validation: {
    role: 'Atomic validator',
    mission: 'Run every independent contract and stop on any blocking finding.',
    activation: 'Use after any patch, transform, decision or review and before an Output can claim a governed result.',
    completion: 'Every applicable atomic invariant passes, or blockers identify the exact card and repairable contract.',
    input: 'VersionedBranchState + GovernancePolicy + ExpectedPostConditions',
    output: 'ValidationResult',
    allowedTools: [],
  },
  output: {
    role: 'Governed publisher',
    mission: 'Emit only a fully validated governed result and its version lineage without implying that source data was changed.',
    activation: 'Use as the terminal card for a validated report, decision, query receipt, derived contract or other governed branch result.',
    completion: 'The emitted result references its validated inputs, version and review state and is eligible for monitoring feedback.',
    input: 'ValidatedGovernedResult',
    output: 'VersionedArtifact | DecisionRecord | QueryReceipt',
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
