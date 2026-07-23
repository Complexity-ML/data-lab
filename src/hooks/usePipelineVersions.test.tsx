// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Edge } from '@xyflow/react'
import type { AgentProposal, PipelineNode } from '../domain/pipeline'
import { usePipelineVersions } from './usePipelineVersions'

const proposal: AgentProposal = {
  id: 'proposal-incremental-start',
  title: 'Create a bounded starting point',
  summary: 'Add a source and review checkpoint.',
  rationale: 'The dataset is not bound yet.',
  addedNodes: [
    { id: 'source-intended-dataset', type: 'pipeline', position: { x: 0, y: 0 }, data: { kind: 'source', label: 'Intended Dataset', description: 'Awaiting binding.', owner: 'LABO Agent', status: 'draft', schema: [] } },
    { id: 'review-bind-dataset', type: 'pipeline', position: { x: 300, y: 0 }, data: { kind: 'review', label: 'Verify and Bind Dataset', description: 'Human checkpoint.', owner: 'Data steward', status: 'draft', schema: [] } },
  ],
  updatedNodes: [],
  addedEdges: [{ id: 'source-to-review', source: 'source-intended-dataset', target: 'review-bind-dataset', type: 'elastic' }],
  removedEdgeIds: [],
  datahubReads: [],
  writeback: 'Local only.',
}

describe('reviewed proposal approval', () => {
  it('commits an incremental reviewed graph even when the pipeline is not runnable yet', () => {
    const setActivity = vi.fn()
    const { result } = renderHook(() => {
      const [nodes, setNodes] = useState<PipelineNode[]>([])
      const [edges, setEdges] = useState<Edge[]>([])
      const versions = usePipelineVersions({
        edges,
        nodes,
        proposal,
        setActivity,
        setEdges,
        setNodes,
        setProjectTitle: vi.fn(),
        setProposal: vi.fn(),
        setSelectedId: vi.fn(),
      })
      return { edges, nodes, versions }
    })

    act(() => { result.current.versions.recordPendingReview(proposal) })
    act(() => { expect(result.current.versions.approveProposal()).toBe(true) })

    expect(result.current.nodes.map((node) => node.id)).toEqual(['source-intended-dataset', 'review-bind-dataset'])
    expect(result.current.edges).toHaveLength(1)
    expect(setActivity).toHaveBeenLastCalledWith('Change approved · atomic transaction passed · 2 pipeline readiness checks remain')
  })
})
