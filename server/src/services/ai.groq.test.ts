import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AiConfig } from './settings.js'

const mockGetAiConfig = vi.fn()
vi.mock('./settings.js', () => ({ getAiConfig: () => mockGetAiConfig(), getSetting: vi.fn() }))

const mockOllamaChat = vi.fn()
vi.mock('./ollama.js', () => ({
  ollamaChat: (...a: unknown[]) => mockOllamaChat(...a),
  ollamaEmbed: vi.fn(),
}))
vi.mock('../lib/logger.js', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))

const GROQ_SECRET = 'gsk_live_groq_secret_123'
const OPENAI_SECRET = 'sk-openai-must-not-be-used'
const stored: Record<string, string | undefined> = {}
vi.mock('./apiKeys.js', () => ({
  peekApiKey: (p: string) => stored[p],
  ensureApiKeysLoaded: vi.fn().mockResolvedValue(undefined),
  redactSecrets: (t: string) => t.split(GROQ_SECRET).join('[redacted]'),
}))

vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: vi.fn() } } }))
vi.mock('@google/genai', () => ({ GoogleGenAI: class { models = { generateContent: vi.fn(), embedContent: vi.fn() } } }))

// Both OpenAI and Groq use this class; the constructor options tell them apart.
const ctorCalls: Array<{ apiKey?: string; baseURL?: string }> = []
const mockCreate = vi.fn()
vi.mock('openai', () => ({
  default: class {
    constructor(opts: { apiKey?: string; baseURL?: string }) { ctorCalls.push(opts) }
    chat = { completions: { create: (...a: unknown[]) => mockCreate(...a) } }
    embeddings = { create: vi.fn() }
  },
}))

import { aiChat, activeModelLabel, listProviders, AiProviderError, GROQ_BASE_URL } from './ai.js'

const cfg = (over: Partial<AiConfig> = {}): AiConfig => ({
  model: 'llama3.2', useClaude: false, strictLocal: false, provider: 'groq',
  claudeModel: 'c', geminiModel: 'g', openaiModel: 'o', groqModel: 'openai/gpt-oss-120b',
  perTask: {}, allowCloud: true, ...over,
})
const reply = (content: string | null, finish = 'stop') => ({ choices: [{ message: { content }, finish_reason: finish }] })
const apiError = (status: number, message = 'boom') => Object.assign(new Error(message), { status })
const body = (n = 0) => mockCreate.mock.calls[n][0] as Record<string, any>

beforeEach(() => {
  vi.clearAllMocks()
  ctorCalls.length = 0
  for (const k of Object.keys(stored)) delete stored[k]
  stored.groq = GROQ_SECRET
  stored.openai = OPENAI_SECRET
  mockGetAiConfig.mockResolvedValue(cfg())
  mockCreate.mockResolvedValue(reply('hello from groq'))
  mockOllamaChat.mockResolvedValue('hello from ollama')
})
afterEach(() => vi.restoreAllMocks())

describe('Groq provider — connection', () => {
  // The SDK client is cached per key, so each test uses a key no other test has used.
  it('uses the OpenAI SDK pointed at Groq with the Groq key, never the OpenAI key', async () => {
    stored.groq = 'gsk_key_for_the_connection_test'
    await aiChat('hi')
    expect(GROQ_BASE_URL).toBe('https://api.groq.com/openai/v1')
    expect(ctorCalls).toEqual([{ apiKey: 'gsk_key_for_the_connection_test', baseURL: GROQ_BASE_URL }])
    expect(ctorCalls.some(c => c.apiKey === OPENAI_SECRET)).toBe(false)
  })

  it('rebuilds the client when the key changes at runtime', async () => {
    stored.groq = 'gsk_first_key_111'
    await aiChat('hi')
    const before = ctorCalls.length
    stored.groq = 'gsk_second_key_222'
    await aiChat('hi')
    expect(ctorCalls.slice(before)).toEqual([{ apiKey: 'gsk_second_key_222', baseURL: GROQ_BASE_URL }])
  })

  it('reuses the client while the key is unchanged', async () => {
    stored.groq = 'gsk_key_for_the_reuse_test'
    await aiChat('hi')
    const built = ctorCalls.length
    await aiChat('hi')
    await aiChat('hi')
    expect(ctorCalls.length).toBe(built)
  })
})

describe('Groq provider — request', () => {
  it('sends the configured model, the system prompt and the user prompt', async () => {
    expect(await aiChat('What is 2+2?', 'Be brief.', undefined, undefined, undefined, { task: 'ask' })).toBe('hello from groq')
    const b = body()
    expect(b.model).toBe('openai/gpt-oss-120b')
    expect(b.messages).toEqual([{ role: 'system', content: 'Be brief.' }, { role: 'user', content: 'What is 2+2?' }])
    expect(b).not.toHaveProperty('response_format')
    expect(mockOllamaChat).not.toHaveBeenCalled()
  })

  it('omits the system message when there is none', async () => {
    await aiChat('hi')
    expect(body().messages).toEqual([{ role: 'user', content: 'hi' }])
  })

  it('uses max_completion_tokens (max_tokens is deprecated) and passes the temperature through', async () => {
    mockGetAiConfig.mockResolvedValue(cfg({ groqModel: 'llama-3.3-70b-versatile' }))
    await aiChat('hi', undefined, undefined, { max_tokens: 300, temperature: 0 })
    expect(body()).toMatchObject({ max_completion_tokens: 300, temperature: 0 })
    expect(body()).not.toHaveProperty('max_tokens')
  })

  it('defaults the token cap to 2048 for a non-reasoning model', async () => {
    mockGetAiConfig.mockResolvedValue(cfg({ groqModel: 'llama-3.3-70b-versatile' }))
    await aiChat('hi')
    expect(body().max_completion_tokens).toBe(2048)
  })

  it.each(['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3-32b', 'deepseek-r1-distill-llama-70b'])(
    'floors the token cap for the reasoning model %s so hidden reasoning cannot leave an empty reply',
    async (model) => {
      mockGetAiConfig.mockResolvedValue(cfg({ groqModel: model }))
      await aiChat('hi', undefined, undefined, { max_tokens: 20 })
      expect(body().max_completion_tokens).toBe(4096)
    },
  )

  it('keeps a larger cap than the floor', async () => {
    await aiChat('hi', undefined, undefined, { max_tokens: 8000 })
    expect(body().max_completion_tokens).toBe(8000)
  })

  it('passes a timeout/abort signal', async () => {
    await aiChat('hi')
    expect(mockCreate.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })
})

describe('Groq provider — JSON mode', () => {
  it('asks for a JSON object and tells the model to answer in JSON', async () => {
    mockCreate.mockResolvedValue(reply('{"ok":true}'))
    const out = await aiChat('classify', 'You classify.', 'json')
    expect(out).toBe('{"ok":true}')
    expect(body().response_format).toEqual({ type: 'json_object' })
    expect(body().messages[0].content).toMatch(/You classify\./)
    expect(body().messages[0].content).toMatch(/JSON/)
  })

  it('strips code fences some models add anyway', async () => {
    mockCreate.mockResolvedValue(reply('```json\n{"ok":true}\n```'))
    expect(await aiChat('classify', undefined, 'json')).toBe('{"ok":true}')
  })

  it('retries once without JSON mode when the model rejects it', async () => {
    mockCreate
      .mockRejectedValueOnce(apiError(400, "400 response_format json_object is not supported with this model"))
      .mockResolvedValueOnce(reply('{"ok":true}'))
    expect(await aiChat('classify', undefined, 'json')).toBe('{"ok":true}')
    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(body(0)).toHaveProperty('response_format')
    expect(body(1)).not.toHaveProperty('response_format')
    expect(body(1).messages).toEqual(body(0).messages) // the prompt already asks for JSON
  })

  it('does not retry a 400 that is not about JSON mode', async () => {
    mockCreate.mockRejectedValue(apiError(400, 'The model does not exist'))
    await expect(aiChat('classify', undefined, 'json', undefined, undefined, { provider: 'groq' })).rejects.toMatchObject({ provider: 'groq' })
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('does not retry other errors, and does not retry when JSON mode was not requested', async () => {
    mockCreate.mockRejectedValue(apiError(400, 'json is mentioned but no format was asked for'))
    await expect(aiChat('hi', undefined, undefined, undefined, undefined, { provider: 'groq' })).rejects.toBeInstanceOf(AiProviderError)
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })
})

describe('Groq provider — errors', () => {
  const explicit = { provider: 'groq' as const }

  it('reports an empty reply with the finish reason', async () => {
    mockCreate.mockResolvedValue(reply(null, 'length'))
    await expect(aiChat('hi', undefined, undefined, undefined, undefined, explicit))
      .rejects.toMatchObject({ provider: 'groq', kind: 'bad_response', message: 'Groq returned no text (finish_reason: length)' })
  })

  it.each([
    [429, 'rate_limit'],
    [401, 'auth'],
    [403, 'auth'],
    [503, 'unavailable'],
  ])('maps HTTP %i to %s', async (status, kind) => {
    mockCreate.mockRejectedValue(apiError(status))
    await expect(aiChat('hi', undefined, undefined, undefined, undefined, explicit)).rejects.toMatchObject({ provider: 'groq', kind, status })
  })

  it('maps a timeout', async () => {
    mockCreate.mockRejectedValue(Object.assign(new Error('timed out'), { name: 'TimeoutError' }))
    await expect(aiChat('hi', undefined, undefined, undefined, undefined, explicit)).rejects.toMatchObject({ kind: 'timeout' })
  })

  it('never lets the key reach an error message', async () => {
    mockCreate.mockRejectedValue(apiError(401, `Invalid API Key: ${GROQ_SECRET}`))
    const err = await aiChat('hi', undefined, undefined, undefined, undefined, explicit).catch(e => e)
    expect(err.message).not.toContain(GROQ_SECRET)
    expect(err.message).toContain('[redacted]')
  })

  it('background calls fall back to Ollama when Groq fails; explicit or user-initiated calls surface the error', async () => {
    mockCreate.mockRejectedValue(apiError(503))
    expect(await aiChat('hi')).toBe('hello from ollama')
    await expect(aiChat('hi', undefined, undefined, undefined, undefined, { userInitiated: true })).rejects.toMatchObject({ provider: 'groq' })
  })
})

describe('Groq provider — consent and privacy rules', () => {
  it('stays on Ollama without cloud consent', async () => {
    mockGetAiConfig.mockResolvedValue(cfg({ allowCloud: false }))
    expect(await aiChat('hi')).toBe('hello from ollama')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('stays on Ollama without a key', async () => {
    delete stored.groq
    expect(await aiChat('hi')).toBe('hello from ollama')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('never receives content marked private', async () => {
    expect(await aiChat('secret note', undefined, undefined, undefined, undefined, { cloudSafe: false })).toBe('hello from ollama')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('is refused (not silently downgraded) when explicitly chosen but not allowed', async () => {
    mockGetAiConfig.mockResolvedValue(cfg({ strictLocal: true, allowCloud: false, provider: 'ollama' }))
    await expect(aiChat('hi', undefined, undefined, undefined, undefined, { provider: 'groq' }))
      .rejects.toMatchObject({ kind: 'blocked', provider: 'groq' })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('can be chosen per task while the default stays local', async () => {
    mockGetAiConfig.mockResolvedValue(cfg({ provider: 'ollama', perTask: { explain: 'groq' } }))
    expect(await aiChat('hi', undefined, undefined, undefined, undefined, { task: 'explain' })).toBe('hello from groq')
    expect(await aiChat('hi', undefined, undefined, undefined, undefined, { task: 'classify' })).toBe('hello from ollama')
  })

  it('reports which provider and model answered', async () => {
    const onProvider = vi.fn()
    await aiChat('hi', undefined, undefined, undefined, undefined, { onProvider })
    expect(onProvider).toHaveBeenCalledWith({ provider: 'groq', model: 'openai/gpt-oss-120b' })
    expect(await activeModelLabel()).toBe('groq:openai/gpt-oss-120b')
  })
})

describe('listProviders', () => {
  it('includes Groq, available only with a key', async () => {
    expect((await listProviders()).find(p => p.id === 'groq')).toEqual({ id: 'groq', configured: true })
    delete stored.groq
    expect((await listProviders()).find(p => p.id === 'groq')).toEqual({ id: 'groq', configured: false })
  })
})
