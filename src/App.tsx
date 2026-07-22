import { addEdge, useEdgesState, useNodesState, type Connection } from '@xyflow/react'
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { AppFooter } from './components/AppFooter'
import { AppHeader } from './components/AppHeader'
import { ReviewPanel } from './components/ReviewPanel'
import { SettingsModal } from './components/shared/SettingsModal'
import type { SettingsSection } from './components/shared/SettingsModal'
import { materializeAiProposal } from './domain/ai'
import { buildCardReworkRequest, buildPipelineAgentRequest } from './domain/agent-context'
import { layoutPipeline } from './domain/layout'
import { applyProposal, cardLabels, initialEdges, initialNodes, loadPipelinePreset, newCard, type AgentProposal, type CardKind, type PipelineNode, type PipelinePresetId } from './domain/pipeline'
import { appendPipelineVersion, commitPendingVersion, createPipelineVersion, rejectPendingVersion, restorePipelineVersion, type PipelineVersion } from './domain/versioning'
import { validatePipeline } from './validation'
import { disconnectedAiStatus, disconnectedChatGPTStatus, useAiConnections } from './hooks/useAiConnections'
import { CardInspectorView } from './views/CardInspectorView'
import { CardLibraryView } from './views/CardLibraryView'
import { PipelineCanvasView } from './views/PipelineCanvasView'
export default function App() {
  const platformClass = window.dataLab?.platform ? `platform-${window.dataLab.platform}` : 'platform-web'
  const [nodes, setNodes, onNodesChange] = useNodesState<PipelineNode>(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedId, setSelectedId] = useState('')
  const [proposal, setProposal] = useState<AgentProposal>()
  const [pendingVersionId, setPendingVersionId] = useState<string>()
  const [requestedVersionId, setRequestedVersionId] = useState<string>()
  const [contextMenu, setContextMenu] = useState<{ nodeId: string; label: string; x: number; y: number }>()
  const [connectionMode, setConnectionMode] = useState<'demo' | 'connected'>('demo')
  const [mcpTransport, setMcpTransport] = useState<'demo' | 'http' | 'stdio'>('demo')
  const [mcpMessage, setMcpMessage] = useState('Local demo context')
  const [agentRunning, setAgentRunning] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('appearance')
  const [libraryOpen, setLibraryOpen] = useState(true)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [nativeFullscreen, setNativeFullscreen] = useState(false)
  const [versions, setVersions] = useState<PipelineVersion[]>([])
  const [projectTitle, setProjectTitle] = useState('Untitled pipeline')
  const [activity, setActivity] = useState('Empty workspace · add a card or load an example from Settings')
  const { active, activeAiSource, aiStatus, chatGPTStatus, configureChatGPT, connectChatGPT, disconnectChatGPT, refreshAiModelCatalog, saveAiConnection, selectActiveAgentSource, testAiConnection } = useAiConnections(setActivity)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => window.localStorage.getItem('data-lab-theme') === 'dark' ? 'dark' : 'light')
  const agentRunId = useRef(0)
  const flowInstance = useRef<{ screenToFlowPosition(point: { x: number; y: number }): { x: number; y: number } } | null>(null)
  const issues = useMemo(() => validatePipeline(nodes, edges), [nodes, edges])
  const selected = nodes.find((node) => node.id === selectedId)
  const errors = issues.filter((issue) => issue.severity === 'error')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('data-lab-theme', theme)
  }, [theme])

  useEffect(() => {
    window.localStorage.removeItem('data-lab-versions')
  }, [])

  useEffect(() => {
    if (!window.dataLab) return
    void window.dataLab.getDataHubMcpStatus().then((status) => {
      setConnectionMode(status.mode)
      setMcpTransport(status.transport)
      setMcpMessage(status.message)
    }).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!window.dataLab) return
    void window.dataLab.loadWorkspace().then((saved) => {
      if (!saved || !Array.isArray(saved.nodes) || !Array.isArray(saved.edges) || saved.nodes.length === 0) return
      setNodes(saved.nodes)
      setEdges(saved.edges)
      setVersions(Array.isArray(saved.versions) ? saved.versions : [])
      setProjectTitle(typeof saved.projectTitle === 'string' ? saved.projectTitle : 'Saved pipeline')
      setSelectedId(saved.nodes[0]?.id ?? '')
      setActivity(`SQLite workspace restored · ${saved.nodes.length} cards · ${saved.versions?.length ?? 0} versions`)
    }).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!window.dataLab) return
    void window.dataLab.getWindowState().then((state) => setNativeFullscreen(state.fullscreen)).catch(() => undefined)
    return window.dataLab.onWindowStateChanged((state) => setNativeFullscreen(state.fullscreen))
  }, [])

  useEffect(() => {
    if (!window.dataLab) return
    return window.dataLab.onHumanReviewOpened(({ versionId }) => {
      setRequestedVersionId(versionId)
      setSettingsSection('versions')
      setSettingsOpen(true)
    })
  }, [])

  const onConnect = (connection: Connection) => {
    if (!connection.source || !connection.target) return
    setEdges((current) => addEdge({ ...connection, id: `e-${connection.source}-${connection.target}-${Date.now()}`, type: 'elastic' }, current))
    setActivity('Manual lineage connection added · run validation before publishing')
  }

  const addCard = (kind: CardKind, position?: { x: number; y: number }) => {
    const created = newCard(kind, nodes.length)
    const node = position ? { ...created, position } : created
    setNodes((current) => [...current, node])
    setSelectedId(node.id)
    setActivity(`${cardLabels[kind]} card added as draft${position ? ' at the drop position' : ''}`)
  }

  const dropLibraryCard = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const rawKind = event.dataTransfer.getData('application/data-lab-card')
    if (!rawKind || !(rawKind in cardLabels) || !flowInstance.current) return
    const point = flowInstance.current.screenToFlowPosition({ x: event.clientX, y: event.clientY })
    addCard(rawKind as CardKind, { x: point.x - 116, y: point.y - 66 })
  }

  const updateSelected = (patch: Partial<PipelineNode['data']>) => {
    setNodes((current) => current.map((node) => node.id === selectedId ? { ...node, data: { ...node.data, ...patch } } : node))
  }

  const recordPendingReview = (nextProposal: AgentProposal) => {
    const preview = applyProposal(nodes, edges, nextProposal)
    const previewIssues = validatePipeline(preview.nodes, preview.edges)
    const version = createPipelineVersion(preview.nodes, preview.edges, `Review · ${nextProposal.title}`, 'agent', previewIssues)
    version.status = 'pending-review'
    version.description = `Upgrade: ${nextProposal.summary} Why: ${nextProposal.rationale}`
    setPendingVersionId(version.id)
    setVersions((current) => {
      const nextVersions = appendPipelineVersion(current, version)
      if (window.dataLab) void window.dataLab.saveWorkspace({ projectTitle, nodes, edges, versions: nextVersions })
      return nextVersions
    })
    return version.id
  }

  const auditWithAgent = async (agentRequest = 'Analyze this pipeline and propose the smallest evidence-backed improvement.') => {
    setContextMenu(undefined)
    setProposal(undefined)
    if (nodes.length === 0) {
      setActivity('Agent flow blocked · add a Data Source card before running the pipeline')
      return
    }
    if (!window.dataLab) {
      setActivity('AI provider unavailable in web preview · launch the Electron application')
      return
    }
    const [currentAiStatus, currentChatGPT] = await Promise.all([window.dataLab.getAiStatus().catch(() => disconnectedAiStatus), window.dataLab.getChatGPTStatus().catch(() => disconnectedChatGPTStatus)])
    const activeConnected = activeAiSource === 'chatgpt' ? currentChatGPT.connected : currentAiStatus.providers[activeAiSource].connected
    if (!activeConnected) {
      setSettingsSection('ai')
      setSettingsOpen(true)
      setActivity(`${active.label} is the active agent source but is not connected · open Settings → AI connection`)
      return
    }

    setAgentRunning(true)
    const runId = ++agentRunId.current
    setActivity('Agent reading the current graph, atomic findings and version history…')
    const source = nodes.find((node) => node.data.kind === 'source' && node.data.datahubUrn)
    let datahubEvidence: string[] = []
    try {
      if (source?.data.datahubUrn) {
        setActivity('Agent reading trusted schema and lineage through DataHub MCP…')
        const audit = await window.dataLab.auditDataHubWithMcp(source.data.datahubUrn)
        if (agentRunId.current !== runId) return
        const successfulReads = audit.reads.filter((read) => read.status === 'ok').length
        datahubEvidence = audit.reads.map((read) => `${read.name} · ${read.status} · ${read.summary}`)
        setConnectionMode('connected')
        setMcpTransport(audit.transport)
        setMcpMessage(`MCP ${audit.transport} · ${successfulReads}/${audit.reads.length} reads completed`)
      } else {
        datahubEvidence = ['No DataHub URN is bound to a Data Source card. Treat evidence as incomplete.']
      }

      const activeModel = activeAiSource === 'chatgpt' ? currentChatGPT.selectedModel ?? 'ChatGPT' : currentAiStatus.providers[activeAiSource].model
      setActivity(`${activeModel} is analyzing the graph and previous versions…`)
      const requestPayload = buildPipelineAgentRequest({ datahubEvidence, edges, issues, nodes, objective: agentRequest, versions })
      const response = activeAiSource === 'chatgpt' ? await window.dataLab.runChatGPTProposal(requestPayload) : await window.dataLab.runAiProposal(requestPayload)
      if (agentRunId.current !== runId) return
      const nextProposal = materializeAiProposal(response, nodes, edges)
      setProposal(nextProposal)
      setInspectorOpen(true)
      const reviewVersionId = nextProposal.requiresHumanReview ? recordPendingReview(nextProposal) : undefined
      setActivity(`${response.model} proposed ${nextProposal.addedNodes.length + nextProposal.updatedNodes.length + nextProposal.addedEdges.length + nextProposal.removedEdgeIds.length} reviewed change(s) · graph unchanged`)
      if (nextProposal.requiresHumanReview) void window.dataLab.notifyHumanReview({ cardLabel: 'Agent Decision', reason: nextProposal.summary, versionId: reviewVersionId })
    } catch (error) {
      if (agentRunId.current !== runId) return
      setActivity(`Agent run failed · ${error instanceof Error ? error.message : 'unknown provider error'} · graph unchanged`)
    } finally { if (agentRunId.current === runId) setAgentRunning(false) }
  }

  const reworkSelectedWithAgent = async () => {
    if (!selected) return
    setContextMenu(undefined)
    if (!window.dataLab) {
      setActivity('AI provider unavailable in web preview · launch the Electron application')
      return
    }
    const [status, currentChatGPT] = await Promise.all([window.dataLab.getAiStatus().catch(() => disconnectedAiStatus), window.dataLab.getChatGPTStatus().catch(() => disconnectedChatGPTStatus)])
    const activeConnected = activeAiSource === 'chatgpt' ? currentChatGPT.connected : status.providers[activeAiSource].connected
    if (!activeConnected) {
      setSettingsSection('ai')
      setSettingsOpen(true)
      setActivity(`${active.label} is not connected · no card action was generated`)
      return
    }
    setAgentRunning(true)
    const runId = ++agentRunId.current
    const activeModel = activeAiSource === 'chatgpt' ? currentChatGPT.selectedModel ?? 'ChatGPT' : status.providers[activeAiSource].model
    setActivity(`${activeModel} is reviewing ${selected.data.label} with version context…`)
    try {
      const requestPayload = buildCardReworkRequest({ edges, focusNodeId: selected.id, issues, nodes, versions })
      const response = activeAiSource === 'chatgpt' ? await window.dataLab.runChatGPTProposal(requestPayload) : await window.dataLab.runAiProposal(requestPayload)
      if (agentRunId.current !== runId) return
      const nextProposal = materializeAiProposal(response, nodes, edges)
      setProposal(nextProposal)
      setInspectorOpen(true)
      const reviewVersionId = nextProposal.requiresHumanReview ? recordPendingReview(nextProposal) : undefined
      setActivity(`${response.model} proposed a card-level diff${nextProposal.requiresHumanReview ? ' · human review required' : ' · agent is confident'}`)
      if (nextProposal.requiresHumanReview) void window.dataLab.notifyHumanReview({ cardLabel: selected.data.label, reason: nextProposal.summary, versionId: reviewVersionId })
    } catch (error) {
      if (agentRunId.current !== runId) return
      setActivity(`Card analysis failed · ${error instanceof Error ? error.message : 'unknown provider error'} · card unchanged`)
    } finally { if (agentRunId.current === runId) setAgentRunning(false) }
  }

  const stopAgent = () => {
    agentRunId.current += 1
    setAgentRunning(false)
    setActivity('Emergency stop · current agent run cancelled · active branch unchanged')
    if (window.dataLab) void window.dataLab.cancelAiProposal()
    if (window.dataLab) void window.dataLab.cancelChatGPTProposal()
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
    setVersions((current) => {
      const nextVersions = commitPendingVersion(current, pendingVersionId, version)
      if (window.dataLab) void window.dataLab.saveWorkspace({ projectTitle, nodes: layouted, edges: next.edges, versions: nextVersions })
      return nextVersions
    })
    setSelectedId(proposal.updatedNodes[0]?.nodeId ?? proposal.addedNodes[0]?.id ?? '')
    setProposal(undefined)
    setPendingVersionId(undefined)
    setActivity('Change approved · atomic checks passed · revision committed')
  }

  const rejectProposal = () => {
    if (pendingVersionId) setVersions((current) => {
      const nextVersions = rejectPendingVersion(current, pendingVersionId)
      if (window.dataLab) void window.dataLab.saveWorkspace({ projectTitle, nodes, edges, versions: nextVersions })
      return nextVersions
    })
    setPendingVersionId(undefined)
    setProposal(undefined)
    setActivity('Agent proposal rejected · revision marked rejected · active branch unchanged')
  }

  const saveManualVersion = () => {
    const currentIssues = validatePipeline(nodes, edges)
    const blocking = currentIssues.filter((issue) => issue.severity === 'error')
    if (blocking.length) {
      setActivity(`Version not saved · fix ${blocking.length} blocking atomic check${blocking.length === 1 ? '' : 's'} first`)
      return
    }
    const version = createPipelineVersion(nodes, edges, `Manual checkpoint ${versions.length + 1}`, 'manual', currentIssues)
    setVersions((current) => {
      const nextVersions = appendPipelineVersion(current, version)
      if (window.dataLab) void window.dataLab.saveWorkspace({ projectTitle, nodes, edges, versions: nextVersions })
      return nextVersions
    })
    setActivity(`Version saved · ${version.label}`)
  }

  const restoreVersion = (versionId: string) => {
    const version = versions.find((candidate) => candidate.id === versionId)
    if (!version || (version.status ?? 'committed') !== 'committed') return
    const restored = restorePipelineVersion(version)
    setNodes(restored.nodes)
    setEdges(restored.edges)
    setProposal(undefined)
    setPendingVersionId(undefined)
    setSelectedId(restored.nodes[0]?.id ?? '')
    setActivity(`Version restored · ${version.label}`)
    if (window.dataLab) void window.dataLab.saveWorkspace({ projectTitle, nodes: restored.nodes, edges: restored.edges, versions })
  }

  const loadPreset = (presetId: PipelinePresetId) => {
    const preset = loadPipelinePreset(presetId)
    setNodes(preset.nodes)
    setEdges(preset.edges)
    setProjectTitle(preset.title)
    setSelectedId(preset.nodes[0]?.id ?? '')
    setProposal(undefined)
    setPendingVersionId(undefined)
    setActivity(presetId === 'empty' ? 'Empty workspace ready' : `${preset.title} example loaded · ${preset.nodes.length} cards · not saved`)
    setSettingsOpen(false)
  }

  const syncDataHub = async () => {
    if (!window.dataLab) {
      setActivity('Web demo mode · launch Electron with DATAHUB_GMS_URL to connect DataHub')
      return
    }
    try {
      const status = await window.dataLab.connectDataHubMcp()
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

  return <main className={`app-shell ${platformClass}${nativeFullscreen ? ' native-fullscreen' : ''}`}>
    <AppHeader agentRunning={agentRunning} cardCount={nodes.length} onOpenSettings={() => { setSettingsSection('appearance'); setSettingsOpen(true) }} onRun={() => void auditWithAgent()} projectTitle={projectTitle} />

    {settingsOpen && <SettingsModal
      activeAiSource={activeAiSource}
      aiStatus={aiStatus}
      chatGPTStatus={chatGPTStatus}
      connectionMode={connectionMode}
      errorCount={errors.length}
      findingCount={issues.length}
      initialSection={settingsSection}
      mcpMessage={mcpMessage}
      mcpTransport={mcpTransport}
      onAutoLayout={() => { setNodes((current) => layoutPipeline(current, edges)); setActivity('Topology-aware XY layout applied · Split branches preserved') }}
      onClose={() => setSettingsOpen(false)}
      onConfigureChatGPT={configureChatGPT}
      onConnectChatGPT={connectChatGPT}
      onDisconnectChatGPT={disconnectChatGPT}
      onLoadPreset={loadPreset}
      onRefreshAiModelCatalog={refreshAiModelCatalog}
      onSaveAiSettings={saveAiConnection}
      onSelectActiveAiSource={selectActiveAgentSource}
      onSyncDataHub={syncDataHub}
      onTestAiConnection={testAiConnection}
      onThemeChange={setTheme}
      onValidate={() => setActivity(`${errors.length} blocking issue${errors.length === 1 ? '' : 's'} · ${issues.length} total findings`)}
      onRestoreVersion={restoreVersion}
      onSaveVersion={saveManualVersion}
      selectedVersionId={requestedVersionId}
      theme={theme}
      versions={versions.map(({ id, label, createdAt, origin, blockingIssues, status, description }) => ({ id, label, createdAt, origin, blockingIssues, status, description }))}
    />}

    <section className={`workspace${libraryOpen ? '' : ' library-collapsed'}${inspectorOpen ? '' : ' inspector-collapsed'}`}>
      <div aria-hidden={!libraryOpen} className={`library-panel-shell ${libraryOpen ? '' : 'is-closed'}`}><CardLibraryView onAddCard={addCard} onClose={() => setLibraryOpen(false)} /></div>

      <PipelineCanvasView
        contextMenu={contextMenu}
        edges={edges}
        inspectorOpen={inspectorOpen}
        libraryOpen={libraryOpen}
        nodes={nodes}
        onConnect={onConnect}
        onDeleteCard={deleteCard}
        onDrop={dropLibraryCard}
        onEdgesChange={onEdgesChange}
        onEditCard={(nodeId, label) => { setSelectedId(nodeId); setContextMenu(undefined); setActivity(`${label} opened in the inspector`) }}
        onFlowInit={(instance) => { flowInstance.current = instance }}
        onNodeContextMenu={(event, node) => { event.preventDefault(); setSelectedId(node.id); setContextMenu({ nodeId: node.id, label: node.data.label, x: event.clientX, y: event.clientY }) }}
        onNodesChange={onNodesChange}
        onOpenInspector={() => setInspectorOpen(true)}
        onOpenLibrary={() => setLibraryOpen(true)}
        onPaneClick={() => setContextMenu(undefined)}
        onSelectNode={setSelectedId}
        theme={theme}
      />

      <aside aria-hidden={!inspectorOpen} className={`inspector-panel ${inspectorOpen ? '' : 'is-closed'}`}>
        {proposal ? <ReviewPanel proposal={proposal} onApply={approveProposal} onClose={() => setInspectorOpen(false)} onDiscard={rejectProposal} /> : <CardInspectorView errorCount={errors.length} issues={issues} onAgentRework={reworkSelectedWithAgent} onClose={() => setInspectorOpen(false)} onSelectNode={setSelectedId} onUpdate={updateSelected} selected={selected} />}
      </aside>
    </section>

    <AppFooter activity={activity} agentRunning={agentRunning} connected={active.connected} context={{ cards: nodes.length, edges: edges.length, versions: versions.length, mcp: connectionMode === 'connected' ? `MCP ${mcpTransport}` : 'MCP not connected', model: `${active.label} · ${active.model}` }} onOpenAiSettings={() => { setSettingsSection('ai'); setSettingsOpen(true) }} onStop={stopAgent} onSubmit={(prompt) => void auditWithAgent(prompt)} />
  </main>
}
