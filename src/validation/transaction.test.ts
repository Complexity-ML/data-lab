import { describe, expect, it } from 'vitest'
import type { Edge } from '@xyflow/react'
import type { PipelineNode } from '../domain/pipeline'
import { atomicTransactionBlockers, validatePipeline } from '.'

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

describe('atomic proposal transactions', () => {
  it('allows a safe incremental source and review checkpoint while keeping readiness findings', () => {
    const edges: Edge[] = [{ id: 'source-to-review', source: source.id, target: review.id, type: 'elastic' }]
    const issues = validatePipeline([source, review], edges)

    expect(issues.some((issue) => issue.id === 'missing-output')).toBe(true)
    expect(issues.some((issue) => issue.id === `orphan-output-${review.id}`)).toBe(true)
    expect(atomicTransactionBlockers(issues)).toEqual([])
  })

  it('still rejects unsafe graph topology', () => {
    const cyclicEdges: Edge[] = [
      { id: 'source-to-review', source: source.id, target: review.id, type: 'elastic' },
      { id: 'review-to-source', source: review.id, target: source.id, type: 'elastic' },
    ]

    expect(atomicTransactionBlockers(validatePipeline([source, review], cyclicEdges)).map((issue) => issue.id)).toContain('cycle')
  })
})
