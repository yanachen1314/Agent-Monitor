import { afterEach, describe, expect, it, vi } from 'vitest'
import { withMinimumDuration } from '../src/shared/minimum-duration'

describe('withMinimumDuration', () => {
  afterEach(() => vi.useRealTimers())

  it('keeps a completed action pending until the minimum duration elapses', async () => {
    vi.useFakeTimers()
    let settled = false
    const result = withMinimumDuration(async () => 'done', 500).then((value) => {
      settled = true
      return value
    })

    await vi.advanceTimersByTimeAsync(499)
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    await expect(result).resolves.toBe('done')
  })

  it('also preserves the minimum duration when the action fails', async () => {
    vi.useFakeTimers()
    let settled = false
    const result = withMinimumDuration(async () => {
      throw new Error('failed')
    }, 500).catch((error: unknown) => {
      settled = true
      throw error
    })
    const rejection = expect(result).rejects.toThrow('failed')

    await vi.advanceTimersByTimeAsync(499)
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    await rejection
  })
})
