import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const electronState = vi.hoisted(() => ({ directory: '', encryptionAvailable: true }))

vi.mock('electron', () => ({
  app: { getPath: () => electronState.directory },
  safeStorage: {
    decryptString: (buffer: Buffer) => buffer.toString('utf8').replace(/^encrypted:/, ''),
    encryptString: (value: string) => Buffer.from(`encrypted:${value}`),
    isEncryptionAvailable: () => electronState.encryptionAvailable,
  },
}))

import { getAiStatus, modelCapabilities, redactSensitive, refreshAiModelCatalog, saveAiSettings } from './ai-provider.js'

let directory: string

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'data-lab-ai-provider-'))
  electronState.directory = directory
  electronState.encryptionAvailable = true
  process.env.OPENAI_API_KEY = ''
  process.env.ANTHROPIC_API_KEY = ''
  process.env.MOONSHOT_API_KEY = ''
})

afterEach(() => {
  vi.unstubAllGlobals()
  rmSync(directory, { force: true, recursive: true })
})

describe('secure provider credential lifecycle', () => {
  it('saves, rotates and removes each provider key independently without exposing it to the renderer status', async () => {
    await saveAiSettings({ provider: 'openai', apiKey: 'sk-first-secret' })
    await saveAiSettings({ provider: 'anthropic', apiKey: 'key-anthropic-secret' })
    await saveAiSettings({ provider: 'openai', apiKey: 'sk-rotated-secret' })

    const status = await getAiStatus()
    expect(status.providers.openai).toMatchObject({ connected: true, credentialSource: 'encrypted' })
    expect(status.providers.anthropic).toMatchObject({ connected: true, credentialSource: 'encrypted' })
    expect(JSON.stringify(status)).not.toContain('secret')

    const stored = readFileSync(join(directory, 'ai-provider.json'), 'utf8')
    expect(stored).not.toContain('sk-rotated-secret')
    expect(stored).not.toContain('key-anthropic-secret')

    await saveAiSettings({ provider: 'openai', clearKey: true })
    const cleared = await getAiStatus()
    expect(cleared.providers.openai.connected).toBe(false)
    expect(cleared.providers.anthropic.connected).toBe(true)
  })

  it('refuses to write a plaintext fallback when secure storage is unavailable', async () => {
    electronState.encryptionAvailable = false
    await expect(saveAiSettings({ provider: 'moonshot', apiKey: 'key-moonshot-secret' })).rejects.toThrow('Secure credential storage is unavailable')
    expect(() => readFileSync(join(directory, 'ai-provider.json'), 'utf8')).toThrow()
  })

  it('redacts authorization headers and common provider token formats from errors and logs', () => {
    const source = 'Authorization: "Bearer sk-example-secret123" api_key="key-private-secret123" access_token="token-private-secret123"'
    const redacted = redactSensitive(source)
    expect(redacted).not.toContain('secret123')
    expect(redacted).toContain('[REDACTED]')
  })
})

describe('provider model capabilities', () => {
  it('enables only controls supported by the selected provider and model', () => {
    expect(modelCapabilities('openai', 'gpt-5.6-terra')).toMatchObject({ reasoning: true, verbosity: true, serviceTier: true })
    expect(modelCapabilities('anthropic', 'claude-opus-4-8')).toMatchObject({ reasoning: false, verbosity: false, serviceTier: false })
    expect(modelCapabilities('moonshot', 'kimi-k3')).toMatchObject({ reasoning: true, verbosity: false, serviceTier: false })
  })

  it('marks known legacy model families as deprecated', () => {
    expect(modelCapabilities('openai', 'gpt-3.5-turbo').deprecated).toBe(true)
    expect(modelCapabilities('anthropic', 'claude-2.1').deprecated).toBe(true)
  })

  it('caches a refreshed catalog while preserving a manual model ID that is temporarily unavailable', async () => {
    await saveAiSettings({ provider: 'openai', model: 'my-fine-tuned-model', apiKey: 'sk-catalog-secret' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'gpt-5.6-terra' }, { id: 'gpt-5.6-fast' }] }), { status: 200, headers: { 'content-type': 'application/json' } })))

    const status = await refreshAiModelCatalog({ provider: 'openai' })

    expect(status.providers.openai.catalog.map((model) => model.id)).toEqual(['gpt-5.6-terra', 'gpt-5.6-fast'])
    expect(status.providers.openai.catalogRefreshedAt).toBeTruthy()
    expect(status.providers.openai.modelUnavailable).toBe(true)
    expect(status.settings.model).toBe('my-fine-tuned-model')
  })
})
