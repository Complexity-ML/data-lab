import { describe, expect, it } from 'vitest'
import { customerActivationEdges, customerActivationNodes } from './pipeline'
import { createPipelineExport, parsePipelineExport } from './pipeline-io'

describe('versioned pipeline JSON exchange', () => {
  it('round-trips graph metadata while excluding secrets, encrypted blobs and local paths', () => {
    const nodes = customerActivationNodes.map((node, index) => index ? node : ({ ...node, data: { ...node.data, apiKey: 'secret', encryptedKey: 'blob', localPath: '/Users/person/private' } }))
    const exported = createPipelineExport('Customer activation', nodes, customerActivationEdges, [])
    const serialized = JSON.stringify(exported)
    expect(serialized).not.toContain('secret')
    expect(serialized).not.toContain('encryptedKey')
    expect(serialized).not.toContain('/Users/person')
    expect(parsePipelineExport(serialized).graph.nodes).toHaveLength(nodes.length)
  })

  it('rejects unsupported schema versions before returning a graph', () => {
    expect(() => parsePipelineExport(JSON.stringify({ schema: 'data-lab.pipeline', schemaVersion: 99, graph: { nodes: [], edges: [] } }))).toThrow('Unsupported DATA LAB schema version 99')
  })

  it('rejects dangling imports instead of partially changing the workspace', () => {
    const value = createPipelineExport('Broken', [], [], [])
    value.graph.edges.push({ id: 'dangling', source: 'missing', target: 'also-missing' })
    expect(() => parsePipelineExport(JSON.stringify(value))).toThrow('references a missing card')
  })
})
