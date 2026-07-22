import { contextBridge, ipcRenderer } from 'electron'

const statusChannel = 'data-lab:datahub-status'
const datasetChannel = 'data-lab:datahub-dataset'
const mcpStatusChannel = 'data-lab:datahub-mcp-status'
const mcpConnectChannel = 'data-lab:datahub-mcp-connect'
const mcpAuditChannel = 'data-lab:datahub-mcp-audit'

contextBridge.exposeInMainWorld('dataLab', {
  runtime: 'electron',
  platform: process.platform,
  getDataHubStatus: () => ipcRenderer.invoke(statusChannel),
  loadDatasetContext: (urn: string) => ipcRenderer.invoke(datasetChannel, { urn }),
  getDataHubMcpStatus: () => ipcRenderer.invoke(mcpStatusChannel),
  connectDataHubMcp: () => ipcRenderer.invoke(mcpConnectChannel),
  auditDataHubWithMcp: (urn: string) => ipcRenderer.invoke(mcpAuditChannel, { urn }),
})
