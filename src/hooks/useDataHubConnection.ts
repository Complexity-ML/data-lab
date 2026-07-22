import { useEffect, useState } from 'react'

type ConnectionMode = 'demo' | 'connected'
type McpTransport = 'demo' | 'http' | 'stdio'

export function useDataHubConnection(setActivity: (message: string) => void) {
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('demo')
  const [mcpTransport, setMcpTransport] = useState<McpTransport>('demo')
  const [mcpMessage, setMcpMessage] = useState('Local demo context')

  useEffect(() => {
    if (!window.dataLab) return
    void window.dataLab.getDataHubMcpStatus().then((status) => {
      setConnectionMode(status.mode)
      setMcpTransport(status.transport)
      setMcpMessage(status.message)
    }).catch(() => undefined)
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
      setConnectionMode(status.mode)
      setMcpTransport(status.transport)
      setMcpMessage(status.message)
      setActivity(status.mode === 'connected' ? `${status.message} · ready for agent audits` : status.message)
    } catch (error) {
      setConnectionMode('demo')
      setMcpMessage(error instanceof Error ? error.message : 'unknown error')
      setActivity(`DataHub MCP connection failed · ${error instanceof Error ? error.message : 'unknown error'}`)
    }
  }

  return { connectionMode, mcpMessage, mcpTransport, recordAudit, syncDataHub }
}
