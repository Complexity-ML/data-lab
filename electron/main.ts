import { app, BrowserWindow, ipcMain, type BrowserWindowConstructorOptions } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDataHubStatus, loadDatasetContext } from './datahub.js'
import { auditDataHubWithMcp, closeDataHubMcp, connectDataHubMcp, getDataHubMcpConfigurationStatus } from './datahub-mcp.js'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const statusChannel = 'labo-data:datahub-status'
const datasetChannel = 'labo-data:datahub-dataset'
const mcpStatusChannel = 'labo-data:datahub-mcp-status'
const mcpConnectChannel = 'labo-data:datahub-mcp-connect'
const mcpAuditChannel = 'labo-data:datahub-mcp-audit'

function createMainWindow() {
  const platformFrame: BrowserWindowConstructorOptions = process.platform === 'darwin'
    ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 24 } }
    : { titleBarStyle: 'default', autoHideMenuBar: true }
  const window = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 1080,
    minHeight: 680,
    backgroundColor: '#f8fafc',
    title: 'LABO DATA',
    ...platformFrame,
    webPreferences: {
      preload: join(currentDirectory, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })

  const developmentUrl = process.env.VITE_DEV_SERVER_URL
  if (developmentUrl) void window.loadURL(developmentUrl)
  else void window.loadFile(join(currentDirectory, '..', 'dist', 'index.html'))
}

app.whenReady().then(() => {
  ipcMain.handle(statusChannel, () => getDataHubStatus())
  ipcMain.handle(datasetChannel, (_event, payload: { urn?: unknown }) => {
    if (typeof payload?.urn !== 'string') throw new Error('Invalid DataHub dataset request')
    return loadDatasetContext(payload.urn)
  })
  ipcMain.handle(mcpStatusChannel, () => getDataHubMcpConfigurationStatus())
  ipcMain.handle(mcpConnectChannel, () => connectDataHubMcp())
  ipcMain.handle(mcpAuditChannel, (_event, payload: { urn?: unknown }) => {
    if (typeof payload?.urn !== 'string') throw new Error('Invalid DataHub MCP audit request')
    return auditDataHubWithMcp(payload.urn)
  })
  createMainWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  void closeDataHubMcp()
})
