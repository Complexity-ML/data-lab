import type { Edge } from '@xyflow/react'
import type { PipelineNode } from './pipeline'
import { parseRiskAssessmentRule, riskDomainFromText, type RiskDomain, type RiskSeverity } from './risk-assessment'

export type RiskImpactItemKind = 'risk' | 'impact' | 'coverage-gap'

export interface RiskImpactItem {
  id: string
  nodeId: string
  kind: RiskImpactItemKind
  domain: RiskDomain
  severity: RiskSeverity
  title: string
  detail: string
  action: string
  evidence?: string
  affectedAssets?: number
  affectedModels?: number
}

export interface RiskImpactOverview {
  items: RiskImpactItem[]
  actionable: number
  critical: number
  high: number
  coverageGaps: number
}

function hasDownstreamRisk(nodeId: string, nodes: PipelineNode[], edges: Edge[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]))
  for (const edge of edges) if (edge.sourceHandle !== 'feedback') outgoing.get(edge.source)?.push(edge.target)
  const queue = [...(outgoing.get(nodeId) ?? [])]
  const visited = new Set<string>()
  while (queue.length) {
    const currentId = queue.shift()!
    if (visited.has(currentId)) continue
    visited.add(currentId)
    const current = byId.get(currentId)
    if (!current) continue
    if (current.data.kind === 'risk') return true
    queue.push(...(outgoing.get(currentId) ?? []))
  }
  return false
}

export function collectRiskImpactOverview(nodes: PipelineNode[], edges: Edge[]): RiskImpactOverview {
  const items: RiskImpactItem[] = nodes.flatMap((node) => {
    if (node.data.kind === 'risk') {
      const risk = parseRiskAssessmentRule(node.data.rule)
      return [{
        id: `risk-${node.id}`,
        nodeId: node.id,
        kind: 'risk' as const,
        domain: risk.domain,
        severity: risk.severity ?? 'unknown',
        title: node.data.label,
        detail: node.data.description,
        action: risk.action || 'Complete this evidence-backed risk assessment.',
        evidence: risk.evidence,
        affectedAssets: risk.affectedAssets,
        affectedModels: risk.affectedModels,
      }]
    }
    if (node.data.kind !== 'impact') return []
    const domain = riskDomainFromText(`${node.data.label} ${node.data.description} ${node.data.rule ?? ''}`)
    const impact: RiskImpactItem = {
      id: `impact-${node.id}`,
      nodeId: node.id,
      kind: 'impact',
      domain,
      severity: 'unknown',
      title: node.data.label,
      detail: node.data.description,
      action: 'Trace this impact through an evidence-backed Risk Assessment.',
    }
    if (hasDownstreamRisk(node.id, nodes, edges)) return [impact]
    return [impact, {
      id: `coverage-${node.id}`,
      nodeId: node.id,
      kind: 'coverage-gap' as const,
      domain,
      severity: 'medium' as const,
      title: `Risk coverage missing · ${node.data.label}`,
      detail: 'This Impact Analysis has no downstream Risk Assessment, so severity, confidence, evidence and mitigation are not yet explicit.',
      action: 'Ask the agent to add an evidence-backed Risk Assessment and a bounded mitigation path.',
    }]
  })
  const actionableItems = items.filter((item) => item.kind === 'coverage-gap'
    || (item.kind === 'risk' && !['low', 'unknown'].includes(item.severity)))
  return {
    items,
    actionable: actionableItems.length,
    critical: items.filter((item) => item.kind === 'risk' && item.severity === 'critical').length,
    high: items.filter((item) => item.kind === 'risk' && item.severity === 'high').length,
    coverageGaps: items.filter((item) => item.kind === 'coverage-gap').length,
  }
}

export function riskItemsForDomain(overview: RiskImpactOverview, domain: 'all' | RiskDomain) {
  return domain === 'all' ? overview.items : overview.items.filter((item) => item.domain === domain)
}
