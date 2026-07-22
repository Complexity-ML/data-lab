import { contextBridge, ipcRenderer } from 'electron'

const statusChannel = 'data-lab:datahub-status'
const datasetChannel = 'data-lab:datahub-dataset'
const mcpStatusChannel = 'data-lab:datahub-mcp-status'
const mcpConnectChannel = 'data-lab:datahub-mcp-connect'
const mcpAuditChannel = 'data-lab:datahub-mcp-audit'
const humanReviewNotificationChannel = 'data-lab:human-review-notification'
const windowStateChannel = 'data-lab:window-state'
const windowStateChangedChannel = 'data-lab:window-state-changed'
const aiStatusChannel = 'data-lab:ai-status'
const aiSaveChannel = 'data-lab:ai-save'
const aiTestChannel = 'data-lab:ai-test'
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

contextBridge.exposeInMainWorld('dataLab', {
  runtime: 'electron',
  platform: process.platform,
  getDataHubStatus: () => ipcRenderer.invoke(statusChannel),
  loadDatasetContext: (urn: string) => ipcRenderer.invoke(datasetChannel, { urn }),
  getDataHubMcpStatus: () => ipcRenderer.invoke(mcpStatusChannel),
  connectDataHubMcp: () => ipcRenderer.invoke(mcpConnectChannel),
  auditDataHubWithMcp: (urn: string) => ipcRenderer.invoke(mcpAuditChannel, { urn }),
  notifyHumanReview: (payload: { cardLabel: string; reason: string }) => ipcRenderer.invoke(humanReviewNotificationChannel, payload),
  getAiStatus: () => ipcRenderer.invoke(aiStatusChannel),
  saveAiSettings: (payload: unknown) => ipcRenderer.invoke(aiSaveChannel, payload),
  testAiConnection: () => ipcRenderer.invoke(aiTestChannel),
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
  onHumanReviewOpened: (callback: () => void) => {
    const listener = () => callback()
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
