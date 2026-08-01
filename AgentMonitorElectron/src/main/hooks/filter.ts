import type { CliSource } from '../../shared/types'

interface HookCommandRecord {
  type?: unknown
  command?: unknown
}

interface HookEntryRecord {
  matcher?: unknown
  hooks?: unknown
}

interface HooksDocumentRecord {
  hooks?: {
    Stop?: unknown
  }
}

export interface FilteredHookEntry {
  matcher?: string
  hooks: Array<{
    type: 'command'
    command: string
  }>
}

export function extractAgentMonitorStopHooks(
  document: unknown,
  source: CliSource
): FilteredHookEntry[] {
  const stopEntries = (document as HooksDocumentRecord | null)?.hooks?.Stop
  if (!Array.isArray(stopEntries)) return []

  return stopEntries.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') return []
    const entry = candidate as HookEntryRecord
    if (!Array.isArray(entry.hooks)) return []

    const ownHooks = entry.hooks.flatMap((hookCandidate) => {
      if (!hookCandidate || typeof hookCandidate !== 'object') return []
      const hook = hookCandidate as HookCommandRecord
      if (typeof hook.command !== 'string' || !isAgentMonitorHookCommand(hook.command, source)) {
        return []
      }
      return [{ type: 'command' as const, command: hook.command }]
    })
    if (ownHooks.length === 0) return []

    return [
      {
        ...(typeof entry.matcher === 'string' ? { matcher: entry.matcher } : {}),
        hooks: ownHooks
      }
    ]
  })
}

export function isAgentMonitorHookCommand(command: string, source: CliSource): boolean {
  return (
    command.includes(`--agent-monitor-hook=${source}`) ||
    (command.toLowerCase().includes('agentmonitorhook.exe') &&
      new RegExp(`(?:^|\\s)${source}(?:\\s|$)`, 'i').test(command)) ||
    (command.toLowerCase().includes('agent-monitor-hook.cmd') &&
      new RegExp(`(?:^|\\s)${source}(?:\\s|$)`, 'i').test(command)) ||
    (command.toLowerCase().includes('agent-monitor-hook.ps1') &&
      new RegExp(`(?:^|\\s)-Source\\s+${source}(?:\\s|$)`, 'i').test(command))
  )
}
