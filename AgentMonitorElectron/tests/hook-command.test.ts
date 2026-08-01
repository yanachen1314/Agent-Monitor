import { describe, expect, it } from 'vitest'
import { formatWindowsHookRunnerCommand } from '../src/main/hooks/command'

describe('formatWindowsHookRunnerCommand', () => {
  it('uses a bash-safe slash path for Claude on Windows', () => {
    expect(
      formatWindowsHookRunnerCommand(
        'C:\\Users\\yanchen\\.codex\\agent-monitor\\AgentMonitorHook.exe',
        'claude'
      )
    ).toBe('"C:/Users/yanchen/.codex/agent-monitor/AgentMonitorHook.exe" claude')
  })

  it('keeps a native Windows path for Codex', () => {
    expect(
      formatWindowsHookRunnerCommand(
        'C:\\Users\\yanchen\\.codex\\agent-monitor\\AgentMonitorHook.exe',
        'codex'
      )
    ).toBe('C:\\Users\\yanchen\\.codex\\agent-monitor\\AgentMonitorHook.exe codex')
  })

  it('quotes native Codex paths that contain spaces', () => {
    expect(formatWindowsHookRunnerCommand('C:\\Users\\Test User\\hook.exe', 'codex')).toBe(
      '"C:\\Users\\Test User\\hook.exe" codex'
    )
  })
})
