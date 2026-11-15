import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenAI } from '@google/genai'
import { ollamaChat, ollamaEmbed } from './ollama.js'
import { getAiConfig, type AiConfig, type ProviderId } from './settings.js'
import logger from '../lib/logger.js'
import { peekApiKey, ensureApiKeysLoaded, redactSecrets } from './apiKeys.js'

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

const PROVIDERS: Record<ProviderId, Provider> = {
  ollama: ollamaProvider,
  claude: claudeProvider,
  gemini: geminiProvider,
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

// Embeddings always go through Ollama — Anthropic has no embeddings API and vectors must stay comparable.
export async function aiEmbed(text: string): Promise<number[]> {
  return ollamaEmbed(text)
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
