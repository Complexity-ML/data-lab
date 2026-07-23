import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const electronState = vi.hoisted(() => ({ directory: '', encryptionAvailable: true, availabilityChecks: 0, decryptions: 0 }))

vi.mock('electron', () => ({
  app: { getPath: () => electronState.directory },
  safeStorage: {
    decryptString: (buffer: Buffer) => { electronState.decryptions += 1; return buffer.toString('utf8').replace(/^encrypted:/, '') },
    encryptString: (value: string) => Buffer.from(`encrypted:${value}`),
    isEncryptionAvailable: () => { electronState.availabilityChecks += 1; return electronState.encryptionAvailable },
  },
}))

import { assertBoundedMcpPayload, getDataHubMcpConfigurationStatus, hasExplicitDataHubWritebackTool, normalizeDataHubMcpStartupError, parseDataHubDecisionRequest, resolveDataHubMcpCommand, resolveEvidenceTtlMs, resolveLineageArguments, resolveReadableToolNames, saveDataHubMcpSettings, writeDataHubDecision } from './datahub-mcp.js'
import { closeWorkspaceDatabase } from './workspace-db.js'

let directory: string

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'data-lab-datahub-'))
  electronState.directory = directory
  electronState.encryptionAvailable = true
  electronState.availabilityChecks = 0
  electronState.decryptions = 0
  process.env.DATAHUB_MCP_URL = ''
  process.env.DATAHUB_MCP_TOKEN = ''
  process.env.DATAHUB_GMS_URL = ''
  process.env.DATAHUB_GMS_TOKEN = ''
})

afterEach(() => {
  closeWorkspaceDatabase()
  rmSync(directory, { force: true, recursive: true })
})

describe('DataHub MCP connection settings', () => {
  it('reports startup status without probing or opening operating-system secure storage', () => {
    const status = getDataHubMcpConfigurationStatus()
    expect(status.settings.tokenSource).toBe('none')
    expect(electronState.availabilityChecks).toBe(0)
    expect(electronState.decryptions).toBe(0)
  })

  it('finds uvx in the macOS user install directory even when the app PATH is minimal', () => {
    const expected = '/Users/data-lab/.local/bin/uvx'
    expect(resolveDataHubMcpCommand({ PATH: '/usr/bin:/bin' }, 'darwin', '/Users/data-lab', (candidate) => candidate === expected)).toBe(expected)
    expect(resolveDataHubMcpCommand({ DATAHUB_MCP_COMMAND: '/custom/bin/datahub-mcp' }, 'darwin', '/Users/data-lab', () => false)).toBe('/custom/bin/datahub-mcp')
  })

  it('uses Windows path rules when resolving uvx for a Windows desktop build', () => {
    const expected = 'C:\\Users\\data-lab\\.local\\bin\\uvx.exe'
    expect(resolveDataHubMcpCommand({ PATH: 'C:\\Windows;C:\\Tools' }, 'win32', 'C:\\Users\\data-lab', (candidate) => candidate === expected)).toBe(expected)
  })

  it('turns a missing uvx spawn failure into an actionable desktop message', () => {
    const error = Object.assign(new Error('spawn uvx ENOENT'), { code: 'ENOENT' })
    expect(normalizeDataHubMcpStartupError(error, 'uvx').message).toContain('Install uv, restart DATA LAB')
  })

  it('rejects oversized or non-serializable MCP responses before parsing or caching them', () => {
    expect(() => assertBoundedMcpPayload({ content: 'x'.repeat(1_001) }, 'test response', 1_000)).toThrow('safety limit')
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(() => assertBoundedMcpPayload(circular)).toThrow('not valid serializable data')
  })

  it('normalizes the exact write-back payload before any confirmation or MCP mutation', () => {
    expect(parseDataHubDecisionRequest({ revisionId: ' revision-1 ', title: ' Decision ', rationale: ' Because ', author: ' Operator ', relatedAssets: ['urn:li:dataset:test', 'https://malicious.test'] })).toEqual({
      revisionId: 'revision-1', title: 'Decision', rationale: 'Because', author: 'Operator', relatedAssets: ['urn:li:dataset:test'],
    })
  })
  it('falls back only to the bounded read-only allowlist when tool discovery is slow', async () => {
    const names = await resolveReadableToolNames(async () => { throw new Error('tool discovery timed out') })
    expect([...names].sort()).toEqual(['get_entities', 'get_lineage', 'list_schema_fields', 'search'])
    expect(names.has('save_document')).toBe(false)
  })

  it('advertises write-back only for an explicit non-read-only save_document tool', () => {
    expect(hasExplicitDataHubWritebackTool(undefined)).toBe(false)
    expect(hasExplicitDataHubWritebackTool({ tools: [{ name: 'save_document' }] } as never)).toBe(false)
    expect(hasExplicitDataHubWritebackTool({ tools: [{ name: 'save_document', annotations: { readOnlyHint: true } }] } as never)).toBe(false)
    expect(hasExplicitDataHubWritebackTool({ tools: [{ name: 'save_document', annotations: { readOnlyHint: false } }] } as never)).toBe(true)
    expect(getDataHubMcpConfigurationStatus().writebackAvailable).toBe(false)
  })

  it('uses the discovered tool catalog when it is available', async () => {
    const names = await resolveReadableToolNames(async () => ({ tools: [{ name: 'search' }, { name: 'custom_read' }] }))
    expect([...names]).toEqual(['search', 'custom_read'])
  })

  it('uses the current official DataHub MCP lineage contract when advertised', () => {
    const urn = 'urn:li:dataset:(urn:li:dataPlatform:snowflake,customers,PROD)'
    expect(resolveLineageArguments({ properties: { urn: {}, upstream: {}, max_hops: {}, max_results: {} } }, urn, false)).toEqual({
      urn,
      upstream: false,
      max_hops: 3,
      max_results: 30,
    })
  })

  it('keeps compatibility with the earlier direction-based lineage contract', () => {
    const urn = 'urn:li:dataset:(urn:li:dataPlatform:snowflake,customers,PROD)'
    expect(resolveLineageArguments({ properties: { urn: {}, direction: {}, max_hops: {}, count: {} } }, urn, true)).toEqual({
      urn,
      direction: 'upstream',
      max_hops: 3,
      count: 30,
    })
  })

  it('supports bounded per-evidence cache TTL configuration', () => {
    expect(resolveEvidenceTtlMs({
      DATAHUB_CACHE_ENTITY_TTL_MS: '10000',
      DATAHUB_CACHE_SCHEMA_TTL_MS: '2500',
      DATAHUB_CACHE_LINEAGE_TTL_MS: '99999999',
    })).toEqual({ get_entities: 10_000, list_schema_fields: 5_000, get_lineage: 3_600_000 })
  })

  it('persists endpoint metadata and an encrypted token without exposing the credential', async () => {
    await saveDataHubMcpSettings({ transport: 'stdio', url: 'http://localhost:8080/', token: 'datahub-private-token' })

    electronState.availabilityChecks = 0
    const status = getDataHubMcpConfigurationStatus()
    expect(status).toMatchObject({
      mode: 'demo',
      transport: 'stdio',
      settings: { transport: 'stdio', url: 'http://localhost:8080', tokenConfigured: true, tokenSource: 'encrypted' },
    })
    expect(JSON.stringify(status)).not.toContain('datahub-private-token')
    expect(electronState.availabilityChecks).toBe(0)
    expect(electronState.decryptions).toBe(0)
    expect(readFileSync(join(directory, 'data-lab.sqlite')).toString('utf8')).not.toContain('datahub-private-token')
  })

  it('keeps governed write-back disabled by default and persists explicit opt-in', async () => {
    await saveDataHubMcpSettings({ transport: 'stdio', url: 'http://localhost:8080' })
    expect(getDataHubMcpConfigurationStatus().settings.writebackEnabled).toBe(false)
    await saveDataHubMcpSettings({ transport: 'stdio', url: 'http://localhost:8080', writebackEnabled: true })
    expect(getDataHubMcpConfigurationStatus().settings.writebackEnabled).toBe(true)
  })

  it('rejects write-back before contacting MCP unless a human enabled it in Settings', async () => {
    await saveDataHubMcpSettings({ transport: 'stdio', url: 'http://localhost:8080' })
    await expect(writeDataHubDecision({
      revisionId: 'revision-1',
      title: 'Approved schema correction',
      rationale: 'The reviewed schema contract requires the corrected field.',
      author: 'DATA LAB operator',
      relatedAssets: ['urn:li:dataset:(urn:li:dataPlatform:snowflake,customers,PROD)'],
    })).rejects.toThrow('write-back is disabled')
  })

  it('rotates and clears the saved token independently from the endpoint', async () => {
    await saveDataHubMcpSettings({ transport: 'http', url: 'https://mcp.example.com/mcp', token: 'first-token' })
    await saveDataHubMcpSettings({ transport: 'http', url: 'https://mcp.example.com/mcp', token: 'second-token' })
    expect(getDataHubMcpConfigurationStatus().settings.tokenConfigured).toBe(true)

    await saveDataHubMcpSettings({ transport: 'http', url: 'https://mcp.example.com/mcp', clearToken: true })
    expect(getDataHubMcpConfigurationStatus()).toMatchObject({ settings: { url: 'https://mcp.example.com/mcp', tokenConfigured: false, tokenSource: 'none' } })
  })

  it('refuses plaintext token persistence when OS encryption is unavailable', async () => {
    electronState.encryptionAvailable = false
    await expect(saveDataHubMcpSettings({ transport: 'stdio', url: 'http://localhost:8080', token: 'unsafe-token' })).rejects.toThrow('Secure credential storage is unavailable')
  })

  it('allows an unauthenticated local OSS quickstart while keeping hosted credentials optional', async () => {
    await saveDataHubMcpSettings({ transport: 'stdio', url: 'http://localhost:8080' })
    expect(getDataHubMcpConfigurationStatus()).toMatchObject({
      transport: 'stdio',
      settings: { tokenConfigured: false, tokenSource: 'none' },
      message: 'Local DataHub OSS MCP is ready without token authentication',
    })
  })
})
