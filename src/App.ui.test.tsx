// @vitest-environment jsdom

import { cleanup, createEvent, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DragEvent as ReactDragEvent, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { AgentPrompt } from './components/shared/AgentPrompt'

interface MockNode {
  id: string
  position: { x: number; y: number }
  data: { kind: string; label: string }
}

interface MockFlowProps {
  children?: ReactNode
  nodes: MockNode[]
  onDrop?(event: ReactDragEvent<HTMLDivElement>): void
  onInit?(instance: { screenToFlowPosition(point: { x: number; y: number }): { x: number; y: number } }): void
}

vi.mock('@xyflow/react', async () => {
  const React = await import('react')
  return {
    addEdge: (edge: unknown, edges: unknown[]) => [...edges, edge],
    Background: () => null,
    BackgroundVariant: { Lines: 'lines' },
    BaseEdge: () => null,
    Controls: () => null,
    EdgeLabelRenderer: ({ children }: { children?: ReactNode }) => <>{children}</>,
    Handle: () => null,
    MarkerType: { ArrowClosed: 'arrowclosed' },
    MiniMap: () => null,
    Position: { Left: 'left', Right: 'right' },
    ReactFlow: ({ children, nodes, onDrop, onInit }: MockFlowProps) => {
      const initialized = React.useRef(false)
      React.useEffect(() => {
        if (initialized.current) return
        initialized.current = true
        onInit?.({ screenToFlowPosition: (point) => point })
      }, [onInit])
      return <div data-testid="pipeline-flow" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
        {nodes.map((node) => <div
          data-kind={node.data.kind}
          data-node-id={node.id}
          data-x={node.position.x}
          data-y={node.position.y}
          key={node.id}
        >{node.data.label}</div>)}
        {children}
      </div>
    },
    useEdgesState: (initial: unknown[]) => {
      const [edges, setEdges] = React.useState(initial)
      return [edges, setEdges, vi.fn()]
    },
    useNodesState: (initial: unknown[]) => {
      const [nodes, setNodes] = React.useState(initial)
      return [nodes, setNodes, vi.fn()]
    },
  }
})

class DataTransferStub {
  dropEffect = 'none'
  effectAllowed = 'all'
  private readonly values = new Map<string, string>()

  getData(format: string) {
    return this.values.get(format) ?? ''
  }

  setData(format: string, value: string) {
    this.values.set(format, value)
  }
}

afterEach(() => cleanup())

beforeEach(() => {
  window.localStorage.clear()
  delete window.dataLab
})

describe('visual pipeline workspace regressions', () => {
  it('opens a new install blank, with zero versions and no false successful run state', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByText('0 cards', { exact: false })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Run agent flow' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Pipeline is empty')).toBeTruthy()
    expect(screen.queryByText('All atomic checks passed')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Show agentic details' }))
    expect(screen.getByText('0 checkpoints')).toBeTruthy()
  })

  it('collapses and reopens Card Library and Inspector independently', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Close card library' }))
    expect(screen.getByRole('button', { name: 'Open card library' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Close inspector' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Open card library' }))
    await user.click(screen.getByRole('button', { name: 'Close inspector' }))
    expect(screen.getByRole('button', { name: 'Open inspector' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Close card library' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Open inspector' }))
    expect(screen.getByRole('button', { name: 'Close inspector' })).toBeTruthy()
  })

  it('keeps ChatGPT sign-in retryable and reports why web preview cannot connect', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Open settings' }))
    await user.click(screen.getByRole('button', { name: 'AI connectionModel and quality' }))
    const connectButton = screen.getByRole('button', { name: 'Continue with ChatGPT' }) as HTMLButtonElement
    expect(connectButton.disabled).toBe(false)
    await user.click(connectButton)

    expect(await screen.findByText('ChatGPT connection requires Electron')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Continue with ChatGPT' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('adds palette cards by click and drops dragged cards at pointer flow-space XY', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    const flow = screen.getByTestId('pipeline-flow')
    const sourcePaletteCard = screen.getByTitle('Click to add or drag Data Source onto the canvas')

    await user.click(sourcePaletteCard)
    const clickedCard = flow.querySelector<HTMLElement>('[data-kind="source"]')
    expect(clickedCard?.dataset.x).toBe('120')
    expect(clickedCard?.dataset.y).toBe('120')

    const transfer = new DataTransferStub()
    const analysisPaletteCard = screen.getByTitle('Click to add or drag Data Analysis onto the canvas')
    fireEvent.dragStart(analysisPaletteCard, { dataTransfer: transfer })
    const dropEvent = createEvent.drop(flow, { dataTransfer: transfer })
    Object.defineProperties(dropEvent, { clientX: { value: 500 }, clientY: { value: 300 } })
    fireEvent(flow, dropEvent)

    const droppedCard = flow.querySelector<HTMLElement>('[data-kind="analysis"]')
    expect(droppedCard?.dataset.x).toBe('384')
    expect(droppedCard?.dataset.y).toBe('234')
    expect(container.querySelectorAll('[data-node-id]')).toHaveLength(2)
  })
})

describe('agent prompt regressions', () => {
  it('caps multi-line growth, keeps scrolling on the textarea and leaves actions outside it', () => {
    render(<AgentPrompt
      activity="Ready"
      busy={false}
      connected
      context={{ cards: 0, edges: 0, versions: 0, mcp: 'MCP connected', model: 'Codex' }}
      onOpenSettings={vi.fn()}
      onStop={vi.fn()}
      onSubmit={vi.fn()}
    />)
    const textarea = screen.getByRole('textbox', { name: 'What should the DATA LAB agent do?' })
    Object.defineProperty(textarea, 'scrollHeight', { configurable: true, get: () => 160 })

    fireEvent.change(textarea, { target: { value: 'Analyze\nthen rebuild\nthen validate\nthen explain every change' } })

    expect(textarea.style.height).toBe('88px')
    expect(textarea.style.overflowY).toBe('auto')
    const form = textarea.closest('form')
    expect(form).toBeTruthy()
    expect(within(form!).getByRole('button', { name: 'Send request to DATA LAB agent' })).toBeTruthy()
    expect(within(form!).getByRole('button', { name: 'Show agentic details' })).toBeTruthy()
  })
})
