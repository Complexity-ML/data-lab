import { useEdgesState, useNodesState } from '@xyflow/react'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { AppFooter } from './components/AppFooter'
import { AppHeader } from './components/AppHeader'
import { ProposalReviewModal } from './components/ProposalReviewModal'
import { KeyboardShortcutsModal } from './components/shared/KeyboardShortcutsModal'
import type { SettingsSection } from './components/shared/SettingsModal'
import { WorkspaceRecoveryModal } from './components/shared/WorkspaceRecoveryModal'
import type { AtomicPipelineRun } from './domain/atomic-execution'
import { recordDiagnostic } from './domain/diagnostics'
import { layoutPipeline } from './domain/layout'
import { initialEdges, initialNodes, type AgentProposal, type PipelineNode } from './domain/pipeline'
import { useLanguage } from './i18n'
import { useAiConnections } from './hooks/useAiConnections'
import { useAppTheme } from './hooks/useAppTheme'
import { useAppUpdates } from './hooks/useAppUpdates'
import { useAtomicReviewResolver } from './hooks/useAtomicReviewResolver'
import { useAutonomousPlayer } from './hooks/useAutonomousPlayer'
import { useAutonomyPolicy } from './hooks/useAutonomyPolicy'
import { useDataHubConnection } from './hooks/useDataHubConnection'
import { useDiagnosticsActions } from './hooks/useDiagnosticsActions'
import { useGraphHistory } from './hooks/useGraphHistory'
import { useIncidentEvents } from './hooks/useIncidentEvents'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { usePipelineInteractions } from './hooks/usePipelineInteractions'
import { usePipelineVersions } from './hooks/usePipelineVersions'
import { useReviewAssistant } from './hooks/useReviewAssistant'
import { useSelectedCardRework } from './hooks/useSelectedCardRework'
import { useWorkspacePersistence } from './hooks/useWorkspacePersistence'
import { validatePipeline } from './validation'
import { AgentActionsView, type AgentActionLog } from './views/AgentActionsView'
import { CardInspectorView } from './views/CardInspectorView'
import { CardLibraryView } from './views/CardLibraryView'
import { IncidentReportsView } from './views/IncidentReportsView'
import { LiveActivityView } from './views/LiveActivityView'
import { PipelineCanvasView } from './views/PipelineCanvasView'

const SettingsModal = lazy(() => import('./components/shared/SettingsModal').then((module) => ({ default: module.SettingsModal })))

export default function App() {
  const { language } = useLanguage()
  const platformClass = window.dataLab?.platform ? `platform-${window.dataLab.platform}` : 'platform-web'
  const [nodes, setNodes, onNodesChange] = useNodesState<PipelineNode>(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedId, setSelectedId] = useState('')
  const [proposal, setProposal] = useState<AgentProposal>()
  const [proposalReviewOpen, setProposalReviewOpen] = useState(false)
  const [requestedVersionId, setRequestedVersionId] = useState<string>()
  const [contextMenu, setContextMenu] = useState<{ nodeId: string; label: string; x: number; y: number }>()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('appearance')
  const [libraryOpen, setLibraryOpen] = useState(true)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [leftOperationsPanel, setLeftOperationsPanel] = useState<'actions' | 'logs'>()
  const [reportsOpen, setReportsOpen] = useState(false)
  const [nativeFullscreen, setNativeFullscreen] = useState(false)
  const [projectTitle, setProjectTitle] = useState('Untitled pipeline')
  const [activity, setActivity] = useState('Empty workspace · add a card or load an example from Settings')
  const [actionHistory, setActionHistory] = useState<AgentActionLog[]>([])
  const activeAtomicRun = useRef<AtomicPipelineRun | undefined>(undefined)
  const agentRunId = useRef(0)
  const resumePlayerAfterReview = useRef(false)
  const resolveAtomicReview = useAtomicReviewResolver(activeAtomicRun)

  const appUpdates = useAppUpdates(setActivity)
  const ai = useAiConnections(setActivity)
  const dataHub = useDataHubConnection(setActivity)
  const pipelineVersions = usePipelineVersions({
    edges,
    nodes,
    proposal,
    resolveApprovedExecution: (candidateNodes, candidateEdges) => resolveAtomicReview(candidateNodes, candidateEdges, 'approved'),
    resolveRejectedExecution: (candidateNodes, candidateEdges) => resolveAtomicReview(candidateNodes, candidateEdges, 'rejected'),
    setActivity,
    setEdges,
    setNodes,
    setProjectTitle,
    setProposal,
    setSelectedId,
  })
  const workspace = useWorkspacePersistence({
    edges,
    inspectorOpen,
    libraryOpen,
    nodes,
    projectTitle,
    setActivity,
    setEdges,
    setInspectorOpen,
    setLibraryOpen,
    setNodes,
    setProjectTitle,
    setSelectedId,
    setVersions: pipelineVersions.setVersions,
    versions: pipelineVersions.versions,
  })
  const incidents = useIncidentEvents(workspace.activeWorkspaceId)
  const diagnostics = useDiagnosticsActions(incidents.setEvents)
  const graphHistory = useGraphHistory({ edges, nodes, setActivity, setEdges, setNodes })
  const [theme, setTheme] = useAppTheme()
  const [autonomyPolicy, setAutonomyPolicy] = useAutonomyPolicy()
  const issues = useMemo(() => validatePipeline(nodes, edges), [nodes, edges])
  const errors = issues.filter((issue) => issue.severity === 'error')
  const selected = nodes.find((node) => node.id === selectedId)
  const pipeline = usePipelineInteractions({
    edges,
    inspectorOpen,
    invalidateDataHubContext: dataHub.invalidateContext,
    libraryOpen,
    nodes,
    persistImportedWorkspace: workspace.persistImportedWorkspace,
    projectTitle,
    selected,
    selectedId,
    setActivity,
    setContextMenu,
    setEdges,
    setNodes,
    setProjectTitle,
    setProposal,
    setSelectedId,
    setVersions: pipelineVersions.setVersions,
    versions: pipelineVersions.versions,
  })
  const reviewAssistant = useReviewAssistant({
    active: ai.active,
    activeAiSource: ai.activeAiSource,
    edges,
    incidentSummaries: incidents.summaries,
    issues,
    language,
    nodes,
    openAiSettings: () => { setSettingsSection('ai'); setSettingsOpen(true) },
    proposal,
    setActivity,
    versions: pipelineVersions.versions,
  })
  const player = useAutonomousPlayer({
    active: ai.active,
    activeAiSource: ai.activeAiSource,
    activeAtomicRun,
    agentRunId,
    approveProposal: pipelineVersions.approveProposal,
    autonomyPolicy,
    commitAutonomousProposal: pipelineVersions.commitAutonomousProposal,
    connectionMode: dataHub.catalogConnectionMode,
    edges,
    fitCommittedGraph: pipeline.fitCommittedGraph,
    incidentSummaries: incidents.summaries,
    inspectDataHubAsset: dataHub.inspectAsset,
    inspectorOpen,
    issues,
    language,
    libraryOpen,
    logIncident: incidents.record,
    nodes,
    pendingVersionId: pipelineVersions.pendingVersionId,
    projectTitle,
    proposal,
    recordAudit: dataHub.recordAudit,
    recordPendingReview: pipelineVersions.recordPendingReview,
    rejectProposal: pipelineVersions.rejectProposal,
    resumePlayerAfterReview,
    reviewAssistant,
    searchDataHubAssets: dataHub.searchAssets,
    setActivity,
    setContextMenu,
    setNodes,
    setProjectTitle,
    setProposal,
    setProposalReviewOpen,
    setSettingsOpen,
    setSettingsSection,
    versions: pipelineVersions.versions,
    workspace,
    writeDataHubDecision: dataHub.writeDecision,
  })
  const reworkSelectedWithAgent = useSelectedCardRework({
    active: ai.active,
    activeAiSource: ai.activeAiSource,
    activeAtomicRun,
    agentRunId,
    edges,
    issues,
    language,
    nodes,
    openAiSettings: () => { setSettingsSection('ai'); setSettingsOpen(true) },
    recordPendingReview: pipelineVersions.recordPendingReview,
    resumePlayerAfterReview,
    selected,
    setActivity,
    setAgentRunning: player.setAgentRunning,
    setContextMenu,
    setNodes,
    setProposal,
    setProposalReviewOpen,
    versions: pipelineVersions.versions,
  })

  const unresolvedIncidents = incidents.summaries.filter((incident) => incident.status !== 'resolved')
  const proposalAddsReport = Boolean(proposal?.incidentKey && !unresolvedIncidents.some((incident) => incident.incidentKey === proposal.incidentKey))
  const reportCount = unresolvedIncidents.length + (proposalAddsReport ? 1 : 0)
  const activityBusy = player.agentRunning || player.playerStarting || reviewAssistant.busy || ai.chatGPTConnecting || appUpdates.busy || player.stepPending
  const agentActionHistory = useMemo(
    () => actionHistory.filter((entry) => /\b(agent|autonomous|player|proposal|review|controller|iteration)\b/i.test(entry.message)),
    [actionHistory],
  )
  const leftPanelOpen = libraryOpen || Boolean(leftOperationsPanel)
  const rightPanelOpen = inspectorOpen || reportsOpen

  useEffect(() => {
    setActionHistory((current) => current[0]?.message === activity
      ? current
      : [{ id: `action-${Date.now()}`, message: activity, createdAt: new Date().toISOString() }, ...current].slice(0, 60))
  }, [activity])
  useEffect(() => { window.localStorage.removeItem('data-lab-versions') }, [])
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

  useKeyboardShortcuts({
    add: () => pipeline.addCard('source'),
    deleteSelected: () => selectedId ? pipeline.deleteCard(selectedId) : setActivity('Delete unavailable · select a card first'),
    fitView: () => { void pipeline.flowInstance.current?.fitView({ duration: 180, padding: 0.18 }); setActivity('Canvas fitted to the current graph') },
    openHelp: () => setShortcutsOpen(true),
    redo: graphHistory.redo,
    save: () => { void workspace.saveWorkspace() },
    undo: graphHistory.undo,
  })

  return <main className={`app-shell ${platformClass}${nativeFullscreen ? ' native-fullscreen' : ''}`}>
    <AppHeader
      agentBusy={player.agentRunning || player.playerStarting}
      cardCount={nodes.length}
      onOpenSettings={() => { setSettingsSection('appearance'); setSettingsOpen(true) }}
      onPause={player.pauseAgent}
      onPlay={player.playAgent}
      onStop={player.stopAgent}
      playerState={player.playerState}
      projectTitle={projectTitle}
      reviewPending={Boolean(proposal)}
      saveState={workspace.saveState}
    />

    {workspace.recovery && <WorkspaceRecoveryModal onDiscard={() => void workspace.resolveRecovery('discard')} onRecover={() => void workspace.resolveRecovery('recover')} updatedAt={workspace.recovery.updatedAt} />}
    {shortcutsOpen && <KeyboardShortcutsModal onClose={() => setShortcutsOpen(false)} />}
    {proposal && proposalReviewOpen && <ProposalReviewModal
      applying={player.proposalApprovalBusy}
      assistant={{
        activity,
        answer: reviewAssistant.answer,
        busy: reviewAssistant.busy,
        connected: ai.active.connected,
        context: {
          ai: ai.active.connected ? `${ai.active.label} ready` : `${ai.active.label} offline`,
          cards: nodes.length,
          edges: edges.length,
          versions: pipelineVersions.versions.length,
          mcp: dataHub.connectionMode === 'connected' ? `MCP ${dataHub.mcpTransport} connected` : 'MCP offline',
          model: `${ai.active.label} · ${ai.active.model}`,
        },
        onAsk: (question) => { void reviewAssistant.ask(question) },
        onOpenSettings: () => { setSettingsSection('ai'); setSettingsOpen(true) },
        onStop: reviewAssistant.stop,
      }}
      proposal={proposal}
      relatedAssets={[...new Set(nodes.flatMap((node) => node.data.datahubUrn ? [node.data.datahubUrn] : []))]}
      revisionId={pipelineVersions.pendingVersionId}
      writebackAvailable={dataHub.connectionMode === 'connected' && dataHub.settings.writebackEnabled && dataHub.writebackAvailable}
      onApply={(writebackRequested) => { void player.approveAgentProposal(writebackRequested).then((applied) => { if (applied) setProposalReviewOpen(false) }) }}
      onClose={() => setProposalReviewOpen(false)}
      onDiscard={() => { setProposalReviewOpen(false); player.rejectAgentProposal() }}
    />}

    {settingsOpen && <Suspense fallback={<div aria-live="polite" className="lazy-modal-loading" role="status">Loading workspace settings…</div>}><SettingsModal
      activeAiSource={ai.activeAiSource}
      activeWorkspaceId={workspace.activeWorkspaceId}
      aiStatus={ai.aiStatus}
      autonomyPolicy={autonomyPolicy}
      chatGPTStatus={ai.chatGPTStatus}
      catalogConnectors={dataHub.catalogConnectors}
      connectionMode={dataHub.connectionMode}
      dataHubSettings={dataHub.settings}
      appUpdateBusy={appUpdates.busy}
      appUpdateStatus={appUpdates.status}
      errorCount={errors.length}
      findingCount={issues.length}
      incidentReportCount={incidents.events.length}
      initialSection={settingsSection}
      mcpMessage={dataHub.mcpMessage}
      mcpTransport={dataHub.mcpTransport}
      onApprovePendingReview={(versionId) => {
        const reviewedVersion = pipelineVersions.versions.find((version) => version.id === versionId)
        const approved = pipelineVersions.approvePendingVersion(versionId)
        if (!approved) return
        if (projectTitle === 'Untitled pipeline' && reviewedVersion) setProjectTitle(reviewedVersion.label.replace(/^Review · /, '').slice(0, 72))
        pipeline.fitCommittedGraph()
        if (player.playerState === 'running') player.queueAutonomousStep(
          'A stored Human Review version was approved. Reread the committed graph, reports, diagnostics and version memory, then propose the next coherent safe iteration.',
          player.playerSessionId.current,
        )
      }}
      onArchiveWorkspace={workspace.archiveWorkspace}
      onAutonomyPolicyChange={setAutonomyPolicy}
      onCheckForAppUpdate={appUpdates.check}
      onClearIncidentReports={diagnostics.clearIncidentReports}
      onAutoLayout={() => { setNodes((current) => layoutPipeline(current, edges)); setActivity('Topology-aware XY layout applied · Split branches preserved') }}
      onClose={() => setSettingsOpen(false)}
      onCancelChatGPTLogin={ai.cancelChatGPTLogin}
      onConfigureChatGPT={ai.configureChatGPT}
      onConnectChatGPT={ai.connectChatGPT}
      onCreateWorkspace={workspace.createWorkspace}
      onDeleteWorkspace={workspace.deleteWorkspace}
      onDeleteCatalogConnector={dataHub.deleteCatalogConnector}
      onDisconnectChatGPT={ai.disconnectChatGPT}
      onEmergencyStop={player.stopAgent}
      onDuplicateWorkspace={workspace.duplicateWorkspace}
      onDownloadAppUpdate={appUpdates.download}
      onExportDiagnostics={diagnostics.exportDiagnostics}
      onExportPipeline={pipeline.exportPipelineJson}
      onImportPipeline={pipeline.importPipelineJson}
      onInstallAppUpdate={appUpdates.install}
      onLoadDiagnostics={diagnostics.loadBundle}
      onSaveDiagnosticSettings={async (settings) => {
        if (!window.dataLab) throw new Error('Diagnostics require the Electron application')
        return window.dataLab.saveDiagnosticSettings(settings)
      }}
      onLoadPreset={(presetId) => { workspace.detachWorkspace(); pipelineVersions.loadPreset(presetId); setSettingsOpen(false) }}
      onOpenDiagnosticLogs={diagnostics.openLogs}
      onOpenSetupUpdater={appUpdates.openSetup}
      onOpenWorkspace={workspace.openWorkspace}
      onRefreshAiModelCatalog={ai.refreshAiModelCatalog}
      onRejectPendingReview={pipelineVersions.rejectPendingVersionById}
      onRemindHumanReview={(version) => { if (window.dataLab) void window.dataLab.notifyHumanReview({ cardLabel: version.label, reason: version.description ?? 'Human Review is still pending.', versionId: version.id, remind: true }) }}
      onRenameWorkspace={workspace.renameWorkspace}
      onSaveAiSettings={ai.saveAiConnection}
      onSaveCatalogConnector={dataHub.saveCatalogConnector}
      onSaveDataHubSettings={dataHub.saveSettings}
      onSelectActiveAiSource={ai.selectActiveAgentSource}
      onSetAppUpdateChannel={appUpdates.setChannel}
      onSyncDataHub={dataHub.syncDataHub}
      onTestCatalogConnector={dataHub.testCatalogConnector}
      onTestAiConnection={ai.testAiConnection}
      onThemeChange={setTheme}
      onValidate={() => {
        recordDiagnostic({ category: 'validation', action: 'pipeline.validate', status: errors.length ? 'error' : 'success', detail: { blockingIssues: errors.length, totalFindings: issues.length, cardCount: nodes.length } })
        setActivity(`${errors.length} blocking issue${errors.length === 1 ? '' : 's'} · ${issues.length} total findings`)
      }}
      onRestoreVersion={pipelineVersions.restoreVersion}
      onSaveVersion={pipelineVersions.saveManualVersion}
      onSaveWorkspace={workspace.saveWorkspace}
      projectTitle={projectTitle}
      selectedVersionId={requestedVersionId}
      theme={theme}
      versions={pipelineVersions.versions.map(({ id, label, createdAt, origin, blockingIssues, status, description, evidence }) => ({ id, label, createdAt, origin, blockingIssues, status, description, evidence }))}
      workspaceSaveState={workspace.saveState}
      workspaces={workspace.workspaces}
    /></Suspense>}

    <section className={`workspace${leftPanelOpen ? '' : ' library-collapsed'}${rightPanelOpen ? '' : ' inspector-collapsed'}`}>
      <div aria-hidden={!leftPanelOpen} className={`library-panel-shell ${leftPanelOpen ? '' : 'is-closed'}`} id="data-lab-left-panel" inert={!leftPanelOpen} tabIndex={-1}>
        {leftOperationsPanel === 'actions'
          ? <aside aria-label="Agent actions" className="left-operations-panel operations-panel" id="data-lab-actions"><AgentActionsView busy={activityBusy} history={agentActionHistory} onClose={() => setLeftOperationsPanel(undefined)} playerState={player.playerState} /></aside>
          : leftOperationsPanel === 'logs'
            ? <aside aria-label="Live activity log" className="left-operations-panel operations-panel" id="data-lab-live-logs"><LiveActivityView busy={activityBusy} entries={actionHistory} onClose={() => setLeftOperationsPanel(undefined)} /></aside>
            : <CardLibraryView onAddCard={pipeline.addCard} onClose={() => setLibraryOpen(false)} />}
      </div>

      <PipelineCanvasView
        activityBusy={activityBusy}
        actionsOpen={leftOperationsPanel === 'actions'}
        contextMenu={contextMenu}
        edges={edges}
        inspectorOpen={inspectorOpen}
        libraryOpen={libraryOpen}
        logsOpen={leftOperationsPanel === 'logs'}
        nodes={nodes}
        reportCount={reportCount}
        reportsOpen={reportsOpen}
        onConnect={pipeline.onConnect}
        onReconnect={pipeline.onReconnect}
        onDeleteCard={pipeline.deleteCard}
        onDrop={pipeline.dropLibraryCard}
        onEdgesChange={onEdgesChange}
        onEditCard={(nodeId, label) => { setSelectedId(nodeId); setContextMenu(undefined); setActivity(`${label} opened in the inspector`) }}
        onFlowInit={(instance) => { pipeline.flowInstance.current = instance }}
        onNodeContextMenu={(event, node) => { event.preventDefault(); setSelectedId(node.id); setContextMenu({ nodeId: node.id, label: node.data.label, x: event.clientX, y: event.clientY }) }}
        onNodesChange={onNodesChange}
        onOpenActions={() => { setLibraryOpen(false); setLeftOperationsPanel('actions') }}
        onOpenInspector={() => { setReportsOpen(false); setInspectorOpen(true) }}
        onOpenLibrary={() => { setLeftOperationsPanel(undefined); setLibraryOpen(true) }}
        onOpenLogs={() => { setLibraryOpen(false); setLeftOperationsPanel('logs') }}
        onOpenReports={() => { setInspectorOpen(false); setReportsOpen(true) }}
        onPaneClick={() => setContextMenu(undefined)}
        onSelectNode={setSelectedId}
        theme={theme}
      />

      {reportsOpen
        ? <aside aria-label="Incident reports" className="inspector-panel operations-panel" id="data-lab-reports"><IncidentReportsView events={incidents.events} incidents={incidents.summaries} onClose={() => setReportsOpen(false)} onOpenProposal={() => setProposalReviewOpen(true)} onSelectCard={(nodeId) => { setSelectedId(nodeId); setReportsOpen(false); setInspectorOpen(true) }} proposal={proposal?.incidentKey ? proposal : undefined} /></aside>
        : <aside aria-hidden={!inspectorOpen} aria-label="Card inspector" className={`inspector-panel ${inspectorOpen ? '' : 'is-closed'}`} id="data-lab-inspector" inert={!inspectorOpen} tabIndex={-1}>
          <CardInspectorView dataHubConnected={dataHub.catalogConnectionMode === 'connected'} errorCount={errors.length} issues={issues} onAgentRework={reworkSelectedWithAgent} onBindDataHubSource={pipeline.bindDataHubSource} onClose={() => setInspectorOpen(false)} onFocusDiagram={pipeline.focusIncidentDiagram} onInspectDataHubAsset={dataHub.inspectAsset} onOpenDataHubSettings={() => { setSettingsSection('connections'); setSettingsOpen(true) }} onSearchDataHub={dataHub.searchAssets} onSelectNode={setSelectedId} onUpdate={pipeline.updateSelected} selected={selected} workbenchAssets={Object.fromEntries(nodes.flatMap((node) => (node.data.assetRef ?? node.data.datahubUrn) ? [[node.data.assetRef ?? node.data.datahubUrn!, { nodeId: node.id, label: node.data.label }]] : []))} />
        </aside>}
    </section>

    {proposal && !proposalReviewOpen && <button className="proposal-review-reopen" onClick={() => setProposalReviewOpen(true)} type="button"><span aria-hidden="true">✦</span> Review agent proposal</button>}
    <AppFooter activity={activity} playerState={player.playerState} />
  </main>
}
