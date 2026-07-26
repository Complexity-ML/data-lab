import type { PipelineNode } from './pipeline'
import type { RiskImpactItemKind, RiskImpactOverview } from './risk-impact'
import { parseRiskAssessmentRule, type RiskSeverity } from './risk-assessment'

export interface AnalysisReportRisk {
  id: string
  nodeId: string
  title: string
  detail: string
  domain: string
  kind: RiskImpactItemKind
  severity: RiskSeverity
  confidence?: number
  evidence?: string
  affectedAssets?: number
  sensitiveSignals?: number
  scope?: string
  action: string
}

export interface AnalysisReportEvidence {
  nodeId: string
  kind: string
  label: string
  title: string
  detail: string
}

export interface AnalysisReport {
  scope: string
  summary: string
  inspectedAssets: number
  totalAssets: number
  aggregateProfiles: number
  coverageGaps: number
  risks: AnalysisReportRisk[]
  evidence: AnalysisReportEvidence[]
  limitations: string[]
}

const severityRank: Record<RiskSeverity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  unknown: 1,
}

export function humanizeAnalysisValue(value: string) {
  return value.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export function buildAnalysisReport(nodes: PipelineNode[], overview?: RiskImpactOverview): AnalysisReport {
  const sources = nodes.filter((node) => node.data.kind === 'source')
  const exploration = nodes
    .filter((node) => node.data.kind === 'explorer' && node.data.exploration)
    .map((node) => node.data.exploration!)
    .sort((left, right) => right.inspected - left.inspected || right.total - left.total)[0]
  const inspectedAssets = exploration?.inspected ?? sources.length
  const totalAssets = exploration?.total ?? sources.length
  const aggregateProfiles = exploration?.dataAudited
    ?? exploration?.datasets.filter((dataset) => dataset.dataAuditStatus === 'complete').length
    ?? nodes.filter((node) => node.data.kind === 'profile' && node.data.profile?.aggregateAudit.status === 'complete').length
  const coverageGaps = exploration?.dataAuditCoverageGaps
    ?? exploration?.datasets.filter((dataset) => dataset.dataAuditStatus === 'coverage_gap').length
    ?? nodes.filter((node) => node.data.kind === 'profile' && node.data.profile?.aggregateAudit.status === 'coverage_gap').length

  const riskItems = overview?.items ?? nodes
    .filter((node) => node.data.kind === 'risk')
    .map((node) => {
      const parsed = parseRiskAssessmentRule(node.data.rule)
      return {
        id: `risk-${node.id}`,
        nodeId: node.id,
        kind: 'risk' as const,
        domain: parsed.domain,
        severity: parsed.severity ?? 'unknown',
        title: node.data.label,
        detail: node.data.description,
        action: parsed.action || 'Review the evidence and define a governed next action.',
        evidence: parsed.evidence,
        affectedAssets: parsed.affectedAssets,
      }
    })
  const risks = riskItems
    .map((item): AnalysisReportRisk => {
      const node = nodes.find((candidate) => candidate.id === item.nodeId)
      const parsed = node?.data.kind === 'risk' ? parseRiskAssessmentRule(node.data.rule) : undefined
      const sensitiveSignals = Number(item.detail.match(/\b(\d+)\s+sensitive (?:field\/tag signals?|fields?|signals?)(?:\(s\))?/i)?.[1])
      return {
        id: item.id,
        nodeId: item.nodeId,
        title: /^host risk\b/i.test(item.title)
          ? `${parsed?.scope || 'Dataset'} ${humanizeAnalysisValue(item.domain)} risk`
          : item.title,
        detail: item.detail
          .replace(/^Evidence-backed risk preserved before mitigation\.\s*/i, '')
          .replace(/^HIGH host risk score/i, 'Host risk score'),
        domain: item.domain,
        kind: item.kind,
        severity: item.severity,
        confidence: parsed?.confidence,
        evidence: item.evidence,
        affectedAssets: item.affectedAssets,
        sensitiveSignals: Number.isFinite(sensitiveSignals) ? sensitiveSignals : undefined,
        scope: parsed?.scope || undefined,
        action: humanizeAnalysisValue(item.action),
      }
    })
    .sort((left, right) => severityRank[right.severity] - severityRank[left.severity] || (left.kind === 'risk' ? -1 : 1))
  const primaryRisk = risks.find((risk) => risk.kind === 'risk') ?? risks[0]

  const sourceScope = sources.map((node) => node.data.label).slice(0, 3).join(', ')
  const riskScope = primaryRisk?.scope
  const profileScope = nodes.find((node) => node.data.kind === 'profile')?.data.label.replace(/\s+profile$/i, '')
  const scopeBase = sourceScope || riskScope || profileScope || 'Current workbench'
  const scope = primaryRisk ? `${scopeBase} ${humanizeAnalysisValue(primaryRisk.domain)} analysis` : `${scopeBase} analysis`

  const evidenceKinds = new Set(['profile', 'analysis', 'impact', 'validation', 'output'])
  const evidence = nodes
    .filter((node) => evidenceKinds.has(node.data.kind))
    .map((node): AnalysisReportEvidence => ({
      nodeId: node.id,
      kind: humanizeAnalysisValue(node.data.kind),
      label: node.data.kind === 'profile'
        ? node.data.profile?.aggregateAudit.status === 'complete' ? 'aggregate profile' : 'metadata profile'
        : humanizeAnalysisValue(node.data.kind),
      title: node.data.label,
      detail: node.data.description,
    }))

  const limitations = [
    ...(coverageGaps > 0 ? [`${coverageGaps} catalog asset${coverageGaps === 1 ? '' : 's'} lack${coverageGaps === 1 ? 's' : ''} an aggregate value profile. No value-level anomaly is asserted for that uncovered evidence.`] : []),
    ...nodes
      .filter((node) => node.data.kind === 'profile' && node.data.profile?.aggregateAudit.status !== 'complete')
      .map((node) => `${node.data.label} contains schema metadata only; aggregate row, null, uniqueness and distribution evidence is ${humanizeAnalysisValue(node.data.profile?.aggregateAudit.status ?? 'unavailable')}.`),
  ].filter((value, index, all) => all.indexOf(value) === index)

  const severityLabel = primaryRisk ? primaryRisk.severity.charAt(0).toUpperCase() + primaryRisk.severity.slice(1) : ''
  const summaryParts = primaryRisk
    ? [
        primaryRisk.sensitiveSignals !== undefined
          ? `${scopeBase} contains ${primaryRisk.sensitiveSignals} sensitive field or tag signal${primaryRisk.sensitiveSignals === 1 ? '' : 's'}.`
          : `${scopeBase} has a ${severityLabel} ${humanizeAnalysisValue(primaryRisk.domain)} risk.`,
        `The ${humanizeAnalysisValue(primaryRisk.domain)} risk is rated ${severityLabel}${primaryRisk.confidence !== undefined ? ` with ${Math.round(primaryRisk.confidence * 100)}% confidence` : ''}${primaryRisk.affectedAssets !== undefined ? ` and may affect ${primaryRisk.affectedAssets} downstream asset${primaryRisk.affectedAssets === 1 ? '' : 's'}` : ''}.`,
        aggregateProfiles === 0
          ? 'Aggregate value profiling is unavailable; therefore, no value-level anomaly is claimed.'
          : coverageGaps > 0
            ? `${aggregateProfiles} aggregate profile${aggregateProfiles === 1 ? ' is' : 's are'} available, while ${coverageGaps} catalog asset${coverageGaps === 1 ? '' : 's'} remain uncovered for value-level analysis.`
            : `${aggregateProfiles} aggregate profile${aggregateProfiles === 1 ? '' : 's'} provide value-level evidence.`,
        /human review|review|verify|verification/i.test(primaryRisk.action)
          ? 'Human review and post-mitigation verification are required.'
          : `Recommended next action: ${primaryRisk.action}.`,
        totalAssets > 0 ? `Catalog coverage: ${inspectedAssets}/${totalAssets} assets checked.` : '',
      ]
    : [
        'No Risk Assessment result is present in the current graph.',
        totalAssets > 0 ? `Catalog coverage: ${inspectedAssets}/${totalAssets} assets checked, with ${aggregateProfiles} aggregate profiles and ${coverageGaps} profile gaps.` : 'No connected-catalog coverage checkpoint is present.',
      ]

  return {
    scope,
    summary: summaryParts.filter(Boolean).join(' '),
    inspectedAssets,
    totalAssets,
    aggregateProfiles,
    coverageGaps,
    risks,
    evidence,
    limitations,
  }
}
