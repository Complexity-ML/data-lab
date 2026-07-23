import { contextBridge, ipcRenderer } from 'electron'

const statusChannel = 'data-lab:datahub-status'
const datasetChannel = 'data-lab:datahub-dataset'
const mcpStatusChannel = 'data-lab:datahub-mcp-status'
const mcpConnectChannel = 'data-lab:datahub-mcp-connect'
const mcpSettingsSaveChannel = 'data-lab:datahub-mcp-settings-save'
const mcpAuditChannel = 'data-lab:datahub-mcp-audit'
const mcpSearchChannel = 'data-lab:datahub-mcp-search'
const mcpInspectChannel = 'data-lab:datahub-mcp-inspect'
const mcpInvalidateChannel = 'data-lab:datahub-mcp-invalidate'
const mcpWritebackChannel = 'data-lab:datahub-mcp-writeback'
const humanReviewNotificationChannel = 'data-lab:human-review-notification'
const windowStateChannel = 'data-lab:window-state'
const windowStateChangedChannel = 'data-lab:window-state-changed'
const aiStatusChannel = 'data-lab:ai-status'
const aiSaveChannel = 'data-lab:ai-save'
const aiTestChannel = 'data-lab:ai-test'
const aiCatalogRefreshChannel = 'data-lab:ai-catalog-refresh'
const aiProposalChannel = 'data-lab:ai-proposal'
const aiCancelChannel = 'data-lab:ai-cancel'
const humanReviewOpenedChannel = 'data-lab:human-review-opened'
const chatGPTStatusChannel = 'data-lab:chatgpt-status'
const chatGPTConnectChannel = 'data-lab:chatgpt-connect'
const chatGPTDisconnectChannel = 'data-lab:chatgpt-disconnect'
const chatGPTConfigureChannel = 'data-lab:chatgpt-configure'
const chatGPTProposalChannel = 'data-lab:chatgpt-proposal'
const chatGPTCancelChannel = 'data-lab:chatgpt-cancel'
const workspaceLoadChannel = 'data-lab:workspace-load'
const workspaceCreateChannel = 'data-lab:workspace-create'
const workspaceRenameChannel = 'data-lab:workspace-rename'
const workspaceDuplicateChannel = 'data-lab:workspace-duplicate'
const workspaceArchiveChannel = 'data-lab:workspace-archive'
const workspaceOpenChannel = 'data-lab:workspace-open'
const workspaceAutosaveChannel = 'data-lab:workspace-autosave'
const workspaceCommitChannel = 'data-lab:workspace-commit'
const workspaceRecoveryChannel = 'data-lab:workspace-recovery'
const activeAiSourceChannel = 'data-lab:active-ai-source'
const activeAiSourceSaveChannel = 'data-lab:active-ai-source-save'
const diagnosticsRecordChannel = 'data-lab:diagnostics-record'
const diagnosticsExportChannel = 'data-lab:diagnostics-export'
const diagnosticsOpenChannel = 'data-lab:diagnostics-open'
const applicationRestartChannel = 'data-lab:application-restart'
const appUpdateStatusChannel = 'data-lab:app-update-status'
const appUpdateStatusChangedChannel = 'data-lab:app-update-status-changed'
const appUpdateSetChannel = 'data-lab:app-update-set-channel'
const appUpdateCheckChannel = 'data-lab:app-update-check'
const appUpdateDownloadChannel = 'data-lab:app-update-download'
const appUpdateInstallChannel = 'data-lab:app-update-install'

contextBridge.exposeInMainWorld('dataLab', {
  runtime: 'electron',
  platform: process.platform,
  getDataHubStatus: () => ipcRenderer.invoke(statusChannel),
  loadDatasetContext: (urn: string) => ipcRenderer.invoke(datasetChannel, { urn }),
  getDataHubMcpStatus: () => ipcRenderer.invoke(mcpStatusChannel),
  connectDataHubMcp: () => ipcRenderer.invoke(mcpConnectChannel),
  saveDataHubMcpSettings: (payload: { transport: 'http' | 'stdio'; url: string; token?: string; clearToken?: boolean; writebackEnabled?: boolean }) => ipcRenderer.invoke(mcpSettingsSaveChannel, payload),
  auditDataHubWithMcp: (urn: string, force = false) => ipcRenderer.invoke(mcpAuditChannel, { urn, force }),
  searchDataHubAssets: (query: string) => ipcRenderer.invoke(mcpSearchChannel, { query }),
  inspectDataHubAsset: (urn: string, force = false) => ipcRenderer.invoke(mcpInspectChannel, { urn, force }),
  invalidateDataHubContext: (urn?: string) => ipcRenderer.invoke(mcpInvalidateChannel, { urn }),
  writeDataHubDecision: (payload: { revisionId: string; title: string; rationale: string; author: string; relatedAssets: string[] }) => ipcRenderer.invoke(mcpWritebackChannel, payload),
  notifyHumanReview: (payload: { cardLabel: string; reason: string; versionId?: string; remind?: boolean }) => ipcRenderer.invoke(humanReviewNotificationChannel, payload),
  getAiStatus: () => ipcRenderer.invoke(aiStatusChannel),
  saveAiSettings: (payload: unknown) => ipcRenderer.invoke(aiSaveChannel, payload),
  testAiConnection: () => ipcRenderer.invoke(aiTestChannel),
  refreshAiModelCatalog: (provider: 'openai' | 'anthropic' | 'moonshot') => ipcRenderer.invoke(aiCatalogRefreshChannel, { provider }),
  runAiProposal: (payload: unknown) => ipcRenderer.invoke(aiProposalChannel, payload),
  cancelAiProposal: () => ipcRenderer.invoke(aiCancelChannel),
  getChatGPTStatus: () => ipcRenderer.invoke(chatGPTStatusChannel),
  connectChatGPT: () => ipcRenderer.invoke(chatGPTConnectChannel),
  disconnectChatGPT: () => ipcRenderer.invoke(chatGPTDisconnectChannel),
  configureChatGPT: (payload: { model: string; effort: string }) => ipcRenderer.invoke(chatGPTConfigureChannel, payload),
  runChatGPTProposal: (payload: unknown) => ipcRenderer.invoke(chatGPTProposalChannel, payload),
  cancelChatGPTProposal: () => ipcRenderer.invoke(chatGPTCancelChannel),
  loadWorkspaceState: () => ipcRenderer.invoke(workspaceLoadChannel),
  createWorkspace: (name: string, workspace: unknown) => ipcRenderer.invoke(workspaceCreateChannel, { name, workspace }),
  renameWorkspace: (workspaceId: string, name: string) => ipcRenderer.invoke(workspaceRenameChannel, { workspaceId, name }),
  duplicateWorkspace: (workspaceId: string, name?: string) => ipcRenderer.invoke(workspaceDuplicateChannel, { workspaceId, name }),
  archiveWorkspace: (workspaceId: string) => ipcRenderer.invoke(workspaceArchiveChannel, { workspaceId }),
  openWorkspace: (workspaceId: string) => ipcRenderer.invoke(workspaceOpenChannel, { workspaceId }),
  autosaveWorkspace: (workspace: unknown) => ipcRenderer.invoke(workspaceAutosaveChannel, workspace),
  commitWorkspace: (workspace: unknown) => ipcRenderer.invoke(workspaceCommitChannel, workspace),
  resolveWorkspaceRecovery: (action: 'recover' | 'discard') => ipcRenderer.invoke(workspaceRecoveryChannel, { action }),
  getActiveAiSource: () => ipcRenderer.invoke(activeAiSourceChannel),
  setActiveAiSource: (source: 'chatgpt' | 'openai' | 'anthropic' | 'moonshot') => ipcRenderer.invoke(activeAiSourceSaveChannel, { source }),
  recordDiagnostic: (event: unknown) => ipcRenderer.invoke(diagnosticsRecordChannel, event),
  exportDiagnostics: () => ipcRenderer.invoke(diagnosticsExportChannel),
  openDiagnosticLogs: () => ipcRenderer.invoke(diagnosticsOpenChannel),
  restartApplication: () => ipcRenderer.invoke(applicationRestartChannel),
  getAppUpdateStatus: () => ipcRenderer.invoke(appUpdateStatusChannel),
  setAppUpdateChannel: (channel: 'stable' | 'main') => ipcRenderer.invoke(appUpdateSetChannel, { channel }),
  checkForAppUpdate: () => ipcRenderer.invoke(appUpdateCheckChannel),
  downloadAppUpdate: () => ipcRenderer.invoke(appUpdateDownloadChannel),
  installAppUpdate: () => ipcRenderer.invoke(appUpdateInstallChannel),
  onAppUpdateStatusChanged: (callback: (status: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: unknown) => callback(status)
    ipcRenderer.on(appUpdateStatusChangedChannel, listener)
    return () => ipcRenderer.removeListener(appUpdateStatusChangedChannel, listener)
  },
  onHumanReviewOpened: (callback: (payload: { versionId?: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { versionId?: string } = {}) => callback(payload)
    ipcRenderer.on(humanReviewOpenedChannel, listener)
    return () => ipcRenderer.removeListener(humanReviewOpenedChannel, listener)
  },
  getWindowState: () => ipcRenderer.invoke(windowStateChannel),
  onWindowStateChanged: (callback: (state: { fullscreen: boolean }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: { fullscreen: boolean }) => callback(state)
    ipcRenderer.on(windowStateChangedChannel, listener)
    return () => ipcRenderer.removeListener(windowStateChangedChannel, listener)
  },
})
