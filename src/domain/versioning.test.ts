import { describe, expect, it } from 'vitest'
import { customerActivationEdges as initialEdges, customerActivationNodes as initialNodes } from './pipeline'
import { appendPipelineVersion, createPipelineVersion, readPipelineVersions, restorePipelineVersion } from './versioning'

describe('pipeline versioning', () => {
  it('creates an isolated graph snapshot', () => {
    const version = createPipelineVersion(initialNodes, initialEdges, 'Initial', 'initial', [])
    const restored = restorePipelineVersion(version)
    restored.nodes[0].data.label = 'Changed'
    expect(version.nodes[0].data.label).toBe('Customers 360')
  })

  it('keeps a bounded version history', () => {
    const versions = Array.from({ length: 4 }, (_, index) => createPipelineVersion(initialNodes, initialEdges, `${index}`, 'manual', []))
    expect(appendPipelineVersion(versions.slice(0, 3), versions[3], 2)).toHaveLength(2)
  })

  it('rejects malformed persisted history', () => {
    expect(readPipelineVersions('{broken')).toEqual([])
  })
})
