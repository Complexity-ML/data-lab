import type { SchemaField } from './domain/pipeline'

interface DataHubStatus {
  mode: 'demo' | 'connected'
  url?: string
  message: string
}

interface DataHubDatasetContext {
  urn: string
  name: string
  description?: string
  platform?: string
  owners: string[]
  tags: string[]
  fields: SchemaField[]
}

interface DataHubMcpStatus {
  mode: 'demo' | 'connected'
  transport: 'demo' | 'http' | 'stdio'
  message: string
  serverVersion?: string
  toolCount: number
  tools: string[]
}

interface DataHubMcpAudit {
  urn: string
  transport: 'http' | 'stdio'
  serverVersion?: string
  reads: {
    name: 'get_entities' | 'list_schema_fields' | 'get_lineage'
    status: 'ok' | 'unavailable' | 'error'
    summary: string
  }[]
}

declare global {
  interface Window {
    dataLab?: {
      runtime: 'electron'
      platform: 'darwin' | 'win32' | 'linux'
      getDataHubStatus(): Promise<DataHubStatus>
      loadDatasetContext(urn: string): Promise<DataHubDatasetContext>
      getDataHubMcpStatus(): Promise<DataHubMcpStatus>
      connectDataHubMcp(): Promise<DataHubMcpStatus>
      auditDataHubWithMcp(urn: string): Promise<DataHubMcpAudit>
    }
  }
}

export {}
