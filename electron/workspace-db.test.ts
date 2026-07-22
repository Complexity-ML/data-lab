import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeWorkspaceDatabase, loadAppSetting, loadSavedWorkspace, saveAppSetting, saveWorkspace } from './workspace-db.js'

let testDirectory: string | undefined

afterEach(() => {
  closeWorkspaceDatabase()
  if (testDirectory) rmSync(testDirectory, { force: true, recursive: true })
  testDirectory = undefined
})

describe('SQLite workspace persistence', () => {
  it('restores the active graph and review lifecycle after restart', () => {
    testDirectory = mkdtempSync(join(tmpdir(), 'data-lab-workspace-'))
    const payload = {
      projectTitle: 'Customer activation',
      nodes: [{ id: 'active-source' }],
      edges: [],
      versions: [
        { id: 'v-committed', status: 'committed' },
        { id: 'v-review', status: 'pending-review', description: 'Upgrade: mask email' },
        { id: 'v-rejected', status: 'rejected' },
      ],
    }

    expect(loadSavedWorkspace(testDirectory)).toBeNull()
    expect(saveWorkspace(testDirectory, payload)).toEqual({ saved: true })
    closeWorkspaceDatabase()
    expect(loadSavedWorkspace(testDirectory)).toEqual(payload)
  })

  it('persists application settings independently from the active workspace', () => {
    testDirectory = mkdtempSync(join(tmpdir(), 'data-lab-settings-'))
    saveAppSetting(testDirectory, 'active-ai-provider', 'anthropic')
    saveWorkspace(testDirectory, { projectTitle: 'Independent graph' })
    closeWorkspaceDatabase()

    expect(loadAppSetting(testDirectory, 'active-ai-provider')).toBe('anthropic')
    expect(loadSavedWorkspace(testDirectory)).toEqual({ projectTitle: 'Independent graph' })
  })
})
