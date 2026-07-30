import { app } from 'electron'
import { join } from 'node:path'

export interface AppPaths {
  userData: string
  configFile: string
  runtimeFile: string
  audioDir: string
  backupDir: string
  logDir: string
  builtinAudio: string
}

export function createAppPaths(): AppPaths {
  const userData = app.getPath('userData')
  return {
    userData,
    configFile: join(userData, 'config.json'),
    runtimeFile: join(userData, 'runtime.json'),
    audioDir: join(userData, 'audio'),
    backupDir: join(userData, 'backups'),
    logDir: join(userData, 'logs'),
    builtinAudio: join(app.getAppPath(), 'resources', 'audio', 'complete.wav')
  }
}
