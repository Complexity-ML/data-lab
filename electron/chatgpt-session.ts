import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { proposalSchema } from './ai-provider.js'
import { parseAndValidateProposal } from './proposal-contract.js'

export interface ChatGPTModelOption { id: string; label: string; description?: string; efforts: string[]; defaultEffort?: string; isDefault: boolean }
export interface ChatGPTSessionStatus { available: boolean; connected: boolean; email?: string; planType?: string; models?: ChatGPTModelOption[]; selectedModel?: string; selectedEffort?: string; error?: string }
type JsonRecord = Record<string, unknown>
type OpenExternal = (url: string) => Promise<unknown>

const require = createRequire(import.meta.url)
const requestTimeoutMs = 30_000
const loginTimeoutMs = 5 * 60_000
const turnTimeoutMs = 3 * 60_000

function record(value: unknown): JsonRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {} }
function errorMessage(value: unknown) { const detail = record(value); return typeof detail.message === 'string' ? detail.message : String(value) }

function codexCommand(): { command: string; args: string[]; env?: NodeJS.ProcessEnv } {
  const configured = process.env.DATA_LAB_CODEX_PATH?.trim()
  if (configured) return { command: configured, args: ['app-server'] }
  const target = ({
    'darwin-arm64': ['@openai/codex-darwin-arm64', 'aarch64-apple-darwin'], 'darwin-x64': ['@openai/codex-darwin-x64', 'x86_64-apple-darwin'],
    'linux-arm64': ['@openai/codex-linux-arm64', 'aarch64-unknown-linux-musl'], 'linux-x64': ['@openai/codex-linux-x64', 'x86_64-unknown-linux-musl'],
    'win32-arm64': ['@openai/codex-win32-arm64', 'aarch64-pc-windows-msvc'], 'win32-x64': ['@openai/codex-win32-x64', 'x86_64-pc-windows-msvc'],
  } as Record<string, [string, string]>)[`${process.platform}-${process.arch}`]
  if (target) try {
    const packageRoot = dirname(require.resolve(`${target[0]}/package.json`)).replace(/app\.asar([/\\])/, 'app.asar.unpacked$1')
    const executable = join(packageRoot, 'vendor', target[1], 'bin', process.platform === 'win32' ? 'codex.exe' : 'codex')
    if (existsSync(executable)) return { command: executable, args: ['app-server'] }
  } catch { /* fall through */ }
  try { return { command: process.execPath, args: [require.resolve('@openai/codex/bin/codex.js'), 'app-server'], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } } } catch { return { command: 'codex', args: ['app-server'] } }
}

function dedicatedEnvironment(codexHome: string, extra?: NodeJS.ProcessEnv) {
  mkdirSync(codexHome, { recursive: true })
  const config = join(codexHome, 'config.toml')
  if (!existsSync(config)) writeFileSync(config, 'cli_auth_credentials_store = "file"\nforced_login_method = "chatgpt"\n', { encoding: 'utf8', mode: 0o600 })
  const environment: NodeJS.ProcessEnv = { ...process.env, ...extra, CODEX_HOME: codexHome }
  delete environment.OPENAI_API_KEY
  delete environment.CODEX_API_KEY
  delete environment.CODEX_ACCESS_TOKEN
  return environment
}

export class ChatGPTAgentSession {
  private process?: ChildProcessWithoutNullStreams
  private initialized?: Promise<void>
  private nextId = 1
  private selectedModel?: string
  private selectedEffort?: string
  private readonly pending = new Map<number, { resolve(value: unknown): void; reject(reason: Error): void; timeout: NodeJS.Timeout }>()
  private readonly listeners = new Set<(method: string, params: unknown) => void>()
  constructor(private readonly openExternal: OpenExternal, private readonly version: string, private readonly codexHome: string) {}

  private start() {
    if (this.initialized) return this.initialized
    this.initialized = new Promise<void>((resolve, reject) => {
      const invocation = codexCommand()
      let ready = false
      try { this.process = spawn(invocation.command, invocation.args, { env: dedicatedEnvironment(this.codexHome, invocation.env), stdio: ['pipe', 'pipe', 'pipe'] }) } catch (error) { reject(error); return }
      this.process.once('error', (error) => { if (!ready) reject(error); this.fail(error) })
      this.process.stderr.resume()
      this.process.once('exit', () => { this.fail(new Error('Codex App Server stopped')); this.process = undefined; this.initialized = undefined })
      createInterface({ input: this.process.stdout }).on('line', (line) => this.receive(line))
      void this.request('initialize', { clientInfo: { name: 'data_lab', title: 'DATA LAB', version: this.version }, capabilities: null }).then(() => { this.write({ method: 'initialized' }); ready = true; resolve() }).catch((error) => { this.process?.kill(); this.initialized = undefined; reject(error) })
    })
    return this.initialized
  }
  private write(message: JsonRecord) { if (!this.process?.stdin.writable) throw new Error('Codex App Server is unavailable'); this.process.stdin.write(`${JSON.stringify(message)}\n`) }
  private receive(line: string) {
    let message: JsonRecord
    try { message = record(JSON.parse(line)) } catch { return }
    if (typeof message.id === 'number' && ('result' in message || 'error' in message)) {
      const item = this.pending.get(message.id); if (!item) return; clearTimeout(item.timeout); this.pending.delete(message.id); message.error ? item.reject(new Error(errorMessage(message.error))) : item.resolve(message.result); return
    }
    if (typeof message.method === 'string' && 'id' in message) { this.write({ id: message.id, error: { code: -32601, message: 'DATA LAB denies App Server tool requests' } }); return }
    if (typeof message.method === 'string') for (const listener of this.listeners) listener(message.method, message.params)
  }
  private request(method: string, params?: unknown, timeoutMs = requestTimeoutMs): Promise<unknown> {
    const id = this.nextId++
    return new Promise((resolve, reject) => { const timeout = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} timed out`)) }, timeoutMs); this.pending.set(id, { resolve, reject, timeout }); try { this.write({ id, method, params }) } catch (error) { clearTimeout(timeout); this.pending.delete(id); reject(error) } })
  }
  private fail(error: Error) { for (const item of this.pending.values()) { clearTimeout(item.timeout); item.reject(error) } this.pending.clear() }
  private waitFor(method: string, predicate: (params: JsonRecord) => boolean, timeoutMs: number) {
    return new Promise<JsonRecord>((resolve, reject) => { const timeout = setTimeout(() => { this.listeners.delete(listener); reject(new Error(`${method} timed out`)) }, timeoutMs); const listener = (candidate: string, params: unknown) => { const value = record(params); if (candidate !== method || !predicate(value)) return; clearTimeout(timeout); this.listeners.delete(listener); resolve(value) }; this.listeners.add(listener) })
  }
  private collect(threadId: string) {
    let output = ''
    const listener = (method: string, params: unknown) => { const value = record(params); if (value.threadId !== threadId) return; const item = record(value.item); if (method === 'item/completed' && item.type === 'agentMessage' && typeof item.text === 'string') output = item.text; if (method === 'item/agentMessage/delta' && typeof value.delta === 'string') output += value.delta }
    this.listeners.add(listener)
    return { read: () => output, stop: () => this.listeners.delete(listener) }
  }

  async status(): Promise<ChatGPTSessionStatus> {
    if (!this.initialized && !existsSync(join(this.codexHome, 'auth.json'))) return { available: true, connected: false }
    try {
      await this.start()
      const account = record(record(await this.request('account/read', { refreshToken: false })).account)
      if (account.type !== 'chatgpt') return { available: true, connected: false }
      let models: ChatGPTModelOption[] = []
      try { const result = record(await this.request('model/list', { limit: 100, includeHidden: false })); models = (Array.isArray(result.data) ? result.data : []).map((item) => { const model = record(item); const efforts = (Array.isArray(model.supportedReasoningEfforts) ? model.supportedReasoningEfforts : []).map((effort) => record(effort).reasoningEffort).filter((effort): effort is string => typeof effort === 'string'); return { id: typeof model.model === 'string' ? model.model : String(model.id ?? ''), label: typeof model.displayName === 'string' ? model.displayName : String(model.model ?? ''), description: typeof model.description === 'string' ? model.description : undefined, efforts, defaultEffort: typeof model.defaultReasoningEffort === 'string' ? model.defaultReasoningEffort : undefined, isDefault: model.isDefault === true } }).filter((model) => model.id) } catch { /* keep session */ }
      const selected = models.find((model) => model.id === this.selectedModel) ?? models.find((model) => model.isDefault) ?? models[0]
      if (selected && !this.selectedModel) { this.selectedModel = selected.id; this.selectedEffort = selected.defaultEffort ?? selected.efforts[0] }
      return { available: true, connected: true, email: typeof account.email === 'string' ? account.email : undefined, planType: typeof account.planType === 'string' ? account.planType : undefined, models, selectedModel: this.selectedModel, selectedEffort: this.selectedEffort }
    } catch (error) { return { available: false, connected: false, error: error instanceof Error ? error.message : String(error) } }
  }
  async connect() { await this.start(); const result = record(await this.request('account/login/start', { type: 'chatgpt', useHostedLoginSuccessPage: true, appBrand: 'chatgpt' })); if (result.type !== 'chatgpt' || typeof result.loginId !== 'string' || typeof result.authUrl !== 'string') throw new Error('Codex did not return a ChatGPT sign-in URL'); const completed = this.waitFor('account/login/completed', (params) => params.loginId === result.loginId, loginTimeoutMs); await this.openExternal(result.authUrl); const notification = await completed; if (notification.success !== true) throw new Error(typeof notification.error === 'string' ? notification.error : 'ChatGPT sign-in was not completed'); return this.status() }
  async disconnect() { await this.start(); await this.request('account/logout'); this.selectedModel = undefined; this.selectedEffort = undefined; return { available: true, connected: false } as ChatGPTSessionStatus }
  async configure(payload: { model?: unknown; effort?: unknown }) { const status = await this.status(); const model = status.models?.find((item) => item.id === payload.model); if (!model) throw new Error('Choose a model available to this ChatGPT account'); this.selectedModel = model.id; this.selectedEffort = typeof payload.effort === 'string' && model.efforts.includes(payload.effort) ? payload.effort : model.defaultEffort ?? model.efforts[0]; return this.status() }

  async runProposal(payload: unknown) {
    const status = await this.status(); if (!status.connected) throw new Error('Connect ChatGPT in Settings → AI connection first')
    const threadResult = record(await this.request('thread/start', { cwd: tmpdir(), approvalPolicy: 'never', sandbox: 'read-only', ephemeral: true, model: status.selectedModel ?? null, baseInstructions: 'You are the bounded DATA LAB pipeline planning agent. Never run commands, inspect files, browse, or mutate the computer. Return only the requested JSON proposal.', developerInstructions: 'Use only the supplied graph, validation, DataHub evidence, compact Data Profile cards, and version history. When reading a dataset, add or update one bounded Data Profile card without raw rows, then reuse fresh profiles instead of reconstructing the data mentally. Never repeat rejected revisions. Add a Human Review card only when confidence is insufficient or impact is sensitive.' }))
    const thread = record(threadResult.thread); if (typeof thread.id !== 'string') throw new Error('ChatGPT did not start a DATA LAB planning thread')
    const collector = this.collect(thread.id); const completed = this.waitFor('turn/completed', (params) => params.threadId === thread.id, turnTimeoutMs)
    try {
      await this.request('turn/start', { threadId: thread.id, input: [{ type: 'text', text: JSON.stringify(payload).slice(0, 80_000), text_elements: [] }], approvalPolicy: 'never', effort: status.selectedEffort ?? null, outputSchema: proposalSchema }, turnTimeoutMs)
      const notification = await completed; const turn = record(notification.turn); if (turn.status !== 'completed') throw new Error(errorMessage(turn.error ?? 'ChatGPT planning failed'))
      const items = (Array.isArray(turn.items) ? turn.items : []).map(record); const output = items.filter((item) => item.type === 'agentMessage' && typeof item.text === 'string').map((item) => item.text as string).at(-1) ?? collector.read(); if (!output) throw new Error('ChatGPT returned no proposal')
      const proposal = parseAndValidateProposal(output, payload)
      return { proposal, model: status.selectedModel ?? 'ChatGPT', usage: undefined }
    } finally { collector.stop(); void this.request('thread/delete', { threadId: thread.id }).catch(() => undefined) }
  }
  cancel() { const cancelled = Boolean(this.process); this.stop(); return { cancelled } }
  stop() { this.process?.kill(); this.process = undefined; this.initialized = undefined }
}
