import { app } from 'electron'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

export interface AppPaths {
  userData: string
  configFile: string
  runtimeFile: string
  inboxDir: string
  audioDir: string
  backupDir: string
  logDir: string
  builtinAudio: string
}

export function createAppPaths(): AppPaths {
  const userData = app.getPath('userData')
  const ipcDir = process.platform === 'win32' ? join(tmpdir(), 'agent-monitor-ipc') : userData
  return {
    userData,
    configFile: join(userData, 'config.json'),
    runtimeFile: join(ipcDir, 'runtime.json'),
    inboxDir: join(ipcDir, 'inbox'),
    audioDir: join(userData, 'audio'),
    backupDir: join(userData, 'backups'),
    logDir: join(userData, 'logs'),
    builtinAudio: join(app.getAppPath(), 'resources', 'audio', 'complete.wav')
  }
}
