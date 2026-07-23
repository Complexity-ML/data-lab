import { addEdge, reconnectEdge, useEdgesState, useNodesState, type Connection, type Edge } from '@xyflow/react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { AppFooter } from './components/AppFooter'
import { AppHeader, type AgentPlayerState } from './components/AppHeader'
import { ProposalReviewModal } from './components/ProposalReviewModal'
import type { SettingsSection } from './components/shared/SettingsModal'
import { KeyboardShortcutsModal } from './components/shared/KeyboardShortcutsModal'
import { WorkspaceRecoveryModal } from './components/shared/WorkspaceRecoveryModal'
import { materializeAiProposal } from './domain/ai'
import { buildCardReworkRequest, buildPipelineAgentRequest, buildReviewAssistantRequest } from './domain/agent-context'
import { applyAtomicRunState, buildAtomicRunTrace, executePipelineAtomically, resumePipelineAtomically, type AtomicPipelineRun } from './domain/atomic-execution'
import type { DataHubAssetSummary, DataHubEvidence } from './domain/datahub'
import { addDataProfileToProposal, canReuseDataProfile, dataProfileEvidence } from './domain/data-profile'
import { layoutPipeline } from './domain/layout'
import { createPipelineExport, parsePipelineExport } from './domain/pipeline-io'
import { applyProposal, cardLabels, initialEdges, initialNodes, newCard, type AgentProposal, type CardKind, type PipelineNode } from './domain/pipeline'
import { findEquivalentVersion, graphsEquivalent } from './domain/versioning'
import { errorMessage, notifyError, notifyToast } from './domain/toasts'
import { recordDiagnostic } from './domain/diagnostics'
import { atomicTransactionBlockers, validatePipeline } from './validation'
import { disconnectedAiStatus, disconnectedChatGPTStatus, useAiConnections } from './hooks/useAiConnections'
import { useDataHubConnection } from './hooks/useDataHubConnection'
import { usePipelineVersions } from './hooks/usePipelineVersions'
import { useGraphHistory } from './hooks/useGraphHistory'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useWorkspacePersistence } from './hooks/useWorkspacePersistence'
import { useAppUpdates } from './hooks/useAppUpdates'
import { useLiveIncidentMonitor, type LiveIncidentTrigger } from './hooks/useLiveIncidentMonitor'
import { CardInspectorView } from './views/CardInspectorView'
import { CardLibraryView } from './views/CardLibraryView'
import { PipelineCanvasView } from './views/PipelineCanvasView'
import { AgentActionsView, type AgentActionLog } from './views/AgentActionsView'
import { IncidentReportsView } from './views/IncidentReportsView'
import { LiveActivityView } from './views/LiveActivityView'
import { useLanguage } from './i18n'
import { summarizeIncidentEvents, type IncidentEvent, type IncidentEventInput } from './domain/incidents'
import { incidentDiagramNodeIds } from './domain/incident-diagram'
import { asksForSeparateWorkspace, selectDataSources, workspaceNameFromObjective, type SourceSelection } from './domain/source-routing'
import { defaultBlankObjective, resolveAgentObjective } from './domain/agent-objective'

const SettingsModal = lazy(() => import('./components/shared/SettingsModal').then((module) => ({ default: module.SettingsModal })))
export default function App() {
  const { language } = useLanguage()
  const platformClass = window.dataLab?.platform ? `platform-${window.dataLab.platform}` : 'platform-web'
  const [nodes, setNodes, onNodesChange] = useNodesState<PipelineNode>(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedId, setSelectedId] = useState('')
  const [proposal, setProposal] = useState<AgentProposal>()
  const [proposalReviewOpen, setProposalReviewOpen] = useState(false)
  const [proposalApprovalBusy, setProposalApprovalBusy] = useState(false)
  const [requestedVersionId, setRequestedVersionId] = useState<string>()
  const [contextMenu, setContextMenu] = useState<{ nodeId: string; label: string; x: number; y: number }>()
  const [agentRunning, setAgentRunning] = useState(false)
  const [playerStarting, setPlayerStarting] = useState(false)
  const [playerState, setPlayerState] = useState<AgentPlayerState>('stopped')
  const [reviewAssistantBusy, setReviewAssistantBusy] = useState(false)
  const [reviewAssistantAnswer, setReviewAssistantAnswer] = useState<{ summary: string; rationale: string; evidence: string[]; model: string }>()
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
  const [incidentEvents, setIncidentEvents] = useState<IncidentEvent[]>([])
  const [pendingWorkspacePrompt, setPendingWorkspacePrompt] = useState<string>()
  const [autonomousStepRequest, setAutonomousStepRequest] = useState<{ objective: string; sessionId: number }>()
  const agentRunId = useRef(0)
  const playerSessionId = useRef(0)
  const playerStartupBlocked = useRef(false)
  const reviewAssistantRunId = useRef(0)
  const activeAtomicRun = useRef<AtomicPipelineRun | undefined>(undefined)
  const proposalApprovalRunning = useRef(false)
  const resumePlayerAfterReview = useRef(false)
  const monitorBootstrapAttempted = useRef(false)
  const autonomousStepTimer = useRef<number | undefined>(undefined)
  const flowInstance = useRef<{ fitView(options?: { duration?: number; padding?: number; nodes?: { id: string }[] }): Promise<boolean>; screenToFlowPosition(point: { x: number; y: number }): { x: number; y: number } } | null>(null)

  const resolveAtomicReview = (candidateNodes: PipelineNode[], candidateEdges: typeof edges, decision: 'approved' | 'rejected') => {
    const previous = activeAtomicRun.current
    if (!previous || previous.state !== 'waiting') return candidateNodes
    const reviewDecisions = Object.fromEntries(candidateNodes
      .filter((node) => node.data.kind === 'review' && previous.nodeStates[node.id] === 'waiting')
      .map((node) => [node.id, decision]))
    if (Object.keys(reviewDecisions).length === 0) return candidateNodes
    try {
      const resumed = resumePipelineAtomically(candidateNodes, candidateEdges, previous, reviewDecisions)
      activeAtomicRun.current = resumed
      return applyAtomicRunState(candidateNodes, resumed)
    } catch (error) {
      recordDiagnostic({ category: 'provider', action: 'branch.resume', status: 'error', detail: { decision, message: errorMessage(error, 'Unknown resume error') } })
      return candidateNodes
    }
  }

  const appUpdates = useAppUpdates(setActivity)
  const { active, activeAiSource, aiStatus, cancelChatGPTLogin, chatGPTConnecting, chatGPTStatus, configureChatGPT, connectChatGPT, disconnectChatGPT, refreshAiModelCatalog, saveAiConnection, selectActiveAgentSource, testAiConnection } = useAiConnections(setActivity)
  const { connectionMode, inspectAsset: inspectDataHubAsset, invalidateContext: invalidateDataHubContext, mcpMessage, mcpTransport, recordAudit, saveSettings: saveDataHubSettings, searchAssets: searchDataHubAssets, settings: dataHubSettings, syncDataHub, writebackAvailable: dataHubWritebackAvailable, writeDecision: writeDataHubDecision } = useDataHubConnection(setActivity)
  const { approvePendingVersion, approveProposal, commitAutonomousProposal, loadPreset, pendingVersionId, recordPendingReview, rejectPendingVersionById, rejectProposal, restoreVersion, saveManualVersion, setVersions, versions } = usePipelineVersions({
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
  const workspacePersistence = useWorkspacePersistence({ edges, inspectorOpen, libraryOpen, nodes, projectTitle, setActivity, setEdges, setInspectorOpen, setLibraryOpen, setNodes, setProjectTitle, setSelectedId, setVersions, versions })
  const graphHistory = useGraphHistory({ edges, nodes, setActivity, setEdges, setNodes })
  const [theme, setTheme] = useState<'light' | 'dark'>(() => window.localStorage.getItem('data-lab-theme') === 'dark' ? 'dark' : 'light')
  const issues = useMemo(() => validatePipeline(nodes, edges), [nodes, edges])
  const selected = nodes.find((node) => node.id === selectedId)
  const errors = issues.filter((issue) => issue.severity === 'error')
  const incidentSummaries = useMemo(() => summarizeIncidentEvents(incidentEvents), [incidentEvents])
  const unresolvedIncidents = incidentSummaries.filter((incident) => incident.status !== 'resolved')
  const pendingProposalIsDistinct = Boolean(proposal?.incidentKey && !unresolvedIncidents.some((incident) => incident.incidentKey === proposal.incidentKey))
  const reportCount = unresolvedIncidents.length + (pendingProposalIsDistinct ? 1 : 0)
  const activityBusy = agentRunning || playerStarting || reviewAssistantBusy || chatGPTConnecting || appUpdates.busy || Boolean(autonomousStepRequest)
  const agentActionHistory = useMemo(() => actionHistory.filter((entry) => /\b(agent|autonomous|player|proposal|review|controller|iteration)\b/i.test(entry.message)), [actionHistory])
  const leftPanelOpen = libraryOpen || Boolean(leftOperationsPanel)
  const rightPanelOpen = inspectorOpen || reportsOpen

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('data-lab-theme', theme)
  }, [theme])

  useEffect(() => {
    setActionHistory((current) => {
      if (current[0]?.message === activity) return current
      return [{ id: `action-${Date.now()}`, message: activity, createdAt: new Date().toISOString() }, ...current].slice(0, 60)
    })
  }, [activity])

  useEffect(() => {
    window.localStorage.removeItem('data-lab-versions')
  }, [])

  useEffect(() => {
    setReviewAssistantAnswer(undefined)
    setReviewAssistantBusy(false)
    reviewAssistantRunId.current += 1
  }, [proposal?.id])

  useEffect(() => {
    if (!window.dataLab?.listIncidentEvents) return
    void window.dataLab.listIncidentEvents().then(setIncidentEvents).catch(() => undefined)
  }, [workspacePersistence.activeWorkspaceId])

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
    const feedback = connection.sourceHandle === 'feedback'
    setEdges((current) => addEdge({ ...connection, id: `e-${connection.source}-${connection.target}-${Date.now()}`, type: 'elastic', label: feedback ? 'next iteration' : undefined }, current))
    setActivity(feedback ? 'Feedback boundary added · each trigger starts a new bounded atomic iteration' : 'Manual lineage connection added · run validation before publishing')
  }

  const onReconnect = (oldEdge: Edge, connection: Connection) => {
    if (!connection.source || !connection.target) return
    const feedback = connection.sourceHandle === 'feedback'
    setEdges((current) => reconnectEdge(oldEdge, connection, current, { shouldReplaceId: false }).map((edge) => edge.id === oldEdge.id
      ? { ...edge, type: 'elastic', label: feedback ? 'next iteration' : undefined }
      : edge))
    setActivity(feedback ? 'Feedback cable reconnected · next bounded iteration preserved' : 'Elastic cable reconnected · lineage validation refreshed')
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

  const focusIncidentDiagram = (diagramId: string) => {
    const nodeIds = incidentDiagramNodeIds(diagramId, nodes, edges)
    if (!nodeIds.length) {
      setActivity('Incident Diagram unavailable · no connected workstream found')
      return
    }
    void flowInstance.current?.fitView({ duration: 260, padding: 0.24, nodes: nodeIds.map((id) => ({ id })) })
    setActivity(`Incident workstream focused · ${nodeIds.length} cards across its parallel branches`)
  }

  const bindDataHubSource = (asset: DataHubAssetSummary) => {
    if (!selected || selected.data.kind !== 'source') return
    const previousUrn = selected.data.datahubUrn
    setNodes((current) => current.map((node) => node.id === selected.id ? {
      ...node,
      data: {
        ...node.data,
        datahubUrn: asset.urn,
        datahubPlatform: asset.platform,
        datahubEnvironment: asset.environment,
        datahubDomain: asset.domain,
        datahubTags: asset.tags,
        datahubQuality: asset.qualityStatus,
        datahubFreshness: asset.freshness,
        datahubUpstream: asset.upstream,
        datahubDownstream: asset.downstream,
        label: asset.name,
        description: asset.description,
        owner: asset.owners[0] ?? 'Unassigned',
        schema: asset.fields,
        status: asset.qualityStatus === 'failing' || asset.owners.length === 0 ? 'warning' : 'healthy',
      },
    } : node))
    if (previousUrn && previousUrn !== asset.urn) void invalidateDataHubContext(previousUrn)
    void invalidateDataHubContext(asset.urn)
    setActivity(`${asset.name} bound atomically · ${asset.fields.length} fields · ${asset.downstream.length} downstream assets · fresh MCP read required before agent execution`)
  }

  const logIncident = useCallback(async (event: IncidentEventInput) => {
    if (!window.dataLab?.recordIncidentEvent) return
    const result = await window.dataLab.recordIncidentEvent(event).catch(() => ({ recorded: false as const }))
    if (result.recorded && result.event) setIncidentEvents((current) => [result.event!, ...current.filter((candidate) => candidate.id !== result.event!.id)].slice(0, 200))
  }, [])

  const queueAutonomousStep = (objective: string, sessionId = playerSessionId.current, delayMs = 650) => {
    if (autonomousStepTimer.current !== undefined) window.clearTimeout(autonomousStepTimer.current)
    setActivity(delayMs > 1_000 ? 'Autonomous retry scheduled · waiting for fresh external evidence…' : 'Agent iteration committed · rereading the graph before the next coherent iteration…')
    autonomousStepTimer.current = window.setTimeout(() => {
      autonomousStepTimer.current = undefined
      if (playerSessionId.current !== sessionId) return
      setAutonomousStepRequest({ objective, sessionId })
    }, delayMs)
  }

  const auditWithAgent = async (agentRequest = defaultBlankObjective, monitored?: LiveIncidentTrigger, expectedPlayerSessionId?: number) => {
    const routingPreview: SourceSelection = monitored
      ? {
          mode: 'single',
          sources: nodes.filter((node) => node.id === monitored.monitor.sourceId && node.data.datahubUrn === monitored.monitor.urn),
          matchedTerms: [monitored.monitor.sourceLabel],
        }
      : selectDataSources(nodes, agentRequest)
    const objective = resolveAgentObjective(agentRequest, { hasGraph: nodes.length > 0, matchedSource: routingPreview.matchedTerms.length > 0 })
    if (!objective.accepted) {
      setActivity('Request outside DATA LAB scope · no provider call · graph unchanged')
      notifyToast('Ask about datasets, lineage, incidents, cards or graph operations.', 'info', 'No data action detected')
      return
    }
    agentRequest = objective.objective
    setContextMenu(undefined)
    setProposal(undefined)
    if (!window.dataLab) {
      setActivity('AI provider unavailable in web preview · launch the Electron application')
      return
    }
    const [currentAiStatus, currentChatGPT] = await Promise.all([window.dataLab.getAiStatus().catch(() => disconnectedAiStatus), window.dataLab.getChatGPTStatus().catch(() => disconnectedChatGPTStatus)])
    if (expectedPlayerSessionId !== undefined && playerSessionId.current !== expectedPlayerSessionId) return
    const activeConnected = activeAiSource === 'chatgpt' ? currentChatGPT.connected : currentAiStatus.providers[activeAiSource].connected
    if (!activeConnected) {
      setSettingsSection('ai')
      setSettingsOpen(true)
      setActivity(`${active.label} is the active agent source but is not connected · open Settings → AI connection`)
      return
    }
    if (!monitored && nodes.length > 0 && asksForSeparateWorkspace(agentRequest)) {
      const workspaceName = workspaceNameFromObjective(agentRequest)
      try {
        setActivity('Saving the current graph before creating the explicitly requested workspace…')
        await workspacePersistence.saveWorkspace()
        setPendingWorkspacePrompt(agentRequest)
        await workspacePersistence.createWorkspace(workspaceName, {
          projectTitle: workspaceName,
          nodes: [],
          edges: [],
          versions: [],
          projectSettings: { inspectorOpen, libraryOpen },
        })
        setActivity(`Separate workspace created · ${workspaceName} · preserved prompt will start on the blank graph`)
      } catch (error) {
        setPendingWorkspacePrompt(undefined)
        notifyError(error, 'Unable to create the separate workspace')
        setActivity(`Separate workspace creation failed · ${errorMessage(error, 'SQLite unavailable')} · current graph preserved`)
      }
      return
    }

    setAgentRunning(true)
    const runId = ++agentRunId.current
    const atomicRun = executePipelineAtomically(nodes, edges)
    activeAtomicRun.current = atomicRun
    setNodes((current) => applyAtomicRunState(current, atomicRun))
    setActivity('Agent reading the current graph, atomic findings and version history…')
    const sourceSelection = routingPreview
    const routedSources = sourceSelection.sources
    const hasDataSource = nodes.some((node) => node.data.kind === 'source')
    const unboundSource = nodes.find((node) => node.data.kind === 'source' && !node.data.datahubUrn)
    let datahubEvidence: string[] = []
    let evidenceEntries: DataHubEvidence[] = []
    let blankCandidate: DataHubAssetSummary | undefined
    const profileCandidates = new Map<string, DataHubAssetSummary>()
    try {
      if (routedSources.length > 0) {
        for (const [sourceIndex, source] of routedSources.entries()) {
          const sourceUrn = source.data.datahubUrn!
          const sourceProfile = nodes.find((node) => node.data.kind === 'profile' && node.data.profile?.sourceUrn === sourceUrn)
          const forcedMonitorAudit = monitored?.monitor.urn === sourceUrn ? monitored.audit : undefined
          if (sourceProfile?.data.profile && canReuseDataProfile(sourceProfile.data.profile, Boolean(forcedMonitorAudit))) {
            setActivity(`Agent reusing ${sourceProfile.data.label} · source ${sourceIndex + 1}/${routedSources.length}…`)
            const remembered = dataProfileEvidence(sourceProfile.data.profile)
            datahubEvidence.push(...remembered.summaries.map((summary) => `${source.data.label} · ${summary}`))
            evidenceEntries.push(...remembered.evidence)
            continue
          }

          setActivity(`Agent reading ${source.data.label} through DataHub MCP · source ${sourceIndex + 1}/${routedSources.length}…`)
          let audit: Awaited<ReturnType<NonNullable<typeof window.dataLab>['auditDataHubWithMcp']>>
          try {
            audit = forcedMonitorAudit ?? await window.dataLab.auditDataHubWithMcp(sourceUrn)
          } catch (error) {
            const detail = errorMessage(error, 'DataHub audit failed')
            datahubEvidence.push(`${source.data.label} (${sourceUrn}) · audit error · ${detail}`)
            await logIncident({
              incidentKey: monitored?.incidentKey ?? `datahub-evidence:${sourceUrn}`,
              transition: 'opened',
              severity: 'critical',
              title: `DataHub evidence · ${source.data.label}`,
              detail,
              sourceSystem: 'DataHub',
              sourceRef: sourceUrn,
              fingerprint: 'audit-transport-error',
              cardId: source.id,
              branchId: monitored?.monitor.monitorId ?? source.id,
            })
            continue
          }
          if (agentRunId.current !== runId) return
          const successfulReads = audit.reads.filter((read) => read.status === 'ok').length
          datahubEvidence.push(...audit.reads.map((read) => `${source.data.label} · ${read.name} · ${read.status} · ${read.summary}`))
          evidenceEntries.push(...audit.reads.map((read) => ({ tool: read.name, urn: sourceUrn, capturedAt: read.capturedAt, expiresAt: read.expiresAt, status: read.status, summary: read.summary, cached: read.cached, stale: read.stale })))
          const failedReads = audit.reads.filter((read) => read.status !== 'ok' || read.stale)
          await logIncident({
            incidentKey: monitored?.incidentKey ?? `datahub-evidence:${sourceUrn}`,
            transition: failedReads.length ? 'opened' : 'recovered',
            severity: failedReads.length === audit.reads.length ? 'critical' : failedReads.length ? 'warning' : 'info',
            title: `DataHub evidence · ${source.data.label}`,
            detail: failedReads.length ? `${failedReads.length}/${audit.reads.length} metadata reads failed or became stale: ${failedReads.map((read) => read.name).join(', ')}.` : 'All required DataHub metadata reads returned to normal.',
            sourceSystem: 'DataHub',
            sourceRef: sourceUrn,
            fingerprint: audit.reads.map((read) => `${read.name}:${read.status}:${read.stale}`).join('|'),
            cardId: source.id,
            branchId: monitored?.monitor.monitorId ?? source.id,
          })
          recordAudit(audit.transport, successfulReads, audit.reads.length)
          const inspection = await inspectDataHubAsset(sourceUrn, Boolean(forcedMonitorAudit)).catch(() => undefined)
          if (inspection?.asset) profileCandidates.set(sourceUrn, inspection.asset)
        }
      } else if ((!hasDataSource || unboundSource) && connectionMode === 'connected') {
        setActivity(`${unboundSource ? 'Unbound source' : 'Blank canvas'} · agent is discovering a starting dataset through DataHub MCP…`)
        let candidates = await searchDataHubAssets(agentRequest).catch(() => [])
        if (!candidates.length) candidates = await searchDataHubAssets('customer').catch(() => [])
        blankCandidate = candidates[0]
        if (blankCandidate) {
          const inspection = await inspectDataHubAsset(blankCandidate.urn)
          blankCandidate = inspection.asset
          profileCandidates.set(inspection.asset.urn, inspection.asset)
          evidenceEntries = inspection.evidence.map((read) => ({ tool: read.name, urn: inspection.asset.urn, capturedAt: read.capturedAt, expiresAt: read.expiresAt, status: read.status, summary: read.summary, cached: read.cached, stale: read.stale }))
          datahubEvidence = [
            `Starting dataset candidate from DataHub: ${inspection.asset.name} (${inspection.asset.urn}). Add it as the Data Source card in the proposed graph.`,
            `Schema: ${inspection.asset.fields.map((field) => `${field.name}:${field.type}${field.tags?.length ? `[${field.tags.join(',')}]` : ''}`).join(', ') || 'unavailable'}`,
            `Governance: owners=${inspection.asset.owners.join(', ') || 'missing'}; tags=${inspection.asset.tags.join(', ') || 'none'}; quality=${inspection.asset.qualityStatus}; upstream=${inspection.asset.upstream.length}; downstream=${inspection.asset.downstream.length}`,
            ...inspection.evidence.map((read) => `${read.name} · ${read.status} · ${read.summary}`),
          ]
        } else {
          await logIncident({
            incidentKey: 'source-discovery:datahub',
            transition: 'opened',
            severity: 'warning',
            title: 'DataHub source discovery unavailable',
            detail: 'DataHub MCP is connected, but no governed starting dataset matched the autonomous objective. The player will retry without calling the model again.',
            sourceSystem: 'DataHub',
            sourceRef: 'mcp',
            fingerprint: 'no-governed-source-candidate',
            cardId: unboundSource?.id,
            branchId: unboundSource?.id,
          })
          if (unboundSource && expectedPlayerSessionId !== undefined && playerSessionId.current === expectedPlayerSessionId) {
            queueAutonomousStep('Retry governed DataHub source discovery for the existing unbound Data Source. Do not propose another placeholder or duplicate graph.', expectedPlayerSessionId, 30_000)
            setActivity('Incident reported · no governed DataHub source matched · autonomous retry in 30 seconds')
          }
          if (unboundSource) return
          datahubEvidence = ['No governed DataHub source matched the objective. The graph has no Data Source yet. Add one explicit unbound Data Source and one Human Review binding checkpoint without inventing schema, ownership or lineage.']
        }
      } else if (unboundSource) {
        await logIncident({
          incidentKey: 'source-discovery:datahub',
          transition: 'opened',
          severity: 'critical',
          title: 'DataHub connection required',
          detail: 'The autonomous graph contains an unbound Data Source, but DataHub MCP is not connected. Monitoring and impact analysis cannot begin.',
          sourceSystem: 'DataHub',
          sourceRef: 'mcp',
          fingerprint: 'datahub-disconnected',
          cardId: unboundSource.id,
          branchId: unboundSource.id,
        })
        if (expectedPlayerSessionId !== undefined && playerSessionId.current === expectedPlayerSessionId) {
          queueAutonomousStep('Retry the existing unbound Data Source after DataHub MCP becomes available. Do not add another placeholder.', expectedPlayerSessionId, 30_000)
          setActivity('Incident reported · DataHub MCP is required · autonomous retry in 30 seconds')
        }
        return
      } else {
        datahubEvidence = ['No bounded DataHub source matched the prompt. Treat evidence as incomplete and do not modify an unrelated source branch.']
      }

      const activeModel = activeAiSource === 'chatgpt' ? currentChatGPT.selectedModel ?? 'ChatGPT' : currentAiStatus.providers[activeAiSource].model
      setActivity(`${activeModel} is analyzing the graph and previous versions…`)
      const runtimeDiagnostics = await window.dataLab.exportDiagnostics()
        .then((bundle) => bundle.events
          .filter((event) => event.status === 'warning' || event.status === 'error')
          .slice(-16)
          .map(({ action, category, status, timestamp }) => ({ action, category, status, timestamp })))
        .catch(() => [])
      const requestPayload = buildPipelineAgentRequest({
        datahubEvidence,
        edges,
        incidentContext: incidentSummaries,
        issues,
        nodes,
        objective: agentRequest,
        responseLanguage: language === 'fr' ? 'French' : 'English',
        runtimeDiagnostics,
        sourceScope: {
          mode: sourceSelection.mode,
          sourceIds: routedSources.map((source) => source.id),
          sourceUrns: routedSources.flatMap((source) => source.data.datahubUrn ? [source.data.datahubUrn] : []),
        },
        versions,
      })
      const response = activeAiSource === 'chatgpt' ? await window.dataLab.runChatGPTProposal(requestPayload) : await window.dataLab.runAiProposal(requestPayload)
      recordDiagnostic({ category: 'provider', action: 'pipeline.proposal', status: 'success', detail: { source: activeAiSource, model: response.model, evidenceCount: evidenceEntries.length } })
      if (agentRunId.current !== runId) return
      const nextProposal = materializeAiProposal(response, nodes, edges)
      nextProposal.incidentKey = monitored?.incidentKey
      if (blankCandidate) {
        const proposedSource = nextProposal.addedNodes.find((node) => node.data.kind === 'source')
        if (proposedSource) proposedSource.data = {
          ...proposedSource.data,
          label: blankCandidate.name,
          description: blankCandidate.description || proposedSource.data.description,
          owner: blankCandidate.owners.join(', ') || proposedSource.data.owner,
          schema: blankCandidate.fields,
          datahubUrn: blankCandidate.urn,
          datahubPlatform: blankCandidate.platform,
          datahubEnvironment: blankCandidate.environment,
          datahubDomain: blankCandidate.domain,
          datahubTags: blankCandidate.tags,
          datahubQuality: blankCandidate.qualityStatus,
          datahubFreshness: blankCandidate.freshness,
          datahubUpstream: blankCandidate.upstream,
          datahubDownstream: blankCandidate.downstream,
        }
        if (unboundSource) {
          nextProposal.addedNodes = []
          nextProposal.updatedNodes = [{
            nodeId: unboundSource.id,
            reason: 'Bind the existing placeholder to the governed DataHub asset discovered from fresh MCP evidence.',
            patch: {
              label: blankCandidate.name,
              description: blankCandidate.description || 'Governed DataHub source selected by the autonomous player.',
              owner: blankCandidate.owners.join(', ') || 'Unassigned',
              schema: blankCandidate.fields,
              datahubUrn: blankCandidate.urn,
              datahubPlatform: blankCandidate.platform,
              datahubEnvironment: blankCandidate.environment,
              datahubDomain: blankCandidate.domain,
              datahubTags: blankCandidate.tags,
              datahubQuality: blankCandidate.qualityStatus,
              datahubFreshness: blankCandidate.freshness,
              datahubUpstream: blankCandidate.upstream,
              datahubDownstream: blankCandidate.downstream,
            },
          }]
          nextProposal.addedEdges = nextProposal.addedEdges.filter((edge) => edge.source !== unboundSource.id && edge.target !== unboundSource.id)
          nextProposal.removedEdgeIds = []
          nextProposal.title = `Bind ${blankCandidate.name}`
          nextProposal.summary = `Bind the existing Data Source to ${blankCandidate.urn} from fresh DataHub MCP evidence, then reread the graph before adding the next incident-handling card.`
          nextProposal.requiresHumanReview = false
          nextProposal.incidentKey = 'source-discovery:datahub'
          await logIncident({
            incidentKey: 'source-discovery:datahub',
            transition: 'recovered',
            severity: 'info',
            title: `Governed source discovered · ${blankCandidate.name}`,
            detail: `Fresh DataHub evidence resolved the unbound source to ${blankCandidate.urn}.`,
            sourceSystem: 'DataHub',
            sourceRef: blankCandidate.urn,
            fingerprint: blankCandidate.urn,
            cardId: unboundSource.id,
            branchId: unboundSource.id,
          })
        }
      }
      for (const [sourceUrn, profileCandidate] of profileCandidates) {
        const sourceNode = nodes.find((node) => node.data.kind === 'source' && node.data.datahubUrn === sourceUrn)
          ?? nextProposal.addedNodes.find((node) => node.data.kind === 'source' && node.data.datahubUrn === sourceUrn)
        addDataProfileToProposal(nextProposal, nodes, profileCandidate, sourceNode)
      }
      nextProposal.runTrace = buildAtomicRunTrace(nodes, atomicRun)
      const preview = applyProposal(nodes, edges, nextProposal)
      const equivalentVersion = findEquivalentVersion(preview.nodes, preview.edges, versions)
      if (graphsEquivalent(nodes, edges, preview.nodes, preview.edges) || equivalentVersion) {
        const autonomousSessionActive = expectedPlayerSessionId !== undefined && playerSessionId.current === expectedPlayerSessionId
        const hasMonitor = nodes.some((node) => node.data.kind === 'monitor')
        if (autonomousSessionActive && !hasMonitor && !monitorBootstrapAttempted.current) {
          monitorBootstrapAttempted.current = true
          setActivity('Graph is already current · no duplicate revision created · preparing the missing Live Monitor…')
          queueAutonomousStep('The previous proposal is already committed. Do not repeat it. Propose the next coherent missing iteration toward continuous incident handling; if the governed path is otherwise complete, add the required Live Monitor and feedback boundary.', expectedPlayerSessionId)
        } else {
          setActivity(hasMonitor
            ? 'Graph is already current · no duplicate revision created · Live Monitor remains armed'
            : `Graph is already current · no duplicate revision created${autonomousSessionActive ? ' · monitoring needs a Live Monitor card' : ''}`)
        }
        return
      }
      nextProposal.evidence = evidenceEntries
      const autonomousSessionActive = expectedPlayerSessionId !== undefined && playerSessionId.current === expectedPlayerSessionId
      const touchesReviewCheckpoint = nextProposal.addedNodes.some((node) => node.data.kind === 'review')
        || nextProposal.updatedNodes.some((update) => nodes.find((node) => node.id === update.nodeId)?.data.kind === 'review')
      if (touchesReviewCheckpoint) nextProposal.requiresHumanReview = true
      if ((monitored || autonomousSessionActive) && !nextProposal.requiresHumanReview && !touchesReviewCheckpoint) {
        const autonomousVersionId = commitAutonomousProposal(nextProposal)
        if (autonomousVersionId && projectTitle === 'Untitled pipeline') setProjectTitle(nextProposal.title.slice(0, 72))
        if (autonomousVersionId) {
          if (monitored) {
            await logIncident({
              incidentKey: monitored.incidentKey,
              transition: 'agent-action',
              severity: 'info',
              title: nextProposal.title,
              detail: `${nextProposal.summary} The correction passed atomic validation and was committed as a restorable version; Live Monitor will verify the next fingerprint.`,
              sourceSystem: 'DataHub',
              sourceRef: monitored.monitor.urn,
              fingerprint: monitored.audit.reads.map((read) => `${read.name}:${read.status}:${read.stale}`).join('|'),
              cardId: monitored.monitor.monitorId,
              branchId: monitored.monitor.monitorId,
              versionId: autonomousVersionId,
            })
          } else {
            queueAutonomousStep(`Iteration "${nextProposal.title}" is committed. Reread the current graph, reports, diagnostics and version memory, then propose the next coherent useful iteration toward a self-monitoring incident workflow. Return no action when the graph is complete.`, expectedPlayerSessionId)
          }
        } else if (autonomousSessionActive) {
          const blockers = atomicTransactionBlockers(validatePipeline(preview.nodes, preview.edges))
          const feedback = blockers.map((issue) => `${issue.title}: ${issue.detail}`).join(' | ')
          queueAutonomousStep(`The previous graph diff was rejected atomically and was not committed. Repair the proposal itself in one smaller coherent diff. Resolve these exact blockers without weakening validation or duplicating cards: ${feedback}`, expectedPlayerSessionId, 1_200)
          setActivity(`Autonomous correction rejected safely · ${blockers.length} atomic check${blockers.length === 1 ? '' : 's'} failed · agent retry scheduled`)
        }
        return
      }
      resumePlayerAfterReview.current = playerState === 'running' && expectedPlayerSessionId !== undefined
      setProposal(nextProposal)
      setProposalReviewOpen(true)
      const reviewVersionId = recordPendingReview(nextProposal)
      setActivity(`${response.model} proposed ${nextProposal.addedNodes.length + nextProposal.updatedNodes.length + nextProposal.addedEdges.length + nextProposal.removedEdgeIds.length} reviewed change(s) · graph unchanged`)
      if (nextProposal.requiresHumanReview) {
        if (nextProposal.incidentKey) void logIncident({ incidentKey: nextProposal.incidentKey, transition: 'human-review', severity: 'warning', title: nextProposal.title, detail: nextProposal.summary, sourceSystem: monitored ? 'DataHub' : undefined, sourceRef: monitored?.monitor.urn, versionId: reviewVersionId, branchId: monitored?.monitor.monitorId })
        void window.dataLab.notifyHumanReview({ cardLabel: 'Agent Decision', reason: nextProposal.summary, versionId: reviewVersionId })
      }
    } catch (error) {
      notifyError(error, 'Agent run failed')
      recordDiagnostic({ category: 'provider', action: 'pipeline.proposal', status: 'error', detail: { source: activeAiSource, message: errorMessage(error) } })
      if (agentRunId.current !== runId) return
      setActivity(`Agent run failed · ${errorMessage(error, 'Unknown provider error')} · graph unchanged`)
    } finally { if (agentRunId.current === runId) setAgentRunning(false) }
  }

  useEffect(() => {
    const preservedPrompt = pendingWorkspacePrompt
    if (!preservedPrompt || !workspacePersistence.activeWorkspaceId || nodes.length > 0 || versions.length > 0) return
    setPendingWorkspacePrompt(undefined)
    void auditWithAgent(preservedPrompt)
  }, [nodes.length, pendingWorkspacePrompt, versions.length, workspacePersistence.activeWorkspaceId])

  useEffect(() => {
    if (!autonomousStepRequest || playerState !== 'running' || proposal || agentRunning || playerStarting) return
    const request = autonomousStepRequest
    setAutonomousStepRequest(undefined)
    void auditWithAgent(request.objective, undefined, request.sessionId)
  }, [agentRunning, autonomousStepRequest, playerStarting, playerState, proposal])

  useEffect(() => () => {
    if (autonomousStepTimer.current !== undefined) window.clearTimeout(autonomousStepTimer.current)
  }, [])

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
    const atomicRun = executePipelineAtomically(nodes, edges)
    activeAtomicRun.current = atomicRun
    setNodes((current) => applyAtomicRunState(current, atomicRun))
    const activeModel = activeAiSource === 'chatgpt' ? currentChatGPT.selectedModel ?? 'ChatGPT' : status.providers[activeAiSource].model
    setActivity(`${activeModel} is reviewing ${selected.data.label} with version context…`)
    try {
      const source = selected.data.datahubUrn ? selected : nodes.find((node) => node.data.kind === 'source' && node.data.datahubUrn)
      let evidenceEntries: DataHubEvidence[] = []
      if (source?.data.datahubUrn) {
        const audit = await window.dataLab.auditDataHubWithMcp(source.data.datahubUrn)
        if (agentRunId.current !== runId) return
        evidenceEntries = audit.reads.map((read) => ({ tool: read.name, urn: source.data.datahubUrn!, capturedAt: read.capturedAt, expiresAt: read.expiresAt, status: read.status, summary: read.summary, cached: read.cached, stale: read.stale }))
      }
      const requestPayload = buildCardReworkRequest({ datahubEvidence: evidenceEntries, edges, focusNodeId: selected.id, issues, nodes, responseLanguage: language === 'fr' ? 'French' : 'English', versions })
      const response = activeAiSource === 'chatgpt' ? await window.dataLab.runChatGPTProposal(requestPayload) : await window.dataLab.runAiProposal(requestPayload)
      if (agentRunId.current !== runId) return
      const nextProposal = materializeAiProposal(response, nodes, edges)
      nextProposal.runTrace = buildAtomicRunTrace(nodes, atomicRun)
      const preview = applyProposal(nodes, edges, nextProposal)
      const equivalentVersion = findEquivalentVersion(preview.nodes, preview.edges, versions)
      if (graphsEquivalent(nodes, edges, preview.nodes, preview.edges) || equivalentVersion) {
        setActivity(`Card proposal blocked as equivalent to ${equivalentVersion ? `${equivalentVersion.label} (${equivalentVersion.status ?? 'committed'})` : 'the current graph'} · no revision created`)
        return
      }
      nextProposal.evidence = evidenceEntries
      resumePlayerAfterReview.current = false
      setProposal(nextProposal)
      setProposalReviewOpen(true)
      const reviewVersionId = recordPendingReview(nextProposal)
      setActivity(`${response.model} proposed a card-level diff${nextProposal.requiresHumanReview ? ' · human review required' : ' · agent is confident'}`)
      if (nextProposal.requiresHumanReview) void window.dataLab.notifyHumanReview({ cardLabel: selected.data.label, reason: nextProposal.summary, versionId: reviewVersionId })
    } catch (error) {
      notifyError(error, 'Card analysis failed')
      if (agentRunId.current !== runId) return
      setActivity(`Card analysis failed · ${errorMessage(error, 'Unknown provider error')} · card unchanged`)
    } finally { if (agentRunId.current === runId) setAgentRunning(false) }
  }

  const playAgent = () => {
    if (agentRunning || playerStarting || reviewAssistantBusy || proposal) return
    if (!active.connected) {
      setSettingsSection('ai')
      setSettingsOpen(true)
      setActivity(`${active.label} is not connected · autonomous player remains stopped`)
      return
    }
    const sessionId = ++playerSessionId.current
    monitorBootstrapAttempted.current = false
    setAutonomousStepRequest(undefined)
    playerStartupBlocked.current = true
    setPlayerStarting(true)
    setPlayerState('running')
    let controller = nodes.find((node) => node.data.kind === 'control' && node.data.controlMode === 'autonomous-player')
    if (!controller) {
      controller = newCard('control', nodes.length)
      controller = {
        ...controller,
        data: {
          ...controller.data,
          label: 'DATA LAB Controller',
          description: 'Global autonomous policy. It controls review checkpoints, automatic resume and idle monitoring without entering dataset lineage.',
          owner: 'DATA LAB Agent',
          status: 'healthy',
        },
      }
      setNodes((current) => [...current, controller!])
      setActivity('DATA LAB Controller created · preparing the first autonomous graph iteration…')
      setAutonomousStepRequest({
        objective: `Execute the persistent DATA LAB Control policy as coherent versioned iterations: ${controller.data.rule}`,
        sessionId,
      })
      playerStartupBlocked.current = false
      setPlayerStarting(false)
      return
    }
    const objective = controller?.data.rule?.trim()
      ? `Execute the persistent DATA LAB Control policy exactly and incrementally: ${controller.data.rule}`
      : defaultBlankObjective
    setActivity(controller
      ? `Autonomous player started · following ${controller.data.label}…`
      : nodes.length ? 'Autonomous player started · auditing the current graph before monitoring changes…' : 'Autonomous player started · discovering the best governed starting point…')
    void auditWithAgent(objective, undefined, sessionId)
      .finally(() => {
        if (playerSessionId.current === sessionId) {
          playerStartupBlocked.current = false
          setPlayerStarting(false)
        }
      })
  }

  const pauseAgent = () => {
    if (playerState !== 'running') return
    resumePlayerAfterReview.current = false
    setPlayerState('paused')
    setActivity(agentRunning
      ? 'Autonomous player pause armed · current atomic iteration may finish · no next iteration will start'
      : 'Autonomous player paused · monitoring and new iterations are suspended')
  }

  const stopAgent = () => {
    const cancellingActiveRun = agentRunning
    setPlayerState('stopped')
    playerSessionId.current += 1
    agentRunId.current += 1
    reviewAssistantRunId.current += 1
    setPlayerStarting(false)
    setAutonomousStepRequest(undefined)
    if (autonomousStepTimer.current !== undefined) {
      window.clearTimeout(autonomousStepTimer.current)
      autonomousStepTimer.current = undefined
    }
    playerStartupBlocked.current = false
    resumePlayerAfterReview.current = false
    setAgentRunning(false)
    setReviewAssistantBusy(false)
    if (cancellingActiveRun) {
      setNodes((current) => current.map((node) => node.data.runState === 'completed' ? node : { ...node, data: { ...node.data, runState: 'stopped' } }))
      activeAtomicRun.current = undefined
    }
    setActivity(cancellingActiveRun
      ? 'Emergency stop · current agent run cancelled · active branch unchanged'
      : 'Autonomous player stopped · monitoring disabled · graph unchanged')
    if (window.dataLab) void window.dataLab.cancelAiProposal()
    if (window.dataLab) void window.dataLab.cancelChatGPTProposal()
  }

  const stopReviewAssistant = () => {
    reviewAssistantRunId.current += 1
    setReviewAssistantBusy(false)
    setActivity('Human Review assistant stopped · proposal and graph unchanged')
    if (window.dataLab) void window.dataLab.cancelAiProposal()
    if (window.dataLab) void window.dataLab.cancelChatGPTProposal()
  }

  const askReviewAssistant = async (question: string) => {
    if (!proposal || reviewAssistantBusy || !window.dataLab) return
    if (!active.connected) {
      setSettingsSection('ai')
      setSettingsOpen(true)
      setActivity(`${active.label} is not connected · Human Review remains fully manual`)
      return
    }
    const runId = ++reviewAssistantRunId.current
    setReviewAssistantBusy(true)
    setActivity(`${active.model} is reading the pending review · read-only assistant turn…`)
    try {
      const payload = buildReviewAssistantRequest({
        edges,
        incidentContext: incidentSummaries,
        issues,
        nodes,
        proposal,
        question,
        responseLanguage: language === 'fr' ? 'French' : 'English',
        versions,
      })
      const response = activeAiSource === 'chatgpt'
        ? await window.dataLab.runChatGPTProposal(payload)
        : await window.dataLab.runAiProposal(payload)
      if (reviewAssistantRunId.current !== runId) return
      setReviewAssistantAnswer({
        summary: response.proposal.summary,
        rationale: response.proposal.rationale,
        evidence: response.proposal.evidence,
        model: response.model,
      })
      setActivity(`${response.model} answered the reviewer · zero graph actions accepted`)
      recordDiagnostic({ category: 'provider', action: 'review.assistant', status: 'success', detail: { source: activeAiSource, model: response.model, actionCount: response.proposal.actions.length } })
    } catch (error) {
      if (reviewAssistantRunId.current !== runId) return
      notifyError(error, 'Human Review assistant failed')
      setActivity(`Human Review assistant failed · ${errorMessage(error, 'Unknown provider error')} · proposal unchanged`)
      recordDiagnostic({ category: 'provider', action: 'review.assistant', status: 'error', detail: { source: activeAiSource, message: errorMessage(error) } })
    } finally {
      if (reviewAssistantRunId.current === runId) setReviewAssistantBusy(false)
    }
  }

  const rejectAgentProposal = () => {
    const rejected = proposal
    rejectProposal()
    if (!rejected?.incidentKey) return
    void logIncident({
      incidentKey: rejected.incidentKey,
      transition: 'worsened',
      severity: 'warning',
      title: `${rejected.title} · repair requested`,
      detail: 'Human Review rejected the proposed correction. The affected branch remains unchanged and enters one bounded repair iteration.',
      versionId: pendingVersionId,
    })
    window.setTimeout(() => {
      if (playerState === 'running' && !agentRunning) void auditWithAgent(`Repair the rejected incident proposal "${rejected.title}". Preserve the reviewer rejection in version memory, change only the affected branch, and do not repeat the rejected diff.`)
    }, 250)
  }

  useLiveIncidentMonitor({
    active: Boolean(window.dataLab) && connectionMode === 'connected' && playerState === 'running',
    agentBlocked: agentRunning || playerStarting || Boolean(autonomousStepRequest) || Boolean(proposal),
    nodes,
    edges,
    audit: async (urn) => {
      if (!window.dataLab) throw new Error('Electron is not running')
      return window.dataLab.auditDataHubWithMcp(urn, true)
    },
    onIncident: logIncident,
    onTrigger: async (trigger) => {
      if (playerStartupBlocked.current) return
      await auditWithAgent(
        `Live Monitor detected a connector metadata change for ${trigger.monitor.sourceLabel}. Investigate the incident, preserve its source provenance, update only the affected branch, and propose one coherent versioned correction.`,
        trigger,
      )
    },
  })

  const deleteCard = (nodeId: string) => {
    const node = nodes.find((candidate) => candidate.id === nodeId)
    const attachedEdges = edges.filter((edge) => edge.source === nodeId || edge.target === nodeId).length
    setNodes((current) => current.filter((candidate) => candidate.id !== nodeId))
    setEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId))
    if (selectedId === nodeId) setSelectedId('')
    setContextMenu(undefined)
    setActivity(`${node?.data.label ?? 'Card'} deleted · ${attachedEdges} attached edge${attachedEdges === 1 ? '' : 's'} removed`)
  }

  const exportPipelineJson = () => {
    const artifact = createPipelineExport(projectTitle, nodes, edges, versions)
    const url = URL.createObjectURL(new Blob([JSON.stringify(artifact, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${projectTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'data-lab-pipeline'}.json`
    link.click()
    URL.revokeObjectURL(url)
    setActivity(`Pipeline exported · schema v${artifact.schemaVersion} · credentials and local paths excluded`)
  }

  const exportDiagnosticsJson = async () => {
    if (!window.dataLab) { notifyError('Diagnostics require the Electron application'); return }
    try {
      const bundle = await window.dataLab.exportDiagnostics()
      const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `data-lab-diagnostics-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
      notifyToast(`Exported ${bundle.events.length} sanitized local events`, 'success', 'Diagnostics ready')
    } catch (error) { notifyError(error, 'Unable to export diagnostics') }
  }

  const openDiagnosticLogs = async () => {
    if (!window.dataLab) { notifyError('Diagnostics require the Electron application'); return }
    try { await window.dataLab.openDiagnosticLogs() } catch (error) { notifyError(error, 'Unable to open diagnostic logs') }
  }

  const loadDiagnosticBundle = async () => {
    if (!window.dataLab) throw new Error('Diagnostics require the Electron application')
    return window.dataLab.exportDiagnostics()
  }

  const clearIncidentReports = async () => {
    if (!window.dataLab?.clearIncidentEvents) throw new Error('Incident cleanup requires the Electron application')
    const result = await window.dataLab.clearIncidentEvents()
    setIncidentEvents([])
    notifyToast(`${result.deleted} local incident event${result.deleted === 1 ? '' : 's'} removed from this workspace.`, 'success', 'Reports cleared')
    return result
  }

  const importPipelineJson = async (file: File) => {
    try {
      const artifact = parsePipelineExport(await file.text())
      setNodes(artifact.graph.nodes)
      setEdges(artifact.graph.edges)
      setVersions(artifact.versions)
      setProjectTitle(artifact.projectTitle)
      setSelectedId(artifact.graph.nodes[0]?.id ?? '')
      setProposal(undefined)
      await workspacePersistence.persistImportedWorkspace({ projectTitle: artifact.projectTitle, nodes: artifact.graph.nodes, edges: artifact.graph.edges, versions: artifact.versions, projectSettings: { inspectorOpen, libraryOpen } })
      setActivity(`Pipeline imported after full validation · ${artifact.graph.nodes.length} cards · schema v${artifact.schemaVersion}`)
    } catch (error) {
      notifyError(error, 'Pipeline import failed')
      setActivity(`Import rejected · ${errorMessage(error, 'Invalid pipeline file')} · active workspace unchanged`)
    }
  }

  const fitCommittedGraph = () => {
    window.requestAnimationFrame(() => {
      void flowInstance.current?.fitView({ duration: 240, padding: 0.22 })
    })
  }

  const approveAgentProposal = async (writebackRequested: boolean) => {
    if (proposalApprovalRunning.current) return false
    proposalApprovalRunning.current = true
    setProposalApprovalBusy(true)
    try {
      const currentProposal = proposal
      const revisionId = pendingVersionId
      const relatedAssets = [...new Set(nodes.flatMap((node) => node.data.datahubUrn ? [node.data.datahubUrn] : []))]
      if (!currentProposal) {
        notifyToast('The reviewed proposal is no longer pending. The graph was not changed.', 'error', 'Approval unavailable')
        return false
      }
      if (!approveProposal()) return false
      const shouldResumePlayer = playerState === 'running' || resumePlayerAfterReview.current
      const continuePlayer = (objective: string) => {
        if (!shouldResumePlayer) return
        resumePlayerAfterReview.current = false
        setPlayerState('running')
        queueAutonomousStep(objective, playerSessionId.current)
      }
      if (projectTitle === 'Untitled pipeline') setProjectTitle(currentProposal.title.slice(0, 72))
      if (shouldResumePlayer) setActivity('Human Review approved · player resumed automatically · rereading the committed graph')
      if (currentProposal.incidentKey) void logIncident({ incidentKey: currentProposal.incidentKey, transition: 'agent-action', severity: 'info', title: currentProposal.title, detail: currentProposal.summary, versionId: revisionId })
      fitCommittedGraph()
      if (!writebackRequested) {
        continuePlayer(`Human Review approved "${currentProposal.title}". Reread the committed graph, reports, diagnostics and version memory, then propose the next coherent safe iteration. Do not repeat the approved diff.`)
        return true
      }
      if (!revisionId) {
        setActivity('Revision committed locally · DataHub write-back skipped because the pending revision ID was unavailable')
        continuePlayer(`Human Review approved "${currentProposal.title}". Reread the committed graph and propose the next coherent safe iteration.`)
        return true
      }
      try {
        setActivity('Revision committed locally · writing the explicitly approved Decision to DataHub…')
        const result = await writeDataHubDecision({
          revisionId,
          title: currentProposal.title,
          rationale: currentProposal.rationale,
          author: 'DATA LAB operator',
          relatedAssets,
        })
        setActivity(`Revision committed locally · DataHub write-back succeeded · ${result.summary}`)
      } catch (error) {
        notifyError(error, 'DataHub write-back failed')
        setActivity(`Revision committed locally · DataHub write-back failed · ${errorMessage(error)} · local graph was not rolled back`)
      }
      continuePlayer(`Human Review approved "${currentProposal.title}". Reread the committed graph, reports, diagnostics and version memory, then propose the next coherent safe iteration.`)
      return true
    } catch (error) {
      notifyError(error, 'Unable to apply the reviewed graph')
      setActivity(`Approval failed · ${errorMessage(error, 'Unexpected graph transaction error')} · graph unchanged`)
      recordDiagnostic({ category: 'revision', action: 'proposal.approve', status: 'error', detail: { message: errorMessage(error) } })
      return false
    } finally {
      proposalApprovalRunning.current = false
      setProposalApprovalBusy(false)
    }
  }

  useKeyboardShortcuts({
    add: () => addCard('source'),
    deleteSelected: () => selectedId ? deleteCard(selectedId) : setActivity('Delete unavailable · select a card first'),
    fitView: () => { void flowInstance.current?.fitView({ duration: 180, padding: 0.18 }); setActivity('Canvas fitted to the current graph') },
    openHelp: () => setShortcutsOpen(true),
    redo: graphHistory.redo,
    save: () => { void workspacePersistence.saveWorkspace() },
    undo: graphHistory.undo,
  })

  return <main className={`app-shell ${platformClass}${nativeFullscreen ? ' native-fullscreen' : ''}`}>
    <AppHeader
      agentBusy={agentRunning || playerStarting}
      cardCount={nodes.length}
      onOpenSettings={() => { setSettingsSection('appearance'); setSettingsOpen(true) }}
      onPause={pauseAgent}
      onPlay={playAgent}
      onStop={stopAgent}
      playerState={playerState}
      projectTitle={projectTitle}
      reviewPending={Boolean(proposal)}
      saveState={workspacePersistence.saveState}
    />

    {workspacePersistence.recovery && <WorkspaceRecoveryModal onDiscard={() => void workspacePersistence.resolveRecovery('discard')} onRecover={() => void workspacePersistence.resolveRecovery('recover')} updatedAt={workspacePersistence.recovery.updatedAt} />}
    {shortcutsOpen && <KeyboardShortcutsModal onClose={() => setShortcutsOpen(false)} />}
    {proposal && proposalReviewOpen && <ProposalReviewModal
      applying={proposalApprovalBusy}
      assistant={{
        activity,
        answer: reviewAssistantAnswer,
        busy: reviewAssistantBusy,
        connected: active.connected,
        context: { ai: active.connected ? `${active.label} ready` : `${active.label} offline`, cards: nodes.length, edges: edges.length, versions: versions.length, mcp: connectionMode === 'connected' ? `MCP ${mcpTransport} connected` : 'MCP offline', model: `${active.label} · ${active.model}` },
        onAsk: (question) => { void askReviewAssistant(question) },
        onOpenSettings: () => { setSettingsSection('ai'); setSettingsOpen(true) },
        onStop: stopReviewAssistant,
      }}
      proposal={proposal}
      relatedAssets={[...new Set(nodes.flatMap((node) => node.data.datahubUrn ? [node.data.datahubUrn] : []))]}
      revisionId={pendingVersionId}
      writebackAvailable={connectionMode === 'connected' && dataHubSettings.writebackEnabled && dataHubWritebackAvailable}
      onApply={(writebackRequested) => { void approveAgentProposal(writebackRequested).then((applied) => { if (applied) setProposalReviewOpen(false) }) }}
      onClose={() => setProposalReviewOpen(false)}
      onDiscard={() => { setProposalReviewOpen(false); rejectAgentProposal() }}
    />}

    {settingsOpen && <Suspense fallback={<div aria-live="polite" className="lazy-modal-loading" role="status">Loading workspace settings…</div>}><SettingsModal
      activeAiSource={activeAiSource}
      activeWorkspaceId={workspacePersistence.activeWorkspaceId}
      aiStatus={aiStatus}
      chatGPTStatus={chatGPTStatus}
      connectionMode={connectionMode}
      dataHubSettings={dataHubSettings}
      appUpdateBusy={appUpdates.busy}
      appUpdateStatus={appUpdates.status}
      errorCount={errors.length}
      findingCount={issues.length}
      incidentReportCount={incidentEvents.length}
      initialSection={settingsSection}
      mcpMessage={mcpMessage}
      mcpTransport={mcpTransport}
      onApprovePendingReview={(versionId) => {
        const reviewedVersion = versions.find((version) => version.id === versionId)
        const approved = approvePendingVersion(versionId)
        if (approved) {
          if (projectTitle === 'Untitled pipeline' && reviewedVersion) setProjectTitle(reviewedVersion.label.replace(/^Review · /, '').slice(0, 72))
          fitCommittedGraph()
          if (playerState === 'running') queueAutonomousStep('A stored Human Review version was approved. Reread the committed graph, reports, diagnostics and version memory, then propose the next coherent safe iteration.', playerSessionId.current)
        }
      }}
      onArchiveWorkspace={workspacePersistence.archiveWorkspace}
      onCheckForAppUpdate={appUpdates.check}
      onClearIncidentReports={clearIncidentReports}
      onAutoLayout={() => { setNodes((current) => layoutPipeline(current, edges)); setActivity('Topology-aware XY layout applied · Split branches preserved') }}
      onClose={() => setSettingsOpen(false)}
      onCancelChatGPTLogin={cancelChatGPTLogin}
      onConfigureChatGPT={configureChatGPT}
      onConnectChatGPT={connectChatGPT}
      onCreateWorkspace={workspacePersistence.createWorkspace}
      onDeleteWorkspace={workspacePersistence.deleteWorkspace}
      onDisconnectChatGPT={disconnectChatGPT}
      onEmergencyStop={stopAgent}
      onDuplicateWorkspace={workspacePersistence.duplicateWorkspace}
      onDownloadAppUpdate={appUpdates.download}
      onExportDiagnostics={exportDiagnosticsJson}
      onExportPipeline={exportPipelineJson}
      onImportPipeline={importPipelineJson}
      onInstallAppUpdate={appUpdates.install}
      onLoadDiagnostics={loadDiagnosticBundle}
      onSaveDiagnosticSettings={async (settings) => {
        if (!window.dataLab) throw new Error('Diagnostics require the Electron application')
        return window.dataLab.saveDiagnosticSettings(settings)
      }}
      onLoadPreset={(presetId) => { workspacePersistence.detachWorkspace(); loadPreset(presetId); setSettingsOpen(false) }}
      onOpenDiagnosticLogs={openDiagnosticLogs}
      onOpenSetupUpdater={appUpdates.openSetup}
      onOpenWorkspace={workspacePersistence.openWorkspace}
      onRefreshAiModelCatalog={refreshAiModelCatalog}
      onRejectPendingReview={rejectPendingVersionById}
      onRemindHumanReview={(version) => { if (window.dataLab) void window.dataLab.notifyHumanReview({ cardLabel: version.label, reason: version.description ?? 'Human Review is still pending.', versionId: version.id, remind: true }) }}
      onRenameWorkspace={workspacePersistence.renameWorkspace}
      onSaveAiSettings={saveAiConnection}
      onSaveDataHubSettings={saveDataHubSettings}
      onSelectActiveAiSource={selectActiveAgentSource}
      onSetAppUpdateChannel={appUpdates.setChannel}
      onSyncDataHub={syncDataHub}
      onTestAiConnection={testAiConnection}
      onThemeChange={setTheme}
      onValidate={() => { recordDiagnostic({ category: 'validation', action: 'pipeline.validate', status: errors.length ? 'error' : 'success', detail: { blockingIssues: errors.length, totalFindings: issues.length, cardCount: nodes.length } }); setActivity(`${errors.length} blocking issue${errors.length === 1 ? '' : 's'} · ${issues.length} total findings`) }}
      onRestoreVersion={restoreVersion}
      onSaveVersion={saveManualVersion}
      onSaveWorkspace={workspacePersistence.saveWorkspace}
      projectTitle={projectTitle}
      selectedVersionId={requestedVersionId}
      theme={theme}
      versions={versions.map(({ id, label, createdAt, origin, blockingIssues, status, description, evidence }) => ({ id, label, createdAt, origin, blockingIssues, status, description, evidence }))}
      workspaceSaveState={workspacePersistence.saveState}
      workspaces={workspacePersistence.workspaces}
    /></Suspense>}

    <section className={`workspace${leftPanelOpen ? '' : ' library-collapsed'}${rightPanelOpen ? '' : ' inspector-collapsed'}`}>
      <div aria-hidden={!leftPanelOpen} className={`library-panel-shell ${leftPanelOpen ? '' : 'is-closed'}`} id="data-lab-left-panel" inert={!leftPanelOpen} tabIndex={-1}>
        {leftOperationsPanel === 'actions'
          ? <aside aria-label="Agent actions" className="left-operations-panel operations-panel" id="data-lab-actions"><AgentActionsView busy={activityBusy} history={agentActionHistory} onClose={() => setLeftOperationsPanel(undefined)} playerState={playerState} /></aside>
          : leftOperationsPanel === 'logs'
            ? <aside aria-label="Live activity log" className="left-operations-panel operations-panel" id="data-lab-live-logs"><LiveActivityView busy={activityBusy} entries={actionHistory} onClose={() => setLeftOperationsPanel(undefined)} /></aside>
            : <CardLibraryView onAddCard={addCard} onClose={() => setLibraryOpen(false)} />}
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
        onConnect={onConnect}
        onReconnect={onReconnect}
        onDeleteCard={deleteCard}
        onDrop={dropLibraryCard}
        onEdgesChange={onEdgesChange}
        onEditCard={(nodeId, label) => { setSelectedId(nodeId); setContextMenu(undefined); setActivity(`${label} opened in the inspector`) }}
        onFlowInit={(instance) => { flowInstance.current = instance }}
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
        ? <aside aria-label="Incident reports" className="inspector-panel operations-panel" id="data-lab-reports"><IncidentReportsView events={incidentEvents} incidents={incidentSummaries} onClose={() => setReportsOpen(false)} onOpenProposal={() => setProposalReviewOpen(true)} onSelectCard={(nodeId) => { setSelectedId(nodeId); setReportsOpen(false); setInspectorOpen(true) }} proposal={proposal?.incidentKey ? proposal : undefined} /></aside>
        : <aside aria-hidden={!inspectorOpen} aria-label="Card inspector" className={`inspector-panel ${inspectorOpen ? '' : 'is-closed'}`} id="data-lab-inspector" inert={!inspectorOpen} tabIndex={-1}>
          <CardInspectorView dataHubConnected={connectionMode === 'connected'} errorCount={errors.length} issues={issues} onAgentRework={reworkSelectedWithAgent} onBindDataHubSource={bindDataHubSource} onClose={() => setInspectorOpen(false)} onFocusDiagram={focusIncidentDiagram} onInspectDataHubAsset={inspectDataHubAsset} onOpenDataHubSettings={() => { setSettingsSection('datahub'); setSettingsOpen(true) }} onSearchDataHub={searchDataHubAssets} onSelectNode={setSelectedId} onUpdate={updateSelected} selected={selected} workbenchAssets={Object.fromEntries(nodes.flatMap((node) => node.data.datahubUrn ? [[node.data.datahubUrn, { nodeId: node.id, label: node.data.label }]] : []))} />
        </aside>}
    </section>

    {proposal && !proposalReviewOpen && <button className="proposal-review-reopen" onClick={() => setProposalReviewOpen(true)} type="button"><span aria-hidden="true">✦</span> Review agent proposal</button>}

    <AppFooter activity={activity} playerState={playerState} />
  </main>
}
