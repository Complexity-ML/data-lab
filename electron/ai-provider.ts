import { app, safeStorage } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export type ApiProvider = 'openai' | 'anthropic' | 'moonshot'
export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type Verbosity = 'low' | 'medium' | 'high'
export type ServiceTier = 'auto' | 'priority'

export interface AiSettings { provider: ApiProvider; model: string; reasoningEffort: ReasoningEffort; verbosity: Verbosity; serviceTier: ServiceTier }
interface ProviderConfig { encryptedKey?: string; model: string }
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

async function readConfig(): Promise<StoredAiConfig> {
  try {
    const parsed = JSON.parse(await readFile(configPath(), 'utf8')) as Partial<StoredAiConfig>
    const selectedProvider = providers.has(parsed.selectedProvider as ApiProvider) ? parsed.selectedProvider as ApiProvider : defaults.selectedProvider
    const source = parsed.providers ?? defaults.providers
    return {
      selectedProvider,
      providers: {
        openai: { model: cleanModel(source.openai?.model, providerDefaults.openai), encryptedKey: source.openai?.encryptedKey ?? parsed.encryptedKey },
        anthropic: { model: cleanModel(source.anthropic?.model, providerDefaults.anthropic), encryptedKey: source.anthropic?.encryptedKey },
        moonshot: { model: cleanModel(source.moonshot?.model, providerDefaults.moonshot), encryptedKey: source.moonshot?.encryptedKey },
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
    return [provider, { connected: Boolean(await apiKey(provider)), credentialSource: environment ? 'environment' as const : config.providers[provider].encryptedKey ? 'encrypted' as const : 'none' as const, model: config.providers[provider].model }] as const
  }))
  const providerStatus = Object.fromEntries(providerEntries) as Record<ApiProvider, { connected: boolean; credentialSource: 'environment' | 'encrypted' | 'none'; model: string }>
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
    throw new Error(`${provider} returned HTTP ${response.status}${detail ? ` · ${detail.slice(0, 300)}` : ''}`)
  }
  return response
}

export async function testAiConnection() {
  const status = await getAiStatus()
  const provider = status.selectedProvider
  const response = await authorizedFetch(provider, '/models')
  const body = await response.json() as { data?: { id?: string }[] }
  const availableModels = (body.data ?? []).map((entry) => entry.id).filter((id): id is string => Boolean(id)).slice(0, 100)
  return { ...(await getAiStatus()), availableModels }
}

export const proposalSchema = {
  type: 'object', additionalProperties: false,
  required: ['title', 'summary', 'rationale', 'requires_human_review', 'confidence', 'writeback', 'evidence', 'actions'],
  properties: {
    title: { type: 'string' }, summary: { type: 'string' }, rationale: { type: 'string' }, requires_human_review: { type: 'boolean' }, confidence: { type: 'number', minimum: 0, maximum: 1 }, writeback: { type: 'string' }, evidence: { type: 'array', items: { type: 'string' }, maxItems: 12 },
    actions: { type: 'array', maxItems: 20, items: { type: 'object', additionalProperties: false, required: ['type', 'node_id', 'kind', 'label', 'description', 'owner', 'rule', 'source', 'target', 'source_handle', 'reason'], properties: {
      type: { type: 'string', enum: ['add_card', 'update_card', 'add_edge', 'remove_edge'] }, node_id: { type: ['string', 'null'] }, kind: { type: ['string', 'null'], enum: ['source', 'analysis', 'split', 'decision', 'transform', 'review', 'validation', 'output', null] }, label: { type: ['string', 'null'] }, description: { type: ['string', 'null'] }, owner: { type: ['string', 'null'] }, rule: { type: ['string', 'null'] }, source: { type: ['string', 'null'] }, target: { type: ['string', 'null'] }, source_handle: { type: ['string', 'null'] }, reason: { type: 'string' },
    } } },
  },
} as const

const instructions = 'You are the DATA LAB pipeline agent. Use only the supplied graph, validation findings, DataHub MCP evidence, and version history. Compare recent versions and never repeat a rejected revision. Agent Decision may add, update, reconnect, or remove graph elements. Return the smallest evidence-backed graph diff as strict JSON matching the supplied schema; never claim it was executed. Set requires_human_review true only for uncertainty, sensitive-data changes, schema changes, or downstream contract changes. If true, include a review card action. Otherwise do not create Human Review. Return no action when evidence is insufficient.'

function parseJsonResponse(value: string) {
  const trimmed = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const proposal = JSON.parse(trimmed) as Record<string, unknown>
  if (!Array.isArray(proposal.actions) || typeof proposal.title !== 'string') throw new Error('The provider returned an invalid DATA LAB proposal contract')
  return proposal
}

export async function runAiProposal(payload: unknown) {
  const status = await getAiStatus()
  const settings = status.settings
  const provider = settings.provider
  activeProposalController?.abort()
  const controller = new AbortController()
  activeProposalController = controller
  try {
    if (provider === 'openai') {
      const response = await authorizedFetch(provider, '/responses', { method: 'POST', signal: controller.signal, body: JSON.stringify({ model: settings.model, store: false, service_tier: settings.serviceTier, reasoning: { effort: settings.reasoningEffort }, text: { verbosity: settings.verbosity, format: { type: 'json_schema', name: 'data_lab_pipeline_proposal', strict: true, schema: proposalSchema } }, instructions, input: JSON.stringify(payload).slice(0, 80_000) }) })
      const body = await response.json() as { model?: string; output?: { content?: { type?: string; text?: string }[] }[]; usage?: unknown }
      const output = body.output?.flatMap((item) => item.content ?? []).find((item) => item.type === 'output_text')?.text
      if (!output) throw new Error('OpenAI returned no structured proposal')
      return { proposal: parseJsonResponse(output), model: body.model ?? settings.model, usage: body.usage }
    }
    if (provider === 'anthropic') {
      const response = await authorizedFetch(provider, '/messages', { method: 'POST', signal: controller.signal, body: JSON.stringify({ model: settings.model, max_tokens: 8_000, system: `${instructions}\nJSON schema:\n${JSON.stringify(proposalSchema)}`, messages: [{ role: 'user', content: JSON.stringify(payload).slice(0, 80_000) }] }) })
      const body = await response.json() as { model?: string; content?: { type?: string; text?: string }[]; usage?: unknown }
      const output = body.content?.find((item) => item.type === 'text')?.text
      if (!output) throw new Error('Claude returned no proposal')
      return { proposal: parseJsonResponse(output), model: body.model ?? settings.model, usage: body.usage }
    }
    const response = await authorizedFetch(provider, '/chat/completions', { method: 'POST', signal: controller.signal, body: JSON.stringify({ model: settings.model, messages: [{ role: 'system', content: `${instructions}\nJSON schema:\n${JSON.stringify(proposalSchema)}` }, { role: 'user', content: JSON.stringify(payload).slice(0, 80_000) }] }) })
    const body = await response.json() as { model?: string; choices?: { message?: { content?: string } }[]; usage?: unknown }
    const output = body.choices?.[0]?.message?.content
    if (!output) throw new Error('Kimi returned no proposal')
    return { proposal: parseJsonResponse(output), model: body.model ?? settings.model, usage: body.usage }
  } finally { if (activeProposalController === controller) activeProposalController = undefined }
}

export function cancelAiProposal() { const cancelled = Boolean(activeProposalController); activeProposalController?.abort(); activeProposalController = undefined; return { cancelled } }
