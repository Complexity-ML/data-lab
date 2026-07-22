import { addEdge, Background, BackgroundVariant, Controls, MarkerType, MiniMap, ReactFlow, useEdgesState, useNodesState, type Connection, type EdgeTypes, type NodeTypes } from '@xyflow/react'
import { Boxes, PanelLeftOpen, PanelRightOpen, Pencil, Settings, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { PipelineCard } from './components/PipelineCard'
import { ReviewPanel } from './components/ReviewPanel'
import { ActionButton } from './components/shared/ActionButton'
import { AgentPrompt } from './components/shared/AgentPrompt'
import { ElasticEdge } from './components/shared/ElasticEdge'
import { SettingsModal } from './components/shared/SettingsModal'
import type { SettingsSection } from './components/shared/SettingsModal'
import { compactGraph, materializeAiProposal, type AiSettings, type AiStatus, type ChatGPTSessionStatus } from './domain/ai'
import { layoutPipeline } from './domain/layout'
import { applyProposal, cardLabels, initialEdges, initialNodes, loadPipelinePreset, newCard, type AgentProposal, type CardKind, type PipelineNode, type PipelinePresetId } from './domain/pipeline'
import { appendPipelineVersion, createPipelineVersion, restorePipelineVersion, type PipelineVersion } from './domain/versioning'
import { validatePipeline } from './validation'
import { CardInspectorView } from './views/CardInspectorView'
import { CardLibraryView } from './views/CardLibraryView'

const nodeTypes: NodeTypes = { pipeline: PipelineCard }
const edgeTypes: EdgeTypes = { elastic: ElasticEdge }
const miniMapColors: Record<CardKind, string> = {
  source: '#bfdbfe', analysis: '#c7d2fe', split: '#ddd6fe', decision: '#e9d5ff',
  transform: '#fef3c7', review: '#fecdd3', validation: '#bbf7d0', output: '#bae6fd',
}
const defaultAiStatus: AiStatus = { connected: false, credentialSource: 'none', selectedProvider: 'openai', providers: { openai: { connected: false, credentialSource: 'none', model: 'gpt-5.6-terra' }, anthropic: { connected: false, credentialSource: 'none', model: 'claude-opus-4-8' }, moonshot: { connected: false, credentialSource: 'none', model: 'kimi-k3' } }, encryptionAvailable: false, settings: { provider: 'openai', model: 'gpt-5.6-terra', reasoningEffort: 'medium', verbosity: 'low', serviceTier: 'auto' } }
const defaultChatGPTStatus: ChatGPTSessionStatus = { available: true, connected: false }

export default function App() {
  const platformClass = window.dataLab?.platform ? `platform-${window.dataLab.platform}` : 'platform-web'
  const [nodes, setNodes, onNodesChange] = useNodesState<PipelineNode>(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedId, setSelectedId] = useState('')
  const [proposal, setProposal] = useState<AgentProposal>()
  const [pendingVersionId, setPendingVersionId] = useState<string>()
  const [contextMenu, setContextMenu] = useState<{ nodeId: string; label: string; x: number; y: number }>()
  const [connectionMode, setConnectionMode] = useState<'demo' | 'connected'>('demo')
  const [mcpTransport, setMcpTransport] = useState<'demo' | 'http' | 'stdio'>('demo')
  const [mcpMessage, setMcpMessage] = useState('Local demo context')
  const [agentRunning, setAgentRunning] = useState(false)
  const [aiStatus, setAiStatus] = useState<AiStatus>(defaultAiStatus)
  const [chatGPTStatus, setChatGPTStatus] = useState<ChatGPTSessionStatus>(defaultChatGPTStatus)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('appearance')
  const [libraryOpen, setLibraryOpen] = useState(true)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [nativeFullscreen, setNativeFullscreen] = useState(false)
  const [versions, setVersions] = useState<PipelineVersion[]>([])
  const [projectTitle, setProjectTitle] = useState('Untitled pipeline')
  const [activity, setActivity] = useState('Empty workspace · add a card or load an example from Settings')
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
    void window.dataLab.getAiStatus().then(setAiStatus).catch(() => undefined)
    void window.dataLab.getChatGPTStatus().then(setChatGPTStatus).catch(() => undefined)
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
    return window.dataLab.onHumanReviewOpened(() => {
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
    const [currentAiStatus, currentChatGPT] = await Promise.all([window.dataLab.getAiStatus().catch(() => defaultAiStatus), window.dataLab.getChatGPTStatus().catch(() => defaultChatGPTStatus)])
    setAiStatus(currentAiStatus)
    setChatGPTStatus(currentChatGPT)
    if (!currentAiStatus.connected && !currentChatGPT.connected) {
      setSettingsSection('ai')
      setSettingsOpen(true)
      setActivity('AI provider not connected · configure OpenAI in Settings → AI connection')
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

      const activeModel = currentChatGPT.connected ? currentChatGPT.selectedModel ?? 'ChatGPT' : currentAiStatus.settings.model
      setActivity(`${activeModel} is analyzing the graph and previous versions…`)
      const requestPayload = {
        mode: 'pipeline-rewrite',
        objective: agentRequest,
        agentDecisionPolicy: 'Agent Decision may add, edit and reconnect cards. Add a Human Review card only when confidence is insufficient or impact is sensitive.',
        graph: compactGraph(nodes, edges),
        validationFindings: issues.map(({ id, severity, title, detail, nodeId }) => ({ id, severity, title, detail, nodeId })),
        datahubEvidence,
        recentVersions: versions.slice(-5).map((version) => ({
          label: version.label,
          origin: version.origin,
          createdAt: version.createdAt,
          blockingIssues: version.blockingIssues,
          status: version.status ?? 'committed',
          description: version.description,
          graph: compactGraph(version.nodes, version.edges),
        })),
        guardrails: ['Return a reviewable diff only', 'Never claim execution', 'Prefer an incremental change over rebuilding without evidence', 'Use Human Review for uncertainty or sensitive/schema/downstream changes'],
      }
      const response = currentChatGPT.connected ? await window.dataLab.runChatGPTProposal(requestPayload) : await window.dataLab.runAiProposal(requestPayload)
      if (agentRunId.current !== runId) return
      const nextProposal = materializeAiProposal(response, nodes, edges)
      setProposal(nextProposal)
      setInspectorOpen(true)
      if (nextProposal.requiresHumanReview) recordPendingReview(nextProposal)
      setActivity(`${response.model} proposed ${nextProposal.addedNodes.length + nextProposal.updatedNodes.length + nextProposal.addedEdges.length + nextProposal.removedEdgeIds.length} reviewed change(s) · graph unchanged`)
      if (nextProposal.requiresHumanReview) void window.dataLab.notifyHumanReview({ cardLabel: 'Agent Decision', reason: nextProposal.summary })
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
    const [status, currentChatGPT] = await Promise.all([window.dataLab.getAiStatus().catch(() => defaultAiStatus), window.dataLab.getChatGPTStatus().catch(() => defaultChatGPTStatus)])
    setAiStatus(status)
    setChatGPTStatus(currentChatGPT)
    if (!status.connected && !currentChatGPT.connected) {
      setSettingsSection('ai')
      setSettingsOpen(true)
      setActivity('AI provider not connected · no static card action was generated')
      return
    }
    setAgentRunning(true)
    const runId = ++agentRunId.current
    const activeModel = currentChatGPT.connected ? currentChatGPT.selectedModel ?? 'ChatGPT' : status.settings.model
    setActivity(`${activeModel} is reviewing ${selected.data.label} with version context…`)
    try {
      const requestPayload = {
        mode: 'card-rework',
        focusNodeId: selected.id,
        objective: 'Improve the selected card and reconnect the schema only when evidence supports it. Add Human Review if uncertain.',
        graph: compactGraph(nodes, edges),
        validationFindings: issues,
        recentVersions: versions.slice(-5).map((version) => ({ label: version.label, origin: version.origin, status: version.status ?? 'committed', description: version.description, blockingIssues: version.blockingIssues, graph: compactGraph(version.nodes, version.edges) })),
      }
      const response = currentChatGPT.connected ? await window.dataLab.runChatGPTProposal(requestPayload) : await window.dataLab.runAiProposal(requestPayload)
      if (agentRunId.current !== runId) return
      const nextProposal = materializeAiProposal(response, nodes, edges)
      setProposal(nextProposal)
      setInspectorOpen(true)
      if (nextProposal.requiresHumanReview) recordPendingReview(nextProposal)
      setActivity(`${response.model} proposed a card-level diff${nextProposal.requiresHumanReview ? ' · human review required' : ' · agent is confident'}`)
      if (nextProposal.requiresHumanReview) void window.dataLab.notifyHumanReview({ cardLabel: selected.data.label, reason: nextProposal.summary })
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
      const nextVersions = pendingVersionId
        ? current.map((candidate) => candidate.id === pendingVersionId ? { ...version, id: candidate.id, createdAt: candidate.createdAt, description: candidate.description, status: 'committed' as const } : candidate)
        : appendPipelineVersion(current, version)
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
      const nextVersions = current.map((candidate) => candidate.id === pendingVersionId ? { ...candidate, status: 'rejected' as const } : candidate)
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

  const saveAiConnection = async (settings: Partial<AiSettings> & { apiKey?: string; clearKey?: boolean }) => {
    if (!window.dataLab) throw new Error('AI settings require the Electron application')
    const status = await window.dataLab.saveAiSettings(settings)
    setAiStatus(status)
    setActivity(status.connected ? `${status.settings.model} connection settings saved` : 'AI settings saved · API key still required')
    return status
  }

  const testAiConnection = async () => {
    if (!window.dataLab) throw new Error('AI connection requires the Electron application')
    const status = await window.dataLab.testAiConnection()
    setAiStatus(status)
    setActivity(`OpenAI connected · ${status.settings.model} ready`)
  }

  const connectChatGPT = async () => {
    if (!window.dataLab) throw new Error('ChatGPT connection requires Electron')
    const status = await window.dataLab.connectChatGPT()
    setChatGPTStatus(status)
    setActivity(status.connected ? `ChatGPT connected · ${status.selectedModel ?? 'default model'}` : 'ChatGPT sign-in was not completed')
  }

  const disconnectChatGPT = async () => {
    if (!window.dataLab) return
    setChatGPTStatus(await window.dataLab.disconnectChatGPT())
    setActivity('ChatGPT account disconnected from DATA LAB')
  }

  const configureChatGPT = async (configuration: { model: string; effort: string }) => {
    if (!window.dataLab) return
    setChatGPTStatus(await window.dataLab.configureChatGPT(configuration))
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
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><Boxes size={18} /></span><div><strong>DATA LAB</strong><small>Context-aware pipeline studio</small></div></div>
      <div className="project-title"><span>{projectTitle}</span><small>{nodes.length ? 'Unsaved draft' : 'Empty canvas'}</small></div>
      <div className="topbar-actions">
        <ActionButton disabled={agentRunning || nodes.length === 0} icon={<Sparkles size={15} />} onClick={() => void auditWithAgent()} title={nodes.length === 0 ? 'Add a Data Source card before running the agent flow' : 'Run the agent flow'} variant="primary">{agentRunning ? 'Agent working…' : 'Run agent flow'}</ActionButton>
        <button aria-label="Open settings" className="settings-trigger" onClick={() => { setSettingsSection('appearance'); setSettingsOpen(true) }} title="Settings" type="button"><Settings size={17} /></button>
      </div>
    </header>

    {settingsOpen && <SettingsModal
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
      onSaveAiSettings={saveAiConnection}
      onSyncDataHub={syncDataHub}
      onTestAiConnection={testAiConnection}
      onThemeChange={setTheme}
      onValidate={() => setActivity(`${errors.length} blocking issue${errors.length === 1 ? '' : 's'} · ${issues.length} total findings`)}
      onRestoreVersion={restoreVersion}
      onSaveVersion={saveManualVersion}
      theme={theme}
      versions={versions.map(({ id, label, createdAt, origin, blockingIssues, status, description }) => ({ id, label, createdAt, origin, blockingIssues, status, description }))}
    />}

    <section className={`workspace${libraryOpen ? '' : ' library-collapsed'}${inspectorOpen ? '' : ' inspector-collapsed'}`}>
      <div aria-hidden={!libraryOpen} className={`library-panel-shell ${libraryOpen ? '' : 'is-closed'}`}><CardLibraryView onAddCard={addCard} onClose={() => setLibraryOpen(false)} /></div>

      <section className="canvas-panel">
        {!libraryOpen && <button aria-label="Open card library" className="library-open" onClick={() => setLibraryOpen(true)} title="Open card library" type="button"><PanelLeftOpen size={16} /><span>Cards</span></button>}
        {!inspectorOpen && <button aria-label="Open inspector" className="inspector-open" onClick={() => setInspectorOpen(true)} title="Open inspector" type="button"><PanelRightOpen size={16} /><span>Inspector</span></button>}
        <div className="canvas-toolbar"><div><span className="live-dot" />Live validation</div><div>{nodes.length} cards <span>·</span> {edges.length} edges</div></div>
        <ReactFlow
          nodes={nodes}
          edges={edges.map((edge) => ({ ...edge, type: 'elastic', markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' }, style: { stroke: '#94a3b8', strokeWidth: 1.6 } }))}
          edgeTypes={edgeTypes}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' }}
          onDrop={dropLibraryCard}
          onInit={(instance) => { flowInstance.current = instance }}
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
          nodeDragThreshold={1}
          snapToGrid={false}
          defaultEdgeOptions={{ type: 'elastic' }}
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
        {proposal ? <ReviewPanel proposal={proposal} onApply={approveProposal} onClose={() => setInspectorOpen(false)} onDiscard={rejectProposal} /> : <CardInspectorView errorCount={errors.length} issues={issues} onAgentRework={reworkSelectedWithAgent} onClose={() => setInspectorOpen(false)} onSelectNode={setSelectedId} onUpdate={updateSelected} selected={selected} />}
      </aside>
    </section>

    <footer className="statusbar">
      <span className="status-activity">{activity}</span>
      <AgentPrompt
        activity={activity}
        busy={agentRunning}
        connected={aiStatus.connected || chatGPTStatus.connected}
        context={{ cards: nodes.length, edges: edges.length, versions: versions.length, mcp: connectionMode === 'connected' ? `MCP ${mcpTransport}` : 'MCP not connected', model: chatGPTStatus.connected ? chatGPTStatus.selectedModel ?? 'ChatGPT' : aiStatus.settings.model }}
        onOpenSettings={() => { setSettingsSection('ai'); setSettingsOpen(true) }}
        onStop={stopAgent}
        onSubmit={(prompt) => void auditWithAgent(prompt)}
      />
      <span className="status-review">Human review <strong>notified</strong> when Agent Decision requests it</span>
    </footer>
  </main>
}
