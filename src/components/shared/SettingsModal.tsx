import { Activity, AlertTriangle, Bot, CheckCircle2, Database, Download, FileDown, FolderKanban, FolderOpen, History, KeyRound, Languages, LayoutTemplate, LogIn, LogOut, Moon, Network, Palette, Play, RefreshCw, Save, Settings, ShieldCheck, Sun, UserRound, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ActiveAiSource, AiSettings, AiStatus, ApiProvider, ChatGPTSessionStatus } from '../../domain/ai'
import type { PipelinePresetId } from '../../domain/pipeline'
import type { WorkspaceSaveState, WorkspaceSummary } from '../../domain/workspace'
import { notifyError } from '../../domain/toasts'
import { ActionButton } from './ActionButton'
import { Modal } from './Modal'
import { VersionBrowser, type VersionSummary } from './VersionBrowser'
import { WorkspaceManager } from './WorkspaceManager'
import { useLanguage } from '../../i18n'
import type { AppUpdateChannel, AppUpdateStatus } from '../../domain/updates'
import type { IncidentEvent, IncidentSummary } from '../../domain/incidents'

export type SettingsSection = 'appearance' | 'workspaces' | 'ai' | 'datahub' | 'updates' | 'diagnostics' | 'presets' | 'pipeline' | 'versions'

interface SettingsModalProps {
  activeAiSource: ActiveAiSource
  appUpdateBusy: boolean
  appUpdateStatus: AppUpdateStatus
  aiStatus: AiStatus
  chatGPTStatus: ChatGPTSessionStatus
  connectionMode: 'demo' | 'connected'
  dataHubSettings: {
    transport: 'http' | 'stdio'
    url: string
    tokenConfigured: boolean
    tokenSource: 'encrypted' | 'environment' | 'none'
    encryptionAvailable: boolean
    writebackEnabled: boolean
  }
  errorCount: number
  findingCount: number
  mcpMessage: string
  mcpTransport: 'demo' | 'http' | 'stdio'
  initialSection?: SettingsSection
  incidentEvents: IncidentEvent[]
  incidentSummaries: IncidentSummary[]
  onAutoLayout: () => void
  onApprovePendingReview: (versionId: string) => void
  onArchiveWorkspace: (workspaceId: string) => Promise<void>
  onCheckForAppUpdate: () => Promise<AppUpdateStatus>
  onClose: () => void
  onCancelChatGPTLogin: () => Promise<void>
  onConfigureChatGPT: (configuration: { model: string; effort: string }) => Promise<void>
  onConnectChatGPT: () => Promise<void>
  onCreateWorkspace: (name: string) => Promise<void>
  onDisconnectChatGPT: () => Promise<void>
  onEmergencyStop: () => void
  onDuplicateWorkspace: (workspaceId: string) => Promise<void>
  onDownloadAppUpdate: () => Promise<AppUpdateStatus>
  onExportPipeline: () => void
  onExportDiagnostics: () => Promise<void>
  onImportPipeline: (file: File) => Promise<void>
  onInstallAppUpdate: () => Promise<AppUpdateStatus>
  onLoadPreset: (preset: PipelinePresetId) => void
  onOpenWorkspace: (workspaceId: string) => Promise<void>
  onOpenDiagnosticLogs: () => Promise<void>
  onOpenSetupUpdater: () => Promise<{ opened: true; channel: AppUpdateChannel; path: string }>
  onRefreshAiModelCatalog: (provider: ApiProvider) => Promise<AiStatus>
  onRejectPendingReview: (versionId: string) => void
  onRemindHumanReview: (version: VersionSummary) => void
  onRenameWorkspace: (workspaceId: string, name: string) => Promise<void>
  onSaveAiSettings: (settings: Partial<AiSettings> & { apiKey?: string; clearKey?: boolean }) => Promise<AiStatus>
  onSelectActiveAiSource: (source: ActiveAiSource) => Promise<void>
  onSetAppUpdateChannel: (channel: AppUpdateChannel) => Promise<AppUpdateStatus>
  onSaveDataHubSettings: (settings: { transport: 'http' | 'stdio'; url: string; token?: string; clearToken?: boolean; writebackEnabled?: boolean }) => Promise<unknown>
  onSyncDataHub: () => Promise<void>
  onTestAiConnection: () => Promise<void>
  onValidate: () => void
  onThemeChange: (theme: 'light' | 'dark') => void
  onRestoreVersion: (versionId: string) => void
  onSaveVersion: () => void
  onSaveWorkspace: () => Promise<void>
  activeWorkspaceId: string | null
  projectTitle: string
  selectedVersionId?: string
  theme: 'light' | 'dark'
  versions: VersionSummary[]
  workspaceSaveState: WorkspaceSaveState
  workspaces: WorkspaceSummary[]
}

export function SettingsModal(props: SettingsModalProps) {
  const { language, setLanguage } = useLanguage()
  const { activeAiSource, activeWorkspaceId, aiStatus, appUpdateBusy, appUpdateStatus, chatGPTStatus, connectionMode, dataHubSettings, errorCount, findingCount, incidentEvents, incidentSummaries, initialSection, mcpMessage, mcpTransport, onApprovePendingReview, onArchiveWorkspace, onAutoLayout, onCancelChatGPTLogin, onCheckForAppUpdate, onClose, onConfigureChatGPT, onConnectChatGPT, onCreateWorkspace, onDisconnectChatGPT, onDownloadAppUpdate, onDuplicateWorkspace, onEmergencyStop, onExportDiagnostics, onExportPipeline, onImportPipeline, onInstallAppUpdate, onLoadPreset, onOpenDiagnosticLogs, onOpenSetupUpdater, onOpenWorkspace, onRefreshAiModelCatalog, onRejectPendingReview, onRemindHumanReview, onRenameWorkspace, onRestoreVersion, onSaveAiSettings, onSaveDataHubSettings, onSaveVersion, onSaveWorkspace, onSelectActiveAiSource, onSetAppUpdateChannel, onSyncDataHub, onTestAiConnection, onThemeChange, onValidate, projectTitle, selectedVersionId, theme, versions, workspaceSaveState, workspaces } = props
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection ?? 'appearance')
  const [aiSettings, setAiSettings] = useState(aiStatus.settings)
  const [aiBusy, setAiBusy] = useState(false)
  const [chatGPTConnecting, setChatGPTConnecting] = useState(false)
  const [aiFeedback, setAiFeedback] = useState('')
  const [dataHubBusy, setDataHubBusy] = useState(false)
  const [dataHubFeedback, setDataHubFeedback] = useState('')
  const [dataHubTransport, setDataHubTransport] = useState<'http' | 'stdio'>(dataHubSettings.transport)
  const [dataHubWriteback, setDataHubWriteback] = useState(dataHubSettings.writebackEnabled)
  const [updateFeedback, setUpdateFeedback] = useState('')
  const apiKeyRef = useRef<HTMLInputElement>(null)
  const modelIdRef = useRef<HTMLInputElement>(null)
  const dataHubUrlRef = useRef<HTMLInputElement>(null)
  const dataHubTokenRef = useRef<HTMLInputElement>(null)
  const chatGPTConnectEpoch = useRef(0)

  useEffect(() => { if (initialSection) setActiveSection(initialSection) }, [initialSection])
  useEffect(() => { setDataHubTransport(dataHubSettings.transport) }, [dataHubSettings.transport])
  useEffect(() => { setDataHubWriteback(dataHubSettings.writebackEnabled) }, [dataHubSettings.writebackEnabled])

  const saveAndConnectDataHub = async () => {
    setDataHubBusy(true)
    setDataHubFeedback('')
    try {
      const token = dataHubTokenRef.current?.value.trim()
      await onSaveDataHubSettings({ transport: dataHubTransport, url: dataHubUrlRef.current?.value.trim() ?? '', token: token || undefined, writebackEnabled: dataHubWriteback })
      if (dataHubTokenRef.current) dataHubTokenRef.current.value = ''
      await onSyncDataHub()
      setDataHubFeedback('DataHub connection saved securely and MCP tools discovered.')
    } catch (error) {
      notifyError(error, 'Unable to connect DataHub MCP')
      setDataHubFeedback(error instanceof Error ? error.message : 'Unable to connect DataHub MCP.')
    } finally { setDataHubBusy(false) }
  }

  const removeDataHubToken = async () => {
    setDataHubBusy(true)
    setDataHubFeedback('')
    try {
      await onSaveDataHubSettings({ transport: dataHubTransport, url: dataHubUrlRef.current?.value.trim() || dataHubSettings.url, clearToken: true, writebackEnabled: dataHubWriteback })
      if (dataHubTokenRef.current) dataHubTokenRef.current.value = ''
      setDataHubFeedback(dataHubSettings.tokenSource === 'environment' ? 'The app token was cleared. An environment token may remain active.' : 'The encrypted DataHub token was removed.')
    } catch (error) {
      notifyError(error, 'Unable to remove the DataHub token')
      setDataHubFeedback(error instanceof Error ? error.message : 'Unable to remove the DataHub token.')
    } finally { setDataHubBusy(false) }
  }

  const draftAiSettings = (): AiSettings => ({
    ...aiSettings,
    model: modelIdRef.current?.value.trim() || aiSettings.model,
  })

  const clearSavedKey = () => {
    if (apiKeyRef.current) apiKeyRef.current.value = ''
  }

  const applySavedSettings = (status: AiStatus) => {
    setAiSettings(status.settings)
    if (modelIdRef.current) modelIdRef.current.value = status.settings.model
  }

  const saveAi = async () => {
    setAiBusy(true)
    setAiFeedback('')
    try {
      const apiKey = apiKeyRef.current?.value.trim()
      const status = await onSaveAiSettings({ ...draftAiSettings(), apiKey: apiKey || undefined })
      applySavedSettings(status)
      clearSavedKey()
      setAiFeedback('Connection settings saved securely.')
    } catch (error) {
      notifyError(error, 'Unable to save the AI connection')
      setAiFeedback(error instanceof Error ? error.message : 'Unable to save the AI connection.')
    } finally { setAiBusy(false) }
  }

  const testAi = async () => {
    setAiBusy(true)
    setAiFeedback('')
    try {
      const draft = draftAiSettings()
      const apiKey = apiKeyRef.current?.value.trim()
      const saved = apiKey
        ? await onSaveAiSettings({ ...draft, apiKey })
        : await onSaveAiSettings(draft)
      applySavedSettings(saved)
      clearSavedKey()
      await onTestAiConnection()
      setAiFeedback(`${draft.provider === 'anthropic' ? 'Claude' : draft.provider === 'moonshot' ? 'Kimi' : 'OpenAI'} connection and model catalog verified.`)
    } catch (error) {
      notifyError(error, 'Provider connection failed')
      setAiFeedback(error instanceof Error ? error.message : 'Provider connection failed.')
    } finally { setAiBusy(false) }
  }

  const refreshModels = async () => {
    setAiBusy(true)
    setAiFeedback('Refreshing the provider model catalog…')
    try {
      const status = await onRefreshAiModelCatalog(aiSettings.provider)
      const provider = status.providers[aiSettings.provider]
      setAiFeedback(`Catalog refreshed · ${provider.catalog.length} models · ${provider.catalogRefreshedAt ? new Date(provider.catalogRefreshedAt).toLocaleString() : 'just now'}. Your manual model ID was preserved.`)
    } catch (error) {
      notifyError(error, 'Model catalog refresh failed')
      setAiFeedback(`${error instanceof Error ? error.message : 'Model catalog refresh failed'} · The current manual model ID is unchanged.`)
    } finally { setAiBusy(false) }
  }

  const removeProviderKey = async () => {
    setAiBusy(true)
    setAiFeedback('')
    try {
      const status = await onSaveAiSettings({ provider: aiSettings.provider, clearKey: true })
      applySavedSettings(status)
      clearSavedKey()
      setAiFeedback(status.providers[aiSettings.provider].credentialSource === 'environment' ? 'The saved key was removed. An environment key remains active outside DATA LAB.' : 'The provider key was removed from secure storage.')
    } catch (error) {
      notifyError(error, 'Unable to remove the provider key')
      setAiFeedback(error instanceof Error ? error.message : 'Unable to remove the provider key.')
    } finally { setAiBusy(false) }
  }

  const connectChatGPTAccount = async () => {
    const attempt = ++chatGPTConnectEpoch.current
    setAiBusy(true)
    setChatGPTConnecting(true)
    setAiFeedback('Opening the secure ChatGPT sign-in…')
    try {
      await onConnectChatGPT()
      if (chatGPTConnectEpoch.current !== attempt) return
      setAiFeedback('ChatGPT account connected and selected for the next agent request.')
    } catch (error) {
      if (chatGPTConnectEpoch.current !== attempt) return
      notifyError(error, 'Unable to connect the ChatGPT account')
      setAiFeedback(error instanceof Error ? error.message : 'Unable to connect the ChatGPT account.')
    } finally {
      if (chatGPTConnectEpoch.current === attempt) {
        setChatGPTConnecting(false)
        setAiBusy(false)
      }
    }
  }

  const cancelChatGPTAccountLogin = async () => {
    chatGPTConnectEpoch.current += 1
    setChatGPTConnecting(false)
    setAiBusy(false)
    setAiFeedback('Cancelling ChatGPT sign-in…')
    try {
      await onCancelChatGPTLogin()
      setAiFeedback('ChatGPT sign-in cancelled. You can retry safely.')
    } catch (error) {
      notifyError(error, 'Unable to cancel the ChatGPT sign-in')
      setAiFeedback(error instanceof Error ? error.message : 'Unable to cancel the ChatGPT sign-in.')
    }
  }

  const disconnectChatGPTAccount = async () => {
    setAiBusy(true)
    setAiFeedback('')
    try {
      await onDisconnectChatGPT()
      setAiFeedback('ChatGPT account disconnected.')
    } catch (error) {
      notifyError(error, 'Unable to disconnect the ChatGPT account')
      setAiFeedback(error instanceof Error ? error.message : 'Unable to disconnect the ChatGPT account.')
    } finally { setAiBusy(false) }
  }

  const chatGPTModel = chatGPTStatus.models?.find((model) => model.id === chatGPTStatus.selectedModel) ?? chatGPTStatus.models?.find((model) => model.isDefault) ?? chatGPTStatus.models?.[0]
  const chatGPTEffort = chatGPTModel?.efforts.includes(chatGPTStatus.selectedEffort ?? '') ? chatGPTStatus.selectedEffort ?? '' : chatGPTModel?.defaultEffort ?? chatGPTModel?.efforts[0] ?? ''
  const chooseProvider = (provider: ApiProvider) => setAiSettings((current) => ({ ...current, provider, model: aiStatus.providers[provider].model }))
  const activeSourceConnected = activeAiSource === 'chatgpt' ? chatGPTStatus.connected : aiStatus.providers[activeAiSource].connected
  const activeSourceModel = activeAiSource === 'chatgpt' ? chatGPTStatus.selectedModel ?? 'ChatGPT' : aiStatus.providers[activeAiSource].model
  const selectedProviderStatus = aiStatus.providers[aiSettings.provider]
  const selectedCapabilities = selectedProviderStatus.capabilities

  const runUpdateAction = async (action: () => Promise<AppUpdateStatus | { opened: true; channel: AppUpdateChannel; path: string }>) => {
    setUpdateFeedback('')
    try {
      const status = await action()
      setUpdateFeedback('message' in status ? status.message : `DATA LAB Setup opened on ${status.channel === 'main' ? 'Main' : 'Stable'}.`)
    } catch (error) {
      setUpdateFeedback(error instanceof Error ? error.message : 'The update action was stopped safely.')
    }
  }

  const chooseActiveSource = async (source: ActiveAiSource) => {
    setAiBusy(true)
    setAiFeedback('')
    try {
      await onSelectActiveAiSource(source)
      setAiFeedback(`${source === 'chatgpt' ? 'ChatGPT' : source === 'anthropic' ? 'Claude' : source === 'moonshot' ? 'Kimi' : 'OpenAI'} will run the next agent request.`)
    } catch (error) {
      notifyError(error, 'Unable to select the active agent source')
      setAiFeedback(error instanceof Error ? error.message : 'Unable to select the active agent source.')
    } finally { setAiBusy(false) }
  }

  const menu = (id: SettingsSection, label: string, detail: string, icon: React.ReactNode) => <button aria-current={activeSection === id ? 'page' : undefined} className={activeSection === id ? 'is-active' : ''} onClick={() => setActiveSection(id)} type="button">{icon}<span><strong>{label}</strong><small>{detail}</small></span></button>

  return <Modal ariaLabelledby="settings-title" className="settings-modal" onClose={onClose}>
    <header className="settings-heading">
      <span><Settings size={19} /></span>
      <div><small>WORKSPACE</small><h2 id="settings-title">Settings</h2><p>Connections, examples, appearance and safe graph history.</p></div>
      <button aria-label="Close settings" className="settings-close" onClick={onClose} type="button"><X size={18} /></button>
    </header>

    <div className="settings-body">
      <nav aria-label="Settings sections" className="settings-sidebar">
        <small>SETTINGS MENU</small>
        {menu('appearance', 'Appearance', 'Theme and interface', <Palette size={17} />)}
        {menu('workspaces', 'Workspaces', 'Save, switch and recover', <FolderKanban size={17} />)}
        {menu('ai', 'AI connection', 'Model and quality', <Bot size={17} />)}
        {menu('datahub', 'DataHub MCP', 'Trusted data context', <Database size={17} />)}
        {menu('updates', 'Updates', 'Signed stable and main builds', <Download size={17} />)}
        {menu('diagnostics', 'Diagnostics', 'Local, private and bounded', <Activity size={17} />)}
        {menu('presets', 'Examples', 'Start empty or explore', <LayoutTemplate size={17} />)}
        {menu('pipeline', 'Pipeline', 'Layout and validation', <Network size={17} />)}
        {menu('versions', 'Versions', 'Safe graph checkpoints', <History size={17} />)}
        <div className="settings-sidebar-status"><span className={activeSourceConnected ? 'connected' : 'demo'} /><div><strong>Active agent</strong><small>{activeSourceConnected ? activeSourceModel : `${activeAiSource} · not connected`}</small></div></div>
      </nav>

      <div className="settings-content">
        {activeSection === 'appearance' && <article className="settings-page">
          <div className="settings-page-heading"><small>APPEARANCE</small><h3>Choose your workspace theme</h3><p>Card identities stay distinct in both light and dark modes.</p></div>
          <section className="settings-section settings-appearance">
            <div className="settings-section-title"><span>Color mode</span><small>Local to this device</small></div>
            <div aria-label="Color theme" className="theme-switch" role="group">
              <button aria-pressed={theme === 'light'} className={theme === 'light' ? 'is-active' : ''} onClick={() => onThemeChange('light')} type="button"><Sun size={20} /><span><strong>Light</strong><small>Clear and bright workspace</small></span></button>
              <button aria-pressed={theme === 'dark'} className={theme === 'dark' ? 'is-active' : ''} onClick={() => onThemeChange('dark')} type="button"><Moon size={20} /><span><strong>Dark</strong><small>Distinct colored cards on slate</small></span></button>
            </div>
          </section>
          <section className="settings-section settings-appearance">
            <div className="settings-section-title"><span><Languages size={15} /> Interface language</span><small>English by default · saved locally</small></div>
            <div aria-label="Interface language" className="theme-switch language-switch" role="group">
              <button aria-pressed={language === 'en'} className={language === 'en' ? 'is-active' : ''} onClick={() => setLanguage('en')} type="button"><span><strong>English</strong><small>Default interface and agent replies</small></span></button>
              <button aria-pressed={language === 'fr'} className={language === 'fr' ? 'is-active' : ''} onClick={() => setLanguage('fr')} type="button"><span><strong>Français</strong><small>Interface et réponses de l’agent</small></span></button>
            </div>
          </section>
        </article>}

        {activeSection === 'workspaces' && <article className="settings-page">
          <div className="settings-page-heading"><small>WORKSPACES</small><h3>Local projects and recovery</h3><p>Each graph, version history and pending agent review stays isolated in its own SQLite workspace.</p></div>
          <WorkspaceManager activeWorkspaceId={activeWorkspaceId} onArchive={onArchiveWorkspace} onCreate={onCreateWorkspace} onDuplicate={onDuplicateWorkspace} onOpen={onOpenWorkspace} onRename={onRenameWorkspace} onSave={onSaveWorkspace} projectTitle={projectTitle} saveState={workspaceSaveState} workspaces={workspaces} />
        </article>}

        {activeSection === 'diagnostics' && <article className="settings-page">
          <div className="settings-page-heading"><small>DIAGNOSTICS</small><h3>Private local activity log</h3><p>Inspect failures without sending catalog content or credentials to a telemetry service.</p></div>
          <section className="settings-section diagnostics-settings">
            <div className="settings-section-title"><span>Local diagnostics</span><small>7 days · 500 events maximum</small></div>
            <div className="diagnostics-privacy"><CheckCircle2 size={18} /><div><strong>External telemetry disabled</strong><small>Tokens, authorization headers and sensitive prompts are redacted before storage and export.</small></div></div>
            <div className="incident-overview">
              <div><strong>{incidentSummaries.filter((incident) => incident.status !== 'resolved').length}</strong><small>Active incidents</small></div>
              <div><strong>{incidentSummaries.filter((incident) => incident.severity === 'critical' && incident.status !== 'resolved').length}</strong><small>Critical</small></div>
              <div><strong>{incidentSummaries.filter((incident) => incident.status === 'waiting-review').length}</strong><small>Waiting review</small></div>
              <div><strong>{incidentSummaries.filter((incident) => incident.status === 'resolved').length}</strong><small>Recovered</small></div>
            </div>
            {incidentSummaries.length > 0 && <div className="incident-ledger">{incidentSummaries.map((incident) => <article className={`status-${incident.status} severity-${incident.severity}`} key={incident.incidentKey}>
              <div><strong>{incident.title}</strong><span>{incident.status.replace('-', ' ')}</span></div>
              <p>{incident.detail}</p>
              <small>{incident.occurrenceCount} occurrence{incident.occurrenceCount === 1 ? '' : 's'} · {incident.eventCount} transition{incident.eventCount === 1 ? '' : 's'} · updated {new Date(incident.updatedAt).toLocaleString()}</small>
            </article>)}</div>}
            <div className="settings-section-title incident-title"><span>Incident timeline</span><small>{incidentEvents.length} local event{incidentEvents.length === 1 ? '' : 's'}</small></div>
            {incidentEvents.length ? <ol className="incident-timeline">{incidentEvents.map((event) => <li className={`incident-${event.transition} severity-${event.severity}`} key={event.id}>
              <span>{event.transition === 'recovered' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}</span>
              <div><strong>{event.title}</strong><p>{event.detail}</p><small>{event.transition.replace('-', ' ')} · {event.severity} · {new Date(event.createdAt).toLocaleString()}{event.cardId ? ` · card ${event.cardId}` : ''}{event.versionId ? ` · revision ${event.versionId}` : ''}</small></div>
            </li>)}</ol> : <div className="incident-empty"><CheckCircle2 size={17} /><div><strong>No incident recorded</strong><small>Live Monitor changes, agent actions, human reviews and returns to normal will appear here.</small></div></div>}
            <div className="diagnostics-actions"><ActionButton icon={<FolderOpen size={15} />} onClick={() => void onOpenDiagnosticLogs()}>Open local logs</ActionButton><ActionButton icon={<FileDown size={15} />} onClick={() => void onExportDiagnostics()} variant="primary">Export sanitized bundle</ActionButton></div>
          </section>
        </article>}

        {activeSection === 'ai' && <article className="settings-page">
          <div className="settings-page-heading"><small>AI CONNECTION</small><h3>Connect the real pipeline agent</h3><p>Without a provider connection, DATA LAB never generates a simulated proposal.</p></div>
          <section className="settings-section active-agent-source">
            <div className="settings-section-title"><span>Active agent source</span><small>Exactly one source runs each request</small></div>
            <div aria-label="Active agent source" className="model-grid active-source-grid" role="radiogroup">{([
              ['chatgpt', 'ChatGPT', chatGPTStatus.connected, chatGPTStatus.selectedModel ?? 'Account session'],
              ['openai', 'OpenAI', aiStatus.providers.openai.connected, aiStatus.providers.openai.model],
              ['anthropic', 'Claude', aiStatus.providers.anthropic.connected, aiStatus.providers.anthropic.model],
              ['moonshot', 'Kimi', aiStatus.providers.moonshot.connected, aiStatus.providers.moonshot.model],
            ] as const).map(([source, label, connected, model]) => <button aria-checked={activeAiSource === source} className={activeAiSource === source ? 'is-active' : ''} disabled={!connected || aiBusy} key={source} onClick={() => void chooseActiveSource(source)} role="radio" type="button"><strong>{label}</strong><small>{model}</small><code>{connected ? activeAiSource === source ? 'active' : 'ready' : 'connect first'}</code></button>)}</div>
          </section>
          <section className="settings-section chatgpt-connection-panel">
            <div className="settings-section-title"><span><UserRound size={15} /> ChatGPT account</span><small>{chatGPTStatus.connected ? 'Connected' : 'Optional'}</small></div>
            {chatGPTStatus.connected ? <>
              <div className="chatgpt-account-status"><CheckCircle2 size={19} /><div><strong>{chatGPTStatus.email ?? 'ChatGPT account connected'}</strong><small>{chatGPTStatus.planType ? `${chatGPTStatus.planType} plan` : 'Codex account session'} · no API key required</small></div></div>
              {chatGPTModel && <div className="ai-option-grid"><label className="settings-field"><span>ChatGPT model</span><select onChange={(event) => { const model = chatGPTStatus.models?.find((item) => item.id === event.target.value); if (model) void onConfigureChatGPT({ model: model.id, effort: model.defaultEffort ?? model.efforts[0] ?? '' }) }} value={chatGPTModel.id}>{chatGPTStatus.models?.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}</select></label><label className="settings-field"><span>Reasoning</span><select disabled={!chatGPTModel.efforts.length} onChange={(event) => void onConfigureChatGPT({ model: chatGPTModel.id, effort: event.target.value })} value={chatGPTEffort}>{chatGPTModel.efforts.map((effort) => <option key={effort} value={effort}>{effort}</option>)}</select></label></div>}
              <div className="ai-connection-actions"><ActionButton disabled={aiBusy} icon={<LogOut size={14} />} onClick={() => void disconnectChatGPTAccount()} variant="ghost">Disconnect ChatGPT</ActionButton></div>
            </> : <><p className="settings-feedback">Sign in with a dedicated DATA LAB Codex session. It does not reuse or expose another app’s credentials.</p><div className="ai-connection-actions">{chatGPTConnecting
              ? <ActionButton icon={<X size={14} />} onClick={() => void cancelChatGPTAccountLogin()} variant="ghost">Cancel ChatGPT sign-in</ActionButton>
              : <ActionButton disabled={aiBusy} icon={<LogIn size={14} />} onClick={() => void connectChatGPTAccount()} variant="primary">Continue with ChatGPT</ActionButton>}</div>{chatGPTStatus.error && <p className="settings-feedback">{chatGPTStatus.error} · You can retry the connection.</p>}</>}
          </section>
          <section className="settings-section ai-connection-panel">
            <div className="settings-section-title"><span>API providers</span><small>{aiStatus.providers[aiSettings.provider].connected ? `Connected · ${aiStatus.providers[aiSettings.provider].credentialSource}` : 'Not connected'}</small></div>
            <div className="model-grid provider-grid" role="radiogroup" aria-label="API provider">{([['openai', 'OpenAI', 'Responses API'], ['anthropic', 'Claude', 'Anthropic Messages'], ['moonshot', 'Kimi', 'Moonshot API']] as const).map(([provider, label, detail]) => <button aria-checked={aiSettings.provider === provider} className={aiSettings.provider === provider ? 'is-active' : ''} key={provider} onClick={() => chooseProvider(provider)} role="radio" type="button"><strong>{label}</strong><small>{detail}</small><code>{aiStatus.providers[provider].connected ? 'connected' : 'API key'}</code></button>)}</div>
            <label className="settings-field"><span><KeyRound size={14} /> {aiSettings.provider === 'anthropic' ? 'Anthropic' : aiSettings.provider === 'moonshot' ? 'Moonshot' : 'OpenAI'} API key</span><input autoComplete="off" defaultValue="" key={`api-key-${aiSettings.provider}`} placeholder={aiStatus.providers[aiSettings.provider].connected ? 'Saved securely · enter only to replace' : 'Paste key locally…'} ref={apiKeyRef} type="password" /><small>The key stays encrypted in Electron secure storage and is never exposed back to React.</small></label>
            <label className="settings-field"><span>Model ID</span><input defaultValue={aiSettings.model} key={`model-${aiSettings.provider}`} list={`models-${aiSettings.provider}`} placeholder="Model returned by this provider" ref={modelIdRef} type="text" /><datalist id={`models-${aiSettings.provider}`}>{selectedProviderStatus.catalog.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}</datalist><small>{selectedProviderStatus.modelUnavailable ? 'This manual model is not in the latest catalog; it is preserved but may be unavailable.' : selectedCapabilities.deprecated ? 'This model appears deprecated. Refresh the catalog and choose a supported replacement.' : selectedProviderStatus.catalogRefreshedAt ? `Catalog refreshed ${new Date(selectedProviderStatus.catalogRefreshedAt).toLocaleString()}.` : 'Refresh models to discover supported capabilities. Manual IDs are preserved.'}</small></label>
            <div className="ai-option-grid">
              <label className="settings-field"><span>Reasoning quality</span><select disabled={!selectedCapabilities.reasoning} onChange={(event) => setAiSettings((current) => ({ ...current, reasoningEffort: event.target.value as AiSettings['reasoningEffort'] }))} value={aiSettings.reasoningEffort}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="xhigh">Extra high</option><option value="max">Maximum</option></select><small>{selectedCapabilities.reasoning ? 'Supported by this model.' : 'Unavailable for this provider/model.'}</small></label>
              <label className="settings-field"><span>Answer detail</span><select disabled={!selectedCapabilities.verbosity} onChange={(event) => setAiSettings((current) => ({ ...current, verbosity: event.target.value as AiSettings['verbosity'] }))} value={aiSettings.verbosity}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select><small>{selectedCapabilities.verbosity ? 'Supported by this model.' : 'Unavailable for this provider/model.'}</small></label>
              <label className="settings-field"><span>Service speed</span><select disabled={!selectedCapabilities.serviceTier} onChange={(event) => setAiSettings((current) => ({ ...current, serviceTier: event.target.value as AiSettings['serviceTier'] }))} value={aiSettings.serviceTier}><option value="auto">Auto</option><option value="priority">Priority (if enabled)</option></select><small>{selectedCapabilities.serviceTier ? 'Provider tier selection is available.' : 'Provider-managed for this model.'}</small></label>
            </div>
            <div className="ai-connection-actions"><ActionButton disabled={aiBusy || selectedProviderStatus.credentialSource !== 'encrypted'} onClick={removeProviderKey} variant="ghost">Remove saved key</ActionButton><ActionButton disabled={aiBusy || !selectedProviderStatus.connected} icon={<RefreshCw size={14} />} onClick={refreshModels} variant="ghost">Refresh models</ActionButton><ActionButton disabled={aiBusy} onClick={saveAi} variant="ghost">Save settings</ActionButton><ActionButton disabled={aiBusy} onClick={testAi} variant="primary">{aiBusy ? 'Checking…' : 'Test connection'}</ActionButton></div>
            {aiFeedback && <p aria-live="polite" className="settings-feedback">{aiFeedback}</p>}
          </section>
          <p className="settings-note">Choose either a ChatGPT account or an API provider. If ChatGPT is connected, DATA LAB uses that account first; disconnect it to use the selected API provider.</p>
        </article>}

        {activeSection === 'datahub' && <article className="settings-page">
          <div className="settings-page-heading"><small>DATAHUB MCP</small><h3>Agent context server</h3><p>Give the model trusted schema, ownership and lineage context through MCP.</p></div>
          <section className="settings-section">
            <div className="settings-section-title"><span>MCP connection</span><small>{mcpTransport === 'demo' ? 'Not configured' : mcpTransport === 'http' ? 'Streamable HTTP' : 'Local stdio'}</small></div>
            <div className="settings-setting-row"><div className={`settings-icon datahub-${connectionMode}`}><Database size={19} /></div><div><strong>DataHub MCP {connectionMode === 'connected' ? 'connected' : 'not connected'}</strong><p>{mcpMessage}</p></div><ActionButton disabled={dataHubBusy || connectionMode !== 'connected'} onClick={() => void onSyncDataHub()} variant="ghost">Sync now</ActionButton></div>
            <div className="ai-option-grid">
              <label className="settings-field"><span>Transport</span><select onChange={(event) => setDataHubTransport(event.target.value as 'http' | 'stdio')} value={dataHubTransport}><option value="stdio">Local stdio (DataHub OSS)</option><option value="http">Streamable HTTP MCP</option></select><small>{dataHubTransport === 'stdio' ? 'Launches mcp-server-datahub locally through uvx; quickstart works without a token.' : 'Connects to an already hosted MCP endpoint.'}</small></label>
              <label className="settings-field"><span>{dataHubTransport === 'stdio' ? 'DataHub GMS URL' : 'MCP server URL'}</span><input defaultValue={dataHubSettings.url} key={`datahub-url-${dataHubSettings.url}`} placeholder={dataHubTransport === 'stdio' ? 'http://localhost:8080' : 'https://mcp.example.com/mcp'} ref={dataHubUrlRef} type="url" /><small>Only HTTP or HTTPS endpoints are accepted.</small></label>
            </div>
            <label className="settings-field"><span>Personal access token <em>optional for local OSS</em></span><input autoComplete="off" placeholder={dataHubSettings.tokenConfigured ? 'Token configured · enter a new value to rotate' : 'Leave empty for an unauthenticated local quickstart'} ref={dataHubTokenRef} type="password" /><small>{dataHubSettings.tokenSource === 'encrypted' ? 'Stored with the operating system secure credential service.' : dataHubSettings.tokenSource === 'environment' ? 'Loaded from the launch environment; never exposed to the renderer.' : dataHubTransport === 'stdio' ? 'Your current quickstart has token authentication disabled, so this field can stay empty.' : dataHubSettings.encryptionAvailable ? 'Hosted endpoints generally require a token; it will be encrypted before SQLite persistence.' : 'Secure credential storage is unavailable; DATA LAB will refuse to save a token.'}</small></label>
            <label className="datahub-writeback-toggle"><span><strong>Approved DataHub write-back</strong><small>Disabled by default. When enabled, only the explicitly advertised <code>save_document</code> mutation can run after a human approves its exact preview.</small></span><input checked={dataHubWriteback} onChange={(event) => setDataHubWriteback(event.target.checked)} type="checkbox" /></label>
            <div className="ai-connection-actions"><ActionButton disabled={dataHubBusy || !dataHubSettings.tokenConfigured} onClick={() => void removeDataHubToken()} variant="ghost">Remove saved token</ActionButton><ActionButton disabled={dataHubBusy} icon={<Database size={14} />} onClick={() => void saveAndConnectDataHub()} variant="primary">{dataHubBusy ? 'Connecting…' : 'Save & connect'}</ActionButton></div>
            {dataHubFeedback && <p aria-live="polite" className="settings-feedback">{dataHubFeedback}</p>}
          </section>
        </article>}

        {activeSection === 'updates' && <article className="settings-page">
          <div className="settings-page-heading"><small>APPLICATION UPDATES</small><h3>Signed desktop release channels</h3><p>DATA LAB never downloads or installs an update without your explicit action.</p></div>
          <section className="settings-section update-settings">
            <div className="settings-section-title"><span><ShieldCheck size={15} /> Installed version</span><small>{appUpdateStatus.currentVersion}</small></div>
            <div className={`update-trust update-${appUpdateStatus.currentSignatureVerified ? 'trusted' : 'blocked'}`}><ShieldCheck size={19} /><div><strong>{appUpdateStatus.currentSignatureVerified ? 'Desktop signature verified' : appUpdateStatus.phase === 'unavailable' ? 'Desktop release required' : 'Unsigned update path blocked'}</strong><small>{appUpdateStatus.message}</small></div></div>
            <div aria-label="Application update channel" className="theme-switch update-channel-switch" role="radiogroup">
              <button aria-checked={appUpdateStatus.channel === 'stable'} className={appUpdateStatus.channel === 'stable' ? 'is-active' : ''} disabled={appUpdateBusy} onClick={() => void runUpdateAction(() => onSetAppUpdateChannel('stable'))} role="radio" type="button"><span><strong>Stable</strong><small>Latest published DATA LAB application release.</small></span></button>
              <button aria-checked={appUpdateStatus.channel === 'main'} className={appUpdateStatus.channel === 'main' ? 'is-active' : ''} disabled={appUpdateBusy} onClick={() => void runUpdateAction(() => onSetAppUpdateChannel('main'))} role="radio" type="button"><span><strong>Main preview</strong><small>Newest main commit; locally rebuilt by Setup.</small></span></button>
            </div>
            <dl className="update-version-grid"><div><dt>Installed</dt><dd>{appUpdateStatus.currentVersion}</dd></div><div><dt>Available</dt><dd>{appUpdateStatus.availableVersion ?? 'Not checked'}</dd></div><div><dt>Signature policy</dt><dd>{appUpdateStatus.downloadedSignatureEnforced ? 'Enforced' : 'Unavailable'}</dd></div><div><dt>Status</dt><dd>{appUpdateStatus.phase}</dd></div></dl>
            {appUpdateStatus.progress !== undefined && <div className="update-progress"><span style={{ width: `${appUpdateStatus.progress}%` }} /><small>{Math.round(appUpdateStatus.progress)}%</small></div>}
            <div className="ai-connection-actions"><ActionButton disabled={appUpdateBusy} icon={<FolderOpen size={14} />} onClick={() => void runUpdateAction(onOpenSetupUpdater)} variant="primary">Open Setup updater</ActionButton><ActionButton disabled={appUpdateBusy || !appUpdateStatus.canCheck} icon={<RefreshCw size={14} />} onClick={() => void runUpdateAction(onCheckForAppUpdate)} variant="ghost">Check signed feed</ActionButton><ActionButton disabled={appUpdateBusy || !appUpdateStatus.canDownload} icon={<Download size={14} />} onClick={() => void runUpdateAction(onDownloadAppUpdate)} variant="ghost">Download signed</ActionButton><ActionButton disabled={appUpdateBusy || !appUpdateStatus.canInstall} icon={<Play size={14} />} onClick={() => void runUpdateAction(onInstallAppUpdate)} variant="ghost">Restart &amp; install</ActionButton></div>
            {(updateFeedback || appUpdateStatus.error) && <p aria-live="polite" className="settings-feedback">{appUpdateStatus.error ?? updateFeedback}</p>}
          </section>
          <p className="settings-note">The selected channel is passed to DATA LAB Setup. Setup locally builds Stable or Main and remembers the same channel for its next launch. Signed automatic feeds remain a separate production-only path.</p>
        </article>}

        {activeSection === 'presets' && <article className="settings-page">
          <div className="settings-page-heading"><small>EXAMPLES</small><h3>Choose a starting canvas</h3><p>DATA LAB always opens empty. Examples are loaded only when you request them.</p></div>
          <section className="settings-section preset-grid">
            <button onClick={() => onLoadPreset('empty')} type="button"><LayoutTemplate size={21} /><strong>Empty canvas</strong><small>Clear the workspace and build from your own DataHub source.</small></button>
            <button onClick={() => onLoadPreset('customer-activation')} type="button"><Database size={21} /><strong>Customer activation</strong><small>Load the ecommerce governance example for exploration.</small></button>
            <button onClick={() => onLoadPreset('pii-masking')} type="button"><KeyRound size={21} /><strong>PII masking lab</strong><small>See the agent insert a governed protection step before activation.</small></button>
            <button onClick={() => onLoadPreset('schema-drift')} type="button"><Network size={21} /><strong>ML impact &amp; drift</strong><small>Trace a training schema change through features to a production model.</small></button>
            <button onClick={() => onLoadPreset('broken-governance')} type="button"><AlertTriangle size={21} /><strong>Ownership &amp; quality</strong><small>Repair missing ownership and failing quality metadata.</small></button>
          </section>
        </article>}

        {activeSection === 'pipeline' && <article className="settings-page">
          <div className="settings-page-heading"><small>PIPELINE</small><h3>Graph tools and validation</h3><p>Maintain a readable topology and verify every rule atomically.</p></div>
          <section className="settings-section"><div className="settings-section-title"><span>Pipeline tools</span><small>Safe workspace actions</small></div><div className="settings-tools"><button onClick={onAutoLayout} type="button"><span><Network size={18} /></span><div><strong>Auto layout</strong><small>Recalculate topology-aware XY placement.</small></div></button><button onClick={onValidate} type="button"><span><Play size={18} /></span><div><strong>Run validation</strong><small>{findingCount} findings · {errorCount} blocking.</small></div><em className={errorCount ? 'has-errors' : 'is-clear'}>{errorCount ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}</em></button><button onClick={onExportPipeline} type="button"><span><Save size={18} /></span><div><strong>Export JSON</strong><small>Download a versioned, non-secret pipeline artifact.</small></div></button><label className="settings-import-file"><span><LayoutTemplate size={18} /></span><div><strong>Import JSON</strong><small>Validate the complete file before replacing this workspace.</small></div><input accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onImportPipeline(file); event.target.value = '' }} type="file" /></label></div></section>
        </article>}

        {activeSection === 'versions' && <article className="settings-page">
          <div className="settings-page-heading settings-heading-with-action"><div><small>VERSIONS</small><h3>Pipeline checkpoints</h3><p>Recent versions are supplied to the connected model so it proposes incremental changes.</p></div><ActionButton icon={<Save size={15} />} onClick={onSaveVersion} variant="primary">Save checkpoint</ActionButton></div>
          <VersionBrowser onApprove={onApprovePendingReview} onEmergencyStop={onEmergencyStop} onReject={onRejectPendingReview} onRemind={onRemindHumanReview} onRestore={onRestoreVersion} pipelineTitle={projectTitle} selectedVersionId={selectedVersionId} versions={versions} />
        </article>}
      </div>
    </div>
  </Modal>
}
