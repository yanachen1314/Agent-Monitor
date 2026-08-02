import { describe, expect, it } from 'vitest'
import {
  formatLogTimestamp,
  hashIdentifier,
  serializeError,
  summarizePath
} from '../src/main/logging/logger'

describe('structured logger helpers', () => {
  it('使用本地时间生成便于阅读的毫秒级时间戳', () => {
    const date = new Date(2026, 7, 2, 17, 4, 1, 802)
    expect(formatLogTimestamp(date)).toBe('2026-08-02 17:04:01.802')
  })

  it('对会话标识生成稳定的不可逆摘要', () => {
    expect(hashIdentifier('session-1')).toBe(hashIdentifier('session-1'))
    expect(hashIdentifier('session-1')).not.toContain('session-1')
    expect(hashIdentifier(null)).toBeNull()
  })

  it('仅从路径中保留末级名称', () => {
    expect(summarizePath('C:\\Users\\tester\\workspace')).toBe('workspace')
    expect(summarizePath('/Users/tester/complete.wav')).toBe('complete.wav')
  })

  it('序列化异常、错误码与 cause 链', () => {
    const cause = Object.assign(new Error('磁盘不可用'), { code: 'EIO' })
    const error = new Error('配置保存失败', { cause })
    expect(serializeError(error)).toEqual(
      expect.objectContaining({
        name: 'Error',
        message: '配置保存失败',
        cause: expect.objectContaining({ code: 'EIO', message: '磁盘不可用' })
      })
    )
  })
})
