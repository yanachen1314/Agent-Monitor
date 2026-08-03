const MAX_EXTERNAL_URL_LENGTH = 2_048

export function isSafeExternalUrl(value: string): boolean {
  if (!value || value.length > MAX_EXTERNAL_URL_LENGTH) return false
  try {
    const url = new URL(value)
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    )
  } catch {
    return false
  }
}
