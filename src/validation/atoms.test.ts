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
      'schema-contract',
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

  it('accepts a replayable graph-only patch only after a context-reading card', () => {
    const source = { ...newCard('source', 0), id: 'source' }
    const analysis = { ...newCard('analysis', 1), id: 'analysis' }
    const patch = { ...newCard('patch', 2), id: 'patch' }
    const output = { ...newCard('output', 3), id: 'output' }
    const findings = validatePipeline([source, analysis, patch, output], [
      { id: 'source-analysis', source: source.id, target: analysis.id },
      { id: 'analysis-patch', source: analysis.id, target: patch.id },
      { id: 'patch-output', source: patch.id, target: output.id },
    ])
    expect(findings.some((finding) => finding.id.startsWith('patch-'))).toBe(false)
  })

  it('accepts an atomic ML risk assessment backed by fresh impact evidence', () => {
    const source = { ...newCard('source', 0), id: 'source' }
    const impact = { ...newCard('impact', 1), id: 'impact' }
    const risk = { ...newCard('risk', 2), id: 'risk', data: { ...newCard('risk', 2).data, rule: 'scope=churn_model_v3 | risk_type=data | severity=high | confidence=0.91 | evidence=fresh | affected_assets=3 | action=repair_feature_then_retrain' } }
    const output = { ...newCard('output', 3), id: 'output' }
    const findings = validatePipeline([source, impact, risk, output], [
      { id: 'source-impact', source: source.id, target: impact.id },
      { id: 'impact-risk', source: impact.id, target: risk.id },
      { id: 'risk-output', source: risk.id, target: output.id },
    ])
    expect(findings.some((finding) => finding.id.startsWith('risk-'))).toBe(false)
  })

  it('blocks a dataset risk inferred only from unavailable connector evidence', () => {
    const source = { ...newCard('source', 0), id: 'source' }
    const impact = { ...newCard('impact', 1), id: 'impact' }
    const risk = { ...newCard('risk', 2), id: 'risk', data: { ...newCard('risk', 2).data, rule: 'scope=churn_model_v3 | risk_type=data | severity=critical | confidence=0.9 | evidence=unavailable | affected_assets=2 | action=stop_model' } }
    const output = { ...newCard('output', 3), id: 'output' }
    const findings = validatePipeline([source, impact, risk, output], [
      { id: 'source-impact', source: source.id, target: impact.id },
      { id: 'impact-risk', source: impact.id, target: risk.id },
      { id: 'risk-output', source: risk.id, target: output.id },
    ])
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'risk-data-evidence-risk', severity: 'error' }),
    ]))
  })

  it('keeps collection reliability from claiming affected data assets', () => {
    const source = { ...newCard('source', 0), id: 'source' }
    const analysis = { ...newCard('analysis', 1), id: 'analysis' }
    const risk = { ...newCard('risk', 2), id: 'risk', data: { ...newCard('risk', 2).data, rule: 'scope=datahub_mcp | risk_type=collection | severity=high | confidence=1 | evidence=unavailable | affected_assets=4 | action=retry_connector' } }
    const output = { ...newCard('output', 3), id: 'output' }
    const findings = validatePipeline([source, analysis, risk, output], [
      { id: 'source-analysis', source: source.id, target: analysis.id },
      { id: 'analysis-risk', source: analysis.id, target: risk.id },
      { id: 'risk-output', source: risk.id, target: output.id },
    ])
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'risk-collection-impact-risk', severity: 'error' }),
    ]))
  })

  it('keeps feedback loops bounded and rejects feedback outside Output-to-Monitor', () => {
    const source = { ...newCard('source', 0), id: 'source' }
    const monitor = { ...newCard('monitor', 1), id: 'monitor' }
    const output = { ...newCard('output', 2), id: 'output' }
    const valid = validatePipeline([source, monitor, output], [
      { id: 'source-monitor', source: source.id, target: monitor.id },
      { id: 'monitor-output', source: monitor.id, target: output.id },
      { id: 'feedback', source: output.id, target: monitor.id, sourceHandle: 'feedback' },
    ])
    expect(valid.some((finding) => finding.id === 'cycle')).toBe(false)
    expect(valid.some((finding) => finding.id === 'output-edge-output')).toBe(false)

    const invalid = validatePipeline([source, monitor, output], [
      { id: 'invalid-feedback', source: source.id, target: monitor.id, sourceHandle: 'feedback' },
      { id: 'monitor-output', source: monitor.id, target: output.id },
    ])
    expect(invalid).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'feedback-contract-invalid-feedback', severity: 'error' })]))
  })

  it('requires Parallel Agents to fan out with branch-only context and atomic merge', () => {
    const source = { ...newCard('source', 0), id: 'source' }
    const parallel = { ...newCard('parallel', 1), id: 'parallel' }
    const left = { ...newCard('output', 2), id: 'left' }
    const right = { ...newCard('output', 3), id: 'right' }
    const findings = validatePipeline([source, parallel, left, right], [
      { id: 'source-parallel', source: source.id, target: parallel.id },
      { id: 'parallel-left', source: parallel.id, target: left.id },
      { id: 'parallel-right', source: parallel.id, target: right.id },
    ])
    expect(findings.some((finding) => finding.id.startsWith('parallel-'))).toBe(false)
  })

  it('treats a Data Profile as sidecar memory rather than an executable orphan', () => {
    const profile = { ...newCard('profile', 9), id: 'profile-memory' }
    const findings = validatePipeline([...initialNodes, profile], initialEdges)
    expect(findings.some((finding) => finding.nodeId === profile.id && finding.atomId === 'card-contracts')).toBe(false)
  })

  it('keeps one DATA LAB Control card outside lineage with a complete player policy', () => {
    const source = { ...newCard('source', 0), id: 'control-test-source' }
    const output = { ...newCard('output', 1), id: 'control-test-output' }
    const control = { ...newCard('control', 9), id: 'control-policy' }
    const baseNodes = [source, output]
    const baseEdges = [{ id: 'control-test-path', source: source.id, target: output.id }]
    const valid = validatePipeline([...baseNodes, control], baseEdges)
    expect(valid.some((finding) => finding.nodeId === control.id && finding.atomId === 'card-contracts')).toBe(false)

    const connected = validatePipeline([...baseNodes, control], [...baseEdges, { id: 'control-source', source: control.id, target: source.id }])
    expect(connected).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'control-edge-control-policy', severity: 'error' }),
    ]))
  })

  it('detects a declared breaking schema type drift', () => {
    const source = { ...newCard('source', 0), id: 'drift-source', data: { ...newCard('source', 0).data, schema: [{ name: 'customer_id', type: 'number' as const }] } }
    const contract = { ...newCard('validation', 1), id: 'drift-contract', data: { ...newCard('validation', 1).data, rule: 'schema_contract: customer_id:string' } }
    const output = { ...newCard('output', 2), id: 'drift-output' }
    const findings = validatePipeline([source, contract, output], [{ id: 'e-1', source: source.id, target: contract.id }, { id: 'e-2', source: contract.id, target: output.id }])
    expect(findings).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'schema-contract-type-drift-contract-customer_id', atomId: 'schema-contract', severity: 'error' })]))
  })
})
