import type { CliSource } from '../../shared/types'

export function formatWindowsHookRunnerCommand(runner: string, source: CliSource): string {
  if (source === 'claude') {
    // Claude Code executes command hooks through bash, even on Windows. Backslashes
    // would be consumed as escape characters (C:\Users -> C:Users).
    return `"${escapeDoubleQuoted(runner.replaceAll('\\', '/'))}" claude`
  }
  return `${quoteWhenNeeded(runner)} codex`
}

function quoteWhenNeeded(path: string): string {
  return /\s/.test(path) ? `"${escapeDoubleQuoted(path)}"` : path
}

function escapeDoubleQuoted(value: string): string {
  return value.replaceAll('"', '\\"')
}
