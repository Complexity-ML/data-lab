// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { newCard } from '../domain/pipeline'

const { updateNodeInternals } = vi.hoisted(() => ({ updateNodeInternals: vi.fn() }))

vi.mock('@xyflow/react', () => ({
  Handle: ({ id, type }: { id?: string; type: string }) => <i data-handle-id={id ?? 'default'} data-testid="pipeline-handle" data-type={type} />,
  Position: { Left: 'left', Right: 'right' },
  useUpdateNodeInternals: () => updateNodeInternals,
}))

import { PipelineCard } from './PipelineCard'

afterEach(cleanup)

const cardProps = (card: ReturnType<typeof newCard>) => ({
  id: card.id,
  data: card.data,
  selected: false,
}) as unknown as Parameters<typeof PipelineCard>[0]

describe('Pipeline card ports', () => {
  it('lets Data Profile participate in a replayable graph path', () => {
    const profile = newCard('profile', 0)
    render(<PipelineCard {...cardProps(profile)} />)
    expect(screen.getAllByTestId('pipeline-handle').map((handle) => handle.getAttribute('data-type'))).toEqual(['target', 'source'])
  })

  it('exposes only a feedback source on Output for a next monitor iteration', () => {
    const output = newCard('output', 0)
    render(<PipelineCard {...cardProps(output)} />)
    const handles = screen.getAllByTestId('pipeline-handle')
    expect(handles.map((handle) => [handle.getAttribute('data-type'), handle.getAttribute('data-handle-id')])).toEqual([
      ['target', 'default'],
      ['source', 'feedback'],
    ])
  })

  it('keeps the global DATA LAB Controller outside dataset lineage', () => {
    const controller = newCard('control', 0)
    render(<PipelineCard {...cardProps(controller)} />)
    expect(screen.queryAllByTestId('pipeline-handle')).toEqual([])
    expect(screen.getByText('Player')).toBeTruthy()
  })

  it('refreshes React Flow handle geometry when a card role changes', () => {
    const analysis = newCard('analysis', 0)
    const split = newCard('split', 0)
    const view = render(<PipelineCard {...cardProps(analysis)} />)

    view.rerender(<PipelineCard {...cardProps({ ...split, id: analysis.id })} />)

    expect(updateNodeInternals).toHaveBeenLastCalledWith(analysis.id)
    expect(screen.getAllByTestId('pipeline-handle').map((handle) => handle.getAttribute('data-handle-id'))).toEqual(['default', 'approved', 'quarantine'])
  })
})
