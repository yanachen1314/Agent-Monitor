import { createHash } from 'node:crypto'
import type {
  AppConfig,
  IpcResponseCode,
  RecentActivity,
  TurnStoppedEvent
} from '../../shared/types'

export interface ProcessResult {
  code: IpcResponseCode
  shouldPlay: boolean
}

export class EventProcessor {
  private readonly dedupe = new Map<string, number>()
  private readonly activities: RecentActivity[] = []
  private lastEvent: TurnStoppedEvent | null = null
  private lastDispatchAt = 0

  process(event: TurnStoppedEvent, config: AppConfig): ProcessResult {
    this.cleanup()
    this.lastEvent = event

    if (config.globalPaused) {
      this.addActivity(event, 'suppressed')
      return { code: 'GLOBAL_PAUSED', shouldPlay: false }
    }
    if (!config.monitors[event.source].enabled) {
      this.addActivity(event, 'suppressed')
      return { code: 'MONITOR_DISABLED', shouldPlay: false }
    }

    const key = this.createKey(event)
    if (this.dedupe.has(key)) {
      return { code: 'DUPLICATE_IGNORED', shouldPlay: false }
    }
    this.dedupe.set(key, Date.now())

    const now = Date.now()
    const shouldPlay = now - this.lastDispatchAt >= 1_000
    if (shouldPlay) this.lastDispatchAt = now
    this.addActivity(event, shouldPlay ? 'reminded' : 'suppressed')
    return { code: 'ACCEPTED', shouldPlay }
  }

  markLatestFailed(): void {
    const latest = this.activities[0]
    if (latest) latest.result = 'failed'
  }

  getLastEvent(): TurnStoppedEvent | null {
    return this.lastEvent ? structuredClone(this.lastEvent) : null
  }

  getActivities(): RecentActivity[] {
    return structuredClone(this.activities)
  }

  private createKey(event: TurnStoppedEvent): string {
    const timeBucket = Math.floor(event.timestamp / 3_000)
    const raw = event.turnId
      ? `${event.source}:${event.sessionId ?? 'unknown'}:${event.turnId}:${event.eventType}`
      : `${event.source}:${event.sessionId ?? 'unknown'}:${timeBucket}:${event.eventType}`
    return createHash('sha256').update(raw).digest('hex')
  }

  private addActivity(event: TurnStoppedEvent, result: RecentActivity['result']): void {
    this.activities.unshift({
      id: `${event.source}-${event.timestamp}-${event.turnId ?? 'unknown'}`,
      source: event.source,
      stoppedAt: event.timestamp,
      cwd: event.cwd,
      result
    })
    this.activities.splice(20)
  }

  private cleanup(): void {
    const cutoff = Date.now() - 5 * 60_000
    for (const [key, timestamp] of this.dedupe) {
      if (timestamp < cutoff) this.dedupe.delete(key)
    }
    if (this.dedupe.size <= 1_000) return
    const sorted = [...this.dedupe.entries()].sort((a, b) => a[1] - b[1])
    for (const [key] of sorted.slice(0, this.dedupe.size - 1_000)) {
      this.dedupe.delete(key)
    }
  }
}
