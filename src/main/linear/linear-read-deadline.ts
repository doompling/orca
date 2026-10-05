export const LINEAR_READ_TIMEOUT_MS = 30_000

export async function withLinearReadDeadline<T>(
  read: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort(
      new Error(
        'Linear read timed out after 30 seconds. Check your connection and refresh to retry.'
      )
    )
  }, LINEAR_READ_TIMEOUT_MS)
  try {
    return await read(controller.signal)
  } finally {
    clearTimeout(timeout)
  }
}
