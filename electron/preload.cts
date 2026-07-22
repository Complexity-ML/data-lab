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
const workspaceSaveChannel = 'data-lab:workspace-save'
const activeAiSourceChannel = 'data-lab:active-ai-source'
const activeAiSourceSaveChannel = 'data-lab:active-ai-source-save'

contextBridge.exposeInMainWorld('dataLab', {
  runtime: 'electron',
  platform: process.platform,
  getDataHubStatus: () => ipcRenderer.invoke(statusChannel),
  loadDatasetContext: (urn: string) => ipcRenderer.invoke(datasetChannel, { urn }),
  getDataHubMcpStatus: () => ipcRenderer.invoke(mcpStatusChannel),
  connectDataHubMcp: () => ipcRenderer.invoke(mcpConnectChannel),
  saveDataHubMcpSettings: (payload: { transport: 'http' | 'stdio'; url: string; token?: string; clearToken?: boolean }) => ipcRenderer.invoke(mcpSettingsSaveChannel, payload),
  auditDataHubWithMcp: (urn: string, force = false) => ipcRenderer.invoke(mcpAuditChannel, { urn, force }),
  searchDataHubAssets: (query: string) => ipcRenderer.invoke(mcpSearchChannel, { query }),
  inspectDataHubAsset: (urn: string, force = false) => ipcRenderer.invoke(mcpInspectChannel, { urn, force }),
  invalidateDataHubContext: (urn?: string) => ipcRenderer.invoke(mcpInvalidateChannel, { urn }),
  notifyHumanReview: (payload: { cardLabel: string; reason: string; versionId?: string }) => ipcRenderer.invoke(humanReviewNotificationChannel, payload),
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
  loadWorkspace: () => ipcRenderer.invoke(workspaceLoadChannel),
  saveWorkspace: (payload: unknown) => ipcRenderer.invoke(workspaceSaveChannel, payload),
  getActiveAiSource: () => ipcRenderer.invoke(activeAiSourceChannel),
  setActiveAiSource: (source: 'chatgpt' | 'openai' | 'anthropic' | 'moonshot') => ipcRenderer.invoke(activeAiSourceSaveChannel, { source }),
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
