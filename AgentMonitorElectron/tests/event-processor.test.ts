import { describe, expect, it } from 'vitest'
import type { AppConfig, TurnStoppedEvent } from '../src/shared/types'
import { EventProcessor } from '../src/main/events/processor'

const config: AppConfig = {
  version: 1,
  defaultAudio: { source: 'builtin', path: 'builtin://complete.wav', volume: 0.7 },
  monitors: {
    claude: { enabled: true, audioMode: 'default', customAudioPath: null },
    codex: { enabled: true, audioMode: 'default', customAudioPath: null }
  },
  globalPaused: false,
  autoStart: true,
  closeToTray: true
}

function event(overrides: Partial<TurnStoppedEvent> = {}): TurnStoppedEvent {
  return {
    version: 1,
    source: 'codex',
    eventType: 'turnStopped',
    sessionId: 'session-1',
    turnId: 'turn-1',
    cwd: 'C:\\project',
    timestamp: Date.now(),
    ...overrides
  }
}

describe('EventProcessor', () => {
  it('接受首个事件并忽略重复事件', () => {
    const processor = new EventProcessor()
    expect(processor.process(event(), config)).toEqual({
      code: 'ACCEPTED',
      shouldPlay: true
    })
    expect(processor.process(event(), config)).toEqual({
      code: 'DUPLICATE_IGNORED',
      shouldPlay: false
    })
  })

  it('监控关闭时不播放', () => {
    const processor = new EventProcessor()
    const disabled = structuredClone(config)
    disabled.monitors.codex.enabled = false
    expect(processor.process(event(), disabled).code).toBe('MONITOR_DISABLED')
  })

  it('一秒内的不同事件合并播放', () => {
    const processor = new EventProcessor()
    expect(processor.process(event(), config).shouldPlay).toBe(true)
    expect(processor.process(event({ turnId: 'turn-2' }), config).shouldPlay).toBe(false)
  })
})
