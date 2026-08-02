import { describe, expect, it, vi } from 'vitest'
import type { AudioPlayCommand } from '../src/shared/types'
import { AudioQueue } from '../src/main/audio/queue'
import type { AppLogger } from '../src/main/logging/logger'

const audio = { path: 'complete.wav', volume: 1, fallbackUsed: false }

describe('AudioQueue', () => {
  it('使用同一 requestId 记录完整播放状态', async () => {
    let command: AudioPlayCommand | undefined
    const logger: AppLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }
    const queue = new AudioQueue((nextCommand) => {
      command = nextCommand
    }, logger)

    const result = queue.enqueue(audio, {
      traceId: 'evt-test',
      source: 'codex',
      kind: 'notification'
    })
    await vi.waitFor(() => expect(command).toBeDefined())
    queue.handleResult({ requestId: command!.requestId, status: 'started' })
    queue.handleResult({ requestId: command!.requestId, status: 'ended' })
    await result

    expect(logger.debug).toHaveBeenCalledWith(
      'audio',
      'audio_enqueued',
      expect.any(String),
      expect.objectContaining({ traceId: 'evt-test', requestId: command!.requestId })
    )
    expect(logger.info).toHaveBeenCalledWith(
      'audio',
      'audio_play_ended',
      expect.any(String),
      expect.objectContaining({ traceId: 'evt-test', requestId: command!.requestId })
    )
  })

  it('等待异步派发就绪后才开始播放超时计时', async () => {
    vi.useFakeTimers()
    let releaseDispatch!: () => void
    const dispatch = vi.fn(() => new Promise<void>((resolve) => (releaseDispatch = resolve)))
    const queue = new AudioQueue(dispatch)
    const result = queue.enqueue(audio)
    let settled = false
    void result.then(
      () => (settled = true),
      () => (settled = true)
    )

    await vi.advanceTimersByTimeAsync(20_000)
    expect(settled).toBe(false)

    releaseDispatch()
    await vi.advanceTimersByTimeAsync(9_999)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await expect(result).rejects.toThrow('AUDIO_PLAY_TIMEOUT')
    vi.useRealTimers()
  })

  it('派发失败时立即拒绝当前播放项', async () => {
    const queue = new AudioQueue(async () => {
      throw new Error('RENDERER_UNAVAILABLE')
    })

    await expect(queue.enqueue(audio)).rejects.toThrow('RENDERER_UNAVAILABLE')
  })
})
