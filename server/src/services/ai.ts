import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenAI } from '@google/genai'
import OpenAI from 'openai'
import { ollamaChat, ollamaEmbed } from './ollama.js'
import { getAiConfig, type AiConfig, type ProviderId } from './settings.js'
import logger from '../lib/logger.js'
import { peekApiKey, ensureApiKeysLoaded, redactSecrets } from './apiKeys.js'
import { activeEmbedding, EMBEDDING_DIMENSIONS } from './embeddingConfig.js'

export type { ProviderId } from './settings.js'

// ── Errors ───────────────────────────────────────────────────────────────────

export type AiErrorKind = 'rate_limit' | 'timeout' | 'auth' | 'blocked' | 'bad_response' | 'unavailable'

/** One error type for every provider failure, so callers never see SDK-specific errors. */
export class AiProviderError extends Error {
  constructor(
    public readonly provider: ProviderId,
    public readonly kind: AiErrorKind,
    message: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = 'AiProviderError'
  }
}

function toProviderError(provider: ProviderId, err: unknown): AiProviderError {
  if (err instanceof AiProviderError) return err
  const e = err as { name?: string; status?: number; message?: string } | undefined
  const status = typeof e?.status === 'number' ? e.status : undefined
  const message = redactSecrets(e?.message ?? String(err))
  if (status === 429) return new AiProviderError(provider, 'rate_limit', message, status)
  if (status === 401 || status === 403) return new AiProviderError(provider, 'auth', message, status)
  if (e?.name === 'AbortError' || e?.name === 'TimeoutError' || e?.name === 'APIConnectionTimeoutError') {
    return new AiProviderError(provider, 'timeout', message, status)
  }
  return new AiProviderError(provider, 'unavailable', message, status)
}

// ── Provider registry ────────────────────────────────────────────────────────

interface ChatRequest {
  prompt: string
  system?: string
  format?: string | object
  options?: Record<string, any>
  signal?: AbortSignal
  config: AiConfig
}

interface Provider {
  id: ProviderId
  /** True when the provider can be used right now (key present). Ollama is always "available". */
  available(): boolean
  model(config: AiConfig): string
  chat(req: ChatRequest): Promise<string>
}

const CLOUD_TIMEOUT_MS = 120_000
const DEFAULT_MAX_TOKENS = 2048

function withTimeout(signal?: AbortSignal): AbortSignal {
  const t = AbortSignal.timeout(CLOUD_TIMEOUT_MS)
  return signal ? AbortSignal.any([signal, t]) : t
}

// Claude/Gemini have no Ollama-style `format`, so JSON is requested in the system prompt.
function withJsonInstruction(system: string | undefined, format?: string | object): string | undefined {
  if (!format) return system
  const schema = typeof format === 'object' ? ` matching this JSON schema: ${JSON.stringify(format)}` : ''
  const rule = `Respond with ONLY valid JSON${schema}. No markdown code fences, no commentary.`
  return system ? `${system}\n\n${rule}` : rule
}

function stripJsonFences(text: string): string {
  const m = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return m ? m[1] : text
}

function maxTokens(options?: Record<string, any>): number {
  const v = options?.max_tokens ?? options?.num_predict
  return typeof v === 'number' && v > 0 ? v : DEFAULT_MAX_TOKENS
}

const ollamaProvider: Provider = {
  id: 'ollama',
  available: () => true,
  model: (c) => c.model,
  chat: (r) => ollamaChat(r.prompt, r.system, r.config.model, r.format, r.options, r.signal),
}

// The key can change at runtime (saved in Settings), so the SDK client is rebuilt when it does.
let _anthropic: { key: string | undefined; client: Anthropic } | null = null
function getAnthropicClient(): Anthropic {
  const key = peekApiKey('claude')
  if (!_anthropic || _anthropic.key !== key) _anthropic = { key, client: new Anthropic({ apiKey: key }) }
  return _anthropic.client
}

const claudeProvider: Provider = {
  id: 'claude',
  available: () => !!peekApiKey('claude'),
  model: (c) => c.claudeModel,
  async chat(r) {
    const system = withJsonInstruction(r.system, r.format)
    try {
      const message = await getAnthropicClient().messages.create(
        {
          model: r.config.claudeModel,
          max_tokens: maxTokens(r.options),
          ...(typeof r.options?.temperature === 'number' ? { temperature: r.options.temperature } : {}),
          ...(system ? { system } : {}),
          messages: [{ role: 'user', content: r.prompt }],
        },
        { signal: withTimeout(r.signal) },
      )
      const text = message.content
        .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
        .map(b => b.text)
        .join('')
      if (!text) throw new AiProviderError('claude', 'bad_response', 'Claude returned no text content')
      return r.format ? stripJsonFences(text) : text
    } catch (err) {
      throw toProviderError('claude', err)
    }
  },
}

let _gemini: { key: string | undefined; client: GoogleGenAI } | null = null
function getGeminiClient(): GoogleGenAI {
  const key = peekApiKey('gemini')
  if (!_gemini || _gemini.key !== key) _gemini = { key, client: new GoogleGenAI({ apiKey: key }) }
  return _gemini.client
}

const geminiProvider: Provider = {
  id: 'gemini',
  available: () => !!peekApiKey('gemini'),
  model: (c) => c.geminiModel,
  async chat(r) {
    const system = withJsonInstruction(r.system, r.format)
    try {
      const res = await getGeminiClient().models.generateContent({
        model: r.config.geminiModel,
        contents: r.prompt,
        config: {
          ...(system ? { systemInstruction: system } : {}),
          ...(r.format ? { responseMimeType: 'application/json' } : {}),
          ...(typeof r.options?.temperature === 'number' ? { temperature: r.options.temperature } : {}),
          maxOutputTokens: maxTokens(r.options),
          abortSignal: withTimeout(r.signal),
        },
      })
      const text = res.text
      if (!text) throw new AiProviderError('gemini', 'bad_response', 'Gemini returned no text (blocked or empty)')
      return r.format ? stripJsonFences(text) : text
    } catch (err) {
      throw toProviderError('gemini', err)
    }
  },
}

let _openai: { key: string | undefined; client: OpenAI } | null = null
function getOpenAIClient(): OpenAI {
  const key = peekApiKey('openai')
  if (!_openai || _openai.key !== key) _openai = { key, client: new OpenAI({ apiKey: key }) }
  return _openai.client
}

// Reasoning models (o-series, gpt-5 family) spend completion tokens on hidden reasoning, so a small cap can come back
// empty, and they reject a custom temperature. Everything else gets the caller's temperature and cap unchanged.
const isReasoningModel = (model: string) => /^(o\d|gpt-5)/i.test(model)
const REASONING_MIN_TOKENS = 1024

const openaiProvider: Provider = {
  id: 'openai',
  available: () => !!peekApiKey('openai'),
  model: (c) => c.openaiModel,
  async chat(r) {
    const system = withJsonInstruction(r.system, r.format)
    const model = r.config.openaiModel
    const reasoning = isReasoningModel(model)
    const cap = maxTokens(r.options)
    try {
      const completion = await getOpenAIClient().chat.completions.create(
        {
          model,
          max_completion_tokens: reasoning ? Math.max(cap, REASONING_MIN_TOKENS) : cap,
          ...(!reasoning && typeof r.options?.temperature === 'number' ? { temperature: r.options.temperature } : {}),
          // JSON mode needs the word "JSON" in the messages; withJsonInstruction always adds it.
          ...(r.format ? { response_format: { type: 'json_object' as const } } : {}),
          messages: [
            ...(system ? [{ role: 'system' as const, content: system }] : []),
            { role: 'user' as const, content: r.prompt },
          ],
        },
        { signal: withTimeout(r.signal) },
      )
      const choice = completion.choices[0]
      const text = choice?.message?.content
      if (!text) {
        const why = choice?.finish_reason ? ` (finish_reason: ${choice.finish_reason})` : ''
        throw new AiProviderError('openai', 'bad_response', `OpenAI returned no text${why}`)
      }
      return r.format ? stripJsonFences(text) : text
    } catch (err) {
      throw toProviderError('openai', err)
    }
  },
}

const PROVIDERS: Record<ProviderId, Provider> = {
  ollama: ollamaProvider,
  claude: claudeProvider,
  gemini: geminiProvider,
  openai: openaiProvider,
}

export function getProvider(id: ProviderId): Provider {
  return PROVIDERS[id]
}

/** Provider ids with their availability — for GET /api/ai/providers. Never exposes keys. */
export async function listProviders(): Promise<Array<{ id: ProviderId; configured: boolean }>> {
  await ensureApiKeysLoaded()
  return (Object.keys(PROVIDERS) as ProviderId[]).map(id => ({ id, configured: PROVIDERS[id].available() }))
}

// ── Routing ──────────────────────────────────────────────────────────────────

export interface AiCallOptions {
  /** Task name used to look up a per-task provider, e.g. 'classify', 'explain', 'insights'. */
  task?: string
  /** Explicit provider (e.g. the user's per-click choice). Refused, not downgraded, if it can't be honoured. */
  provider?: ProviderId
  /**
   * Result of `cloudSafe(item)` for the content in this prompt. `false` pins the call to Ollama.
   * Omit for content that is not item data (e.g. a search query).
   */
  cloudSafe?: boolean
  /** User-initiated calls surface provider errors instead of silently falling back to Ollama. */
  userInitiated?: boolean
  /** Called once with the provider/model that actually produced the answer (after any fallback). */
  onProvider?: (info: { provider: ProviderId; model: string }) => void
}

function resolveProvider(config: AiConfig, opts: AiCallOptions): ProviderId {
  const explicit = opts.provider !== undefined
  const requested: ProviderId =
    opts.provider ?? (opts.task ? config.perTask[opts.task] : undefined) ?? config.provider

  if (requested === 'ollama') return 'ollama'

  // Every reason a cloud provider can't be used. For explicit requests this is an error the
  // caller sees; for default routing the call quietly stays on Ollama.
  let blockedReason: string | null = null
  if (config.strictLocal) blockedReason = 'Strict Local Mode is on'
  else if (!config.allowCloud) blockedReason = 'cloud AI is not enabled in Settings'
  else if (opts.cloudSafe === false) blockedReason = 'this content is marked private and may not leave your machine'
  else if (!PROVIDERS[requested].available()) blockedReason = `no API key is configured for ${requested}`

  if (blockedReason) {
    if (explicit) throw new AiProviderError(requested, 'blocked', `Cannot use ${requested}: ${blockedReason}`)
    return 'ollama'
  }
  return requested
}

export async function aiChat(
  prompt: string,
  system?: string,
  format?: string | object,
  options?: Record<string, any>,
  signal?: AbortSignal,
  opts: AiCallOptions = {},
): Promise<string> {
  await ensureApiKeysLoaded()
  const config = await getAiConfig()
  const providerId = resolveProvider(config, opts)
  const req: ChatRequest = { prompt, system, format, options, signal, config }

  const report = (id: ProviderId) => opts.onProvider?.({ provider: id, model: PROVIDERS[id].model(config) })

  if (providerId === 'ollama') {
    const out = await ollamaProvider.chat(req)
    report('ollama')
    return out
  }

  try {
    const out = await PROVIDERS[providerId].chat(req)
    report(providerId)
    return out
  } catch (err) {
    // Background work degrades to Ollama; user-initiated and explicitly-chosen calls surface the error.
    if (opts.userInitiated || opts.provider !== undefined || signal?.aborted) throw err
    logger.warn(
      { provider: providerId, task: opts.task, err: err instanceof Error ? err.message : String(err) },
      'Cloud AI call failed — falling back to Ollama',
    )
    const out = await ollamaProvider.chat(req)
    report('ollama')
    return out
  }
}

// ── Embeddings ───────────────────────────────────────────────────────────────

export type EmbedKind = 'document' | 'query'
export interface EmbedOptions {
  /** 'document' for stored items, 'query' for a search/Ask question (cloud models embed the two differently). */
  kind?: EmbedKind
  signal?: AbortSignal
}

const EMBED_TIMEOUT_MS = 30_000
const EMBED_MAX_ATTEMPTS = 3
const EMBED_BACKOFF_MS = 500

/** Scales a vector to unit length. Cloud models return shortened (768-dim) vectors that are not normalised. */
export function l2Normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0))
  if (!Number.isFinite(norm) || norm === 0) return v
  return v.map(x => x / norm)
}

/** Rejects anything that would not fit the vector(768) columns, rather than letting Postgres or a bad vector decide. */
function checkVector(provider: ProviderId, values: number[] | undefined): number[] {
  if (!values || values.length !== EMBEDDING_DIMENSIONS || values.some(x => typeof x !== 'number' || !Number.isFinite(x))) {
    throw new AiProviderError(
      provider, 'bad_response',
      `${provider} returned ${values ? values.length : 'no'} embedding values, expected ${EMBEDDING_DIMENSIONS}`,
    )
  }
  if (values.every(x => x === 0)) throw new AiProviderError(provider, 'bad_response', `${provider} returned an all-zero embedding`)
  return l2Normalize(values)
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason) }, { once: true })
  })

/** Retries rate limits and 5xx with exponential backoff; auth, blocked and bad responses fail at once. */
async function withEmbedRetry<T>(provider: ProviderId, call: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await call()
    } catch (err) {
      const e = toProviderError(provider, err)
      const retryable = e.kind === 'rate_limit' || (e.status !== undefined && e.status >= 500)
      if (!retryable || attempt >= EMBED_MAX_ATTEMPTS || signal?.aborted) throw e
      logger.warn({ provider, attempt, kind: e.kind }, 'Embedding call failed, retrying')
      await sleep(EMBED_BACKOFF_MS * 2 ** (attempt - 1), signal)
    }
  }
}

async function geminiEmbed(text: string, model: string, kind: EmbedKind, signal?: AbortSignal): Promise<number[]> {
  try {
    const res = await getGeminiClient().models.embedContent({
      model,
      contents: text,
      config: {
        outputDimensionality: EMBEDDING_DIMENSIONS,
        // gemini-embedding-2 normalises itself and has no task types; -001 wants them.
        ...(/embedding-2/i.test(model) ? {} : { taskType: kind === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT' }),
        abortSignal: signal ? AbortSignal.any([signal, AbortSignal.timeout(EMBED_TIMEOUT_MS)]) : AbortSignal.timeout(EMBED_TIMEOUT_MS),
      },
    })
    return checkVector('gemini', res.embeddings?.[0]?.values)
  } catch (err) {
    throw toProviderError('gemini', err)
  }
}

async function openaiEmbed(text: string, model: string, signal?: AbortSignal): Promise<number[]> {
  try {
    const res = await getOpenAIClient().embeddings.create(
      { model, input: text, dimensions: EMBEDDING_DIMENSIONS },
      { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(EMBED_TIMEOUT_MS)]) : AbortSignal.timeout(EMBED_TIMEOUT_MS) },
    )
    return checkVector('openai', res.data[0]?.embedding)
  } catch (err) {
    throw toProviderError('openai', err)
  }
}

/**
 * Embeds text with the ACTIVE embedding model (settings `embedding_provider` / `embedding_model`, default local
 * Ollama). A cloud model is used only under the same rules as chat: Strict Local Mode off, cloud consent on, key set.
 * Otherwise this throws a `blocked` AiProviderError and never falls back to another model, because vectors from
 * different models are not comparable. Per-item privacy (`cloudSafe`) is enforced by the caller that stores vectors.
 */
export async function aiEmbed(text: string, opts: EmbedOptions = {}): Promise<number[]> {
  const active = activeEmbedding()
  if (active.provider === 'ollama') return ollamaEmbed(text)

  await ensureApiKeysLoaded()
  const config = await getAiConfig()
  const provider: ProviderId = active.provider
  let blockedReason: string | null = null
  if (config.strictLocal) blockedReason = 'Strict Local Mode is on'
  else if (!config.allowCloud) blockedReason = 'cloud AI is not enabled in Settings'
  else if (!PROVIDERS[provider].available()) blockedReason = `no API key is configured for ${provider}`
  if (blockedReason) throw new AiProviderError(provider, 'blocked', `Cannot embed with ${provider}: ${blockedReason}`)

  const kind = opts.kind ?? 'document'
  return withEmbedRetry(
    provider,
    () => (provider === 'gemini' ? geminiEmbed(text, active.model, kind, opts.signal) : openaiEmbed(text, active.model, opts.signal)),
    opts.signal,
  )
}

/** The provider `aiChat` would use for these options right now (does not make a call). */
export async function activeProvider(opts: AiCallOptions = {}): Promise<ProviderId> {
  try {
    await ensureApiKeysLoaded()
    return resolveProvider(await getAiConfig(), opts)
  } catch {
    return 'ollama'
  }
}

/** `<provider>:<model>` label for `items.extraction_model`. */
export async function activeModelLabel(opts: AiCallOptions = {}): Promise<string> {
  await ensureApiKeysLoaded()
  const config = await getAiConfig()
  let id: ProviderId
  try {
    id = resolveProvider(config, opts)
  } catch {
    id = 'ollama'
  }
  return `${id}:${PROVIDERS[id].model(config)}`
}
