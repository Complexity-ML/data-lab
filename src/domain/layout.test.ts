import { describe, expect, it } from 'vitest'
import { layoutPipeline } from './layout'
import { initialEdges, initialNodes } from './pipeline'

describe('pipeline XY layout', () => {
  it('places every lineage edge from left to right', () => {
    const arranged = layoutPipeline(initialNodes, initialEdges)
    const position = new Map(arranged.map((node) => [node.id, node.position]))
    for (const edge of initialEdges) expect(position.get(edge.source)!.x).toBeLessThan(position.get(edge.target)!.x)
  })

  it('keeps approved split branches above quarantine branches', () => {
    const arranged = layoutPipeline(initialNodes, initialEdges)
    const approved = arranged.find((node) => node.id === 'normalize-customer')!
    const quarantine = arranged.find((node) => node.id === 'quarantine-output')!
    expect(approved.position.y).toBeLessThan(quarantine.position.y)
  })

  it('does not reposition a cyclic graph', () => {
    const cycle = [...initialEdges, { id: 'cycle', source: 'activation-output', target: 'customers-source' }]
    expect(layoutPipeline(initialNodes, cycle)).toBe(initialNodes)
  })
})
