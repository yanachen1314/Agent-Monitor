import { createHash, randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import { app } from 'electron'
import log from 'electron-log/main'
import type { LogLevel } from '../../shared/types'
import type { AppPaths } from '../paths'

export type LogContext = Record<string, unknown>

export interface AppLogger {
  debug(component: string, event: string, message: string, context?: LogContext): void
  info(component: string, event: string, message: string, context?: LogContext): void
  warn(component: string, event: string, message: string, context?: LogContext): void
  error(component: string, event: string, message: string, context?: LogContext): void
  setLevel(level: LogLevel): void
}

const REDACTED = '[REDACTED]'
const sensitiveKeyPattern = /token|password|secret|authorization|cookie/i

export function initializeLogger(paths: AppPaths, initialLevel: LogLevel = 'info'): AppLogger {
  log.initialize()
  log.transports.file.resolvePathFn = () => `${paths.logDir}/agent-monitor.log`
  log.transports.file.maxSize = 100 * 1024 * 1024
  log.transports.file.level = initialLevel
  log.transports.file.format = ({ data }) => data
  log.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : 'info'

  const write = (
    level: LogLevel,
    component: string,
    event: string,
    message: string,
    context: LogContext = {}
  ): void => {
    const record = {
      timestamp: formatLogTimestamp(),
      level,
      component,
      event,
      message,
      pid: process.pid,
      appVersion: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      ...(sanitizeLogValue(context) as LogContext)
    }
    log[level](JSON.stringify(record))
  }

  return {
    debug: (component, event, message, context) =>
      write('debug', component, event, message, context),
    info: (component, event, message, context) => write('info', component, event, message, context),
    warn: (component, event, message, context) => write('warn', component, event, message, context),
    error: (component, event, message, context) =>
      write('error', component, event, message, context),
    setLevel: (level) => {
      log.transports.file.level = level
    }
  }
}

export function createTraceId(): string {
  return `evt-${randomUUID()}`
}

export function formatLogTimestamp(date = new Date()): string {
  const pad = (value: number, length = 2): string => String(value).padStart(length, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}

export function hashIdentifier(value: string | null | undefined): string | null {
  if (!value) return null
  return createHash('sha256').update(value).digest('hex').slice(0, 12)
}

export function summarizePath(value: string | null | undefined): string | null {
  if (!value) return null
  return basename(value.replaceAll('\\', '/')) || null
}

export function serializeError(error: unknown): LogContext {
  if (!(error instanceof Error)) {
    return { name: 'UnknownError', message: String(error) }
  }

  const nodeError = error as NodeJS.ErrnoException
  return {
    name: error.name,
    message: error.message,
    ...(nodeError.code ? { code: nodeError.code } : {}),
    ...(error.stack ? { stack: error.stack } : {}),
    ...(error.cause ? { cause: serializeError(error.cause) } : {})
  }
}

function sanitizeLogValue(value: unknown, key = '', seen = new WeakSet<object>()): unknown {
  if (sensitiveKeyPattern.test(key)) return REDACTED
  if (value === null || value === undefined) return value
  if (value instanceof Error) return serializeError(value)
  if (typeof value === 'bigint') return value.toString()
  if (typeof value !== 'object') return value
  if (seen.has(value)) return '[Circular]'
  seen.add(value)

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogValue(item, key, seen))
  }

  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      sanitizeLogValue(entryValue, entryKey, seen)
    ])
  )
}
