import { describe, expect, it } from 'vitest'
import { ensureHostReviewCheckpoint } from './review-checkpoint'
import { newCard, type AgentProposal } from './pipeline'

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
})
