import { describe, expect, it } from 'vitest'
import { extractAgentMonitorStopHooks } from '../src/main/hooks/filter'

describe('extractAgentMonitorStopHooks', () => {
  it('仅返回指定 CLI 的 Agent Monitor Hook', () => {
    const document = {
      hooks: {
        Stop: [
          {
            matcher: 'all',
            hooks: [
              { type: 'command', command: 'user-script.exe' },
              {
                type: 'command',
                command: '"AgentMonitor.exe" --agent-monitor-hook=claude'
              }
            ]
          },
          {
            hooks: [
              {
                type: 'command',
                command: '"AgentMonitor.exe" --agent-monitor-hook=codex'
              }
            ]
          }
        ]
      },
      privateValue: '不得返回'
    }

    expect(extractAgentMonitorStopHooks(document, 'claude')).toEqual([
      {
        matcher: 'all',
        hooks: [
          {
            type: 'command',
            command: '"AgentMonitor.exe" --agent-monitor-hook=claude'
          }
        ]
      }
    ])
  })

  it('配置结构无效或未配置时返回空数组', () => {
    expect(extractAgentMonitorStopHooks({}, 'codex')).toEqual([])
    expect(
      extractAgentMonitorStopHooks(
        { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'other.exe' }] }] } },
        'codex'
      )
    ).toEqual([])
  })
})
