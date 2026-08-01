import { describe, expect, it, vi } from 'vitest'
import { AudioQueue } from '../src/main/audio/queue'

const audio = { path: 'complete.wav', volume: 1, fallbackUsed: false }

describe('AudioQueue', () => {
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
