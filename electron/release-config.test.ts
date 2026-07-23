import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
  dependencies: Record<string, string>
  build: {
    forceCodeSigning?: boolean
    generateUpdatesFilesForAllChannels?: boolean
    mac: { identity?: string; hardenedRuntime?: boolean; notarize?: boolean; icon?: string; target?: Array<{ target: string; arch: string[] }> }
    publish?: Array<{ provider?: string; owner?: string; repo?: string }>
  }
}

describe('macOS release configuration', () => {
  it('fails closed in production and builds both signed updater formats for both architectures', () => {
    expect(packageJson.dependencies['electron-updater']).toBeTruthy()
    expect(packageJson.build.forceCodeSigning).toBe(true)
    expect(packageJson.build.generateUpdatesFilesForAllChannels).toBe(true)
    expect(packageJson.build.mac.identity).toBeUndefined()
    expect(packageJson.build.mac.hardenedRuntime).toBe(true)
    expect(packageJson.build.mac.notarize).toBe(true)
    expect(packageJson.build.mac.icon).toBe('build/icon-1024.png')
    expect(packageJson.build.mac.target).toEqual([
      { target: 'dmg', arch: ['x64', 'arm64'] },
      { target: 'zip', arch: ['x64', 'arm64'] },
    ])
    expect(packageJson.build.publish).toEqual(expect.arrayContaining([expect.objectContaining({ provider: 'github', owner: 'Complexity-ML', repo: 'data-lab' })]))
  })

  it('keeps the ad-hoc escape hatch limited to the local directory package', () => {
    expect(packageJson.scripts['package:mac:dir']).toContain('-c.forceCodeSigning=false')
    expect(packageJson.scripts['package:mac:dir']).toContain('-c.mac.notarize=false')
    expect(packageJson.scripts['package:mac:release']).not.toContain('forceCodeSigning=false')
  })

  it('requires immutable stable tags, Apple secrets and native verification in CI', () => {
    const workflow = readFileSync(join(root, '.github/workflows/macos-release.yml'), 'utf8')
    expect(workflow).toContain("tags: ['v*']")
    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).not.toContain('branches: [main]')
    expect(workflow).toContain('MACOS_CERTIFICATE_P12')
    expect(workflow).toContain('APPLE_API_KEY_P8')
    expect(workflow).toContain('codesign --verify --deep --strict')
    expect(workflow).toContain('spctl --assess --type execute')
    expect(workflow).toContain('stapler validate')
  })
})
