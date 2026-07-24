import { describe, expect, it } from 'vitest'
import { defaultRiskAssessmentRule, parseRiskAssessmentRule } from './risk-assessment'

describe('risk assessment context', () => {
  it('parses a complete versioned ML risk contract', () => {
    expect(parseRiskAssessmentRule('scope=churn_model_v3 | risk_type=data | severity=high | confidence=0.86 | evidence=fresh | affected_assets=3 | action=repair_feature_then_retrain')).toEqual({
      scope: 'churn_model_v3',
      riskType: 'data',
      severity: 'high',
      confidence: 0.86,
      evidence: 'fresh',
      affectedAssets: 3,
      action: 'repair_feature_then_retrain',
      complete: true,
    })
  })

  it('keeps collection reliability distinct from a data anomaly', () => {
    const assessment = parseRiskAssessmentRule(defaultRiskAssessmentRule)
    expect(assessment).toMatchObject({ riskType: 'none', severity: 'unknown', evidence: 'unavailable', affectedAssets: 0, complete: true })
  })

  it('marks malformed or unbounded contracts incomplete', () => {
    expect(parseRiskAssessmentRule('scope=model | risk_type=data | severity=urgent | confidence=2')).toMatchObject({ complete: false, severity: undefined, confidence: undefined })
  })
})
