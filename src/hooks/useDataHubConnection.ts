import { useEffect, useState } from 'react'

type ConnectionMode = 'demo' | 'connected'
type McpTransport = 'demo' | 'http' | 'stdio'
export type DataHubConnectionSettings = {
  transport: 'http' | 'stdio'
  url: string
  tokenConfigured: boolean
  tokenSource: 'encrypted' | 'environment' | 'none'
  encryptionAvailable: boolean
}

const disconnectedSettings: DataHubConnectionSettings = { transport: 'stdio', url: '', tokenConfigured: false, tokenSource: 'none', encryptionAvailable: false }

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

  const saveSettings = async (payload: { transport: 'http' | 'stdio'; url: string; token?: string; clearToken?: boolean }) => {
    if (!window.dataLab) throw new Error('DataHub settings require the Electron application')
    const status = await window.dataLab.saveDataHubMcpSettings(payload)
    applyStatus(status)
    return status
  }

  return { connectionMode, mcpMessage, mcpTransport, recordAudit, saveSettings, settings, syncDataHub }
}
