import type { Edge } from '@xyflow/react'
import type { ValidationIssue } from '../validation'
import { compactGraph } from './ai'
import type { PipelineNode } from './pipeline'
import type { PipelineVersion } from './versioning'

function versionContext(versions: PipelineVersion[]) {
  return versions.slice(-5).map((version) => ({
    label: version.label,
    origin: version.origin,
    createdAt: version.createdAt,
    blockingIssues: version.blockingIssues,
    status: version.status ?? 'committed',
    description: version.description,
    graph: compactGraph(version.nodes, version.edges),
  }))
}

interface AgentContextInput {
  edges: Edge[]
  issues: ValidationIssue[]
  nodes: PipelineNode[]
  versions: PipelineVersion[]
}

export function buildPipelineAgentRequest(input: AgentContextInput & { datahubEvidence: string[]; objective: string }) {
  return {
    mode: 'pipeline-rewrite',
    objective: input.objective,
    agentDecisionPolicy: 'Agent Decision may add, edit and reconnect cards. Add a Human Review card only when confidence is insufficient or impact is sensitive.',
    graph: compactGraph(input.nodes, input.edges),
    validationFindings: input.issues.map(({ id, severity, title, detail, nodeId }) => ({ id, severity, title, detail, nodeId })),
    datahubEvidence: input.datahubEvidence,
    recentVersions: versionContext(input.versions),
    guardrails: ['Return a reviewable diff only', 'Never claim execution', 'Prefer an incremental change over rebuilding without evidence', 'Use Human Review for uncertainty or sensitive/schema/downstream changes'],
  }
}

export function buildCardReworkRequest(input: AgentContextInput & { focusNodeId: string }) {
  return {
    mode: 'card-rework',
    focusNodeId: input.focusNodeId,
    objective: 'Improve the selected card and reconnect the schema only when evidence supports it. Add Human Review if uncertain.',
    graph: compactGraph(input.nodes, input.edges),
    validationFindings: input.issues,
    recentVersions: versionContext(input.versions),
  }
}
