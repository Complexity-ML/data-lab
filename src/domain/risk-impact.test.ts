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

  it('separates catalog-wide quality risks, sensitive coverage and governance coverage', () => {
    const explorer = {
      ...newCard('explorer', 0),
      id: 'explorer',
      data: {
        ...newCard('explorer', 0).data,
        exploration: {
          query: '*',
          total: 3,
          discovered: 3,
          inspected: 3,
          failed: 0,
          incidents: 1,
          governanceGaps: 1,
          concurrency: 4,
          state: 'complete' as const,
          checkpointAt: '2026-07-24T20:00:00.000Z',
          datasets: [
            {
              urn: 'urn:li:dataset:quality',
              name: 'quality_orders',
              status: 'warning' as const,
              fieldCount: 12,
              sensitiveSignalCount: 0,
              qualityStatus: 'failing' as const,
              ownerCount: 1,
              upstreamCount: 1,
              downstreamCount: 2,
              issues: ['quality failing'],
              fingerprint: 'quality',
              capturedAt: '2026-07-24T20:00:00.000Z',
              expiresAt: '2026-07-24T20:05:00.000Z',
            },
            {
              urn: 'urn:li:dataset:sensitive',
              name: 'customers',
              status: 'healthy' as const,
              fieldCount: 8,
              sensitiveSignalCount: 3,
              qualityStatus: 'healthy' as const,
              ownerCount: 1,
              upstreamCount: 0,
              downstreamCount: 4,
              issues: [],
              fingerprint: 'sensitive',
              capturedAt: '2026-07-24T20:00:00.000Z',
              expiresAt: '2026-07-24T20:05:00.000Z',
            },
            {
              urn: 'urn:li:dataset:governance',
              name: 'missing_tags',
              status: 'warning' as const,
              fieldCount: 2,
              sensitiveSignalCount: 0,
              qualityStatus: 'healthy' as const,
              ownerCount: 1,
              upstreamCount: 0,
              downstreamCount: 0,
              issues: ['tags missing'],
              fingerprint: 'governance',
              capturedAt: '2026-07-24T20:00:00.000Z',
              expiresAt: '2026-07-24T20:05:00.000Z',
            },
          ],
        },
      },
    }

    const overview = collectRiskImpactOverview([explorer], [])

    expect(overview).toMatchObject({ actionable: 3, high: 1, coverageGaps: 2 })
    expect(overview.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'risk', domain: 'data', sourceRef: 'urn:li:dataset:quality' }),
      expect.objectContaining({ kind: 'coverage-gap', domain: 'privacy', sourceRef: 'urn:li:dataset:sensitive' }),
      expect.objectContaining({ kind: 'coverage-gap', domain: 'governance', sourceRef: 'urn:li:dataset:governance' }),
    ]))
    expect(overview.items.find((item) => item.title.includes('missing_tags'))).toMatchObject({
      severity: 'medium',
      evidence: 'catalog_checkpoint:incomplete_governance',
    })
  })
})
