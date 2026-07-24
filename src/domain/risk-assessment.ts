export type RiskType = 'data' | 'collection' | 'none'
export type RiskSeverity = 'critical' | 'high' | 'medium' | 'low' | 'unknown'
export type RiskEvidenceState = 'fresh' | 'stale' | 'unavailable'

export interface RiskAssessmentContext {
  scope: string
  riskType: RiskType | undefined
  severity: RiskSeverity | undefined
  confidence: number | undefined
  evidence: RiskEvidenceState | undefined
  affectedAssets: number | undefined
  action: string
  complete: boolean
}

const riskTypes = new Set<RiskType>(['data', 'collection', 'none'])
const severities = new Set<RiskSeverity>(['critical', 'high', 'medium', 'low', 'unknown'])
const evidenceStates = new Set<RiskEvidenceState>(['fresh', 'stale', 'unavailable'])

function clauses(rule: string | undefined) {
  return new Map((rule ?? '').split(/\s*\|\s*/).flatMap((clause) => {
    const match = clause.match(/^\s*([a-z_]+)\s*=\s*(.+?)\s*$/i)
    return match ? [[match[1].toLowerCase(), match[2]]] as const : []
  }))
}

export function parseRiskAssessmentRule(rule: string | undefined): RiskAssessmentContext {
  const values = clauses(rule)
  const rawRiskType = values.get('risk_type')?.toLowerCase() as RiskType | undefined
  const rawSeverity = values.get('severity')?.toLowerCase() as RiskSeverity | undefined
  const rawEvidence = values.get('evidence')?.toLowerCase() as RiskEvidenceState | undefined
  const rawConfidence = values.get('confidence')
  const rawAffectedAssets = values.get('affected_assets')
  const confidence = rawConfidence === undefined ? undefined : Number(rawConfidence)
  const affectedAssets = rawAffectedAssets === undefined ? undefined : Number(rawAffectedAssets)
  const result: RiskAssessmentContext = {
    scope: values.get('scope')?.trim() ?? '',
    riskType: rawRiskType && riskTypes.has(rawRiskType) ? rawRiskType : undefined,
    severity: rawSeverity && severities.has(rawSeverity) ? rawSeverity : undefined,
    confidence: confidence !== undefined && Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 ? confidence : undefined,
    evidence: rawEvidence && evidenceStates.has(rawEvidence) ? rawEvidence : undefined,
    affectedAssets: affectedAssets !== undefined && Number.isInteger(affectedAssets) && affectedAssets >= 0 ? affectedAssets : undefined,
    action: values.get('action')?.trim() ?? '',
    complete: false,
  }
  result.complete = Boolean(result.scope && result.riskType && result.severity && result.confidence !== undefined
    && result.evidence && result.affectedAssets !== undefined && result.action)
  return result
}

export const defaultRiskAssessmentRule = 'scope=downstream_ml | risk_type=none | severity=unknown | confidence=0 | evidence=unavailable | affected_assets=0 | action=read_versioned_lineage'
