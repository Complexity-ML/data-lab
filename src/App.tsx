import { addEdge, Background, BackgroundVariant, Controls, MarkerType, MiniMap, ReactFlow, useEdgesState, useNodesState, type Connection, type NodeTypes } from '@xyflow/react'
import { Boxes, PanelRightOpen, Pencil, Settings, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { PipelineCard } from './components/PipelineCard'
import { ReviewPanel } from './components/ReviewPanel'
import { ActionButton } from './components/shared/ActionButton'
import { SettingsModal } from './components/shared/SettingsModal'
import { planPrimaryAgentRoute, traceStep } from './domain/agent-runner'
import { layoutPipeline } from './domain/layout'
import { applyProposal, cardLabels, createCardReworkProposal, createGovernanceProposal, initialEdges, initialNodes, newCard, type AgentProposal, type AgentRunTraceStep, type CardKind, type PipelineNode } from './domain/pipeline'
import { appendPipelineVersion, createPipelineVersion, readPipelineVersions, restorePipelineVersion, type PipelineVersion } from './domain/versioning'
import { validatePipeline } from './validation'
import { CardInspectorView } from './views/CardInspectorView'
import { CardLibraryView } from './views/CardLibraryView'

const nodeTypes: NodeTypes = { pipeline: PipelineCard }
const miniMapColors: Record<CardKind, string> = {
  source: '#bfdbfe', analysis: '#c7d2fe', split: '#ddd6fe', decision: '#e9d5ff',
  transform: '#fef3c7', review: '#fecdd3', validation: '#bbf7d0', output: '#bae6fd',
}
const pause = (duration: number) => new Promise((resolve) => window.setTimeout(resolve, duration))

export default function App() {
  const platformClass = window.laboData?.platform ? `platform-${window.laboData.platform}` : 'platform-web'
  const [nodes, setNodes, onNodesChange] = useNodesState<PipelineNode>(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedId, setSelectedId] = useState('customers-source')
  const [proposal, setProposal] = useState<AgentProposal>()
  const [contextMenu, setContextMenu] = useState<{ nodeId: string; label: string; x: number; y: number }>()
  const [connectionMode, setConnectionMode] = useState<'demo' | 'connected'>('demo')
  const [mcpTransport, setMcpTransport] = useState<'demo' | 'http' | 'stdio'>('demo')
  const [mcpMessage, setMcpMessage] = useState('Local demo context')
  const [agentRunning, setAgentRunning] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [versions, setVersions] = useState<PipelineVersion[]>(() => {
    const persisted = readPipelineVersions(window.localStorage.getItem('labo-data-versions'))
    return persisted.length ? persisted : [createPipelineVersion(initialNodes, initialEdges, 'Initial pipeline', 'initial', validatePipeline(initialNodes, initialEdges))]
  })
  const [activity, setActivity] = useState(`Demo catalog loaded · ${initialNodes.length} cards · ${initialEdges.length} lineage edges`)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => window.localStorage.getItem('labo-data-theme') === 'dark' ? 'dark' : 'light')
  const issues = useMemo(() => validatePipeline(nodes, edges), [nodes, edges])
  const selected = nodes.find((node) => node.id === selectedId)
  const errors = issues.filter((issue) => issue.severity === 'error')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('labo-data-theme', theme)
  }, [theme])

  useEffect(() => {
    window.localStorage.setItem('labo-data-versions', JSON.stringify(versions))
  }, [versions])

  useEffect(() => {
    if (!window.laboData) return
    void window.laboData.getDataHubMcpStatus().then((status) => {
      setConnectionMode(status.mode)
      setMcpTransport(status.transport)
      setMcpMessage(status.message)
    }).catch(() => undefined)
  }, [])

  const onConnect = (connection: Connection) => {
    if (!connection.source || !connection.target) return
    setEdges((current) => addEdge({ ...connection, id: `e-${connection.source}-${connection.target}-${Date.now()}`, type: 'smoothstep' }, current))
    setActivity('Manual lineage connection added · run validation before publishing')
  }

  const addCard = (kind: CardKind) => {
    const node = newCard(kind, nodes.length)
    setNodes((current) => [...current, node])
    setSelectedId(node.id)
    setActivity(`${cardLabels[kind]} card added as draft`)
  }

  const updateSelected = (patch: Partial<PipelineNode['data']>) => {
    setNodes((current) => current.map((node) => node.id === selectedId ? { ...node, data: { ...node.data, ...patch } } : node))
  }

  const auditWithAgent = async () => {
    setContextMenu(undefined)
    setProposal(undefined)
    setAgentRunning(true)
    setNodes((current) => current.map((node) => ({ ...node, data: { ...node.data, runState: 'idle', runSequence: undefined } })))
    const source = nodes.find((node) => node.data.kind === 'source' && node.data.datahubUrn)
    const baseProposal = createGovernanceProposal(nodes, edges)
    const hasSensitiveSchema = Boolean(source?.data.schema.some((field) => field.tags?.some((tag) => /pii|sensitive|confidential/i.test(tag))))
    const route = planPrimaryAgentRoute(nodes, edges)
    const runTrace: AgentRunTraceStep[] = []
    let datahubReads = baseProposal.datahubReads
    let agentDoubts = false
    let decisionRequestedReview = false

    try {
      for (let index = 0; index < route.length; index += 1) {
        const card = route[index]
        setSelectedId(card.id)

        const decisionNeedsHuman = card.data.kind === 'decision' && (agentDoubts || hasSensitiveSchema)
        if (decisionNeedsHuman || (card.data.kind === 'review' && card.data.status !== 'healthy')) {
          const summary = card.data.kind === 'decision'
            ? 'Sensitive schema change detected; turn this decision into Human Review.'
            : 'Autonomous execution paused for the named human decision.'
          decisionRequestedReview = card.data.kind === 'decision'
          setNodes((current) => current.map((node) => node.id === card.id ? { ...node, data: { ...node.data, runState: 'waiting', runSequence: index + 1 } } : node))
          runTrace.push(traceStep(card, 'waiting', summary))
          setActivity(`${card.data.label} · ${summary}`)
          await pause(220)
          break
        }

        setNodes((current) => current.map((node) => node.id === card.id ? { ...node, data: { ...node.data, runState: 'running', runSequence: index + 1 } } : node))
        setActivity(`Agent role ${index + 1}/${route.length} · ${card.data.label}`)
        await pause(220)

        if (card.data.kind === 'analysis' && window.laboData && source?.data.datahubUrn) {
          setActivity('Context analyst · reading entity, schema and downstream lineage through MCP…')
          try {
            const audit = await window.laboData.auditDataHubWithMcp(source.data.datahubUrn)
            const successfulReads = audit.reads.filter((read) => read.status === 'ok').length
            agentDoubts = audit.reads.some((read) => read.status !== 'ok')
            datahubReads = audit.reads.map((read) => `${read.name} · ${read.status} · ${read.summary}`)
            setConnectionMode('connected')
            setMcpTransport(audit.transport)
            setMcpMessage(`MCP ${audit.transport} · ${successfulReads}/${audit.reads.length} reads completed`)
          } catch (error) {
            agentDoubts = true
            setConnectionMode('demo')
            setMcpMessage(error instanceof Error ? error.message : 'DataHub MCP unavailable')
          }
        }

        if (card.data.kind === 'validation' && errors.length) {
          const summary = `${errors.length} blocking atomic validation issue${errors.length === 1 ? '' : 's'}.`
          setNodes((current) => current.map((node) => node.id === card.id ? { ...node, data: { ...node.data, runState: 'failed' } } : node))
          runTrace.push(traceStep(card, 'failed', summary))
          setActivity(`Agent stopped · ${summary}`)
          return
        }

        const summary = card.data.kind === 'split'
          ? 'Policy matched the approved branch.'
          : card.data.kind === 'analysis'
            ? agentDoubts ? 'Context collected with uncertainty flags.' : 'Entity, schema and lineage context collected.'
            : 'Card contract completed and output passed forward.'
        setNodes((current) => current.map((node) => node.id === card.id ? { ...node, data: { ...node.data, runState: 'completed' } } : node))
        runTrace.push(traceStep(card, 'completed', summary))
      }

      if (decisionRequestedReview) {
        setProposal({ ...createGovernanceProposal(nodes, edges, { uncertain: agentDoubts }), datahubReads, runTrace })
        setActivity(agentDoubts
          ? 'Agent has doubts · Agent Decision requests Human Review · graph unchanged until approval'
          : 'Sensitive schema change · Agent Decision requests Human Review · approval required')
      } else {
        setActivity('Agent flow completed · every card contract and atomic validation passed')
      }
    } finally {
      setAgentRunning(false)
    }
  }

  const reworkSelectedWithAgent = () => {
    if (!selected) return
    setContextMenu(undefined)
    setProposal(createCardReworkProposal(selected))
    setActivity(`Agent analyzed ${selected.data.label} · card-level review required`)
  }

  const deleteCard = (nodeId: string) => {
    const node = nodes.find((candidate) => candidate.id === nodeId)
    const attachedEdges = edges.filter((edge) => edge.source === nodeId || edge.target === nodeId).length
    setNodes((current) => current.filter((candidate) => candidate.id !== nodeId))
    setEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId))
    if (selectedId === nodeId) setSelectedId('')
    setContextMenu(undefined)
    setActivity(`${node?.data.label ?? 'Card'} deleted · ${attachedEdges} attached edge${attachedEdges === 1 ? '' : 's'} removed`)
  }

  const approveProposal = () => {
    if (!proposal) return
    const next = applyProposal(nodes, edges, proposal)
    const nextIssues = validatePipeline(next.nodes, next.edges)
    const blocking = nextIssues.filter((issue) => issue.severity === 'error')
    if (blocking.length) {
      setActivity(`Transaction rejected · ${blocking.length} atomic check${blocking.length === 1 ? '' : 's'} failed · graph unchanged`)
      return
    }
    const layouted = layoutPipeline(next.nodes, next.edges)
    const version = createPipelineVersion(layouted, next.edges, proposal.title, 'agent', nextIssues)
    setNodes(layouted)
    setEdges(next.edges)
    setVersions((current) => appendPipelineVersion(current, version))
    setSelectedId(proposal.updatedNodes[0]?.nodeId ?? proposal.addedNodes[0]?.id ?? '')
    setProposal(undefined)
    setActivity('Change approved · DataHub writeback queued in demo mode')
  }

  const saveManualVersion = () => {
    const currentIssues = validatePipeline(nodes, edges)
    const blocking = currentIssues.filter((issue) => issue.severity === 'error')
    if (blocking.length) {
      setActivity(`Version not saved · fix ${blocking.length} blocking atomic check${blocking.length === 1 ? '' : 's'} first`)
      return
    }
    const version = createPipelineVersion(nodes, edges, `Manual checkpoint ${versions.length + 1}`, 'manual', currentIssues)
    setVersions((current) => appendPipelineVersion(current, version))
    setActivity(`Version saved · ${version.label}`)
  }

  const restoreVersion = (versionId: string) => {
    const version = versions.find((candidate) => candidate.id === versionId)
    if (!version) return
    const restored = restorePipelineVersion(version)
    setNodes(restored.nodes)
    setEdges(restored.edges)
    setProposal(undefined)
    setSelectedId(restored.nodes[0]?.id ?? '')
    setActivity(`Version restored · ${version.label}`)
  }

  const syncDataHub = async () => {
    if (!window.laboData) {
      setActivity('Web demo mode · launch Electron with DATAHUB_GMS_URL to connect DataHub')
      return
    }
    try {
      const status = await window.laboData.connectDataHubMcp()
      setConnectionMode(status.mode)
      setMcpTransport(status.transport)
      setMcpMessage(status.message)
      if (status.mode !== 'connected') {
        setActivity(status.message)
        return
      }
      setActivity(`${status.message} · ready for agent audits`)
    } catch (error) {
      setConnectionMode('demo')
      setMcpMessage(error instanceof Error ? error.message : 'unknown error')
      setActivity(`DataHub MCP connection failed · ${error instanceof Error ? error.message : 'unknown error'}`)
    }
  }

  return <main className={`app-shell ${platformClass}`}>
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><Boxes size={18} /></span><div><strong>LABO DATA</strong><small>Context-aware pipeline studio</small></div></div>
      <div className="project-title"><span>Customer activation</span><small>Production draft</small></div>
      <div className="topbar-actions">
        <ActionButton disabled={agentRunning} icon={<Sparkles size={15} />} onClick={auditWithAgent} variant="primary">{agentRunning ? 'Running cards…' : 'Run agent flow'}</ActionButton>
        <button aria-label="Open settings" className="settings-trigger" onClick={() => setSettingsOpen(true)} title="Settings" type="button"><Settings size={17} /></button>
      </div>
    </header>

    {settingsOpen && <SettingsModal
      connectionMode={connectionMode}
      errorCount={errors.length}
      findingCount={issues.length}
      mcpMessage={mcpMessage}
      mcpTransport={mcpTransport}
      onAutoLayout={() => { setNodes((current) => layoutPipeline(current, edges)); setActivity('Topology-aware XY layout applied · Split branches preserved') }}
      onClose={() => setSettingsOpen(false)}
      onSyncDataHub={syncDataHub}
      onThemeChange={setTheme}
      onValidate={() => setActivity(`${errors.length} blocking issue${errors.length === 1 ? '' : 's'} · ${issues.length} total findings`)}
      onRestoreVersion={restoreVersion}
      onSaveVersion={saveManualVersion}
      theme={theme}
      versions={versions.map(({ id, label, createdAt, origin, blockingIssues }) => ({ id, label, createdAt, origin, blockingIssues }))}
    />}

    <section className={`workspace ${inspectorOpen ? '' : 'inspector-collapsed'}`}>
      <CardLibraryView onAddCard={addCard} />

      <section className="canvas-panel">
        {!inspectorOpen && <button aria-label="Open inspector" className="inspector-open" onClick={() => setInspectorOpen(true)} title="Open inspector" type="button"><PanelRightOpen size={16} /><span>Inspector</span></button>}
        <div className="canvas-toolbar"><div><span className="live-dot" />Live validation</div><div>{nodes.length} cards <span>·</span> {edges.length} edges</div></div>
        <ReactFlow
          nodes={nodes}
          edges={edges.map((edge) => ({ ...edge, markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' }, style: { stroke: '#94a3b8', strokeWidth: 1.6 } }))}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => setSelectedId(node.id)}
          onNodeContextMenu={(event, node) => {
            event.preventDefault()
            setSelectedId(node.id)
            setContextMenu({ nodeId: node.id, label: node.data.label, x: event.clientX, y: event.clientY })
          }}
          onPaneClick={() => setContextMenu(undefined)}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          minZoom={0.35}
          maxZoom={1.45}
          defaultEdgeOptions={{ type: 'smoothstep' }}
          deleteKeyCode={['Backspace', 'Delete']}
        >
          <Background color={theme === 'dark' ? '#2a3950' : '#e5eaf0'} gap={24} size={1} variant={BackgroundVariant.Lines} />
          <MiniMap className="minimap" maskColor={theme === 'dark' ? 'rgba(15,23,42,.72)' : 'rgba(248,250,252,.72)'} nodeColor={(node) => miniMapColors[(node.data as PipelineNode['data']).kind]} pannable zoomable />
          <Controls className="flow-controls" showInteractive={false} />
        </ReactFlow>
        {contextMenu && <div className="card-context-menu" role="menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <div><small>CARD</small><strong>{contextMenu.label}</strong></div>
          <button className="context-edit" onClick={() => { setSelectedId(contextMenu.nodeId); setContextMenu(undefined); setActivity(`${contextMenu.label} opened in the inspector`) }} role="menuitem" type="button"><Pencil size={14} /><span><strong>Edit card</strong><small>Open metadata and rules</small></span></button>
          <button className="context-delete" onClick={() => deleteCard(contextMenu.nodeId)} role="menuitem" type="button"><Trash2 size={14} /><span><strong>Delete card</strong><small>Also removes attached edges</small></span></button>
        </div>}
      </section>

      <aside aria-hidden={!inspectorOpen} className={`inspector-panel ${inspectorOpen ? '' : 'is-closed'}`}>
        {proposal ? <ReviewPanel proposal={proposal} onApply={approveProposal} onClose={() => setInspectorOpen(false)} onDiscard={() => { setProposal(undefined); setActivity('Agent proposal rejected · graph unchanged') }} /> : <CardInspectorView errorCount={errors.length} issues={issues} onAgentRework={reworkSelectedWithAgent} onClose={() => setInspectorOpen(false)} onSelectNode={setSelectedId} onUpdate={updateSelected} selected={selected} />}
      </aside>
    </section>

    <footer className="statusbar"><span>{activity}</span><span>Human review <strong>required</strong> for agent changes</span></footer>
  </main>
}
