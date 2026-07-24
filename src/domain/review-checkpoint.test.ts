import { describe, expect, it } from 'vitest'
import { ensureHostReviewCheckpoint } from './review-checkpoint'
import { applyProposal, newCard, type AgentProposal } from './pipeline'
import { repairSensitiveOutputPaths } from '../validation/proposal-repair'
import { validatePipeline } from '../validation'

function proposal(): AgentProposal {
  return {
    id: 'risk-change',
    title: 'Risky change',
    summary: 'Change',
    rationale: 'Evidence',
    addedNodes: [],
    updatedNodes: [],
    addedEdges: [],
    removedEdgeIds: [],
    datahubReads: [],
    writeback: '',
  }
}

describe('host review checkpoint', () => {
  it('adds a branch-local review and terminal output once', () => {
    const source = { ...newCard('source', 0), id: 'source' }
    const next = proposal()
    ensureHostReviewCheckpoint(next, [source], [], { anchorId: source.id, reason: 'High deterministic risk.' })
    ensureHostReviewCheckpoint(next, [source], [], { anchorId: source.id, reason: 'High deterministic risk.' })

    expect(next.requiresHumanReview).toBe(true)
    expect(next.addedNodes.filter((node) => node.data.kind === 'review')).toHaveLength(1)
    expect(next.addedNodes.filter((node) => node.data.kind === 'output')).toHaveLength(1)
    expect(next.addedEdges).toHaveLength(2)
    expect(next.rationale).toContain('Host risk gate:')
  })

  it('routes a sensitive high-risk approval through a versioned protection boundary', () => {
    const sourceBase = newCard('source', 0)
    const source = {
      ...sourceBase,
      id: 'source',
      data: {
        ...sourceBase.data,
        schema: [{ name: 'email', type: 'string' as const, tags: ['PII'] }],
      },
    }
    const next = proposal()

    ensureHostReviewCheckpoint(next, [source], [], { anchorId: source.id, reason: 'High deterministic risk.' })
    repairSensitiveOutputPaths(next, [source], [])
    const graph = applyProposal([source], [], next)

    expect(graph.nodes.some((node) => node.data.kind === 'transform' && /mask|tokenize/i.test(node.data.rule ?? ''))).toBe(true)
    expect(validatePipeline(graph.nodes, graph.edges).some((finding) => finding.id.startsWith('sensitive-unprotected-'))).toBe(false)
  })
})
