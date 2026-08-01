export function parseHooksDocument<T extends object>(content: string): T {
  // Codex can leave hooks.json present but empty before the first hook is saved.
  // Treat that state like a missing file while still rejecting malformed JSON.
  return (content.trim() === '' ? {} : JSON.parse(content)) as T
}
