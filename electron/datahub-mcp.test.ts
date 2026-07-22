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

import { getDataHubMcpConfigurationStatus, saveDataHubMcpSettings } from './datahub-mcp.js'
import { closeWorkspaceDatabase } from './workspace-db.js'

let directory: string

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'data-lab-datahub-'))
  electronState.directory = directory
  electronState.encryptionAvailable = true
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
  it('persists endpoint metadata and an encrypted token without exposing the credential', async () => {
    await saveDataHubMcpSettings({ transport: 'stdio', url: 'http://localhost:8080/', token: 'datahub-private-token' })

    const status = getDataHubMcpConfigurationStatus()
    expect(status).toMatchObject({
      mode: 'demo',
      transport: 'stdio',
      settings: { transport: 'stdio', url: 'http://localhost:8080', tokenConfigured: true, tokenSource: 'encrypted' },
    })
    expect(JSON.stringify(status)).not.toContain('datahub-private-token')
    expect(readFileSync(join(directory, 'data-lab.sqlite')).toString('utf8')).not.toContain('datahub-private-token')
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
})
