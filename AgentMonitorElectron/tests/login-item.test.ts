import { describe, expect, it } from 'vitest'
import { shouldStartHidden, syncLoginItem, type LoginItemApp } from '../src/main/login-item'

function createLoginItemApp(initial: {
  openAtLogin: boolean
  status: 'not-registered' | 'enabled' | 'requires-approval' | 'not-found'
  wasOpenedAtLogin?: boolean
}): LoginItemApp & {
  reads: Array<Electron.LoginItemSettingsOptions | undefined>
  writes: Electron.Settings[]
} {
  let current = { ...initial, wasOpenedAtLogin: initial.wasOpenedAtLogin ?? false }
  const reads: Array<Electron.LoginItemSettingsOptions | undefined> = []
  const writes: Electron.Settings[] = []
  return {
    reads,
    writes,
    getLoginItemSettings: (options) => {
      reads.push(options)
      return {
        ...current,
        openAsHidden: false,
        wasOpenedAsHidden: false,
        restoreState: false,
        executableWillLaunchAtLogin: current.openAtLogin,
        launchItems: []
      }
    },
    setLoginItemSettings: (settings) => {
      writes.push(settings)
      current = {
        ...current,
        openAtLogin: settings.openAtLogin ?? false,
        status: settings.openAtLogin ? 'enabled' : 'not-registered'
      }
    }
  }
}

describe('login item platform adapter', () => {
  it('Windows 开启登录启动时携带隐藏参数', () => {
    const app = createLoginItemApp({ openAtLogin: false, status: 'not-registered' })

    expect(syncLoginItem(app, 'win32', true)).toEqual({ status: 'enabled' })
    expect(app.reads).toEqual([{ args: ['--hidden'] }, { args: ['--hidden'] }])
    expect(app.writes).toEqual([{ openAtLogin: true, args: ['--hidden'] }])
  })

  it('macOS 使用 mainAppService 且不传 Windows 参数', () => {
    const app = createLoginItemApp({ openAtLogin: false, status: 'not-registered' })

    expect(syncLoginItem(app, 'darwin', true)).toEqual({ status: 'enabled' })
    expect(app.reads).toEqual([{ type: 'mainAppService' }, { type: 'mainAppService' }])
    expect(app.writes).toEqual([{ openAtLogin: true, type: 'mainAppService' }])
  })

  it('当前系统状态已经符合配置意图时不重复写入', () => {
    const windowsApp = createLoginItemApp({ openAtLogin: true, status: 'enabled' })
    const macApp = createLoginItemApp({ openAtLogin: true, status: 'enabled' })

    syncLoginItem(windowsApp, 'win32', true)
    syncLoginItem(macApp, 'darwin', true)

    expect(windowsApp.writes).toEqual([])
    expect(macApp.writes).toEqual([])
  })

  it('macOS 等待用户批准时保留开启意图且不重复注册', () => {
    const app = createLoginItemApp({ openAtLogin: false, status: 'requires-approval' })

    expect(syncLoginItem(app, 'darwin', true)).toEqual({ status: 'requires-approval' })
    expect(app.writes).toEqual([])
  })

  it('macOS 由登录项启动时隐藏首个窗口', () => {
    const app = createLoginItemApp({
      openAtLogin: true,
      status: 'enabled',
      wasOpenedAtLogin: true
    })

    expect(shouldStartHidden(app, 'darwin', [])).toBe(true)
    expect(shouldStartHidden(app, 'win32', ['AgentMonitor.exe', '--hidden'])).toBe(true)
    expect(shouldStartHidden(app, 'darwin', [])).toBe(true)
  })
})
