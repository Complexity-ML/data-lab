import { describe, expect, it } from 'vitest'
import { parseAndValidateProposal, validateProposal } from './proposal-contract.js'

const payload = {
  graph: {
    nodes: [
      { id: 'source-1', kind: 'source' },
      { id: 'output-1', kind: 'output' },
    ],
    edges: [{ id: 'edge-1', source: 'source-1', target: 'output-1' }],
  },
}

const emptyFields = { kind: null, label: null, description: null, owner: null, rule: null, source: null, target: null, source_handle: null }
const validProposal = {
  title: 'Mask the sensitive field',
  summary: 'Insert a reviewed masking transform.',
  rationale: 'DataHub classifies email as PII.',
  requires_human_review: true,
  confidence: 0.9,
  writeback: 'Record the approved masking decision.',
  evidence: ['get_entities · PII email'],
  actions: [
    { type: 'add_card', node_id: 'mask-email', kind: 'transform', label: 'Mask email', description: 'Hashes email before activation.', owner: 'Data team', rule: 'sha256(email)', source: null, target: null, source_handle: null, reason: 'Protect PII.' },
    { type: 'add_card', node_id: 'review-mask', kind: 'review', label: 'Review masking', description: 'Approve the sensitive-data change.', owner: 'Privacy', rule: null, source: null, target: null, source_handle: null, reason: 'Sensitive change.' },
    { type: 'remove_edge', node_id: 'edge-1', ...emptyFields, reason: 'Replace direct path.' },
    { type: 'add_edge', node_id: null, kind: null, label: null, description: null, owner: null, rule: null, source: 'source-1', target: 'mask-email', source_handle: null, reason: 'Route through masking.' },
  ],
}

describe('strict provider proposal contract', () => {
  it('accepts a bounded, complete and internally consistent proposal', () => {
    expect(validateProposal(validProposal, payload)).toEqual(validProposal)
  })

  it('repairs only non-structural add-card metadata when the provider returns null', () => {
    const incompleteMetadata = { ...validProposal, actions: [{ ...validProposal.actions[0], label: null, description: null, owner: null }, validProposal.actions[1]] }
    const result = validateProposal(incompleteMetadata, payload)
    expect(result.actions[0]).toMatchObject({ node_id: 'mask-email', kind: 'transform', label: 'Transform', description: 'Agent-proposed Transform awaiting graph review.', owner: 'DATA LAB Agent' })
  })

  it('accepts Data Profile as bounded agent memory', () => {
    const profile = { ...validProposal.actions[0], node_id: 'customers-profile', kind: 'profile', label: 'Customers profile', description: 'Compact schema and quality memory.', rule: '40 fields · 1 sensitive · fresh' }
    const result = validateProposal({ ...validProposal, requires_human_review: false, actions: [profile] }, payload)
    expect(result.actions[0]).toMatchObject({ node_id: 'customers-profile', kind: 'profile' })
  })

  it('rejects a Human Review checkpoint when the provider forgets the review flag', () => {
    expect(() => validateProposal({ ...validProposal, requires_human_review: false, actions: [validProposal.actions[1]] }, payload)).toThrow('require requires_human_review=true')
  })

  it('rejects an existing Human Review update when the provider forgets the review flag', () => {
    const graphWithReview = { graph: { nodes: [...payload.graph.nodes, { id: 'review-existing', kind: 'review' }], edges: payload.graph.edges } }
    const update = { ...validProposal.actions[0], type: 'update_card', node_id: 'review-existing', kind: null }
    expect(() => validateProposal({ ...validProposal, requires_human_review: false, actions: [update] }, graphWithReview)).toThrow('require requires_human_review=true')
  })

  it('accepts multiple scoped Impact Analysis atoms', () => {
    const featureImpact = { ...validProposal.actions[0], node_id: 'feature-impact', kind: 'impact', label: 'Feature impact', rule: 'scope(customer_age) → customer_features' }
    const modelImpact = { ...validProposal.actions[0], node_id: 'model-impact', kind: 'impact', label: 'Model impact', rule: 'scope(customer_features) → churn_prediction_v3' }
    const result = validateProposal({ ...validProposal, requires_human_review: false, actions: [featureImpact, modelImpact] }, payload)
    expect(result.actions.map((action) => action.kind)).toEqual(['impact', 'impact'])
  })

  it('accepts graph-only patches, live monitors, parallel agents and incident diagrams', () => {
    const patch = { ...validProposal.actions[0], node_id: 'compatibility-patch', kind: 'patch', label: 'Map legacy customer age', rule: 'graph_only: cast customer_age to number' }
    const monitor = { ...validProposal.actions[0], node_id: 'live-monitor', kind: 'monitor', label: 'Watch metadata drift', rule: 'on_change(metadata_fingerprint) | cooldown=60s | max_iterations=10' }
    const parallel = { ...validProposal.actions[0], node_id: 'parallel-agents', kind: 'parallel', label: 'Inspect independent impacts', rule: 'max_concurrency=3 | context=branch_only | merge=atomic' }
    const diagram = { ...validProposal.actions[0], node_id: 'incident-diagram', kind: 'diagram', label: 'Relate incident branches', rule: 'group=incident | inputs=parallel_diffs | merge=atomic' }
    const result = validateProposal({ ...validProposal, requires_human_review: false, actions: [patch, monitor, parallel, diagram] }, payload)
    expect(result.actions.map((action) => action.kind)).toEqual(['patch', 'monitor', 'parallel', 'diagram'])
  })

  it('accepts a feedback edge only as an explicit source handle value', () => {
    const monitor = { ...validProposal.actions[0], node_id: 'live-monitor', kind: 'monitor', label: 'Watch metadata drift' }
    const feedback = { ...validProposal.actions[3], source: 'output-1', target: 'live-monitor', source_handle: 'feedback' }
    const result = validateProposal({ ...validProposal, requires_human_review: false, actions: [monitor, feedback] }, payload)
    expect(result.actions[1].source_handle).toBe('feedback')
  })

  it('normalizes unambiguous provider source-handle aliases without weakening split routing', () => {
    const split = { ...validProposal.actions[0], node_id: 'route-risk', kind: 'split', label: 'Route risk' }
    const approvedEdge = { ...validProposal.actions[3], source: 'route-risk', target: 'output-1', source_handle: 'Approved branch' }
    const nullablePlaceholder = { ...validProposal.actions[1], source_handle: 'N/A' }
    const result = validateProposal({ ...validProposal, actions: [split, nullablePlaceholder, approvedEdge] }, payload)
    expect(result.actions[1].source_handle).toBeNull()
    expect(result.actions[2].source_handle).toBe('approved')
  })

  it('rejects ambiguous or executable-looking source handles', () => {
    const unsafe = { ...validProposal.actions[3], source_handle: 'approved; delete graph' }
    expect(() => validateProposal({ ...validProposal, actions: [validProposal.actions[1], unsafe] }, payload)).toThrow('must be null, approved, quarantine or feedback')
  })

  it.each([
    ['malformed JSON', '{"title":'],
    ['unknown root field', JSON.stringify({ ...validProposal, surprise: true })],
    ['partial action', JSON.stringify({ ...validProposal, actions: [{ type: 'add_card' }] })],
    ['unknown card kind', JSON.stringify({ ...validProposal, actions: [{ ...validProposal.actions[0], kind: 'shell' }, validProposal.actions[1]] })],
    ['duplicate node id', JSON.stringify({ ...validProposal, actions: [validProposal.actions[0], { ...validProposal.actions[0] }, validProposal.actions[1]] })],
    ['dangling edge', JSON.stringify({ ...validProposal, actions: [validProposal.actions[1], { ...validProposal.actions[3], source: 'missing' }] })],
    ['invalid split handle', JSON.stringify({ ...validProposal, actions: [validProposal.actions[1], { ...validProposal.actions[3], source_handle: 'maybe' }] })],
    ['oversized title', JSON.stringify({ ...validProposal, title: 'x'.repeat(161) })],
    ['too many actions', JSON.stringify({ ...validProposal, actions: Array.from({ length: 21 }, () => validProposal.actions[0]) })],
  ])('rejects fuzz case: %s', (_label, serialized) => {
    expect(() => parseAndValidateProposal(serialized, payload)).toThrow()
  })

  it('leaves the current graph byte-for-byte unchanged after every rejected response', () => {
    const before = structuredClone(payload)
    const invalid = { ...validProposal, actions: [{ ...validProposal.actions[3], target: 'unknown-card' }] }
    expect(() => validateProposal(invalid, payload)).toThrow('dangling edge')
    expect(payload).toEqual(before)
  })

  it('rejects requests whose existing graph already exceeds the safety boundary', () => {
    const oversized = { graph: { nodes: Array.from({ length: 401 }, (_, index) => ({ id: `node-${index}` })), edges: [] } }
    expect(() => validateProposal({ ...validProposal, requires_human_review: false, actions: [] }, oversized)).toThrow('safety limits')
  })
})
