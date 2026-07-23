// @vitest-environment jsdom

import type { Edge } from '@xyflow/react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentProposal, PipelineNode } from '../domain/pipeline'
import { usePipelineVersions } from './usePipelineVersions'

const source: PipelineNode = {
  id: 'source-intended-dataset',
  type: 'pipeline',
  position: { x: 100, y: 100 },
  data: { kind: 'source', label: 'Intended Dataset', description: 'Awaiting a DataHub binding.', owner: 'LABO Agent', status: 'draft', schema: [] },
}

const review: PipelineNode = {
  id: 'review-bind-dataset',
  type: 'pipeline',
  position: { x: 400, y: 100 },
  data: { kind: 'review', label: 'Verify and Bind Dataset', description: 'Human checkpoint.', owner: 'Data steward', status: 'draft', schema: [] },
}

const edge: Edge = { id: 'source-to-review', source: source.id, target: review.id, type: 'elastic' }

const proposal: AgentProposal = {
  id: 'proposal-empty-pipeline-start',
  title: 'Create a bounded starting point for the empty pipeline',
  summary: 'Add a placeholder source and a human checkpoint.',
  rationale: 'The intended dataset must be bound before downstream work.',
  writeback: 'Commit the reviewed graph locally.',
  requiresHumanReview: true,
  datahubReads: ['No DataHub URN is bound.'],
  addedNodes: [source, review],
  updatedNodes: [],
  removedEdgeIds: [],
  addedEdges: [edge],
}

afterEach(cleanup)

function useApprovalHarness(resolveApprovedExecution?: (nodes: PipelineNode[], edges: Edge[]) => PipelineNode[]) {
  const [nodes, setNodes] = useState<PipelineNode[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [currentProposal, setProposal] = useState<AgentProposal | undefined>(proposal)
  const [activity, setActivity] = useState('idle')
  const [, setProjectTitle] = useState('Untitled pipeline')
  const [, setSelectedId] = useState('')
  const versions = usePipelineVersions({
    edges,
    nodes,
    proposal: currentProposal,
    resolveApprovedExecution,
    setActivity,
    setEdges,
    setNodes,
    setProjectTitle,
    setProposal,
    setSelectedId,
  })
  return { activity, currentProposal, edges, nodes, ...versions }
}

describe('agent proposal approval', () => {
  it('commits an approved incremental proposal into the active graph', () => {
    const { result } = renderHook(() => useApprovalHarness())

    act(() => { result.current.recordPendingReview(proposal) })
    expect(result.current.versions.at(-1)?.status).toBe('pending-review')

    let approved = false
    act(() => { approved = result.current.approveProposal() })

    expect(approved).toBe(true)
    expect(result.current.nodes.map((node) => node.id)).toEqual([source.id, review.id])
    expect(result.current.edges).toEqual([edge])
    expect(result.current.currentProposal).toBeUndefined()
    expect(result.current.versions.at(-1)?.status).toBe('committed')
    expect(result.current.versions.at(-1)?.blockingIssues).toBe(0)
    expect(result.current.activity).toContain('Change approved')
    expect(result.current.activity).toContain('readiness')
  })

  it('commits the branch state returned by the Human Review checkpoint resolver', () => {
    const resolveApprovedExecution = vi.fn((nodes: PipelineNode[]) => nodes.map((node) =>
      node.data.kind === 'review'
        ? { ...node, data: { ...node.data, runState: 'completed' as const, runSequence: 7 } }
        : node))
    const { result } = renderHook(() => useApprovalHarness(resolveApprovedExecution))

    act(() => { result.current.recordPendingReview(proposal) })
    act(() => { result.current.approveProposal() })

    expect(resolveApprovedExecution).toHaveBeenCalledOnce()
    expect(result.current.nodes.find((node) => node.id === review.id)?.data).toMatchObject({
      runState: 'completed',
      runSequence: 7,
    })
    expect(result.current.versions.at(-1)?.nodes.find((node) => node.id === review.id)?.data.runState).toBe('completed')
  })
})
