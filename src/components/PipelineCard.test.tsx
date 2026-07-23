// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { newCard } from '../domain/pipeline'

vi.mock('@xyflow/react', () => ({
  Handle: ({ id, type }: { id?: string; type: string }) => <i data-handle-id={id ?? 'default'} data-testid="pipeline-handle" data-type={type} />,
  Position: { Left: 'left', Right: 'right' },
}))

import { PipelineCard } from './PipelineCard'

afterEach(cleanup)

describe('Pipeline card ports', () => {
  it('lets Data Profile participate in a replayable graph path', () => {
    const profile = newCard('profile', 0)
    render(PipelineCard({ data: profile.data, selected: false } as never))
    expect(screen.getAllByTestId('pipeline-handle').map((handle) => handle.getAttribute('data-type'))).toEqual(['target', 'source'])
  })

  it('exposes only a feedback source on Output for a next monitor iteration', () => {
    const output = newCard('output', 0)
    render(PipelineCard({ data: output.data, selected: false } as never))
    const handles = screen.getAllByTestId('pipeline-handle')
    expect(handles.map((handle) => [handle.getAttribute('data-type'), handle.getAttribute('data-handle-id')])).toEqual([
      ['target', 'default'],
      ['source', 'feedback'],
    ])
  })

  it('keeps the global DATA LAB Controller outside dataset lineage', () => {
    const controller = newCard('control', 0)
    render(PipelineCard({ data: controller.data, selected: false } as never))
    expect(screen.queryAllByTestId('pipeline-handle')).toEqual([])
    expect(screen.getByText('Player')).toBeTruthy()
  })
})
