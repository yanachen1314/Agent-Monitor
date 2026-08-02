import { randomUUID } from 'node:crypto'
import type { AudioPlayCommand, AudioPlayResult, ResolvedAudio } from '../../shared/types'
import type { AppLogger, LogContext } from '../logging/logger'
import { serializeError, summarizePath } from '../logging/logger'

export interface AudioQueueContext {
  traceId?: string
  source?: 'claude' | 'codex'
  kind?: 'notification' | 'preview'
}

interface QueueItem {
  command: AudioPlayCommand
  context: AudioQueueContext
  queuedAt: number
  dispatchedAt: number | null
  resolve: () => void
  reject: (error: Error) => void
}

export class AudioQueue {
  private readonly queue: QueueItem[] = []
  private active: QueueItem | null = null
  private timeout: NodeJS.Timeout | null = null
  private readonly maxQueueSize = 8

  constructor(
    private readonly dispatch: (command: AudioPlayCommand) => Promise<void> | void,
    private readonly logger?: AppLogger
  ) {}

  enqueue(audio: ResolvedAudio, context: AudioQueueContext = {}): Promise<void> {
    if (this.queue.length >= this.maxQueueSize) {
      this.logger?.warn('audio', 'audio_queue_full', '音频播放队列已满', {
        ...context,
        queueLength: this.queue.length,
        maxQueueSize: this.maxQueueSize
      })
      return Promise.reject(new Error('AUDIO_QUEUE_FULL'))
    }

    return new Promise((resolve, reject) => {
      const requestId = randomUUID()
      this.queue.push({
        command: { ...audio, requestId },
        context,
        queuedAt: Date.now(),
        dispatchedAt: null,
        resolve,
        reject
      })
      this.logger?.debug('audio', 'audio_enqueued', '音频已加入播放队列', {
        ...context,
        requestId,
        queueLength: this.queue.length,
        fileName: summarizePath(audio.path),
        volume: audio.volume,
        fallbackUsed: audio.fallbackUsed
      })
      this.playNext()
    })
  }

  handleResult(result: AudioPlayResult): void {
    if (!this.active || this.active.command.requestId !== result.requestId) {
      this.logger?.debug('audio', 'audio_result_ignored', '忽略无法匹配当前播放项的结果', {
        requestId: result.requestId,
        status: result.status
      })
      return
    }
    if (result.status === 'started') {
      this.logger?.info('audio', 'audio_play_started', 'Renderer 已开始播放音频', {
        ...this.logContext(this.active),
        dispatchDurationMs: this.active.dispatchedAt
          ? Date.now() - this.active.dispatchedAt
          : undefined
      })
      return
    }

    if (this.timeout) clearTimeout(this.timeout)
    const completed = this.active
    this.active = null
    if (result.status === 'ended') {
      this.logger?.info('audio', 'audio_play_ended', '音频播放完成', {
        ...this.logContext(completed),
        durationMs: Date.now() - completed.queuedAt
      })
      completed.resolve()
    } else {
      this.logger?.error('audio', 'audio_play_failed', 'Renderer 报告音频播放失败', {
        ...this.logContext(completed),
        durationMs: Date.now() - completed.queuedAt,
        error: { name: 'AudioPlaybackError', message: result.message ?? 'AUDIO_PLAY_FAILED' }
      })
      completed.reject(new Error(result.message ?? 'AUDIO_PLAY_FAILED'))
    }
    this.playNext()
  }

  shutdown(): void {
    if (this.timeout) clearTimeout(this.timeout)
    this.active?.reject(new Error('AUDIO_QUEUE_SHUTDOWN'))
    this.active = null
    for (const item of this.queue.splice(0)) {
      item.reject(new Error('AUDIO_QUEUE_SHUTDOWN'))
    }
    this.logger?.info('audio', 'audio_queue_shutdown', '音频播放队列已关闭')
  }

  private playNext(): void {
    if (this.active || this.queue.length === 0) return
    this.active = this.queue.shift() ?? null
    if (!this.active) return
    const dispatched = this.active
    dispatched.dispatchedAt = Date.now()
    this.logger?.debug('audio', 'audio_dispatch_started', '开始向 Renderer 派发音频', {
      ...this.logContext(dispatched),
      queueWaitMs: dispatched.dispatchedAt - dispatched.queuedAt,
      queueLength: this.queue.length
    })
    void Promise.resolve()
      .then(() => this.dispatch(dispatched.command))
      .then(() => {
        if (this.active !== dispatched) return
        this.timeout = setTimeout(() => {
          if (this.active !== dispatched) return
          this.active = null
          this.logger?.error('audio', 'audio_play_timeout', '音频播放等待结果超时', {
            ...this.logContext(dispatched),
            timeoutMs: 10_000
          })
          dispatched.reject(new Error('AUDIO_PLAY_TIMEOUT'))
          this.playNext()
        }, 10_000)
      })
      .catch((error: unknown) => {
        if (this.active !== dispatched) return
        this.active = null
        this.logger?.error('audio', 'audio_dispatch_failed', '音频派发失败', {
          ...this.logContext(dispatched),
          error: serializeError(error)
        })
        dispatched.reject(error instanceof Error ? error : new Error('AUDIO_DISPATCH_FAILED'))
        this.playNext()
      })
  }

  private logContext(item: QueueItem): LogContext {
    return {
      ...item.context,
      requestId: item.command.requestId,
      fileName: summarizePath(item.command.path),
      fallbackUsed: item.command.fallbackUsed
    }
  }
}
