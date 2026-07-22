import { describe, expect, it } from 'vitest'
import { validatePipeline } from '../validation'
import { loadPipelinePreset, type PipelinePresetId } from './pipeline'

const scenarios: Array<{ id: PipelinePresetId; expectedFinding: string }> = [
  { id: 'pii-masking', expectedFinding: 'sensitive-unprotected-pii-source-pii-output' },
  { id: 'schema-drift', expectedFinding: 'schema-contract-type-drift-contract-customer_age' },
  { id: 'broken-governance', expectedFinding: 'missing-owner-governance-source' },
]

describe('optional judge-readable presets', () => {
  it.each(scenarios)('loads $id only when explicitly selected and exposes its expected validation', ({ id, expectedFinding }) => {
    const preset = loadPipelinePreset(id)
    expect(preset.nodes.length).toBeGreaterThan(0)
    expect(validatePipeline(preset.nodes, preset.edges).map((finding) => finding.id)).toContain(expectedFinding)
    expect(JSON.stringify(preset)).not.toMatch(/(?:api[_-]?key|access[_-]?token|password|secret)\s*[=:]/i)
  })

  it('keeps blank startup independent from all optional examples', () => {
    expect(loadPipelinePreset('empty')).toEqual({ title: 'Untitled pipeline', nodes: [], edges: [] })
  })

  it('returns isolated graphs so editing one loaded example cannot mutate the catalog', () => {
    const first = loadPipelinePreset('schema-drift')
    first.nodes[0].data.label = 'Changed locally'
    expect(loadPipelinePreset('schema-drift').nodes[0].data.label).toBe('Training customers v2')
  })
})
