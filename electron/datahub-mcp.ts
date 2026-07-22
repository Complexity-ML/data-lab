import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { app, safeStorage } from 'electron'
import { loadAppSetting, saveAppSetting } from './workspace-db.js'

export type DataHubMcpTransport = 'demo' | 'http' | 'stdio'

export interface DataHubMcpStatus {
  mode: 'demo' | 'connected'
  transport: DataHubMcpTransport
  message: string
  serverVersion?: string
  toolCount: number
  tools: string[]
  settings: DataHubMcpPublicSettings
}

export interface DataHubMcpPublicSettings {
  transport: 'http' | 'stdio'
  url: string
  tokenConfigured: boolean
  tokenSource: 'encrypted' | 'environment' | 'none'
  encryptionAvailable: boolean
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

const settingKeys = {
  transport: 'datahub-mcp-transport',
  url: 'datahub-mcp-url',
  token: 'datahub-mcp-token',
} as const

function validateDatasetUrn(urn: string) {
  if (!urn.startsWith('urn:li:dataset:') || urn.length > 2_000) throw new Error('A valid DataHub dataset URN is required')
}

function decryptStoredToken(encrypted: string | null): string | undefined {
  if (!encrypted || !safeStorage.isEncryptionAvailable()) return undefined
  try { return safeStorage.decryptString(Buffer.from(encrypted, 'base64')).trim() || undefined } catch { return undefined }
}

function configuration(): { mode: DataHubMcpTransport; message: string; url?: string; token?: string; settings: DataHubMcpPublicSettings } {
  const userData = app.getPath('userData')
  const storedTransport = loadAppSetting(userData, settingKeys.transport)
  const storedUrl = loadAppSetting(userData, settingKeys.url)?.trim()
  const storedToken = decryptStoredToken(loadAppSetting(userData, settingKeys.token))
  const transport = storedTransport === 'stdio' || storedTransport === 'http' ? storedTransport : undefined
  const environmentHttpUrl = process.env.DATAHUB_MCP_URL?.trim()
  const environmentGmsUrl = process.env.DATAHUB_GMS_URL?.trim()
  const environmentToken = (process.env.DATAHUB_MCP_TOKEN ?? process.env.DATAHUB_GMS_TOKEN)?.trim()
  const selectedTransport = transport ?? (environmentHttpUrl ? 'http' : 'stdio')
  const url = storedUrl || (selectedTransport === 'http' ? environmentHttpUrl : environmentGmsUrl) || ''
  const token = storedToken || environmentToken
  const settings: DataHubMcpPublicSettings = {
    transport: selectedTransport,
    url,
    tokenConfigured: Boolean(token),
    tokenSource: storedToken ? 'encrypted' : environmentToken ? 'environment' : 'none',
    encryptionAvailable: safeStorage.isEncryptionAvailable(),
  }

  if (selectedTransport === 'http' && url) {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('DATAHUB_MCP_URL must use http or https')
    return { mode: 'http', message: `Remote MCP configured at ${parsed.origin}`, url, token, settings }
  }

  if (selectedTransport === 'stdio' && url && token) return {
    mode: 'stdio',
    message: 'Local DataHub MCP is ready to launch through uvx',
    url,
    token,
    settings,
  }

  return {
    mode: 'demo',
    message: selectedTransport === 'stdio' && url ? 'A DataHub personal access token is required for local stdio.' : 'Configure the DataHub connection below, then connect.',
    settings,
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
  if (config.mode === 'demo') return { mode: 'demo', transport: 'demo', message: config.message, toolCount: 0, tools: [], settings: config.settings }
  return { mode: activeClient ? 'connected' : 'demo', transport: config.mode, message: activeClient ? 'DataHub MCP connected' : config.message, toolCount: 0, tools: [], settings: config.settings }
}

export async function saveDataHubMcpSettings(payload: unknown): Promise<DataHubMcpStatus> {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid DataHub connection settings')
  const value = payload as Record<string, unknown>
  const transport = value.transport === 'http' || value.transport === 'stdio' ? value.transport : undefined
  const url = typeof value.url === 'string' ? value.url.trim().replace(/\/$/, '') : ''
  const token = typeof value.token === 'string' ? value.token.trim() : ''
  if (!transport) throw new Error('Choose HTTP or local stdio transport')
  if (!url || url.length > 2_000) throw new Error('A DataHub URL is required')
  const parsed = new URL(url)
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('DataHub URL must use http or https')
  if (token.length > 1_000) throw new Error('DataHub token is too long')
  if (token && !safeStorage.isEncryptionAvailable()) throw new Error('Secure credential storage is unavailable on this device')

  const userData = app.getPath('userData')
  saveAppSetting(userData, settingKeys.transport, transport)
  saveAppSetting(userData, settingKeys.url, url)
  if (value.clearToken === true) saveAppSetting(userData, settingKeys.token, '')
  else if (token) saveAppSetting(userData, settingKeys.token, safeStorage.encryptString(token).toString('base64'))
  await closeDataHubMcp()
  return getDataHubMcpConfigurationStatus()
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
    settings: config.settings,
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
