import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { app, safeStorage } from 'electron'
import { parseAssetContext, parseSearchResults, readStructuredToolResult, sanitizeEvidenceSummary, type DataHubAssetSummary } from './datahub-context.js'
import { loadAppSetting, saveAppSetting } from './workspace-db.js'
export type { DataHubAssetSummary } from './datahub-context.js'

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
  writebackEnabled: boolean
}

export interface DataHubMcpRead {
  name: 'get_entities' | 'list_schema_fields' | 'get_lineage'
  status: 'ok' | 'unavailable' | 'error'
  summary: string
  capturedAt: string
  expiresAt: string
  cached: boolean
  stale: boolean
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
type ToolCatalog = Awaited<ReturnType<Client['listTools']>>
let toolCatalog: ToolCatalog | undefined
let toolDiscoveryPromise: Promise<ToolCatalog> | undefined
const contextCache = new Map<string, { result: unknown; capturedAt: number; expiresAt: number }>()
const knownReadTools = new Set(['search', 'get_entities', 'list_schema_fields', 'get_lineage'])
const maxMcpResultBytes = 2_000_000
const maxMcpCatalogBytes = 512_000
const defaultEvidenceTtlMs: Record<DataHubMcpRead['name'], number> = {
  get_entities: 5 * 60_000,
  list_schema_fields: 2 * 60_000,
  get_lineage: 90_000,
}

function boundedTtl(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(60 * 60_000, Math.max(5_000, Math.round(parsed))) : fallback
}

export function resolveEvidenceTtlMs(environment: NodeJS.ProcessEnv = process.env): Record<DataHubMcpRead['name'], number> {
  return {
    get_entities: boundedTtl(environment.DATAHUB_CACHE_ENTITY_TTL_MS, defaultEvidenceTtlMs.get_entities),
    list_schema_fields: boundedTtl(environment.DATAHUB_CACHE_SCHEMA_TTL_MS, defaultEvidenceTtlMs.list_schema_fields),
    get_lineage: boundedTtl(environment.DATAHUB_CACHE_LINEAGE_TTL_MS, defaultEvidenceTtlMs.get_lineage),
  }
}

const settingKeys = {
  transport: 'datahub-mcp-transport',
  url: 'datahub-mcp-url',
  token: 'datahub-mcp-token',
  writeback: 'datahub-mcp-writeback',
} as const

function validateDatasetUrn(urn: string) {
  if (!urn.startsWith('urn:li:dataset:') || urn.length > 2_000) throw new Error('A valid DataHub dataset URN is required')
}

export function assertBoundedMcpPayload<T>(value: T, label = 'DataHub MCP response', maxBytes = maxMcpResultBytes): T {
  let serialized: string
  try { serialized = JSON.stringify(value) } catch { throw new Error(`${label} is not valid serializable data`) }
  const bytes = Buffer.byteLength(serialized, 'utf8')
  if (bytes > maxBytes) throw new Error(`${label} exceeded the ${maxBytes}-byte safety limit`)
  return value
}

function safeToolName(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 120 && /^[a-z0-9_.-]+$/i.test(value)
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
  const writebackEnabled = loadAppSetting(userData, settingKeys.writeback) === 'true'
  const settings: DataHubMcpPublicSettings = {
    transport: selectedTransport,
    url,
    tokenConfigured: Boolean(token),
    tokenSource: storedToken ? 'encrypted' : environmentToken ? 'environment' : 'none',
    encryptionAvailable: safeStorage.isEncryptionAvailable(),
    writebackEnabled,
  }

  if (selectedTransport === 'http' && url) {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('DATAHUB_MCP_URL must use http or https')
    return { mode: 'http', message: `Remote MCP configured at ${parsed.origin}`, url, token, settings }
  }

  if (selectedTransport === 'stdio' && url) return {
    mode: 'stdio',
    message: token ? 'Local DataHub MCP is ready with token authentication' : 'Local DataHub OSS MCP is ready without token authentication',
    url,
    token,
    settings,
  }

  return {
    mode: 'demo',
    message: 'Configure the DataHub connection below, then connect.',
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
        ...(config.token ? { DATAHUB_GMS_TOKEN: config.token } : {}),
        TOOLS_IS_MUTATION_ENABLED: config.settings.writebackEnabled ? 'true' : 'false',
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

async function discoverTools(client: Client, label = 'DataHub MCP tool discovery'): Promise<ToolCatalog> {
  if (toolCatalog) return toolCatalog
  if (!toolDiscoveryPromise) {
    const pending = client.listTools().then((catalog) => {
      assertBoundedMcpPayload(catalog, 'DataHub MCP tool catalog', maxMcpCatalogBytes)
      toolCatalog = catalog
      return catalog
    })
    toolDiscoveryPromise = pending
    void pending.finally(() => { if (toolDiscoveryPromise === pending) toolDiscoveryPromise = undefined }).catch(() => undefined)
  }
  return withTimeout(toolDiscoveryPromise, 12_000, label)
}

export async function resolveReadableToolNames(discovery: () => Promise<{ tools: { name: string }[] }>): Promise<Set<string>> {
  try {
    const catalog = await discovery()
    return new Set(catalog.tools.map((tool) => tool.name).filter(safeToolName))
  } catch {
    // Read calls have their own timeouts and return bounded error evidence. A slow
    // listTools response must not block known read-only DataHub operations.
    return new Set(knownReadTools)
  }
}

async function discoverReadableToolNames(client: Client): Promise<Set<string>> {
  return resolveReadableToolNames(() => discoverTools(client))
}

export function getDataHubMcpConfigurationStatus(): DataHubMcpStatus {
  const config = configuration()
  if (config.mode === 'demo') return { mode: 'demo', transport: 'demo', message: config.message, toolCount: 0, tools: [], settings: config.settings }
  const tools = toolCatalog?.tools.map((tool) => tool.name).filter(safeToolName).sort() ?? []
  return { mode: activeClient ? 'connected' : 'demo', transport: config.mode, message: activeClient ? `DataHub MCP connected${tools.length ? ` · ${tools.length} tools available` : ''}` : config.message, toolCount: tools.length, tools, settings: config.settings }
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
  saveAppSetting(userData, settingKeys.writeback, value.writebackEnabled === true ? 'true' : 'false')
  if (value.clearToken === true) saveAppSetting(userData, settingKeys.token, '')
  else if (token) saveAppSetting(userData, settingKeys.token, safeStorage.encryptString(token).toString('base64'))
  await closeDataHubMcp()
  return getDataHubMcpConfigurationStatus()
}

export async function connectDataHubMcp(): Promise<DataHubMcpStatus> {
  const config = configuration()
  if (config.mode === 'demo') return getDataHubMcpConfigurationStatus()
  const client = await connectClient()
  const tools = await discoverTools(client)
  const names = tools.tools.map((tool) => tool.name).filter(safeToolName).sort()
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
  const sanitized = sanitizeEvidenceSummary(compact)
  return sanitized.length > 320 ? `${sanitized.slice(0, 317)}…` : sanitized
}

async function readCachedTool(options: { client: Client; available: Set<string>; urn: string; name: DataHubMcpRead['name']; arguments: Record<string, unknown>; force?: boolean }) {
  const { client, available, name, urn } = options
  const now = Date.now()
  const cacheKey = `${name}:${JSON.stringify(options.arguments)}`
  const cached = contextCache.get(cacheKey)
  if (!options.force && cached && cached.expiresAt > now) return {
    result: cached.result,
    evidence: { name, status: 'ok' as const, summary: summarizeResult(cached.result), capturedAt: new Date(cached.capturedAt).toISOString(), expiresAt: new Date(cached.expiresAt).toISOString(), cached: true, stale: false },
  }
  const capturedAt = new Date(now).toISOString()
  if (!available.has(name)) return {
    result: undefined,
    evidence: { name, status: 'unavailable' as const, summary: 'Tool is not exposed by this MCP server.', capturedAt, expiresAt: capturedAt, cached: false, stale: true },
  }
  try {
    const result = assertBoundedMcpPayload(await withTimeout(client.callTool({ name, arguments: options.arguments }), 20_000, name), `${name} response`)
    const status = result.isError ? 'error' as const : 'ok' as const
    const expiresAt = now + resolveEvidenceTtlMs()[name]
    if (status === 'ok') contextCache.set(cacheKey, { result, capturedAt: now, expiresAt })
    return {
      result,
      evidence: { name, status, summary: summarizeResult(result), capturedAt, expiresAt: new Date(expiresAt).toISOString(), cached: false, stale: status !== 'ok' },
    }
  } catch (error) {
    return {
      result: undefined,
      evidence: { name, status: 'error' as const, summary: `${error instanceof Error ? error.message : 'Unknown MCP error'} (${urn})`, capturedAt, expiresAt: capturedAt, cached: false, stale: true },
    }
  }
}

export async function searchDataHubAssets(query: string): Promise<DataHubAssetSummary[]> {
  const clean = query.trim().slice(0, 180)
  if (clean.length < 2) throw new Error('Enter at least two characters to search DataHub')
  const client = await connectClient()
  const available = await discoverReadableToolNames(client)
  if (!available.has('search')) throw new Error('The connected DataHub MCP server does not expose search')
  const structuredQuery = clean === '*' || clean.startsWith('/q ') ? clean : `/q ${clean.replace(/\s+/g, '+')}`
  const searchResult = assertBoundedMcpPayload(await withTimeout(client.callTool({ name: 'search', arguments: { query: structuredQuery, filter: 'entity_type = dataset', num_results: 12, offset: 0 } }), 20_000, 'search'), 'search response')
  if (searchResult.isError) throw new Error(summarizeResult(searchResult))
  const matches = parseSearchResults(readStructuredToolResult(searchResult))
  if (!matches.length) return []
  let details: Awaited<ReturnType<typeof client.callTool>> | undefined
  if (available.has('get_entities')) {
    try { details = assertBoundedMcpPayload(await withTimeout(client.callTool({ name: 'get_entities', arguments: { urns: matches.map((match) => match.urn) } }), 20_000, 'get_entities'), 'get_entities response') }
    catch { details = undefined }
  }
  const entityPayload = details && !details.isError ? readStructuredToolResult(details) : undefined
  return matches.map((match) => parseAssetContext({ urn: match.urn, name: match.name, entityPayload }))
}

export async function inspectDataHubAsset(urn: string, force = false): Promise<{ asset: DataHubAssetSummary; evidence: DataHubMcpRead[] }> {
  validateDatasetUrn(urn)
  const client = await connectClient()
  const available = await discoverReadableToolNames(client)
  const [entity, schema, upstream, downstream] = await Promise.all([
    readCachedTool({ client, available, urn, name: 'get_entities', arguments: { urns: [urn] }, force }),
    readCachedTool({ client, available, urn, name: 'list_schema_fields', arguments: { urn }, force }),
    readCachedTool({ client, available, urn, name: 'get_lineage', arguments: { urn, direction: 'upstream', max_hops: 3, count: 30 }, force }),
    readCachedTool({ client, available, urn, name: 'get_lineage', arguments: { urn, direction: 'downstream', max_hops: 3, count: 30 }, force }),
  ])
  const evidence = [entity.evidence, schema.evidence, upstream.evidence, downstream.evidence]
  const successful = evidence.filter((item) => item.status === 'ok').sort((left, right) => left.expiresAt.localeCompare(right.expiresAt))[0]
  const asset = parseAssetContext({
    urn,
    entityPayload: readStructuredToolResult(entity.result),
    schemaPayload: readStructuredToolResult(schema.result),
    upstreamPayload: readStructuredToolResult(upstream.result),
    downstreamPayload: readStructuredToolResult(downstream.result),
    capturedAt: successful?.capturedAt,
    expiresAt: successful?.expiresAt,
  })
  return { asset, evidence }
}

export function invalidateDataHubContext(urn?: string) {
  for (const key of contextCache.keys()) if (!urn || key.includes(urn)) contextCache.delete(key)
  return { invalidated: true }
}

export interface DataHubDecisionRequest { revisionId: string; title: string; rationale: string; author: string; relatedAssets: string[] }

export function parseDataHubDecisionRequest(payload: unknown): DataHubDecisionRequest {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid DataHub write-back request')
  const value = payload as Record<string, unknown>
  const revisionId = typeof value.revisionId === 'string' ? value.revisionId.trim().slice(0, 180) : ''
  const title = typeof value.title === 'string' ? value.title.trim().slice(0, 180) : ''
  const rationale = typeof value.rationale === 'string' ? value.rationale.trim().slice(0, 4_000) : ''
  const author = typeof value.author === 'string' ? value.author.trim().slice(0, 180) : 'DATA LAB operator'
  const relatedAssets = Array.isArray(value.relatedAssets) ? value.relatedAssets.filter((item): item is string => typeof item === 'string' && item.startsWith('urn:li:')).slice(0, 20) : []
  if (!revisionId || !title || !rationale) throw new Error('Revision ID, title and rationale are required for DataHub write-back')
  return { revisionId, title, rationale, author, relatedAssets }
}

export async function writeDataHubDecision(payload: unknown): Promise<{ written: true; tool: 'save_document'; summary: string }> {
  const config = configuration()
  if (!config.settings.writebackEnabled) throw new Error('DataHub write-back is disabled in Settings')
  const { revisionId, title, rationale, author, relatedAssets } = parseDataHubDecisionRequest(payload)
  const client = await connectClient()
  const listed = await discoverTools(client, 'DataHub MCP mutation discovery')
  const tool = listed.tools.find((candidate) => candidate.name === 'save_document')
  if (!tool || tool.annotations?.readOnlyHint !== false) throw new Error('The explicitly enabled save_document mutation tool is unavailable')
  const content = `## DATA LAB approved decision\n\n**Revision:** ${revisionId}\n\n**Author:** ${author}\n\n## Rationale\n\n${rationale}`
  const result = assertBoundedMcpPayload(await withTimeout(client.callTool({ name: 'save_document', arguments: { document_type: 'Decision', title: `DATA LAB · ${title}`, content, topics: ['data-lab', 'approved-revision'], related_assets: relatedAssets } }), 20_000, 'save_document'), 'save_document response')
  if (result.isError) throw new Error(summarizeResult(result))
  return { written: true, tool: 'save_document', summary: summarizeResult(result) }
}

export async function auditDataHubWithMcp(urn: string, force = false): Promise<DataHubMcpAudit> {
  validateDatasetUrn(urn)
  const client = await connectClient()
  const available = await discoverReadableToolNames(client)
  const calls: { name: DataHubMcpRead['name']; arguments: Record<string, unknown> }[] = [
    { name: 'get_entities', arguments: { urns: [urn] } },
    { name: 'list_schema_fields', arguments: { urn } },
    { name: 'get_lineage', arguments: { urn, direction: 'downstream', max_hops: 3 } },
  ]

  const reads = await Promise.all(calls.map(async (call) => (await readCachedTool({ client, available, urn, name: call.name, arguments: call.arguments, force })).evidence))

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
  toolCatalog = undefined
  toolDiscoveryPromise = undefined
  contextCache.clear()
  if (client) await client.close().catch(() => undefined)
  else if (transport) await transport.close().catch(() => undefined)
}
