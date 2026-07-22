import { useEffect, useState } from 'react'

type ConnectionMode = 'demo' | 'connected'
type McpTransport = 'demo' | 'http' | 'stdio'
export type DataHubConnectionSettings = {
  transport: 'http' | 'stdio'
  url: string
  tokenConfigured: boolean
  tokenSource: 'encrypted' | 'environment' | 'none'
  encryptionAvailable: boolean
  writebackEnabled: boolean
}

const disconnectedSettings: DataHubConnectionSettings = { transport: 'stdio', url: '', tokenConfigured: false, tokenSource: 'none', encryptionAvailable: false, writebackEnabled: false }

export function useDataHubConnection(setActivity: (message: string) => void) {
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('demo')
  const [mcpTransport, setMcpTransport] = useState<McpTransport>('demo')
  const [mcpMessage, setMcpMessage] = useState('Local demo context')
  const [settings, setSettings] = useState<DataHubConnectionSettings>(disconnectedSettings)

  const applyStatus = (status: Awaited<ReturnType<NonNullable<typeof window.dataLab>['getDataHubMcpStatus']>>) => {
    setConnectionMode(status.mode)
    setMcpTransport(status.transport)
    setMcpMessage(status.message)
    setSettings(status.settings)
  }

  useEffect(() => {
    if (!window.dataLab) return
    void window.dataLab.getDataHubMcpStatus().then(applyStatus).catch(() => undefined)
  }, [])

  const recordAudit = (transport: Exclude<McpTransport, 'demo'>, completedReads: number, totalReads: number) => {
    setConnectionMode('connected')
    setMcpTransport(transport)
    setMcpMessage(`MCP ${transport} · ${completedReads}/${totalReads} reads completed`)
  }

  const syncDataHub = async () => {
    if (!window.dataLab) {
      setActivity('Web demo mode · launch Electron with DATAHUB_GMS_URL to connect DataHub')
      return
    }
    try {
      const status = await window.dataLab.connectDataHubMcp()
      applyStatus(status)
      setActivity(status.mode === 'connected' ? `${status.message} · ready for agent audits` : status.message)
    } catch (error) {
      setConnectionMode('demo')
      setMcpMessage(error instanceof Error ? error.message : 'unknown error')
      setActivity(`DataHub MCP connection failed · ${error instanceof Error ? error.message : 'unknown error'}`)
    }
  }

  const saveSettings = async (payload: { transport: 'http' | 'stdio'; url: string; token?: string; clearToken?: boolean; writebackEnabled?: boolean }) => {
    if (!window.dataLab) throw new Error('DataHub settings require the Electron application')
    const status = await window.dataLab.saveDataHubMcpSettings(payload)
    applyStatus(status)
    return status
  }

  const searchAssets = async (query: string) => {
    if (!window.dataLab) throw new Error('DataHub search requires the Electron application')
    return window.dataLab.searchDataHubAssets(query)
  }

  const inspectAsset = async (urn: string, force = false) => {
    if (!window.dataLab) throw new Error('DataHub inspection requires the Electron application')
    return window.dataLab.inspectDataHubAsset(urn, force)
  }

  const invalidateContext = async (urn?: string) => {
    if (!window.dataLab) return { invalidated: true as const }
    return window.dataLab.invalidateDataHubContext(urn)
  }

  const writeDecision = async (payload: { revisionId: string; title: string; rationale: string; author: string; relatedAssets: string[] }) => {
    if (!window.dataLab) throw new Error('DataHub write-back requires the Electron application')
    return window.dataLab.writeDataHubDecision(payload)
  }

  return { connectionMode, inspectAsset, invalidateContext, mcpMessage, mcpTransport, recordAudit, saveSettings, searchAssets, settings, syncDataHub, writeDecision }
}
