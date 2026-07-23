import { describe, expect, it } from 'vitest'
import { materializeAiProposal, type AiProposalResponse } from './ai'
import type { PipelineNode } from './pipeline'

describe('AI proposal materialization', () => {
  it('accepts an update to an existing Human Review checkpoint', () => {
    const review: PipelineNode = {
      id: 'review-existing',
      type: 'pipeline',
      position: { x: 0, y: 0 },
      data: { kind: 'review', label: 'Review', description: '', owner: 'Data', status: 'healthy', schema: [] },
    }
    const response: AiProposalResponse = {
      model: 'test-model',
      proposal: {
        title: 'Clarify the checkpoint',
        summary: 'Update the existing checkpoint without creating a duplicate.',
        rationale: 'The review already exists.',
        requires_human_review: true,
        confidence: 0.9,
        writeback: 'none',
        evidence: [],
        actions: [{
          type: 'update_card',
          node_id: review.id,
          kind: null,
          label: 'Review corrected mapping',
          description: null,
          owner: null,
          rule: null,
          source: null,
          target: null,
          source_handle: null,
          reason: 'Clarify the existing Human Review.',
        }],
      },
    }

    expect(materializeAiProposal(response, [review], []).updatedNodes).toMatchObject([
      { nodeId: review.id, patch: { label: 'Review corrected mapping' } },
    ])
  })
})
