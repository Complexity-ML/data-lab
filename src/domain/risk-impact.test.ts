import { describe, expect, it } from 'vitest'
import { newCard } from './pipeline'
import { collectRiskImpactOverview, riskItemsForDomain } from './risk-impact'

describe('impact and risk overview', () => {
  it('reports an uncovered Impact Analysis as an actionable coverage gap', () => {
    const impact = {
      ...newCard('impact', 0),
      id: 'impact',
      data: { ...newCard('impact', 0).data, label: 'Churn model impact', description: 'Training feature drift.' },
    }
    const overview = collectRiskImpactOverview([impact], [])

    expect(overview).toMatchObject({ actionable: 1, coverageGaps: 1 })
    expect(overview.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'coverage-gap', domain: 'ml', nodeId: 'impact' }),
    ]))
  })

  it('removes the coverage gap when the Impact reaches a Risk Assessment', () => {
    const impact = { ...newCard('impact', 0), id: 'impact' }
    const risk = {
      ...newCard('risk', 1),
      id: 'risk',
      data: {
        ...newCard('risk', 1).data,
        rule: 'scope=customer_dashboard | risk_domain=analytics | risk_type=data | severity=high | confidence=0.9 | evidence=fresh | affected_assets=2 | action=verify_metrics',
      },
    }
    const overview = collectRiskImpactOverview([impact, risk], [{ id: 'impact-risk', source: 'impact', target: 'risk' }])

    expect(overview).toMatchObject({ actionable: 1, high: 1, coverageGaps: 0 })
    expect(riskItemsForDomain(overview, 'analytics')).toEqual([
      expect.objectContaining({ kind: 'risk', nodeId: 'risk', domain: 'analytics' }),
    ])
  })
})
