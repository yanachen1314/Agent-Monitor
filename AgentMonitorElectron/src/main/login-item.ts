import type { AutoStartState } from '../shared/types'

export interface LoginItemApp {
  getLoginItemSettings(options?: Electron.LoginItemSettingsOptions): Electron.LoginItemSettings
  setLoginItemSettings(settings: Electron.Settings): void
}

function optionsFor(platform: NodeJS.Platform): Electron.LoginItemSettingsOptions | undefined {
  if (platform === 'darwin') return { type: 'mainAppService' }
  if (platform === 'win32') return { args: ['--hidden'] }
  return undefined
}

function settingsFor(platform: NodeJS.Platform, enabled: boolean): Electron.Settings | null {
  if (platform === 'darwin') return { openAtLogin: enabled, type: 'mainAppService' }
  if (platform === 'win32') return { openAtLogin: enabled, args: ['--hidden'] }
  return null
}

export function getAutoStartState(app: LoginItemApp, platform: NodeJS.Platform): AutoStartState {
  if (platform !== 'darwin' && platform !== 'win32') return { status: 'unsupported' }
  const current = app.getLoginItemSettings(optionsFor(platform))
  if (platform === 'darwin' && current.status === 'requires-approval') {
    return { status: 'requires-approval' }
  }
  return { status: current.openAtLogin ? 'enabled' : 'disabled' }
}

export function syncLoginItem(
  app: LoginItemApp,
  platform: NodeJS.Platform,
  desired: boolean
): AutoStartState {
  const current = getAutoStartState(app, platform)
  if (current.status === 'unsupported') return current
  if (desired && (current.status === 'enabled' || current.status === 'requires-approval')) {
    return current
  }
  if (!desired && current.status === 'disabled') return current

  const settings = settingsFor(platform, desired)
  if (!settings) return { status: 'unsupported' }
  app.setLoginItemSettings(settings)
  return getAutoStartState(app, platform)
}

export function shouldStartHidden(
  app: LoginItemApp,
  platform: NodeJS.Platform,
  argv: string[]
): boolean {
  if (argv.includes('--hidden')) return true
  if (platform !== 'darwin') return false
  return app.getLoginItemSettings(optionsFor(platform)).wasOpenedAtLogin
}
