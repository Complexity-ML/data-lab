import type { BrowserWindow } from 'electron'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { autoUpdater, type ProgressInfo, type UpdateDownloadedEvent, type UpdateInfo } from 'electron-updater'
import { isDeveloperIdApplicationSignature, macApplicationBundle, updaterFeedChannel, withUpdateCapabilities, type AppUpdateChannel, type AppUpdateStatus } from './update-policy.js'

const execFileAsync = promisify(execFile)

async function verifyCurrentDeveloperIdSignature(execPath: string) {
  const bundle = macApplicationBundle(execPath)
  if (!bundle) return false
  try {
    await execFileAsync('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', bundle])
    const details = await execFileAsync('/usr/bin/codesign', ['--display', '--verbose=4', bundle])
    return isDeveloperIdApplicationSignature(`${details.stdout}\n${details.stderr}`)
  } catch {
    return false
  }
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/(?:token|authorization|password|secret)=?[^\s]*/gi, '[redacted]').slice(0, 500)
}

export class AppUpdateController {
  private status: AppUpdateStatus
  private readonly publish: (status: AppUpdateStatus) => void

  constructor(private readonly options: {
    channel: AppUpdateChannel
    currentVersion: string
    execPath: string
    isPackaged: boolean
    platform: NodeJS.Platform
    window: () => BrowserWindow | undefined
    statusChannel: string
  }) {
    this.status = withUpdateCapabilities({
      currentVersion: options.currentVersion,
      channel: options.channel,
      phase: 'unavailable',
      currentSignatureVerified: false,
      downloadedSignatureEnforced: false,
      message: 'Updates are available only in a signed DATA LAB macOS application.',
    })
    this.publish = (status) => {
      this.status = status
      const window = this.options.window()
      if (window && !window.isDestroyed()) window.webContents.send(this.options.statusChannel, status)
    }
    this.bindEvents()
  }

  private bindEvents() {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.allowDowngrade = false
    autoUpdater.on('checking-for-update', () => this.transition('checking', 'Checking the signed update feed…'))
    autoUpdater.on('update-available', (info: UpdateInfo) => this.transition('available', `DATA LAB ${info.version} is available. Download requires your approval.`, { availableVersion: info.version }))
    autoUpdater.on('update-not-available', (info: UpdateInfo) => this.transition('ready', `DATA LAB ${this.options.currentVersion} is current on the ${this.status.channel} channel.`, { availableVersion: info.version }))
    autoUpdater.on('download-progress', (progress: ProgressInfo) => this.transition('downloading', `Downloading ${this.status.availableVersion ?? 'the signed update'}…`, { progress: Math.max(0, Math.min(100, progress.percent)) }))
    autoUpdater.on('update-downloaded', (event: UpdateDownloadedEvent) => this.transition('downloaded', `DATA LAB ${event.version} is downloaded. macOS will enforce its code signature during installation.`, { availableVersion: event.version, progress: 100 }))
    autoUpdater.on('error', (error) => this.transition('error', 'The update was stopped safely.', { error: safeError(error) }))
  }

  private transition(phase: AppUpdateStatus['phase'], message: string, patch: Partial<AppUpdateStatus> = {}) {
    this.publish(withUpdateCapabilities({ ...this.status, ...patch, phase, message, error: patch.error }))
  }

  async initialize() {
    autoUpdater.channel = updaterFeedChannel(this.options.channel)
    autoUpdater.allowPrerelease = this.options.channel === 'main'
    if (this.options.platform !== 'darwin' || !this.options.isPackaged) return this.getStatus()
    const verified = await verifyCurrentDeveloperIdSignature(this.options.execPath)
    if (!verified) {
      this.publish(withUpdateCapabilities({ ...this.status, phase: 'blocked', currentSignatureVerified: false, downloadedSignatureEnforced: true, message: 'Updates are blocked because this DATA LAB build is not signed with Apple Developer ID.' }))
      return this.getStatus()
    }
    this.publish(withUpdateCapabilities({ ...this.status, phase: 'ready', currentSignatureVerified: true, downloadedSignatureEnforced: true, message: `Ready to check the ${this.options.channel} signed update channel.` }))
    return this.getStatus()
  }

  getStatus() { return { ...this.status } }

  setChannel(channel: AppUpdateChannel) {
    autoUpdater.channel = updaterFeedChannel(channel)
    autoUpdater.allowPrerelease = channel === 'main'
    this.publish(withUpdateCapabilities({ ...this.status, channel, phase: this.status.currentSignatureVerified ? 'ready' : this.status.phase, availableVersion: undefined, progress: undefined, error: undefined, message: this.status.currentSignatureVerified ? `Ready to check the ${channel} signed update channel.` : this.status.message }))
    return this.getStatus()
  }

  async check() {
    if (!this.status.canCheck) throw new Error(this.status.message)
    await autoUpdater.checkForUpdates()
    return this.getStatus()
  }

  async download() {
    if (!this.status.canDownload) throw new Error('No approved signed update is ready to download')
    await autoUpdater.downloadUpdate()
    return this.getStatus()
  }

  install() {
    if (!this.status.canInstall) throw new Error('Installation is blocked until a signed update has been downloaded')
    autoUpdater.quitAndInstall(false, true)
    return this.getStatus()
  }
}
