import { describe, expect, it } from 'vitest'
import { ipcRequestSchema } from '../src/main/config/schema'

describe('IPC protocol', () => {
  const request = {
    protocolVersion: 1,
    token: '1234567890abcdef',
    event: {
      version: 1,
      source: 'claude',
      eventType: 'turnStopped',
      sessionId: 'session',
      turnId: null,
      cwd: null,
      timestamp: Date.now()
    }
  }

  it('接受合法请求', () => {
    expect(ipcRequestSchema.safeParse(request).success).toBe(true)
  })

  it('拒绝非本协议事件类型', () => {
    expect(
      ipcRequestSchema.safeParse({
        ...request,
        event: { ...request.event, eventType: 'turnCompleted' }
      }).success
    ).toBe(false)
  })

  it('拒绝过长字段', () => {
    expect(
      ipcRequestSchema.safeParse({
        ...request,
        event: { ...request.event, sessionId: 'x'.repeat(257) }
      }).success
    ).toBe(false)
  })
})
