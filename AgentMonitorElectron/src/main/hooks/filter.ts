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

  const marker = `--agent-monitor-hook=${source}`
  return stopEntries.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') return []
    const entry = candidate as HookEntryRecord
    if (!Array.isArray(entry.hooks)) return []

    const ownHooks = entry.hooks.flatMap((hookCandidate) => {
      if (!hookCandidate || typeof hookCandidate !== 'object') return []
      const hook = hookCandidate as HookCommandRecord
      if (typeof hook.command !== 'string' || !hook.command.includes(marker)) return []
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
