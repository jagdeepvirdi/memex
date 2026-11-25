import type {
  IngestUrlRequest,
  IngestUrlResponse,
  CreateItemRequest,
  Item,
  ItemPriority,
  StatsResponse,
  Insight,
  AskRequest,
  AskResponse,
  RediscoveryItem,
  CategoryAnomaly,
  RemapCategoryResponse,
  ItemExtraction,
  SimilarItem,
  NLFilterResponse,
  DigestResponse,
  ExplainRequest,
  ExplainStartResponse,
  ExtractRecipeRequest,
  ExtractRecipeStartResponse,
  ConnectedEntity,
  GithubRepoMeta,
} from '../../../shared/types'
import { toast } from 'sonner'
import { useAuthStore } from '../store/authStore'
import { tokenExpiry } from './jwt'

const BASE = '/api'
const REFRESH_HEADER = 'X-Refreshed-Token'

/** Thrown when the server rejects the session token (expired or invalid). */
export class SessionExpiredError extends Error {
  constructor() {
    super('Session expired')
    this.name = 'SessionExpiredError'
  }
}

/** A non-2xx API response. `body` is the parsed JSON error payload when there was one (e.g. `existingId`). */
export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly body?: Record<string, unknown>) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Signs the user out after a 401. `ProtectedRoute` reacts to the store change
 * with a client-side redirect to /login that remembers the current page, so
 * there is no full reload and sign-in returns the user to where they were.
 */
function expireSession(tokenUsed: string | null) {
  const { token, isAuthenticated, logout } = useAuthStore.getState()
  // Several requests fail together when a session lapses: the first handles it.
  // Also ignore a late 401 for a token that has since been replaced (re-login or renewal),
  // so a stale in-flight request can't sign out a newer session.
  if (!isAuthenticated || token !== tokenUsed) return
  logout()
  toast.error('Your session expired. Please sign in again.', { id: 'session-expired' })
}

/** Adopts a renewed session token from the server (sliding session). */
function adoptRefreshedToken(res: Response) {
  const refreshed = res.headers?.get(REFRESH_HEADER)
  if (!refreshed) return
  const newExp = tokenExpiry(refreshed)
  if (newExp === null) return
  const { token, setToken } = useAuthStore.getState()
  const currentExp = token ? tokenExpiry(token) : null
  // The service worker can replay cached responses carrying an old header.
  // Only ever move the session forward, never back to an older token.
  if (currentExp === null || newExp > currentExp) setToken(refreshed)
}

/**
 * True when the Memex server answers (the public liveness endpoint, with a short timeout). Used before sending anything
 * saved for later: a laptop that is off or a phone with no route to it fails here in seconds instead of hanging.
 */
export async function pingServer(timeoutMs = 4000): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' })
    return res.ok
  } catch {
    return false
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = useAuthStore.getState().token

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...init?.headers as Record<string, string>
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  // A multipart upload needs the browser to set its own Content-Type (with the boundary).
  if (typeof FormData !== 'undefined' && init?.body instanceof FormData) delete headers['Content-Type']

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
  })

  adoptRefreshedToken(res)

  if (res.status === 401 && !path.startsWith('/auth')) {
    expireSession(token)
    throw new SessionExpiredError()
  }

  if (!res.ok) {
    const text = await res.text();
    let error;
    let body: Record<string, unknown> | undefined;
    try {
      body = JSON.parse(text) as Record<string, unknown>;
      error = body.error as string | undefined;
    } catch {
      error = text;
    }
    throw new ApiError(error || `API error ${res.status}`, res.status, body);
  }
  if (res.status === 204 || res.headers?.get('content-length') === '0') return undefined as T
  return res.json() as Promise<T>
}

// ── AI providers ──────────────────────────────────────────────────────────────

export type AiProviderId = 'ollama' | 'claude' | 'gemini' | 'openai' | 'groq'

export interface AiProviderInfo {
  id: AiProviderId
  /** An API key is present on the server (Ollama is always true). The key itself is never sent. */
  configured: boolean
  cloud: boolean
  models: string[]
}

export interface AiTestResult {
  ok: boolean
  provider: AiProviderId
  model?: string
  latencyMs?: number
  reply?: string
  /** On failure: rate_limit | timeout | auth | blocked | bad_response | unavailable */
  kind?: string
  error?: string
}

export function fetchAiProviders(): Promise<AiProviderInfo[]> {
  return apiFetch<AiProviderInfo[]>('/ai/providers')
}

// ── API keys (write-only: the server never returns a key) ───────────────────

export type ApiKeyProvider = 'claude' | 'gemini' | 'openai' | 'groq' | 'youtube'

export interface ApiKeyStatus {
  provider: ApiKeyProvider
  label: string
  configured: boolean
  /** Which key is in effect: `env` (server .env, wins) or `stored` (saved from Settings, encrypted). */
  source: 'env' | 'stored' | null
  /** Last four characters of the key in effect — the only part of a key the client ever sees. */
  last4?: string
  /** A key is also saved in the app. */
  hasStored: boolean
  /** A saved key exists but can no longer be decrypted. */
  undecryptable: boolean
}

export interface YoutubeKeyTest {
  ok: boolean
  kind?: string
  error?: string
}

export function fetchApiKeys(): Promise<ApiKeyStatus[]> {
  return apiFetch<ApiKeyStatus[]>('/ai/keys')
}

export function saveApiKey(provider: ApiKeyProvider, key: string): Promise<ApiKeyStatus> {
  return apiFetch<ApiKeyStatus>(`/ai/keys/${provider}`, { method: 'PUT', body: JSON.stringify({ key }) })
}

export function removeApiKey(provider: ApiKeyProvider): Promise<ApiKeyStatus> {
  return apiFetch<ApiKeyStatus>(`/ai/keys/${provider}`, { method: 'DELETE' })
}

export function testYoutubeKey(): Promise<YoutubeKeyTest> {
  return apiFetch<YoutubeKeyTest>('/ai/keys/youtube/test', { method: 'POST' })
}

export function testAiProvider(provider: AiProviderId): Promise<AiTestResult> {
  return apiFetch<AiTestResult>('/ai/test', { method: 'POST', body: JSON.stringify({ provider }) })
}

export async function ingestUrl(url: string): Promise<IngestUrlResponse> {
  return apiFetch<IngestUrlResponse>('/ingest/url', {
    method: 'POST',
    body: JSON.stringify({ url } as IngestUrlRequest),
  })
}

export async function createItem(item: CreateItemRequest): Promise<Item> {
  return apiFetch<Item>('/items', {
    method: 'POST',
    body: JSON.stringify(item),
  })
}

export async function fetchItems(options: { type?: string, category?: string, tag?: string, deleted?: boolean, limit?: number, offset?: number, pendingEnrichment?: boolean, enriched?: boolean, q?: string, unreviewed?: boolean, reviewed?: boolean, hasReminder?: boolean, maxConfidence?: number, priority?: ItemPriority | 'none' } = {}): Promise<{ items: Item[], total: number }> {
  const params = new URLSearchParams()
  if (options.type) params.append('type', options.type)
  if (options.category) params.append('category', options.category)
  if (options.tag) params.append('tag', options.tag)
  if (options.deleted) params.append('deleted', 'true')
  if (options.limit) params.append('limit', options.limit.toString())
  if (options.offset) params.append('offset', options.offset.toString())
  if (options.pendingEnrichment) params.append('pendingEnrichment', 'true')
  if (options.enriched) params.append('enriched', 'true')
  if (options.unreviewed) params.append('unreviewed', 'true')
  if (options.reviewed) params.append('reviewed', 'true')
  if (options.hasReminder) params.append('hasReminder', 'true')
  if (options.maxConfidence !== undefined) params.append('maxConfidence', options.maxConfidence.toString())
  if (options.priority) params.append('priority', options.priority)
  if (options.q) params.append('q', options.q)

  return apiFetch<{ items: Item[], total: number }>(`/items?${params.toString()}`)
}

export interface SearchResult {
  items: Item[]
  /** false when the results are keyword matches only (no usable embeddings), so recall may be weaker. */
  semantic: boolean
}

export async function fetchSearchResult(query: string, options: { type?: string, category?: string, tag?: string } = {}): Promise<SearchResult> {
  const data = await apiFetch<{ items: Item[]; semantic?: boolean }>('/search', {
    method: 'POST',
    body: JSON.stringify({ query, ...options }),
  })
  return { items: data.items, semantic: data.semantic !== false }
}

export async function fetchSearch(query: string, options: { type?: string, category?: string, tag?: string } = {}): Promise<Item[]> {
  return (await fetchSearchResult(query, options)).items
}

export async function fetchCategories(): Promise<any[]> {
  return apiFetch<any[]>('/categories')
}

export async function fetchTags(): Promise<any[]> {
  return apiFetch<any[]>('/tags')
}

export async function fetchItem(id: string): Promise<Item> {
  return apiFetch<Item>(`/items/${id}`)
}

export async function updateItem(id: string, updates: Partial<Item>): Promise<Item> {
  return apiFetch<Item>(`/items/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  })
}

export async function deleteItem(id: string): Promise<void> {
  await apiFetch<void>(`/items/${id}`, {
    method: 'DELETE',
  })
}

/** Sets (or, with null, clears) the triage priority on many items at once. */
export async function setItemsPriority(ids: string[], priority: ItemPriority | null): Promise<{ count: number }> {
  return apiFetch<{ count: number }>('/items/bulk/priority', {
    method: 'PUT',
    body: JSON.stringify({ ids, priority }),
  })
}

export async function deleteItemsBulk(ids: string[]): Promise<{ count: number }> {
  return apiFetch<{ count: number }>(`/items/bulk`, {
    method: 'DELETE',
    body: JSON.stringify({ ids }),
  })
}

export async function migrateToVault(itemId: string, data: { service: string, url?: string, username?: string, ciphertext: string, iv: string }): Promise<any> {
  return apiFetch<any>(`/vault/migrate/${itemId}`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function fetchStats(): Promise<StatsResponse> {
  return apiFetch<StatsResponse>('/items/stats')
}

export async function fetchInsights(): Promise<Insight[]> {
  return apiFetch<Insight[]>('/items/insights')
}

export async function askKnowledge(question: string): Promise<AskResponse> {
  return apiFetch<AskResponse>('/search/ask', {
    method: 'POST',
    body: JSON.stringify({ question } as AskRequest),
  })
}

export async function fetchRediscovery(): Promise<RediscoveryItem[]> {
  return apiFetch<RediscoveryItem[]>('/items/rediscover')
}

export type { SimilarItem }

export async function fetchVisionHealth(): Promise<{ available: boolean; model: string | null }> {
  return apiFetch<{ available: boolean; model: string | null }>('/ingest/vision/health')
}

export async function fetchWhisperHealth(): Promise<{ installed: boolean; inDocker?: boolean }> {
  return apiFetch<{ installed: boolean; inDocker?: boolean }>('/ingest/whisper/health')
}

export async function fetchCategoryAnomalies(): Promise<CategoryAnomaly[]> {
  return apiFetch<CategoryAnomaly[]>('/categories/anomalies')
}

export async function remapCategory(fromRootId: string, toPath: string[]): Promise<RemapCategoryResponse> {
  return apiFetch<RemapCategoryResponse>('/categories/remap', {
    method: 'POST',
    body: JSON.stringify({ fromRootId, toPath }),
  })
}

export async function fetchItemExtractions(itemId: string): Promise<ItemExtraction[]> {
  return apiFetch<ItemExtraction[]>(`/items/${itemId}/extractions`)
}

export async function applyExtraction(itemId: string, extractionId: string): Promise<Item> {
  return apiFetch<Item>(`/items/${itemId}/apply-extraction/${extractionId}`, { method: 'POST' })
}

/** `provider` pins this one run to that AI ("Redo with..."); without it the normal routing from Settings is used. */
export async function reClassifyItem(itemId: string, provider?: AiProviderId): Promise<ItemExtraction> {
  return apiFetch<ItemExtraction>(`/items/${itemId}/re-classify`, {
    method: 'POST',
    ...(provider ? { body: JSON.stringify({ provider }) } : {}),
  })
}

export async function reprocessBulk(filter: 'unreviewed' | 'all' = 'unreviewed'): Promise<{ queued: number }> {
  return apiFetch<{ queued: number }>('/items/reprocess-bulk', {
    method: 'POST',
    body: JSON.stringify({ filter }),
  })
}

export async function fetchDueReminders(): Promise<Item[]> {
  return apiFetch<Item[]>('/items/reminders/due')
}

export async function shareItem(itemId: string): Promise<{ token: string; expiresAt: string }> {
  return apiFetch<{ token: string; expiresAt: string }>(`/items/${itemId}/share`, { method: 'POST' })
}

export async function unshareItem(itemId: string): Promise<void> {
  await apiFetch<void>(`/items/${itemId}/share`, { method: 'DELETE' })
}

export async function fetchSharedItem(token: string): Promise<Item> {
  // Public endpoint — no auth header needed
  const res = await fetch(`/api/share/${token}`)
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Not found')
  return res.json()
}

export async function fetchDigest(): Promise<DigestResponse> {
  return apiFetch<DigestResponse>('/items/digest')
}

export async function nlFilter(query: string): Promise<NLFilterResponse> {
  return apiFetch<NLFilterResponse>('/items/nl-filter', {
    method: 'POST',
    body: JSON.stringify({ query }),
  })
}

export async function setReminder(itemId: string, remindAt: string | null): Promise<Item> {
  return apiFetch<Item>(`/items/${itemId}`, {
    method: 'PUT',
    body: JSON.stringify({ remindAt }),
  })
}

export async function summarizeItemLinks(itemId: string): Promise<Item> {
  return apiFetch<Item>(`/items/${itemId}/summarize-links`, { method: 'POST' })
}

// ── On-demand AI actions (run only when the user clicks) ──────────────────────

/** Starts Explain as a background job: returns its id at once. Follow it with fetchIngestJob, then re-read the item. */
export function explainItem(itemId: string, opts: ExplainRequest = {}): Promise<ExplainStartResponse> {
  return apiFetch<ExplainStartResponse>(`/items/${itemId}/explain`, { method: 'POST', body: JSON.stringify(opts) })
}

/** Starts Extract recipe as a background job: returns its id at once. Follow it with fetchIngestJob. */
export function extractRecipeFromItem(itemId: string, opts: ExtractRecipeRequest = {}): Promise<ExtractRecipeStartResponse> {
  return apiFetch<ExtractRecipeStartResponse>(`/items/${itemId}/extract-recipe`, { method: 'POST', body: JSON.stringify(opts) })
}

/**
 * Fetches fresh stars / language / last push for a GitHub repo item from the GitHub API and saves them on the item.
 * Rejects with GitHub's reason in the message (not found, rate limit, Strict Local Mode…).
 */
export function refreshGithubInfo(itemId: string): Promise<{ item: Item; github: GithubRepoMeta }> {
  return apiFetch<{ item: Item; github: GithubRepoMeta }>(`/items/${itemId}/github`, { method: 'POST' })
}

/** Entities this item is linked to (creator, repo, channel, director…), with the other items sharing each. */
export function fetchItemEntities(itemId: string): Promise<ConnectedEntity[]> {
  return apiFetch<ConnectedEntity[]>(`/items/${itemId}/entities`)
}

/** Items extracted from this one (e.g. recipes pulled out of a video). */
export function fetchDerivedItems(itemId: string): Promise<Item[]> {
  return apiFetch<Item[]>(`/items/${itemId}/derived`)
}

// ── Bulk paste import ─────────────────────────────────────────────────────────

export type PasteSkipReason = 'too-long' | 'duplicate-in-paste' | 'already-saved'

export interface PasteEntryResult {
  index: number
  title: string
  source: string
  sourceUrl?: string
  /** `saved` = will be / was saved; `skipped` = left out (see `reason`). */
  status: 'saved' | 'skipped'
  reason?: PasteSkipReason
  itemId?: string
  existingId?: string
  existingTitle?: string
}

export interface PasteImportResponse {
  dryRun: boolean
  total: number
  new: number
  skipped: number
  saved?: number
  jobId?: string | null
  entries: PasteEntryResult[]
}

// ── Markdown / Obsidian import ───────────────────────────────

export type MarkdownSkipReason = 'empty' | 'too-long' | 'duplicate-in-zip' | 'already-saved' | 'limit-reached'

export interface MarkdownEntryResult {
  index: number
  path: string
  title: string
  tags: string[]
  status: 'saved' | 'skipped'
  reason?: MarkdownSkipReason
  itemId?: string
  existingId?: string
}

export interface MarkdownImportResponse {
  dryRun: boolean
  total: number
  new: number
  skipped: number
  otherFilesIgnored: number
  max: number
  saved?: number
  jobId?: string | null
  entries: MarkdownEntryResult[]
}

function markdownForm(file: File, dryRun: boolean): FormData {
  const form = new FormData()
  form.append('file', file)
  form.append('dryRun', String(dryRun))
  return form
}

/** Dry run: reads the ZIP (or .md file) and reports what would be saved or skipped. Writes nothing. */
export function previewMarkdownImport(file: File): Promise<MarkdownImportResponse> {
  return apiFetch<MarkdownImportResponse>('/ingest/markdown', { method: 'POST', body: markdownForm(file, true) })
}

/** Saves the new notes instantly and starts background classification (poll `fetchIngestJob`). */
export function startMarkdownImport(file: File): Promise<MarkdownImportResponse> {
  return apiFetch<MarkdownImportResponse>('/ingest/markdown', { method: 'POST', body: markdownForm(file, false) })
}

export interface IngestJobStatus {
  status: 'processing' | 'completed' | 'failed' | 'cancelled' | string
  progress: number
  total: number
  completed: number
  elapsed?: number | string
  error?: string
  details?: {
    classified?: number
    failed?: Array<{ itemId: string; title: string; error: string }>
    /** Explain jobs: which item, and where the work has got to. */
    itemId?: string
    stage?: 'reading' | 'summarising' | 'writing' | 'checking' | 'extracting' | 'items' | 'entities'
    part?: number
    parts?: number
    model?: string
    /** Re-embed jobs: which model, and what has happened so far. */
    target?: string
    embedded?: number
    skippedPrivate?: number
    failures?: number
    /** Extract recipe jobs, once completed: whether a recipe was found, and the new item or the reason it was not. */
    found?: boolean
    reason?: string
    recipeId?: string
    confidence?: number
  }
}

/** Dry run: splits the paste and reports what would be saved or skipped. Writes nothing. */
export function previewPasteImport(text: string): Promise<PasteImportResponse> {
  return apiFetch<PasteImportResponse>('/ingest/paste/bulk', { method: 'POST', body: JSON.stringify({ text, dryRun: true }) })
}

/** Saves the new entries instantly and starts background classification (poll `fetchIngestJob`). */
export function startPasteImport(text: string): Promise<PasteImportResponse> {
  return apiFetch<PasteImportResponse>('/ingest/paste/bulk', { method: 'POST', body: JSON.stringify({ text, dryRun: false }) })
}

/**
 * Asks the server to stop a running Explain / Extract recipe job. `cancelling`: it was told to stop and will turn
 * `cancelled` in a moment; `cancelled`: it had no runner left and the stale job was cleared. Rejects with a 409
 * (ApiError) if the job had already finished, 400 for jobs that cannot be cancelled, 404 if it no longer exists.
 */
export function cancelIngestJob(jobId: string): Promise<{ status: 'cancelling' | 'cancelled' }> {
  return apiFetch<{ status: 'cancelling' | 'cancelled' }>(`/ingest/jobs/${jobId}/cancel`, { method: 'POST' })
}

// ── Embedding model (Settings > AI) ───────────────────────────────────────────

export type EmbeddingProviderId = 'ollama' | 'gemini' | 'openai'

export interface EmbeddingStatus {
  provider: EmbeddingProviderId
  model: string
  /** '<provider>:<model>' */
  id: string
  cloud: boolean
  configured: boolean
  /** Whether new vectors can be made right now; if not, `blockedReason` says why. */
  usable: boolean
  blockedReason: string | null
  counts: { embedded: number; needsReembed: number; skippedPrivate: number; pending: number; total: number }
  /**
   * The similarity thresholds in force and how far to trust them: tuned (by hand), probe (small synthetic test),
   * library (calibrated on this library) or default (nothing known: strict duplicates, no graph links, no merges).
   */
  thresholds: { duplicate: number; graph: number | null; entity: number | null; basis: 'tuned' | 'probe' | 'library' | 'default' }
  /** A re-embed that is running right now, so the page can follow it after a reload. */
  job: { id: string; progress: number; completed: number; total: number } | null
}

export interface ReembedEstimate {
  target: { provider: EmbeddingProviderId; model: string; id: string }
  cloud: boolean
  items: number
  characters: number
  approxTokens: number
  skippedPrivate: number
  alreadyDone: number
  entities: number
  blockedReason: string | null
}

export function fetchEmbeddingStatus(): Promise<EmbeddingStatus> {
  return apiFetch<EmbeddingStatus>('/ai/embedding')
}

/** What switching to (or re-embedding with) this model would do. Read-only: nothing is sent anywhere. */
export function fetchReembedEstimate(provider?: EmbeddingProviderId, model?: string): Promise<ReembedEstimate> {
  const params = new URLSearchParams()
  if (provider) params.set('provider', provider)
  if (provider && model?.trim()) params.set('model', model.trim())
  const qs = params.toString()
  return apiFetch<ReembedEstimate>(`/ai/embedding/estimate${qs ? `?${qs}` : ''}`)
}

/** Makes this the active embedding model. Sends nothing and starts no job. */
export function setEmbeddingModel(provider: EmbeddingProviderId, model?: string): Promise<EmbeddingStatus> {
  return apiFetch<EmbeddingStatus>('/ai/embedding', {
    method: 'PUT',
    body: JSON.stringify({ provider, ...(model?.trim() ? { model: model.trim() } : {}) }),
  })
}

/** Starts the re-embed job for the active model. `id` is the model the user confirmed. */
export function startReembed(id: string): Promise<{ jobId: string }> {
  return apiFetch<{ jobId: string }>('/ai/embedding/reembed', {
    method: 'POST',
    body: JSON.stringify({ confirm: true, id }),
  })
}

export function fetchIngestJob(jobId: string): Promise<IngestJobStatus> {
  return apiFetch<IngestJobStatus>(`/ingest/jobs/${jobId}`)
}

// ── Sample data (demo mode) ──────────────────────────────────────────────────

/** How many sample items are loaded (0: none). */
export async function fetchDemoStatus(): Promise<{ items: number }> {
  return apiFetch<{ items: number }>('/demo')
}

/** Loads the sample items (no AI is called). Rejects with the server's sentence when they are already loaded. */
export async function loadDemoData(): Promise<{ items: number }> {
  return apiFetch<{ items: number }>('/demo', { method: 'POST' })
}

/** Removes exactly the sample items and what only they used; the user's own notes are never touched. */
export async function clearDemoData(): Promise<{ items: number; entities: number; tags: number }> {
  return apiFetch<{ items: number; entities: number; tags: number }>('/demo', { method: 'DELETE' })
}
