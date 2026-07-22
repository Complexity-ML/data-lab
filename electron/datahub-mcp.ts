import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

export type DataHubMcpTransport = 'demo' | 'http' | 'stdio'

export interface DataHubMcpStatus {
  mode: 'demo' | 'connected'
  transport: DataHubMcpTransport
  message: string
  serverVersion?: string
  toolCount: number
  tools: string[]
}

export interface DataHubMcpRead {
  name: 'get_entities' | 'list_schema_fields' | 'get_lineage'
  status: 'ok' | 'unavailable' | 'error'
  summary: string
}

export interface DataHubMcpAudit {
  urn: string
  transport: Exclude<DataHubMcpTransport, 'demo'>
  serverVersion?: string
  reads: DataHubMcpRead[]
}

type ActiveTransport = StdioClientTransport | StreamableHTTPClientTransport

let activeClient: Client | undefined
let activeTransport: ActiveTransport | undefined
let activeMode: Exclude<DataHubMcpTransport, 'demo'> | undefined
let connectionPromise: Promise<Client> | undefined

function validateDatasetUrn(urn: string) {
  if (!urn.startsWith('urn:li:dataset:') || urn.length > 2_000) throw new Error('A valid DataHub dataset URN is required')
}

function configuration(): { mode: DataHubMcpTransport; message: string; url?: string; token?: string } {
  const url = process.env.DATAHUB_MCP_URL?.trim()
  const token = (process.env.DATAHUB_MCP_TOKEN ?? process.env.DATAHUB_GMS_TOKEN)?.trim()
  if (url) {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('DATAHUB_MCP_URL must use http or https')
    return { mode: 'http', message: `Remote MCP configured at ${parsed.origin}`, url, token }
  }

  const gmsUrl = process.env.DATAHUB_GMS_URL?.trim()
  const gmsToken = process.env.DATAHUB_GMS_TOKEN?.trim()
  if (gmsUrl && gmsToken) return {
    mode: 'stdio',
    message: 'Local DataHub MCP is ready to launch through uvx',
    url: gmsUrl,
    token: gmsToken,
  }

  return {
    mode: 'demo',
    message: 'Demo context active. Configure DATAHUB_MCP_URL or DATAHUB_GMS_URL + DATAHUB_GMS_TOKEN.',
  }
}

function createTransport(): { mode: Exclude<DataHubMcpTransport, 'demo'>; transport: ActiveTransport } {
  const config = configuration()
  if (config.mode === 'demo') throw new Error(config.message)
  if (config.mode === 'http') {
    const headers = config.token ? { Authorization: `Bearer ${config.token}` } : undefined
    return {
      mode: 'http',
      transport: new StreamableHTTPClientTransport(new URL(config.url!), { requestInit: { headers } }),
    }
  }

  return {
    mode: 'stdio',
    transport: new StdioClientTransport({
      command: process.env.DATAHUB_MCP_COMMAND?.trim() || 'uvx',
      args: [process.env.DATAHUB_MCP_PACKAGE?.trim() || 'mcp-server-datahub@latest'],
      env: {
        ...getDefaultEnvironment(),
        DATAHUB_GMS_URL: config.url!,
        DATAHUB_GMS_TOKEN: config.token!,
        TOOLS_IS_MUTATION_ENABLED: 'false',
      },
      stderr: 'pipe',
    }),
  }
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs / 1_000}s`)), timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

async function connectClient(): Promise<Client> {
  if (activeClient) return activeClient
  if (connectionPromise) return connectionPromise

  connectionPromise = (async () => {
    const client = new Client({ name: 'data-lab', version: '0.1.0' })
    const configured = createTransport()
    try {
      await withTimeout(client.connect(configured.transport), 30_000, 'DataHub MCP connection')
      activeClient = client
      activeTransport = configured.transport
      activeMode = configured.mode
      return client
    } catch (error) {
      await configured.transport.close().catch(() => undefined)
      throw error
    } finally {
      connectionPromise = undefined
    }
  })()

  return connectionPromise
}

export function getDataHubMcpConfigurationStatus(): DataHubMcpStatus {
  const config = configuration()
  if (config.mode === 'demo') return { mode: 'demo', transport: 'demo', message: config.message, toolCount: 0, tools: [] }
  return { mode: activeClient ? 'connected' : 'demo', transport: config.mode, message: activeClient ? 'DataHub MCP connected' : config.message, toolCount: 0, tools: [] }
}

export async function connectDataHubMcp(): Promise<DataHubMcpStatus> {
  const config = configuration()
  if (config.mode === 'demo') return getDataHubMcpConfigurationStatus()
  const client = await connectClient()
  const tools = await withTimeout(client.listTools(), 12_000, 'DataHub MCP tool discovery')
  const names = tools.tools.map((tool) => tool.name).sort()
  return {
    mode: 'connected',
    transport: activeMode ?? config.mode,
    message: `DataHub MCP connected · ${names.length} tools available`,
    serverVersion: client.getServerVersion()?.version,
    toolCount: names.length,
    tools: names,
  }
}

function summarizeResult(result: unknown): string {
  const value = result && typeof result === 'object' ? result as Record<string, unknown> : {}
  const structured = value.structuredContent ? JSON.stringify(value.structuredContent) : ''
  const content = Array.isArray(value.content) ? value.content : []
  const text = content
    .filter((item): item is { type: 'text'; text: string } => Boolean(item) && typeof item === 'object' && item.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join(' ')
  const compact = (structured || text || (value.isError ? 'MCP tool returned an error' : 'Context received')).replace(/\s+/g, ' ').trim()
  return compact.length > 320 ? `${compact.slice(0, 317)}…` : compact
}

export async function auditDataHubWithMcp(urn: string): Promise<DataHubMcpAudit> {
  validateDatasetUrn(urn)
  const client = await connectClient()
  const listed = await withTimeout(client.listTools(), 12_000, 'DataHub MCP tool discovery')
  const available = new Set(listed.tools.map((tool) => tool.name))
  const calls: { name: DataHubMcpRead['name']; arguments: Record<string, unknown> }[] = [
    { name: 'get_entities', arguments: { urns: [urn] } },
    { name: 'list_schema_fields', arguments: { urn } },
    { name: 'get_lineage', arguments: { urn, direction: 'downstream', max_hops: 3 } },
  ]

  const reads = await Promise.all(calls.map(async (call): Promise<DataHubMcpRead> => {
    if (!available.has(call.name)) return { name: call.name, status: 'unavailable', summary: 'Tool is not exposed by this MCP server.' }
    try {
      const result = await withTimeout(client.callTool({ name: call.name, arguments: call.arguments }), 20_000, call.name)
      return { name: call.name, status: result.isError ? 'error' : 'ok', summary: summarizeResult(result) }
    } catch (error) {
      return { name: call.name, status: 'error', summary: error instanceof Error ? error.message : 'Unknown MCP error' }
    }
  }))

  return {
    urn,
    transport: activeMode ?? 'stdio',
    serverVersion: client.getServerVersion()?.version,
    reads,
  }
}

export async function closeDataHubMcp() {
  const client = activeClient
  const transport = activeTransport
  activeClient = undefined
  activeTransport = undefined
  activeMode = undefined
  connectionPromise = undefined
  if (client) await client.close().catch(() => undefined)
  else if (transport) await transport.close().catch(() => undefined)
}
