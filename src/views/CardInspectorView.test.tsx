// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { newCard } from '../domain/pipeline'
import { CardInspectorView } from './CardInspectorView'

afterEach(cleanup)

describe('DataHub lineage impact', () => {
  it('distinguishes workbench cards from external assets and bounds expansion', () => {
    const selected = newCard('source', 0)
    selected.data.datahubUrn = 'urn:li:dataset:source'
    selected.data.datahubDownstream = Array.from({ length: 35 }, (_, index) => ({
      urn: index === 0 ? 'urn:li:dataset:workbench-output' : `urn:li:dataset:external-${index}`,
      name: `asset-${index}`,
      sensitive: index === 1,
    }))
    const selectNode = vi.fn()
    render(<CardInspectorView
      dataHubConnected={false}
      errorCount={0}
      issues={[]}
      onAgentRework={vi.fn()}
      onBindDataHubSource={vi.fn()}
      onClose={vi.fn()}
      onFocusDiagram={vi.fn()}
      onInspectDataHubAsset={vi.fn()}
      onOpenDataHubSettings={vi.fn()}
      onSearchDataHub={vi.fn()}
      onSelectNode={selectNode}
      onUpdate={vi.fn()}
      selected={selected}
      workbenchAssets={{ 'urn:li:dataset:workbench-output': { nodeId: 'output-1', label: 'CRM output' } }}
    />)

    fireEvent.click(screen.getByRole('button', { name: /asset-0\s*Workbench card · CRM output/ }))
    expect(selectNode).toHaveBeenCalledWith('output-1')
    expect(screen.getByText('Sensitive external path')).toBeTruthy()
    expect(screen.queryByText('asset-20')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show 18 more' }))
    expect(screen.getByText('asset-20')).toBeTruthy()
    expect(screen.queryByText('asset-31')).toBeNull()
    expect(screen.getByText('Expansion is bounded to 30 assets.', { exact: false })).toBeTruthy()
  })
})
