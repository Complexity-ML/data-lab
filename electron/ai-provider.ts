import { app, safeStorage } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseAndValidateProposal } from './proposal-contract.js'

export type ApiProvider = 'openai' | 'anthropic' | 'moonshot'
export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type Verbosity = 'low' | 'medium' | 'high'
export type ServiceTier = 'auto' | 'priority'

export interface ModelCapabilities { reasoning: boolean; verbosity: boolean; serviceTier: boolean; deprecated: boolean }
export interface ProviderModelOption { id: string; label: string; capabilities: ModelCapabilities }
interface ProviderStatus { connected: boolean; credentialSource: 'environment' | 'encrypted' | 'none'; model: string; catalog: ProviderModelOption[]; catalogRefreshedAt?: string; capabilities: ModelCapabilities; modelUnavailable: boolean }

export interface AiSettings { provider: ApiProvider; model: string; reasoningEffort: ReasoningEffort; verbosity: Verbosity; serviceTier: ServiceTier }
interface ProviderConfig { encryptedKey?: string; model: string; catalog?: ProviderModelOption[]; catalogRefreshedAt?: string }
interface StoredAiConfig { selectedProvider: ApiProvider; providers: Record<ApiProvider, ProviderConfig>; reasoningEffort: ReasoningEffort; verbosity: Verbosity; serviceTier: ServiceTier; encryptedKey?: string }

const providerDefaults: Record<ApiProvider, string> = { openai: 'gpt-5.6-terra', anthropic: 'claude-opus-4-8', moonshot: 'kimi-k3' }
const defaults: StoredAiConfig = { selectedProvider: 'openai', providers: { openai: { model: providerDefaults.openai }, anthropic: { model: providerDefaults.anthropic }, moonshot: { model: providerDefaults.moonshot } }, reasoningEffort: 'medium', verbosity: 'low', serviceTier: 'auto' }
const providers = new Set<ApiProvider>(['openai', 'anthropic', 'moonshot'])
const efforts = new Set<ReasoningEffort>(['none', 'low', 'medium', 'high', 'xhigh', 'max'])
const verbosities = new Set<Verbosity>(['low', 'medium', 'high'])
const serviceTiers = new Set<ServiceTier>(['auto', 'priority'])
let activeProposalController: AbortController | undefined

function configPath() { return join(app.getPath('userData'), 'ai-provider.json') }
function cleanModel(value: unknown, fallback: string) { return typeof value === 'string' && /^[A-Za-z0-9._:-]{2,120}$/.test(value) ? value : fallback }

export function modelCapabilities(provider: ApiProvider, model: string): ModelCapabilities {
  const id = model.toLowerCase()
  const deprecated = /(?:gpt-3(?:\.|-|$)|claude-(?:1|2)(?:\.|-|$)|kimi-(?:v1|legacy))/.test(id)
  if (provider === 'openai') return { reasoning: /(?:^|[-_.])(gpt-5|o[134])/.test(id), verbosity: /(?:^|[-_.])gpt-5/.test(id), serviceTier: true, deprecated }
  if (provider === 'anthropic') return { reasoning: false, verbosity: false, serviceTier: false, deprecated }
  return { reasoning: /(?:^|[-_.])kimi-k[23]/.test(id), verbosity: false, serviceTier: false, deprecated }
}

function cleanCatalog(value: unknown, provider: ApiProvider): ProviderModelOption[] {
  if (!Array.isArray(value)) return []
  const unique = new Set<string>()
  return value.flatMap((item) => {
    const source = item && typeof item === 'object' ? item as Record<string, unknown> : {}
    const id = cleanModel(source.id, '')
    if (!id || unique.has(id)) return []
    unique.add(id)
    return [{ id, label: typeof source.label === 'string' ? source.label.slice(0, 160) : id, capabilities: modelCapabilities(provider, id) }]
  }).slice(0, 250)
}

async function readConfig(): Promise<StoredAiConfig> {
  try {
    const parsed = JSON.parse(await readFile(configPath(), 'utf8')) as Partial<StoredAiConfig>
    const selectedProvider = providers.has(parsed.selectedProvider as ApiProvider) ? parsed.selectedProvider as ApiProvider : defaults.selectedProvider
    const source = parsed.providers ?? defaults.providers
    return {
      selectedProvider,
      providers: {
        openai: { model: cleanModel(source.openai?.model, providerDefaults.openai), encryptedKey: source.openai?.encryptedKey ?? parsed.encryptedKey, catalog: cleanCatalog(source.openai?.catalog, 'openai'), catalogRefreshedAt: typeof source.openai?.catalogRefreshedAt === 'string' ? source.openai.catalogRefreshedAt : undefined },
        anthropic: { model: cleanModel(source.anthropic?.model, providerDefaults.anthropic), encryptedKey: source.anthropic?.encryptedKey, catalog: cleanCatalog(source.anthropic?.catalog, 'anthropic'), catalogRefreshedAt: typeof source.anthropic?.catalogRefreshedAt === 'string' ? source.anthropic.catalogRefreshedAt : undefined },
        moonshot: { model: cleanModel(source.moonshot?.model, providerDefaults.moonshot), encryptedKey: source.moonshot?.encryptedKey, catalog: cleanCatalog(source.moonshot?.catalog, 'moonshot'), catalogRefreshedAt: typeof source.moonshot?.catalogRefreshedAt === 'string' ? source.moonshot.catalogRefreshedAt : undefined },
      },
      reasoningEffort: efforts.has(parsed.reasoningEffort as ReasoningEffort) ? parsed.reasoningEffort as ReasoningEffort : defaults.reasoningEffort,
      verbosity: verbosities.has(parsed.verbosity as Verbosity) ? parsed.verbosity as Verbosity : defaults.verbosity,
      serviceTier: serviceTiers.has(parsed.serviceTier as ServiceTier) ? parsed.serviceTier as ServiceTier : defaults.serviceTier,
    }
  } catch { return structuredClone(defaults) }
}

function environmentKey(provider: ApiProvider) {
  return ({ openai: process.env.OPENAI_API_KEY, anthropic: process.env.ANTHROPIC_API_KEY, moonshot: process.env.MOONSHOT_API_KEY })[provider]?.trim()
}

async function apiKey(provider: ApiProvider): Promise<string | undefined> {
  const environment = environmentKey(provider)
  if (environment) return environment
  const config = await readConfig()
  const encrypted = config.providers[provider].encryptedKey
  if (!encrypted || !safeStorage.isEncryptionAvailable()) return undefined
  try { return safeStorage.decryptString(Buffer.from(encrypted, 'base64')).trim() || undefined } catch { return undefined }
}

export async function getAiStatus() {
  const config = await readConfig()
  const providerEntries = await Promise.all((['openai', 'anthropic', 'moonshot'] as ApiProvider[]).map(async (provider) => {
    const environment = Boolean(environmentKey(provider))
    const selected = config.providers[provider]
    const catalog = selected.catalog ?? []
    return [provider, { connected: Boolean(await apiKey(provider)), credentialSource: environment ? 'environment' as const : selected.encryptedKey ? 'encrypted' as const : 'none' as const, model: selected.model, catalog, catalogRefreshedAt: selected.catalogRefreshedAt, capabilities: modelCapabilities(provider, selected.model), modelUnavailable: catalog.length > 0 && !catalog.some((model) => model.id === selected.model) }] as const
  }))
  const providerStatus = Object.fromEntries(providerEntries) as unknown as Record<ApiProvider, ProviderStatus>
  return {
    connected: providerStatus[config.selectedProvider].connected,
    credentialSource: providerStatus[config.selectedProvider].credentialSource,
    selectedProvider: config.selectedProvider,
    providers: providerStatus,
    encryptionAvailable: safeStorage.isEncryptionAvailable(),
    settings: { provider: config.selectedProvider, model: config.providers[config.selectedProvider].model, reasoningEffort: config.reasoningEffort, verbosity: config.verbosity, serviceTier: config.serviceTier },
  }
}

export async function saveAiSettings(payload: Partial<AiSettings> & { apiKey?: unknown; clearKey?: unknown }) {
  const current = await readConfig()
  const provider = providers.has(payload.provider as ApiProvider) ? payload.provider as ApiProvider : current.selectedProvider
  current.selectedProvider = provider
  current.providers[provider].model = cleanModel(payload.model, current.providers[provider].model)
  if (efforts.has(payload.reasoningEffort as ReasoningEffort)) current.reasoningEffort = payload.reasoningEffort as ReasoningEffort
  if (verbosities.has(payload.verbosity as Verbosity)) current.verbosity = payload.verbosity as Verbosity
  if (serviceTiers.has(payload.serviceTier as ServiceTier)) current.serviceTier = payload.serviceTier as ServiceTier
  if (payload.clearKey === true) delete current.providers[provider].encryptedKey
  if (typeof payload.apiKey === 'string' && payload.apiKey.trim()) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure credential storage is unavailable on this device')
    current.providers[provider].encryptedKey = safeStorage.encryptString(payload.apiKey.trim()).toString('base64')
  }
  await writeFile(configPath(), JSON.stringify(current), { encoding: 'utf8', mode: 0o600 })
  return getAiStatus()
}

function providerRequest(provider: ApiProvider, key: string, path: string, init: RequestInit = {}) {
  const base = provider === 'openai' ? 'https://api.openai.com/v1' : provider === 'anthropic' ? 'https://api.anthropic.com/v1' : 'https://api.moonshot.ai/v1'
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  if (provider === 'anthropic') { headers.set('x-api-key', key); headers.set('anthropic-version', '2023-06-01') }
  else headers.set('Authorization', `Bearer ${key}`)
  const timeoutSignal = AbortSignal.timeout(120_000)
  const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal
  return fetch(`${base}${path}`, { ...init, signal, headers })
}

async function authorizedFetch(provider: ApiProvider, path: string, init: RequestInit = {}) {
  const key = await apiKey(provider)
  if (!key) throw new Error(`${provider} is not connected. Add its API key in Settings → AI connection.`)
  const response = await providerRequest(provider, key, path, init)
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`${provider} returned HTTP ${response.status}${detail ? ` · ${redactSensitive(detail).slice(0, 300)}` : ''}`)
  }
  return response
}

export function redactSensitive(value: string) {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|key|token|secret)-[A-Za-z0-9_-]{8,}\b/gi, '[REDACTED]')
    .replace(/("?(?:authorization|api[_-]?key|access[_-]?token)"?\s*[:=]\s*")([^"]+)(")/gi, '$1[REDACTED]$3')
}

export async function refreshAiModelCatalog(payload: { provider?: unknown } = {}) {
  const current = await readConfig()
  const provider = providers.has(payload.provider as ApiProvider) ? payload.provider as ApiProvider : current.selectedProvider
  const response = await authorizedFetch(provider, '/models')
  const body = await response.json() as { data?: { id?: string; display_name?: string }[] }
  const catalog = cleanCatalog((body.data ?? []).map((entry) => ({ id: entry.id, label: entry.display_name ?? entry.id })), provider)
  if (!catalog.length) throw new Error(`${provider} returned an empty or unsupported model catalog`)
  current.providers[provider].catalog = catalog
  current.providers[provider].catalogRefreshedAt = new Date().toISOString()
  await writeFile(configPath(), JSON.stringify(current), { encoding: 'utf8', mode: 0o600 })
  return getAiStatus()
}

export async function testAiConnection() {
  const status = await refreshAiModelCatalog()
  return { ...status, availableModels: status.providers[status.selectedProvider].catalog.map((model) => model.id) }
}

export const proposalSchema = {
  type: 'object', additionalProperties: false,
  required: ['title', 'summary', 'rationale', 'requires_human_review', 'confidence', 'writeback', 'evidence', 'actions'],
  properties: {
    title: { type: 'string' }, summary: { type: 'string' }, rationale: { type: 'string' }, requires_human_review: { type: 'boolean' }, confidence: { type: 'number', minimum: 0, maximum: 1 }, writeback: { type: 'string' }, evidence: { type: 'array', items: { type: 'string' }, maxItems: 12 },
    actions: { type: 'array', maxItems: 20, items: { type: 'object', additionalProperties: false, required: ['type', 'node_id', 'kind', 'label', 'description', 'owner', 'rule', 'source', 'target', 'source_handle', 'reason'], properties: {
      type: { type: 'string', enum: ['add_card', 'update_card', 'add_edge', 'remove_edge'] }, node_id: { type: ['string', 'null'] }, kind: { type: ['string', 'null'], enum: ['source', 'profile', 'analysis', 'impact', 'split', 'decision', 'transform', 'review', 'validation', 'output', null] }, label: { type: ['string', 'null'] }, description: { type: ['string', 'null'] }, owner: { type: ['string', 'null'] }, rule: { type: ['string', 'null'] }, source: { type: ['string', 'null'] }, target: { type: ['string', 'null'] }, source_handle: { type: ['string', 'null'] }, reason: { type: 'string' },
    } } },
  },
} as const

const instructions = 'You are the DATA LAB pipeline agent. Use only the supplied graph, validation findings, DataHub MCP evidence, compact Data Profile cards, and version history. Compare recent versions and never repeat a rejected revision. When reading a dataset, add or update one Data Profile card that summarizes schema, quality, freshness, aggregate statistics and anomalies without raw rows. For a requested data or schema change, add or update an Impact Analysis card that traces DataHub lineage through datasets, features, pipelines, models and deployments, ranks concrete risks, and records recommended actions. Reuse a fresh profile rather than repeating normalization or mental reconstruction. Agent Decision may add, update, reconnect, or remove graph elements. Return the smallest evidence-backed graph diff as strict JSON matching the supplied schema; never claim it was executed. Set requires_human_review true only for uncertainty, sensitive-data changes, schema changes, or downstream contract changes. If true, include a review card action. Otherwise do not create Human Review. Return no action when evidence is insufficient.'

export async function runAiProposal(payload: unknown) {
  const status = await getAiStatus()
  const settings = status.settings
  const provider = settings.provider
  activeProposalController?.abort()
  const controller = new AbortController()
    activeProposalController = controller
  try {
    if (provider === 'openai') {
      const capabilities = modelCapabilities(provider, settings.model)
      const responseBody = {
        model: settings.model,
        store: false,
        ...(capabilities.serviceTier ? { service_tier: settings.serviceTier } : {}),
        ...(capabilities.reasoning ? { reasoning: { effort: settings.reasoningEffort } } : {}),
        text: { ...(capabilities.verbosity ? { verbosity: settings.verbosity } : {}), format: { type: 'json_schema', name: 'data_lab_pipeline_proposal', strict: true, schema: proposalSchema } },
        instructions,
        input: JSON.stringify(payload).slice(0, 80_000),
      }
      const response = await authorizedFetch(provider, '/responses', { method: 'POST', signal: controller.signal, body: JSON.stringify(responseBody) })
      const body = await response.json() as { model?: string; output?: { content?: { type?: string; text?: string }[] }[]; usage?: unknown }
      const output = body.output?.flatMap((item) => item.content ?? []).find((item) => item.type === 'output_text')?.text
      if (!output) throw new Error('OpenAI returned no structured proposal')
      return { proposal: parseAndValidateProposal(output, payload), model: body.model ?? settings.model, usage: body.usage }
    }
    if (provider === 'anthropic') {
      const response = await authorizedFetch(provider, '/messages', { method: 'POST', signal: controller.signal, body: JSON.stringify({ model: settings.model, max_tokens: 8_000, system: `${instructions}\nJSON schema:\n${JSON.stringify(proposalSchema)}`, messages: [{ role: 'user', content: JSON.stringify(payload).slice(0, 80_000) }] }) })
      const body = await response.json() as { model?: string; content?: { type?: string; text?: string }[]; usage?: unknown }
      const output = body.content?.find((item) => item.type === 'text')?.text
      if (!output) throw new Error('Claude returned no proposal')
      return { proposal: parseAndValidateProposal(output, payload), model: body.model ?? settings.model, usage: body.usage }
    }
    const response = await authorizedFetch(provider, '/chat/completions', { method: 'POST', signal: controller.signal, body: JSON.stringify({ model: settings.model, messages: [{ role: 'system', content: `${instructions}\nJSON schema:\n${JSON.stringify(proposalSchema)}` }, { role: 'user', content: JSON.stringify(payload).slice(0, 80_000) }] }) })
    const body = await response.json() as { model?: string; choices?: { message?: { content?: string } }[]; usage?: unknown }
    const output = body.choices?.[0]?.message?.content
    if (!output) throw new Error('Kimi returned no proposal')
    return { proposal: parseAndValidateProposal(output, payload), model: body.model ?? settings.model, usage: body.usage }
  } finally { if (activeProposalController === controller) activeProposalController = undefined }
}

export function cancelAiProposal() { const cancelled = Boolean(activeProposalController); activeProposalController?.abort(); activeProposalController = undefined; return { cancelled } }
