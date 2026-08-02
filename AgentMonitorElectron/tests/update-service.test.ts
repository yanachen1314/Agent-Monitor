import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppUpdater } from 'electron-updater'
import type { AppLogger } from '../src/main/logging/logger'

vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.3.2',
    isPackaged: true
  }
}))

vi.mock('electron-updater', () => ({
  default: { autoUpdater: {} }
}))

import { normalizeUpdateReleaseNotes, UpdateService } from '../src/main/update/service'

function createLogger(): AppLogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    setLevel: vi.fn()
  }
}

function createUpdater(): AppUpdater {
  const updater = new EventEmitter() as EventEmitter & Record<string, unknown>
  updater.autoDownload = true
  updater.autoInstallOnAppQuit = true
  updater.allowPrerelease = true
  updater.checkForUpdates = vi.fn(async () => {
    updater.emit('checking-for-update')
    updater.emit('update-available', {
      version: '0.3.3',
      releaseNotes: '修复自动更新'
    })
    return null
  })
  updater.downloadUpdate = vi.fn(async () => {
    updater.emit('download-progress', { percent: 42.34 })
    updater.emit('update-downloaded', {
      version: '0.3.3',
      releaseNotes: '修复自动更新'
    })
    return []
  })
  updater.quitAndInstall = vi.fn()
  return updater as unknown as AppUpdater
}

describe('UpdateService', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('checks, downloads and installs an available update', async () => {
    const updater = createUpdater()
    const emitted = vi.fn()
    const prepareInstall = vi.fn(async () => undefined)
    const service = new UpdateService({
      updater,
      supported: true,
      logger: createLogger(),
      emitState: emitted,
      prepareInstall
    })

    service.initialize()
    await expect(service.checkForUpdates()).resolves.toMatchObject({
      status: 'available',
      latestVersion: '0.3.3'
    })
    await expect(service.downloadUpdate()).resolves.toMatchObject({
      status: 'downloaded',
      progress: 100
    })
    await service.installUpdate()

    expect(prepareInstall).toHaveBeenCalledOnce()
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true)
    expect(emitted).toHaveBeenCalled()
  })

  it('rejects update operations when unsupported', async () => {
    const service = new UpdateService({
      updater: createUpdater(),
      supported: false,
      logger: createLogger(),
      emitState: vi.fn(),
      prepareInstall: vi.fn(async () => undefined)
    })

    service.initialize()
    expect(service.getState()).toMatchObject({ supported: false, status: 'unsupported' })
    await expect(service.checkForUpdates()).rejects.toThrow(
      '自动更新仅支持打包后的 Windows 正式版本'
    )
  })
})

describe('normalizeUpdateReleaseNotes', () => {
  it('normalizes string and structured release notes', () => {
    expect(normalizeUpdateReleaseNotes('  第一项  ')).toBe('第一项')
    expect(
      normalizeUpdateReleaseNotes([
        { version: '0.3.3', note: '修复一' },
        { version: '0.3.2', note: '修复二' }
      ])
    ).toBe('修复一\n\n修复二')
    expect(normalizeUpdateReleaseNotes(null)).toBeNull()
  })
})
