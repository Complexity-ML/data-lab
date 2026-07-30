// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CardLibraryView } from './CardLibraryView'

afterEach(cleanup)

describe('focused card library', () => {
  it('shows incident-response cards first and reveals builder primitives explicitly', () => {
    render(<CardLibraryView onAddCard={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByText('Incident cards')).toBeTruthy()
    expect(screen.getByText('Data Source')).toBeTruthy()
    expect(screen.queryByText('Worker Node')).toBeNull()
    expect(screen.queryByText('Parallel Agents')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Show advanced pipeline cards/ }))

    expect(screen.getByText('Worker Node')).toBeTruthy()
    expect(screen.getByText('Parallel Agents')).toBeTruthy()
  })
})
