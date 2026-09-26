import {
  OpenCodeServerHttpError,
  type OpenCodeServerRequestOptions
} from './opencode-server-connection-types'

const MAX_RESPONSE_BYTES = 8 * 1024 * 1024
const MAX_REQUEST_BYTES = 2 * 1024 * 1024
const MAX_PENDING_REQUESTS = 32
const DEFAULT_TIMEOUT_MS = 30_000

export function openCodeRequestUrl(
  origin: string,
  cwd: string,
  path: string,
  query?: Record<string, string>
): URL {
  if (path.length > 4096 || !/^\/[a-zA-Z0-9_/-]+$/.test(path) || path.startsWith('//')) {
    throw new Error('Invalid OpenCode request path.')
  }
  const url = new URL(path, origin)
  const entries = Object.entries(query ?? {})
  if (entries.length > 16) {
    throw new Error('OpenCode request query exceeded its size limit.')
  }
  for (const [key, value] of entries) {
    if (key === 'directory' || key === 'workspace') {
      throw new Error('OpenCode request cannot override its owned directory.')
    }
    if (key.length > 128 || value.length > 4096) {
      throw new Error('OpenCode request query exceeded its size limit.')
    }
    url.searchParams.set(key, value)
  }
  url.searchParams.set('directory', cwd)
  return url
}

export async function readOpenCodeResponse(response: Response): Promise<unknown> {
  if (!response.ok) {
    await response.body?.cancel()
    throw new OpenCodeServerHttpError(response.status)
  }
  if (response.status === 204) {
    return null
  }
  if (!response.body) {
    throw new Error('OpenCode server returned an empty response.')
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) {
        break
      }
      bytes += part.value.byteLength
      if (bytes > MAX_RESPONSE_BYTES) {
        throw new Error('OpenCode response exceeded its size limit.')
      }
      chunks.push(part.value)
    }
    const parsed: unknown = JSON.parse(Buffer.concat(chunks, bytes).toString('utf8'))
    return parsed
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    if (error instanceof SyntaxError) {
      throw new Error('OpenCode server returned invalid JSON.')
    }
    throw error
  } finally {
    reader.releaseLock()
  }
}

export function createOpenCodeHttpClient(args: {
  origin: string
  cwd: string
  authorization: string
  fetch: typeof fetch
  assertAvailable: () => void
}) {
  const pending = new Set<AbortController>()
  return {
    abort: () => {
      for (const controller of pending) {
        controller.abort()
      }
    },
    request: async (
      method: 'GET' | 'POST' | 'PATCH',
      path: string,
      body?: unknown,
      options?: OpenCodeServerRequestOptions
    ): Promise<unknown> => {
      args.assertAvailable()
      if (pending.size >= MAX_PENDING_REQUESTS) {
        throw new Error('Too many pending OpenCode requests.')
      }
      const url = openCodeRequestUrl(args.origin, args.cwd, path, options?.query)
      const payload = body === undefined ? undefined : JSON.stringify(body)
      if (payload && Buffer.byteLength(payload) > MAX_REQUEST_BYTES) {
        throw new Error('OpenCode request exceeded its size limit.')
      }
      const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
      if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
        throw new Error('Invalid OpenCode request deadline.')
      }
      const controller = new AbortController()
      pending.add(controller)
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const response = await args.fetch(url, {
          method,
          headers: { authorization: args.authorization, 'content-type': 'application/json' },
          body: payload,
          redirect: 'error',
          signal: controller.signal
        })
        return await readOpenCodeResponse(response)
      } catch (error) {
        if (controller.signal.aborted) {
          throw new Error('OpenCode request was cancelled or exceeded its deadline.')
        }
        if (error instanceof OpenCodeServerHttpError) {
          throw error
        }
        // Provider bodies and fetch diagnostics can include credentials or user content.
        throw new Error('OpenCode request failed or returned an invalid response.')
      } finally {
        clearTimeout(timer)
        pending.delete(controller)
      }
    }
  }
}
