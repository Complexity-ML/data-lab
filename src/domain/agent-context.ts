import type { Edge } from '@xyflow/react'
import type { ValidationIssue } from '../validation'
import { compactGraph } from './ai'
import type { PipelineNode } from './pipeline'
import type { PipelineVersion } from './versioning'
import type { DataHubEvidence } from './datahub'

function versionContext(versions: PipelineVersion[], currentNodes: PipelineNode[], currentEdges: Edge[]) {
  return versions.slice(-5).map((version) => ({
    label: version.label,
    origin: version.origin,
    createdAt: version.createdAt,
    blockingIssues: version.blockingIssues,
    status: version.status ?? 'committed',
    description: version.description,
    evidence: version.evidence?.map(({ tool, urn, capturedAt, expiresAt, status, summary, cached, stale }) => ({ tool, urn, capturedAt, expiresAt, status, summary, cached, stale })),
    graph: compactGraph(version.nodes, version.edges),
    differenceFromCurrent: {
      addedNodeIds: currentNodes.filter((node) => !version.nodes.some((candidate) => candidate.id === node.id)).map((node) => node.id),
      removedNodeIds: version.nodes.filter((node) => !currentNodes.some((candidate) => candidate.id === node.id)).map((node) => node.id),
      changedNodeIds: currentNodes.filter((node) => {
        const prior = version.nodes.find((candidate) => candidate.id === node.id)
        return prior && JSON.stringify(compactGraph([prior], []).nodes[0]) !== JSON.stringify(compactGraph([node], []).nodes[0])
      }).map((node) => node.id),
      edgeCountDelta: currentEdges.length - version.edges.length,
    },
  }))
}

interface AgentContextInput {
  edges: Edge[]
  issues: ValidationIssue[]
  nodes: PipelineNode[]
  versions: PipelineVersion[]
}

export function buildPipelineAgentRequest(input: AgentContextInput & { datahubEvidence: string[]; objective: string; responseLanguage?: 'English' | 'French' }) {
  return {
    mode: 'pipeline-rewrite',
    objective: input.objective,
    responseLanguage: input.responseLanguage ?? 'English',
    agentDecisionPolicy: 'Agent Decision may add, edit and reconnect cards. Add a Human Review card only when confidence is insufficient or impact is sensitive.',
    graph: compactGraph(input.nodes, input.edges),
    validationFindings: input.issues.map(({ id, severity, title, detail, nodeId }) => ({ id, severity, title, detail, nodeId })),
    datahubEvidence: input.datahubEvidence,
    recentVersions: versionContext(input.versions, input.nodes, input.edges),
    guardrails: ['Return a reviewable diff only', 'Never claim execution', 'Prefer an incremental change over rebuilding without evidence', 'When reading a dataset, add or update one Data Profile card as compact reusable memory; summarize schema, quality, freshness and anomalies, and never place raw rows in it', 'Reuse a fresh Data Profile instead of repeating dataset normalization or mental reconstruction', 'Use one or more scoped Impact Analysis cards for change propagation; each instance must be atomic, replayable from versioned evidence, and report concrete affected assets, risk levels and actions', 'Use Human Review for uncertainty or sensitive/schema/downstream changes', `Write human-facing titles, summaries, rationales and reasons in ${input.responseLanguage ?? 'English'}`],
  }
}

export function buildCardReworkRequest(input: AgentContextInput & { focusNodeId: string; datahubEvidence?: DataHubEvidence[]; responseLanguage?: 'English' | 'French' }) {
  return {
    mode: 'card-rework',
    focusNodeId: input.focusNodeId,
    objective: 'Improve the selected card and reconnect the schema only when evidence supports it. Add Human Review if uncertain.',
    responseLanguage: input.responseLanguage ?? 'English',
    graph: compactGraph(input.nodes, input.edges),
    validationFindings: input.issues,
    datahubEvidence: input.datahubEvidence ?? [],
    recentVersions: versionContext(input.versions, input.nodes, input.edges),
  }
}
