import { describe, expect, it } from 'vitest'
import { elasticHorizontalPath } from '../components/shared/ElasticEdge'
import { layoutPipeline } from './layout'
import { customerActivationEdges as initialEdges, customerActivationNodes as initialNodes } from './pipeline'

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

  it('renders elastic cables as cubic curves instead of square steps', () => {
    const path = elasticHorizontalPath(10, 20, 310, 140)
    expect(path).toContain(' C ')
    expect(path).toContain('310 140')
  })

  it('keeps elastic cables cubic while endpoints move between frames', () => {
    const frames = [
      { sourceX: 10, sourceY: 20, targetX: 310, targetY: 140 },
      { sourceX: 34, sourceY: 52, targetX: 278, targetY: 196 },
      { sourceX: 82, sourceY: 104, targetX: 220, targetY: 76 },
    ]
    const paths = frames.map(({ sourceX, sourceY, targetX, targetY }) => {
      const path = elasticHorizontalPath(sourceX, sourceY, targetX, targetY)
      expect(path).toMatch(new RegExp(`^M ${sourceX} ${sourceY} L .+ C [-\\d.]+ [-\\d.]+, [-\\d.]+ [-\\d.]+, [-\\d.]+ [-\\d.]+ L ${targetX} ${targetY}$`))
      expect(path.match(/ C /g)).toHaveLength(1)
      expect(path).not.toMatch(/ [HV] /)
      return path
    })

    expect(new Set(paths).size).toBe(frames.length)
  })
})
