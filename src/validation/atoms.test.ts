import { describe, expect, it } from 'vitest'
import { customerActivationEdges as initialEdges, customerActivationNodes as initialNodes, newCard } from '../domain/pipeline'
import { validatePipeline, validationAtoms } from '.'

describe('atomic pipeline validation', () => {
  it('exposes small independently addressable validators', () => {
    expect(validationAtoms.map((atom) => atom.id)).toEqual([
      'pipeline-presence',
      'pipeline-terminals',
      'edge-integrity',
      'acyclic-lineage',
      'card-contracts',
      'sensitive-data-path',
      'datahub-governance',
    ])
  })

  it('blocks stale sensitive evidence and missing DataHub ownership without calling it healthy', () => {
    const source = {
      ...newCard('source', 0),
      id: 'governed-source',
      data: {
        ...newCard('source', 0).data,
        datahubUrn: 'urn:li:dataset:(urn:li:dataPlatform:snowflake,customers,PROD)',
        datahubTags: ['PII'],
        datahubQuality: 'unavailable' as const,
        datahubFreshness: { capturedAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-01-01T00:01:00.000Z', stale: true },
      },
    }
    const findings = validatePipeline([source], [])
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'missing-owner-governed-source', severity: 'error' }),
      expect.objectContaining({ id: 'metadata-stale-governed-source', severity: 'error' }),
      expect.objectContaining({ id: 'quality-unavailable-governed-source', severity: 'warning' }),
    ]))
  })

  it('rejects an empty pipeline instead of reporting a false success', () => {
    expect(validatePipeline([], [])).toEqual([
      expect.objectContaining({
        id: 'empty-pipeline',
        atomId: 'pipeline-presence',
        severity: 'error',
      }),
    ])
  })

  it('attributes every finding to the atom that produced it', () => {
    const findings = validatePipeline(initialNodes, initialEdges)
    expect(findings).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'sensitive-unprotected-customers-source-activation-output', atomId: 'sensitive-data-path' })]))
  })

  it('requires source and terminal output cards with stable atom IDs', () => {
    const analysis = { ...newCard('analysis', 0), id: 'analysis' }
    expect(validatePipeline([analysis], [])).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'missing-source', atomId: 'pipeline-terminals', severity: 'error' }),
      expect.objectContaining({ id: 'missing-output', atomId: 'pipeline-terminals', severity: 'error' }),
    ]))
  })

  it('validates exact split handle contracts', () => {
    const split = { ...newCard('split', 0), id: 'split' }
    const approved = { ...newCard('output', 1), id: 'approved-output' }
    const quarantine = { ...newCard('output', 2), id: 'quarantine-output' }
    const findings = validatePipeline([split, approved, quarantine], [
      { id: 'e-approved-1', source: 'split', target: 'approved-output', sourceHandle: 'approved' },
      { id: 'e-approved-2', source: 'split', target: 'quarantine-output', sourceHandle: 'approved' },
    ])
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'split-handle-approved-split', severity: 'error' }),
      expect.objectContaining({ id: 'split-handle-quarantine-split', severity: 'error' }),
    ]))
  })

  it('evaluates sensitive protection independently on each output path', () => {
    const source = { ...newCard('source', 0), id: 'source', data: { ...newCard('source', 0).data, schema: [{ name: 'email', type: 'string' as const, tags: ['PII'] }] } }
    const mask = { ...newCard('transform', 1), id: 'mask', data: { ...newCard('transform', 1).data, rule: 'sha256(email)' } }
    const safe = { ...newCard('output', 2), id: 'safe' }
    const unsafe = { ...newCard('output', 3), id: 'unsafe' }
    const findings = validatePipeline([source, mask, safe, unsafe], [
      { id: 'safe-1', source: 'source', target: 'mask' },
      { id: 'safe-2', source: 'mask', target: 'safe' },
      { id: 'unsafe-1', source: 'source', target: 'unsafe' },
    ])
    expect(findings.some((finding) => finding.id.endsWith('-safe'))).toBe(false)
    expect(findings).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'sensitive-unprotected-source-unsafe', severity: 'error' })]))
  })

  it('validates the Human Review card contract independently', () => {
    const review = { ...newCard('review', 1), id: 'review' }
    expect(validatePipeline([...initialNodes, review], initialEdges)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'review-path-review', atomId: 'card-contracts' }),
    ]))
  })
})
