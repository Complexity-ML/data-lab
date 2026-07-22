import { describe, expect, it } from 'vitest'
import { applyAtomicRunState, buildAtomicRunTrace, executePipelineAtomically } from './atomic-execution'
import { customerActivationEdges, customerActivationNodes, newCard } from './pipeline'

describe('atomic pipeline execution state machine', () => {
  it('does not start an empty graph', () => {
    expect(executePipelineAtomically([], [])).toMatchObject({ started: false, state: 'idle', events: [] })
  })

  it('commits cards only after every predecessor completed and reports split outputs independently', () => {
    const run = executePipelineAtomically(customerActivationNodes, customerActivationEdges)
    const completedSequence = new Map(run.events.filter((event) => event.state === 'completed').map((event) => [event.nodeId, event.sequence]))
    for (const edge of customerActivationEdges) expect(completedSequence.get(edge.source)!).toBeLessThan(completedSequence.get(edge.target)!)
    expect(run).toMatchObject({ state: 'completed', branches: expect.arrayContaining([{ outputId: 'activation-output', state: 'completed' }, { outputId: 'quarantine-output', state: 'completed' }]) })
  })

  it('pauses only the Human Review branch while another split branch completes', () => {
    const source = { ...newCard('source', 0), id: 'source' }
    const split = { ...newCard('split', 1), id: 'split' }
    const review = { ...newCard('review', 2), id: 'review' }
    const reviewedOutput = { ...newCard('output', 3), id: 'reviewed-output' }
    const directOutput = { ...newCard('output', 4), id: 'direct-output' }
    const run = executePipelineAtomically([source, split, review, reviewedOutput, directOutput], [
      { id: 'source-split', source: 'source', target: 'split' },
      { id: 'split-review', source: 'split', target: 'review', sourceHandle: 'approved' },
      { id: 'review-output', source: 'review', target: 'reviewed-output' },
      { id: 'split-direct', source: 'split', target: 'direct-output', sourceHandle: 'quarantine' },
    ])
    expect(run.state).toBe('waiting')
    expect(run.branches).toEqual(expect.arrayContaining([{ outputId: 'reviewed-output', state: 'waiting' }, { outputId: 'direct-output', state: 'completed' }]))
  })

  it('stops before a later card commit and never completes a terminal output', () => {
    const run = executePipelineAtomically(customerActivationNodes, customerActivationEdges, { shouldStop: (completed) => completed.length >= 2 })
    expect(run.state).toBe('stopped')
    expect(run.nodeStates['activation-output']).toBe('stopped')
    expect(run.events.some((event) => event.nodeId === 'activation-output' && event.state === 'completed')).toBe(false)
  })

  it('replays multiple scoped Impact Analysis atoms independently', () => {
    const source = { ...newCard('source', 0), id: 'source' }
    const featureImpact = { ...newCard('impact', 1), id: 'feature-impact' }
    const modelImpact = { ...newCard('impact', 2), id: 'model-impact' }
    const output = { ...newCard('output', 3), id: 'output' }
    const graphEdges = [{ id: 'e-1', source: source.id, target: featureImpact.id }, { id: 'e-2', source: featureImpact.id, target: modelImpact.id }, { id: 'e-3', source: modelImpact.id, target: output.id }]
    const first = executePipelineAtomically([source, featureImpact, modelImpact, output], graphEdges)
    const replay = executePipelineAtomically([source, featureImpact, modelImpact, output], graphEdges)
    expect(first.nodeStates).toMatchObject({ 'feature-impact': 'completed', 'model-impact': 'completed' })
    expect(replay.nodeStates).toEqual(first.nodeStates)
    expect(replay.events.filter((event) => event.message.startsWith('Impact Analysis atom'))).toHaveLength(2)
  })

  it('materializes inspectable card states and a deterministic review trace', () => {
    const run = executePipelineAtomically(customerActivationNodes, customerActivationEdges)
    const rendered = applyAtomicRunState(customerActivationNodes, run)
    expect(rendered.find((node) => node.id === 'customers-source')?.data).toMatchObject({ runState: 'completed', runSequence: 2 })
    expect(buildAtomicRunTrace(customerActivationNodes, run).at(-1)).toMatchObject({ nodeId: 'quarantine-output', state: 'completed' })
  })
})
