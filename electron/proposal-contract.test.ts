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
