import { abortSignalReason, throwIfSignalAborted } from '../../shared/abort-signal-reason'

// ── Concurrency limiter — max 4 parallel Linear API calls ────────────
const MAX_CONCURRENT = 4
let running = 0
const queue: (() => void)[] = []

export function acquire(signal?: AbortSignal): Promise<void> {
  throwIfSignalAborted(signal)
  if (running < MAX_CONCURRENT) {
    running++
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const grant = () => {
      signal?.removeEventListener('abort', onAbort)
      running++
      resolve()
    }
    const onAbort = () => {
      const index = queue.indexOf(grant)
      if (index !== -1) {
        queue.splice(index, 1)
      }
      if (signal) {
        reject(abortSignalReason(signal))
      }
    }
    queue.push(grant)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export function release(): void {
  running--
  const next = queue.shift()
  if (next) {
    next()
  }
}
