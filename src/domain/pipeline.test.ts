import { describe, expect, it } from 'vitest'
import { validatePipeline } from '../validation'
import { applyProposal, createGovernanceProposal, initialEdges, initialNodes } from './pipeline'

describe('pipeline validation', () => {
  it('detects the unmasked PII path in the starter graph', () => {
    expect(validatePipeline(initialNodes, initialEdges).some((issue) => issue.id === 'pii-activation')).toBe(true)
  })

  it('clears the PII error after the reviewed agent proposal is applied', () => {
    const proposal = createGovernanceProposal(initialNodes, initialEdges)
    const next = applyProposal(initialNodes, initialEdges, proposal)
    expect(validatePipeline(next.nodes, next.edges).some((issue) => issue.id === 'pii-activation')).toBe(false)
  })

  it('rejects lineage cycles', () => {
    const cyclic = [...initialEdges, { id: 'cycle', source: 'activation-output', target: 'customers-source' }]
    expect(validatePipeline(initialNodes, cyclic).some((issue) => issue.id === 'cycle')).toBe(true)
  })

  it('adapts the generated protection rule to the classified schema', () => {
    const phoneNodes = initialNodes.map((node) => node.id === 'customers-source'
      ? { ...node, data: { ...node.data, schema: [{ name: 'phone_number', type: 'string' as const, tags: ['Sensitive'] }] } }
      : node)
    const proposal = createGovernanceProposal(phoneNodes, initialEdges)
    expect(proposal.addedNodes[0].data.rule).toContain('phone_number')
    expect(proposal.addedNodes[0].data.rule).not.toContain('email')
  })

  it('requests review without changing the graph when MCP evidence is uncertain', () => {
    const proposal = createGovernanceProposal(initialNodes, initialEdges, { uncertain: true })
    expect(proposal.addedNodes).toEqual([])
    expect(proposal.removedEdgeIds).toEqual([])
    expect(proposal.updatedNodes[0].patch.kind).toBe('review')
  })
})
