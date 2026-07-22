import { contextBridge, ipcRenderer } from 'electron'

const statusChannel = 'labo-data:datahub-status'
const datasetChannel = 'labo-data:datahub-dataset'
const mcpStatusChannel = 'labo-data:datahub-mcp-status'
const mcpConnectChannel = 'labo-data:datahub-mcp-connect'
const mcpAuditChannel = 'labo-data:datahub-mcp-audit'

contextBridge.exposeInMainWorld('laboData', {
  runtime: 'electron',
  platform: process.platform,
  getDataHubStatus: () => ipcRenderer.invoke(statusChannel),
  loadDatasetContext: (urn: string) => ipcRenderer.invoke(datasetChannel, { urn }),
  getDataHubMcpStatus: () => ipcRenderer.invoke(mcpStatusChannel),
  connectDataHubMcp: () => ipcRenderer.invoke(mcpConnectChannel),
  auditDataHubWithMcp: (urn: string) => ipcRenderer.invoke(mcpAuditChannel, { urn }),
})
