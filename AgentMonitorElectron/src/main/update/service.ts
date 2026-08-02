import { app } from 'electron'
import electronUpdater, { type AppUpdater, type UpdateInfo } from 'electron-updater'
import type { UpdateState } from '../../shared/types'
import type { AppLogger } from '../logging/logger'

const STARTUP_CHECK_DELAY_MS = 30_000

export interface UpdateServiceOptions {
  logger: AppLogger
  emitState(state: UpdateState): void
  prepareInstall(): Promise<void>
  updater?: AppUpdater
  supported?: boolean
}

export class UpdateService {
  private readonly updater: AppUpdater
  private readonly supported: boolean
  private state: UpdateState
  private initialized = false

  constructor(private readonly options: UpdateServiceOptions) {
    this.updater = options.updater ?? electronUpdater.autoUpdater
    this.supported = options.supported ?? (app.isPackaged && process.platform === 'win32')
    this.state = {
      supported: this.supported,
      status: this.supported ? 'idle' : 'unsupported',
      currentVersion: app.getVersion(),
      latestVersion: null,
      releaseNotes: null,
      progress: null,
      error: null
    }
  }

  initialize(): void {
    if (this.initialized) return
    this.initialized = true
    if (!this.supported) {
      this.options.logger.info('update', 'update_disabled', '当前运行方式不支持自动更新', {
        packaged: app.isPackaged,
        platform: process.platform
      })
      return
    }

    this.updater.autoDownload = false
    this.updater.autoInstallOnAppQuit = false
    this.updater.allowPrerelease = false
    this.registerEvents()

    const timer = setTimeout(() => {
      void this.checkForUpdates().catch(() => undefined)
    }, STARTUP_CHECK_DELAY_MS)
    timer.unref()
  }

  getState(): UpdateState {
    return structuredClone(this.state)
  }

  async checkForUpdates(): Promise<UpdateState> {
    this.assertSupported()
    if (this.state.status === 'checking' || this.state.status === 'downloading') {
      return this.getState()
    }
    try {
      await this.updater.checkForUpdates()
      return this.getState()
    } catch (error) {
      this.handleError(error, '检查更新失败，请稍后重试')
      throw new Error('检查更新失败，请稍后重试', { cause: error })
    }
  }

  async downloadUpdate(): Promise<UpdateState> {
    this.assertSupported()
    if (this.state.status !== 'available') throw new Error('当前没有可下载的新版本')
    this.updateState({ status: 'downloading', progress: 0, error: null })
    try {
      await this.updater.downloadUpdate()
      return this.getState()
    } catch (error) {
      this.handleError(error, '更新下载失败，请稍后重试')
      throw new Error('更新下载失败，请稍后重试', { cause: error })
    }
  }

  async installUpdate(): Promise<void> {
    this.assertSupported()
    if (this.state.status !== 'downloaded') throw new Error('更新尚未下载完成')
    this.updateState({ status: 'installing', error: null })
    this.options.logger.info('update', 'update_installing', '即将退出并安装更新', {
      version: this.state.latestVersion
    })
    await this.options.prepareInstall()
    this.updater.quitAndInstall(false, true)
  }

  private registerEvents(): void {
    this.updater.on('checking-for-update', () => {
      this.options.logger.info('update', 'update_checking', '正在检查更新')
      this.updateState({ status: 'checking', progress: null, error: null })
    })
    this.updater.on('update-available', (info) => {
      this.options.logger.info('update', 'update_available', '检测到新版本', {
        version: info.version
      })
      this.updateState({
        status: 'available',
        latestVersion: info.version,
        releaseNotes: normalizeUpdateReleaseNotes(info.releaseNotes),
        progress: null,
        error: null
      })
    })
    this.updater.on('update-not-available', (info) => {
      this.options.logger.info('update', 'update_not_available', '当前已是最新版本', {
        version: info.version
      })
      this.updateState({
        status: 'up-to-date',
        latestVersion: info.version,
        releaseNotes: null,
        progress: null,
        error: null
      })
    })
    this.updater.on('download-progress', (progress) => {
      this.updateState({
        status: 'downloading',
        progress: Math.min(100, Math.max(0, Math.round(progress.percent * 10) / 10)),
        error: null
      })
    })
    this.updater.on('update-downloaded', (info) => {
      this.options.logger.info('update', 'update_downloaded', '新版本下载完成', {
        version: info.version
      })
      this.updateState({
        status: 'downloaded',
        latestVersion: info.version,
        releaseNotes: normalizeUpdateReleaseNotes(info.releaseNotes),
        progress: 100,
        error: null
      })
    })
    this.updater.on('error', (error) => {
      this.handleError(error, '自动更新发生错误')
    })
  }

  private assertSupported(): void {
    if (!this.supported) throw new Error('自动更新仅支持打包后的 Windows 正式版本')
  }

  private handleError(error: unknown, message: string): void {
    this.options.logger.error('update', 'update_failed', message, { error })
    this.updateState({ status: 'error', progress: null, error: message })
  }

  private updateState(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch }
    this.options.emitState(this.getState())
  }
}

export function normalizeUpdateReleaseNotes(notes: UpdateInfo['releaseNotes']): string | null {
  if (typeof notes === 'string') return notes.trim() || null
  if (!Array.isArray(notes)) return null
  const content = notes
    .map((entry) => entry.note?.trim())
    .filter((entry): entry is string => Boolean(entry))
    .join('\n\n')
  return content || null
}
