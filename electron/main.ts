import { app, BrowserWindow, dialog, ipcMain, Menu, Notification, shell, type BrowserWindowConstructorOptions, type MenuItemConstructorOptions } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDataHubStatus, loadDatasetContext } from './datahub.js'
import { auditDataHubWithMcp, closeDataHubMcp, connectDataHubMcp, getDataHubMcpConfigurationStatus, inspectDataHubAsset, invalidateDataHubContext, saveDataHubMcpSettings, searchDataHubAssets, writeDataHubDecision } from './datahub-mcp.js'
import { cancelAiProposal, getAiStatus, refreshAiModelCatalog, runAiProposal, saveAiSettings, testAiConnection } from './ai-provider.js'
import { ChatGPTAgentSession } from './chatgpt-session.js'
import { archiveWorkspace, autosaveWorkspaceDraft, beginWorkspaceSession, closeWorkspaceDatabase, commitActiveWorkspace, createWorkspace, duplicateWorkspace, loadAppSetting, loadWorkspaceManagerState, markWorkspaceSessionClean, openWorkspace, renameWorkspace, resolveWorkspaceRecovery, saveAppSetting } from './workspace-db.js'
import { parseActiveAiSource, requireSelectableAiSource, type ActiveAiSource } from './active-ai-source.js'
import { reserveHumanReviewNotification } from './human-review-notifications.js'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
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
let mainWindow: BrowserWindow | undefined
let isQuitting = false
let chatGPT: ChatGPTAgentSession | undefined
let workspaceSessionWasUnclean = false

app.setName('DATA LAB')

function configureApplicationMenu() {
  if (process.platform !== 'darwin') return
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'DATA LAB',
      submenu: [
        {
          label: 'About DATA LAB',
          click: () => { void dialog.showMessageBox({ title: 'About DATA LAB', message: 'DATA LAB', detail: `Context-aware pipeline studio\nVersion ${app.getVersion()}`, buttons: ['OK'] }) },
        },
        { type: 'separator' },
        { label: 'Open DATA LAB', accelerator: 'CmdOrCtrl+0', click: focusMainWindow },
        { role: 'services' },
        { type: 'separator' },
        { label: 'Hide DATA LAB', role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { label: 'Quit DATA LAB', role: 'quit' },
      ],
    },
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    { role: 'help', submenu: [{ label: 'DataHub documentation', click: () => void shell.openExternal('https://docs.datahub.com/') }] },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function currentActiveAiSource(): ActiveAiSource {
  const saved = loadAppSetting(app.getPath('userData'), 'active-ai-provider')
  return parseActiveAiSource(saved) ?? 'openai'
}

async function selectActiveAiSource(payload: { source?: unknown }) {
  const [apiStatus, chatGPTStatus] = await Promise.all([getAiStatus(), chatGPT?.status()])
  const source = requireSelectableAiSource(payload?.source, { chatgpt: Boolean(chatGPTStatus?.connected), openai: apiStatus.providers.openai.connected, anthropic: apiStatus.providers.anthropic.connected, moonshot: apiStatus.providers.moonshot.connected })
  if (source !== 'chatgpt') await saveAiSettings({ provider: source })
  saveAppSetting(app.getPath('userData'), 'active-ai-provider', source)
  return { source }
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function notifyHumanReview(payload: { cardLabel?: unknown; reason?: unknown; versionId?: unknown; remind?: unknown }): { shown: boolean; deduplicated?: boolean } {
  const cardLabel = typeof payload?.cardLabel === 'string' ? payload.cardLabel.trim().slice(0, 120) : 'Agent flow'
  const reason = typeof payload?.reason === 'string' ? payload.reason.trim().slice(0, 280) : 'The agent needs a human decision.'
  const versionId = typeof payload?.versionId === 'string' ? payload.versionId.trim().slice(0, 180) : undefined
  if (!Notification.isSupported()) return { shown: false }
  const reservation = reserveHumanReviewNotification(app.getPath('userData'), versionId, payload?.remind === true)
  if (!reservation.allowed) return { shown: false, deduplicated: true }

  const notification = new Notification({
    title: 'DATA LAB · Human review required',
    body: `${cardLabel} — ${reason}`,
  })
  notification.on('click', () => {
    focusMainWindow()
    mainWindow?.webContents.send(humanReviewOpenedChannel, { versionId })
  })
  notification.show()
  return { shown: true }
}

function createMainWindow() {
  const platformFrame: BrowserWindowConstructorOptions = process.platform === 'darwin'
    ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 26 } }
    : { titleBarStyle: 'default', autoHideMenuBar: true }
  const window = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 1080,
    minHeight: 680,
    backgroundColor: '#f8fafc',
    title: 'DATA LAB',
    ...platformFrame,
    webPreferences: {
      preload: join(currentDirectory, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })
  mainWindow = window

  const publishWindowState = () => {
    if (!window.isDestroyed()) window.webContents.send(windowStateChangedChannel, { fullscreen: window.isFullScreen() })
  }
  window.on('enter-full-screen', publishWindowState)
  window.on('leave-full-screen', publishWindowState)

  if (process.platform === 'darwin') {
    window.on('close', (event) => {
      if (isQuitting) return
      event.preventDefault()
      app.hide()
    })
  }
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = undefined
  })

  const developmentUrl = process.env.VITE_DEV_SERVER_URL
  if (developmentUrl) void window.loadURL(developmentUrl)
  else void window.loadFile(join(currentDirectory, '..', 'dist', 'index.html'))
}

app.whenReady().then(() => {
  workspaceSessionWasUnclean = beginWorkspaceSession(app.getPath('userData'))
  configureApplicationMenu()
  chatGPT = new ChatGPTAgentSession((url) => shell.openExternal(url), app.getVersion(), join(app.getPath('userData'), 'chatgpt-agent'))
  ipcMain.handle(statusChannel, () => getDataHubStatus())
  ipcMain.handle(datasetChannel, (_event, payload: { urn?: unknown }) => {
    if (typeof payload?.urn !== 'string') throw new Error('Invalid DataHub dataset request')
    return loadDatasetContext(payload.urn)
  })
  ipcMain.handle(mcpStatusChannel, () => getDataHubMcpConfigurationStatus())
  ipcMain.handle(mcpConnectChannel, () => connectDataHubMcp())
  ipcMain.handle(mcpSettingsSaveChannel, (_event, payload: unknown) => saveDataHubMcpSettings(payload))
  ipcMain.handle(mcpAuditChannel, (_event, payload: { urn?: unknown; force?: unknown }) => {
    if (typeof payload?.urn !== 'string') throw new Error('Invalid DataHub MCP audit request')
    return auditDataHubWithMcp(payload.urn, payload.force === true)
  })
  ipcMain.handle(mcpSearchChannel, (_event, payload: { query?: unknown }) => {
    if (typeof payload?.query !== 'string') throw new Error('Invalid DataHub search request')
    return searchDataHubAssets(payload.query)
  })
  ipcMain.handle(mcpInspectChannel, (_event, payload: { urn?: unknown; force?: unknown }) => {
    if (typeof payload?.urn !== 'string') throw new Error('Invalid DataHub inspection request')
    return inspectDataHubAsset(payload.urn, payload.force === true)
  })
  ipcMain.handle(mcpInvalidateChannel, (_event, payload: { urn?: unknown }) => invalidateDataHubContext(typeof payload?.urn === 'string' ? payload.urn : undefined))
  ipcMain.handle(mcpWritebackChannel, (_event, payload: unknown) => writeDataHubDecision(payload))
  ipcMain.handle(humanReviewNotificationChannel, (_event, payload: { cardLabel?: unknown; reason?: unknown; versionId?: unknown; remind?: unknown }) => notifyHumanReview(payload))
  ipcMain.handle(windowStateChannel, (event) => ({ fullscreen: BrowserWindow.fromWebContents(event.sender)?.isFullScreen() ?? false }))
  ipcMain.handle(aiStatusChannel, () => getAiStatus())
  ipcMain.handle(aiSaveChannel, (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') throw new Error('Invalid AI settings request')
    return saveAiSettings(payload)
  })
  ipcMain.handle(aiTestChannel, () => testAiConnection())
  ipcMain.handle(aiCatalogRefreshChannel, (_event, payload: { provider?: unknown }) => refreshAiModelCatalog(payload ?? {}))
  ipcMain.handle(aiProposalChannel, (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object' || JSON.stringify(payload).length > 100_000) throw new Error('Invalid AI proposal request')
    return runAiProposal(payload)
  })
  ipcMain.handle(aiCancelChannel, () => cancelAiProposal())
  ipcMain.handle(chatGPTStatusChannel, () => chatGPT?.status())
  ipcMain.handle(chatGPTConnectChannel, () => chatGPT?.connect())
  ipcMain.handle(chatGPTDisconnectChannel, () => chatGPT?.disconnect())
  ipcMain.handle(chatGPTConfigureChannel, (_event, payload: { model?: unknown; effort?: unknown }) => chatGPT?.configure(payload ?? {}))
  ipcMain.handle(chatGPTProposalChannel, (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object' || JSON.stringify(payload).length > 100_000) throw new Error('Invalid ChatGPT proposal request')
    return chatGPT?.runProposal(payload)
  })
  ipcMain.handle(chatGPTCancelChannel, () => chatGPT?.cancel() ?? { cancelled: false })
  ipcMain.handle(workspaceLoadChannel, () => loadWorkspaceManagerState(app.getPath('userData'), workspaceSessionWasUnclean))
  ipcMain.handle(workspaceCreateChannel, (_event, payload: { name?: unknown; workspace?: unknown }) => createWorkspace(app.getPath('userData'), payload?.name, payload?.workspace))
  ipcMain.handle(workspaceRenameChannel, (_event, payload: { workspaceId?: unknown; name?: unknown }) => renameWorkspace(app.getPath('userData'), payload?.workspaceId, payload?.name))
  ipcMain.handle(workspaceDuplicateChannel, (_event, payload: { workspaceId?: unknown; name?: unknown }) => duplicateWorkspace(app.getPath('userData'), payload?.workspaceId, payload?.name))
  ipcMain.handle(workspaceArchiveChannel, (_event, payload: { workspaceId?: unknown }) => archiveWorkspace(app.getPath('userData'), payload?.workspaceId))
  ipcMain.handle(workspaceOpenChannel, (_event, payload: { workspaceId?: unknown }) => openWorkspace(app.getPath('userData'), payload?.workspaceId))
  ipcMain.handle(workspaceAutosaveChannel, (_event, payload: unknown) => autosaveWorkspaceDraft(app.getPath('userData'), payload))
  ipcMain.handle(workspaceCommitChannel, (_event, payload: unknown) => commitActiveWorkspace(app.getPath('userData'), payload))
  ipcMain.handle(workspaceRecoveryChannel, (_event, payload: { action?: unknown }) => {
    const state = resolveWorkspaceRecovery(app.getPath('userData'), payload?.action)
    workspaceSessionWasUnclean = false
    return state
  })
  ipcMain.handle(activeAiSourceChannel, () => ({ source: currentActiveAiSource() }))
  ipcMain.handle(activeAiSourceSaveChannel, (_event, payload: { source?: unknown }) => selectActiveAiSource(payload ?? {}))
  createMainWindow()
  app.on('activate', () => {
    focusMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  isQuitting = true
  chatGPT?.stop()
  markWorkspaceSessionClean(app.getPath('userData'))
  closeWorkspaceDatabase()
  void closeDataHubMcp()
})
