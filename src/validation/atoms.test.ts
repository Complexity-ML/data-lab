import { describe, expect, it } from 'vitest'
import { initialEdges, initialNodes, newCard } from '../domain/pipeline'
import { validatePipeline, validationAtoms } from '.'

describe('atomic pipeline validation', () => {
  it('exposes small independently addressable validators', () => {
    expect(validationAtoms.map((atom) => atom.id)).toEqual([
      'edge-integrity',
      'acyclic-lineage',
      'card-contracts',
      'sensitive-data-path',
    ])
  })

  it('attributes every finding to the atom that produced it', () => {
    const findings = validatePipeline(initialNodes, initialEdges)
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ id: 'pii-activation', atomId: 'sensitive-data-path' })
  })

  it('validates the Human Review card contract independently', () => {
    const review = { ...newCard('review', 1), id: 'review' }
    expect(validatePipeline([...initialNodes, review], initialEdges)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'review-path-review', atomId: 'card-contracts' }),
    ]))
  })
})
