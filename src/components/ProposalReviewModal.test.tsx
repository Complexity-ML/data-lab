// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentProposal } from '../domain/pipeline'
import { ProposalReviewModal } from './ProposalReviewModal'

const proposal: AgentProposal = {
  id: 'proposal-modal-1',
  title: 'Validate the proposed graph',
  summary: 'Review the evidence-backed graph before applying it.',
  rationale: 'The active graph remains unchanged until explicit approval.',
  writeback: 'Commit the reviewed graph locally.',
  requiresHumanReview: true,
  datahubReads: ['get_entities · ok'],
  addedNodes: [],
  updatedNodes: [],
  removedEdgeIds: [],
  addedEdges: [],
}

afterEach(cleanup)

describe('proposal graph validation modal', () => {
  it('opens as a labelled dialog and closes without rejecting the proposal', () => {
    const close = vi.fn()
    const discard = vi.fn()
    render(<ProposalReviewModal proposal={proposal} relatedAssets={[]} revisionId="revision-1" writebackAvailable={false} onApply={vi.fn()} onClose={close} onDiscard={discard} />)

    expect(screen.getByRole('dialog', { name: proposal.title })).toBeTruthy()
    expect(screen.getByText('Proposed graph diff')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close proposal review' }))
    expect(close).toHaveBeenCalledOnce()
    expect(discard).not.toHaveBeenCalled()
  })
})
