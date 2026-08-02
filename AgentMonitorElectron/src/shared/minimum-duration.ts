export async function withMinimumDuration<T>(
  action: () => Promise<T>,
  durationMs: number
): Promise<T> {
  const minimumDelay = new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, Math.max(0, durationMs))
  })

  try {
    return await action()
  } finally {
    await minimumDelay
  }
}
