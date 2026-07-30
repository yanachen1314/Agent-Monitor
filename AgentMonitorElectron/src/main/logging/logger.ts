import log from 'electron-log/main'
import type { AppPaths } from '../paths'

export function initializeLogger(paths: AppPaths): typeof log {
  log.initialize()
  log.transports.file.resolvePathFn = () => `${paths.logDir}/agent-monitor.log`
  log.transports.file.maxSize = 2 * 1024 * 1024
  log.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : 'info'
  log.transports.file.level = 'info'
  return log
}
