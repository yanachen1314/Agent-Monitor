import { randomUUID } from 'node:crypto'
import type { AudioPlayCommand, AudioPlayResult, ResolvedAudio } from '../../shared/types'

interface QueueItem {
  command: AudioPlayCommand
  resolve: () => void
  reject: (error: Error) => void
}

export class AudioQueue {
  private readonly queue: QueueItem[] = []
  private active: QueueItem | null = null
  private timeout: NodeJS.Timeout | null = null
  private readonly maxQueueSize = 8

  constructor(private readonly dispatch: (command: AudioPlayCommand) => Promise<void> | void) {}

  enqueue(audio: ResolvedAudio): Promise<void> {
    if (this.queue.length >= this.maxQueueSize) {
      return Promise.reject(new Error('AUDIO_QUEUE_FULL'))
    }

    return new Promise((resolve, reject) => {
      this.queue.push({
        command: { ...audio, requestId: randomUUID() },
        resolve,
        reject
      })
      this.playNext()
    })
  }

  handleResult(result: AudioPlayResult): void {
    if (!this.active || this.active.command.requestId !== result.requestId) return
    if (result.status === 'started') return

    if (this.timeout) clearTimeout(this.timeout)
    const completed = this.active
    this.active = null
    if (result.status === 'ended') {
      completed.resolve()
    } else {
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
  }

  private playNext(): void {
    if (this.active || this.queue.length === 0) return
    this.active = this.queue.shift() ?? null
    if (!this.active) return
    const dispatched = this.active
    void Promise.resolve()
      .then(() => this.dispatch(dispatched.command))
      .then(() => {
        if (this.active !== dispatched) return
        this.timeout = setTimeout(() => {
          if (this.active !== dispatched) return
          this.active = null
          dispatched.reject(new Error('AUDIO_PLAY_TIMEOUT'))
          this.playNext()
        }, 10_000)
      })
      .catch((error: unknown) => {
        if (this.active !== dispatched) return
        this.active = null
        dispatched.reject(error instanceof Error ? error : new Error('AUDIO_DISPATCH_FAILED'))
        this.playNext()
      })
  }
}
