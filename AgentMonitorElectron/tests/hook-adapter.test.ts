import { describe, expect, it, vi } from 'vitest'
import { adaptEvent } from '../src/hook'

describe('Hook adapter', () => {
  it('适配 Claude Stop Hook 且不传递回复内容', () => {
    vi.spyOn(Date, 'now').mockReturnValue(123456)
    const event = adaptEvent('claude', {
      session_id: 'claude-session',
      cwd: '/workspace',
      last_assistant_message: '敏感内容'
    } as never)
    expect(event).toEqual({
      version: 1,
      source: 'claude',
      eventType: 'turnStopped',
      sessionId: 'claude-session',
      turnId: null,
      cwd: '/workspace',
      timestamp: 123456
    })
    vi.restoreAllMocks()
  })

  it('适配 Codex turn_id', () => {
    const event = adaptEvent('codex', {
      session_id: 'codex-session',
      turn_id: 'turn-9',
      cwd: 'C:\\workspace'
    })
    expect(event.turnId).toBe('turn-9')
    expect(event.eventType).toBe('turnStopped')
  })
})
