import { describe, expect, it } from 'vitest'
import { applyProposal, newCard, type AgentProposal, type PipelineNode } from '../domain/pipeline'
import { validatePipeline } from '.'
import { repairSensitiveOutputPaths } from './proposal-repair'

describe('proposal safety repair', () => {
  it('inserts a deterministic protection boundary before a sensitive output', () => {
    const source: PipelineNode = {
      ...newCard('source', 0),
      id: 'source',
      data: {
        ...newCard('source', 0).data,
        schema: [{ name: 'email', type: 'string' as const, tags: ['PII'] }],
      },
    }
    const output = { ...newCard('output', 1), id: 'output' }
    const proposal: AgentProposal = {
      id: 'proposal',
      title: 'Publish governed output',
      summary: 'Add the output.',
      rationale: 'The branch needs a terminal artifact.',
      requiresHumanReview: false,
      addedNodes: [output],
      updatedNodes: [],
      addedEdges: [{ id: 'source-output', source: source.id, target: output.id }],
      removedEdgeIds: [],
      datahubReads: [],
      writeback: '',
    }

    const repaired = repairSensitiveOutputPaths(proposal, [source], [])
    const graph = applyProposal([source], [], proposal)

    expect(repaired.repairedOutputs).toEqual(['output'])
    expect(proposal.requiresHumanReview).toBe(true)
    expect(graph.nodes.some((node) => node.data.kind === 'transform' && /mask|tokenize/i.test(node.data.rule ?? ''))).toBe(true)
    expect(validatePipeline(graph.nodes, graph.edges).some((finding) => finding.id.startsWith('sensitive-unprotected-'))).toBe(false)
  })
})
