// A small HTTP client for the /api/mcp routes of Memex. It turns every failure into a sentence the assistant can
// pass on to the person ("Memex is not running", "that item is private"), and never includes the key in any message.

export type Fetch = typeof fetch

export interface ListEntry {
  id: string
  title: string
  type: string
  summary?: string
  snippet: string
  categories: string[]
  tags: string[]
  sourceUrl?: string
  createdAt: string
}

export interface SearchResponse {
  results: ListEntry[]
  semantic: boolean
  withheldPrivate: number
}

export interface RecentResponse {
  results: ListEntry[]
  withheldPrivate: number
}

export interface FullItem {
  id: string
  title: string
  type: string
  summary?: string
  content: string
  contentTruncated?: boolean
  structured: Record<string, unknown>
  categories: string[]
  tags: string[]
  source: string
  sourceUrl?: string
  createdAt: string
  updatedAt: string
}

export interface SaveResponse {
  item: { id: string; title: string; type: string }
  similarItems: unknown[]
  duplicate?: boolean
}

/** A failure with a message that is safe and useful to show to the person. */
export class MemexError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
  }
}

const READ_TIMEOUT_MS = 30_000
// Saving a page fetches it and classifies it with an AI, which can take a while on a local model.
const SAVE_TIMEOUT_MS = 180_000

export class MemexClient {
  constructor(
    private readonly baseUrl: string,
    private readonly key: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  search(query: string, opts: { limit?: number; type?: string; tag?: string } = {}) {
    return this.request<SearchResponse>('GET', '/api/mcp/search', { q: query, ...opts })
  }

  recent(opts: { limit?: number; type?: string } = {}) {
    return this.request<RecentResponse>('GET', '/api/mcp/recent', opts)
  }

  getItem(id: string) {
    return this.request<FullItem>('GET', `/api/mcp/items/${encodeURIComponent(id)}`)
  }

  saveNote(body: { content: string; title?: string; tags?: string[] }) {
    return this.request<SaveResponse>('POST', '/api/mcp/notes', undefined, body, SAVE_TIMEOUT_MS)
  }

  saveLink(url: string) {
    return this.request<SaveResponse>('POST', '/api/mcp/links', undefined, { url }, SAVE_TIMEOUT_MS)
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    query?: Record<string, string | number | undefined>,
    body?: unknown,
    timeoutMs = READ_TIMEOUT_MS,
  ): Promise<T> {
    const url = new URL(this.baseUrl + path)
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== '') url.searchParams.set(k, String(v))

    let res: Response
    try {
      res = await this.fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.key}`,
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (err) {
      const name = err instanceof Error ? err.name : ''
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new MemexError(`Memex did not answer within ${Math.round(timeoutMs / 1000)} seconds. It may be busy; try again.`)
      }
      throw new MemexError(`Cannot reach Memex at ${this.baseUrl}. Is it running? Start it with "docker compose up -d" or "npm run dev".`)
    }

    const text = await res.text()
    let json: unknown
    try {
      json = text ? JSON.parse(text) : undefined
    } catch {
      json = undefined
    }
    const serverMessage = typeof (json as { error?: unknown } | undefined)?.error === 'string' ? (json as { error: string }).error : undefined

    if (res.ok) {
      if (json === undefined) throw new MemexError('Memex answered with something that is not JSON. Is MEMEX_URL pointing at Memex?', res.status)
      return json as T
    }
    if (res.status === 401) {
      throw new MemexError('Memex rejected the key. It may have been revoked or replaced: create a new one in Memex > Settings > Capture > AI assistants and update MEMEX_MCP_KEY.', 401)
    }
    if (res.status === 429) throw new MemexError('Memex says that is too many requests. Wait a minute and try again.', 429)
    // 400 / 403 / 404 carry a clear message from Memex (invalid input, private item, Strict Local Mode, not found).
    throw new MemexError(serverMessage ?? `Memex answered with an error (HTTP ${res.status}).`, res.status)
  }
}
