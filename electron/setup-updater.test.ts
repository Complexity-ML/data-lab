import { describe, expect, it } from 'vitest'
import { readSetupChannel, saveSetupChannel, setupHelperPath } from './setup-updater.js'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('source-first Setup updater', () => {
  it('resolves the helper installed beside the Electron user profile', () => {
    expect(setupHelperPath('/profile', 'darwin')).toBe('/profile/installer/data-lab-setup')
    expect(setupHelperPath('C:\\profile', 'win32')).toMatch(/installer[\\/]data-lab-setup\.exe$/)
  })

  it('shares the selected channel with Setup without accepting arbitrary values', () => {
    const directory = mkdtempSync(join(tmpdir(), 'data-lab-setup-channel-'))
    saveSetupChannel(directory, 'main')
    expect(readSetupChannel(directory)).toBe('main')
  })
})
