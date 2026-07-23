import { describe, expect, it } from 'vitest'
import { elasticFeedbackPath, elasticHorizontalPath } from '../components/shared/ElasticEdge'
import { layoutPipeline } from './layout'
import { customerActivationEdges as initialEdges, customerActivationNodes as initialNodes, newCard } from './pipeline'

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

  it('routes feedback cables below the bounded iteration instead of through its cards', () => {
    const path = elasticFeedbackPath(900, 180, 420, 320)
    expect(path.match(/ C /g)).toHaveLength(2)
    expect(path).toContain('452')
    expect(path).toMatch(/^M 900 180 L 918 180/)
    expect(path).toMatch(/L 420 320$/)
  })

  it('preserves pinned manual card positions while arranging the surrounding graph', () => {
    const pinned = initialNodes.map((node) => node.id === 'region-split' ? { ...node, position: { x: 777, y: 555 }, data: { ...node.data, pinned: true } } : node)
    const arranged = layoutPipeline(pinned, initialEdges)
    expect(arranged.find((node) => node.id === 'region-split')?.position).toEqual({ x: 777, y: 555 })
    expect(arranged.find((node) => node.id === 'customers-source')?.position).not.toEqual(initialNodes.find((node) => node.id === 'customers-source')?.position)
  })

  it('orders adjacent layers to remove avoidable crossed cables', () => {
    const topLeft = { ...newCard('source', 0), id: 'top-left', position: { x: 0, y: 0 } }
    const bottomLeft = { ...newCard('source', 1), id: 'bottom-left', position: { x: 0, y: 300 } }
    const topRight = { ...newCard('output', 2), id: 'top-right', position: { x: 300, y: 0 } }
    const bottomRight = { ...newCard('output', 3), id: 'bottom-right', position: { x: 300, y: 300 } }
    const edges = [{ id: 'cross-a', source: 'top-left', target: 'bottom-right' }, { id: 'cross-b', source: 'bottom-left', target: 'top-right' }]
    const arranged = layoutPipeline([topLeft, bottomLeft, topRight, bottomRight], edges)
    const positions = new Map(arranged.map((node) => [node.id, node.position]))
    const sourceOrder = positions.get('top-left')!.y - positions.get('bottom-left')!.y
    const targetOrder = positions.get('bottom-right')!.y - positions.get('top-right')!.y
    expect(sourceOrder * targetOrder).toBeGreaterThanOrEqual(0)
  })

  it('reserves a floating lane for the orphaned DATA LAB Controller', () => {
    const control = { ...newCard('control', 0), id: 'data-lab-control' }
    const source = { ...newCard('source', 1), id: 'governed-source' }
    const validation = { ...newCard('validation', 2), id: 'governed-validation' }
    const output = { ...newCard('output', 3), id: 'governed-output' }
    const edges = [
      { id: 'source-validation', source: source.id, target: validation.id },
      { id: 'validation-output', source: validation.id, target: output.id },
    ]

    const arranged = layoutPipeline([control, source, validation, output], edges)
    const controlPosition = arranged.find((node) => node.id === control.id)!.position
    const lineageTop = Math.min(...arranged.filter((node) => node.id !== control.id).map((node) => node.position.y))

    expect(controlPosition.y).toBeLessThan(lineageTop)
    expect(lineageTop - controlPosition.y).toBeGreaterThanOrEqual(240)
  })
})
