import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AiConfig } from './settings.js'

const mockGetAiConfig = vi.fn()
vi.mock('./settings.js', () => ({ getAiConfig: () => mockGetAiConfig(), getSetting: vi.fn() }))

const mockOllamaEmbed = vi.fn()
vi.mock('./ollama.js', () => ({ ollamaChat: vi.fn(), ollamaEmbed: (...a: unknown[]) => mockOllamaEmbed(...a) }))
vi.mock('../lib/logger.js', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))

const SECRET = 'sk-live-embed-secret-123'
const stored: Record<string, string | undefined> = {}
vi.mock('./apiKeys.js', () => ({
  peekApiKey: (p: string) => stored[p],
  ensureApiKeysLoaded: vi.fn().mockResolvedValue(undefined),
  redactSecrets: (t: string) => t.split(SECRET).join('[redacted]'),
}))

vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: vi.fn() } } }))

const mockEmbedContent = vi.fn()
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: vi.fn(), embedContent: (...a: unknown[]) => mockEmbedContent(...a) }
  },
}))

const mockOpenAIEmbed = vi.fn()
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: vi.fn() } }
    embeddings = { create: (...a: unknown[]) => mockOpenAIEmbed(...a) }
  },
}))

import { aiEmbed, l2Normalize, AiProviderError } from './ai.js'
import { setActiveEmbedding, buildEmbedding } from './embeddingConfig.js'

const cfg = (over: Partial<AiConfig> = {}): AiConfig => ({
  model: 'llama3.2', useClaude: false, strictLocal: false, provider: 'ollama',
  claudeModel: 'c', geminiModel: 'g', openaiModel: 'o', groqModel: 'q', perTask: {}, allowCloud: true, ...over,
})
/** A 768-dim vector whose norm is `scale` (all weight on the first component). */
const vec = (scale: number, len = 768) => Array.from({ length: len }, (_, i) => (i === 0 ? scale : 0))
const norm = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0))
const geminiRes = (values: number[] | undefined) => ({ embeddings: values ? [{ values }] : [] })
const apiError = (status: number, message = 'boom') => Object.assign(new Error(message), { status })

beforeEach(() => {
  vi.clearAllMocks()
  for (const k of Object.keys(stored)) delete stored[k]
  stored.gemini = SECRET
  stored.openai = SECRET
  mockGetAiConfig.mockResolvedValue(cfg())
  mockEmbedContent.mockResolvedValue(geminiRes(vec(0.5)))
  mockOpenAIEmbed.mockResolvedValue({ data: [{ embedding: vec(3) }] })
  setActiveEmbedding(buildEmbedding('gemini'))
})
afterEach(() => {
  vi.useRealTimers()
  setActiveEmbedding(null)
})

describe('l2Normalize', () => {
  it('scales a vector to unit length', () => {
    expect(norm(l2Normalize([3, 4]))).toBeCloseTo(1, 10)
  })
  it('leaves a zero vector alone instead of dividing by zero', () => {
    expect(l2Normalize([0, 0])).toEqual([0, 0])
  })
})

describe('aiEmbed — local model', () => {
  it('uses Ollama and reads no settings or keys', async () => {
    setActiveEmbedding(null)
    mockOllamaEmbed.mockResolvedValueOnce([1, 2, 3])
    expect(await aiEmbed('hello', { kind: 'query' })).toEqual([1, 2, 3])
    expect(mockOllamaEmbed).toHaveBeenCalledWith('hello')
    expect(mockGetAiConfig).not.toHaveBeenCalled()
  })
})

describe('aiEmbed — Gemini', () => {
  it('asks for 768 dimensions and the document task type, and returns a unit-length vector', async () => {
    const v = await aiEmbed('a note', { kind: 'document' })
    const req = mockEmbedContent.mock.calls[0][0]
    expect(req.model).toBe('gemini-embedding-001')
    expect(req.contents).toBe('a note')
    expect(req.config).toMatchObject({ outputDimensionality: 768, taskType: 'RETRIEVAL_DOCUMENT' })
    expect(req.config.abortSignal).toBeInstanceOf(AbortSignal)
    expect(v).toHaveLength(768)
    expect(norm(v)).toBeCloseTo(1, 10) // the API returns 0.5 here: shortened vectors are not normalised
  })

  it('uses the query task type for a search question', async () => {
    await aiEmbed('what did I save', { kind: 'query' })
    expect(mockEmbedContent.mock.calls[0][0].config.taskType).toBe('RETRIEVAL_QUERY')
  })

  it('defaults to the document task type', async () => {
    await aiEmbed('x')
    expect(mockEmbedContent.mock.calls[0][0].config.taskType).toBe('RETRIEVAL_DOCUMENT')
  })

  it('omits the task type for gemini-embedding-2, which has none', async () => {
    setActiveEmbedding(buildEmbedding('gemini', 'gemini-embedding-2'))
    await aiEmbed('x')
    const req = mockEmbedContent.mock.calls[0][0]
    expect(req.model).toBe('gemini-embedding-2')
    expect(req.config).not.toHaveProperty('taskType')
  })
})

describe('aiEmbed — OpenAI', () => {
  beforeEach(() => setActiveEmbedding(buildEmbedding('openai')))

  it('asks for 768 dimensions and returns a unit-length vector', async () => {
    const v = await aiEmbed('a note')
    const [body, opts] = mockOpenAIEmbed.mock.calls[0]
    expect(body).toEqual({ model: 'text-embedding-3-small', input: 'a note', dimensions: 768 })
    expect(opts.signal).toBeInstanceOf(AbortSignal)
    expect(norm(v)).toBeCloseTo(1, 10)
  })

  it('uses the model id from settings', async () => {
    setActiveEmbedding(buildEmbedding('openai', 'text-embedding-3-large'))
    await aiEmbed('x')
    expect(mockOpenAIEmbed.mock.calls[0][0].model).toBe('text-embedding-3-large')
  })
})

describe('aiEmbed — consent and privacy gate', () => {
  const blockedWith = async (reason: RegExp) => {
    const err = await aiEmbed('x').catch((e) => e)
    expect(err).toBeInstanceOf(AiProviderError)
    expect(err).toMatchObject({ kind: 'blocked', provider: 'gemini' })
    expect(err.message).toMatch(reason)
    expect(mockEmbedContent).not.toHaveBeenCalled()
    expect(mockOllamaEmbed).not.toHaveBeenCalled() // never silently switches to another model
  }

  it('is blocked by Strict Local Mode', async () => {
    mockGetAiConfig.mockResolvedValue(cfg({ strictLocal: true, allowCloud: false }))
    await blockedWith(/Strict Local/)
  })

  it('is blocked without cloud consent', async () => {
    mockGetAiConfig.mockResolvedValue(cfg({ allowCloud: false }))
    await blockedWith(/not enabled/)
  })

  it('is blocked without an API key', async () => {
    delete stored.gemini
    await blockedWith(/no API key/)
  })
})

describe('aiEmbed — bad responses', () => {
  it('rejects a vector with the wrong number of dimensions', async () => {
    mockEmbedContent.mockResolvedValue(geminiRes(vec(1, 3072)))
    await expect(aiEmbed('x')).rejects.toMatchObject({ kind: 'bad_response', message: expect.stringMatching(/3072.*768|expected 768/) })
  })

  it('rejects an empty response', async () => {
    mockEmbedContent.mockResolvedValue(geminiRes(undefined))
    await expect(aiEmbed('x')).rejects.toMatchObject({ kind: 'bad_response' })
  })

  it('rejects an all-zero vector (it cannot be normalised or compared)', async () => {
    mockEmbedContent.mockResolvedValue(geminiRes(vec(0)))
    await expect(aiEmbed('x')).rejects.toMatchObject({ kind: 'bad_response' })
  })

  it('rejects non-finite values', async () => {
    const v = vec(1)
    v[5] = Number.NaN
    mockEmbedContent.mockResolvedValue(geminiRes(v))
    await expect(aiEmbed('x')).rejects.toMatchObject({ kind: 'bad_response' })
  })
})

describe('aiEmbed — errors and retries', () => {
  it('retries a rate limit with backoff and then succeeds', async () => {
    vi.useFakeTimers()
    mockEmbedContent.mockRejectedValueOnce(apiError(429)).mockRejectedValueOnce(apiError(429)).mockResolvedValueOnce(geminiRes(vec(1)))
    const p = aiEmbed('x')
    await vi.advanceTimersByTimeAsync(500 + 1000)
    expect(await p).toHaveLength(768)
    expect(mockEmbedContent).toHaveBeenCalledTimes(3)
  })

  it('gives up after three attempts and reports a rate limit', async () => {
    vi.useFakeTimers()
    mockEmbedContent.mockRejectedValue(apiError(429))
    const assertion = expect(aiEmbed('x')).rejects.toMatchObject({ kind: 'rate_limit', provider: 'gemini', status: 429 })
    await vi.advanceTimersByTimeAsync(500 + 1000 + 2000)
    await assertion
    expect(mockEmbedContent).toHaveBeenCalledTimes(3)
  })

  it('retries a server error', async () => {
    vi.useFakeTimers()
    mockEmbedContent.mockRejectedValueOnce(apiError(503)).mockResolvedValueOnce(geminiRes(vec(1)))
    const p = aiEmbed('x')
    await vi.advanceTimersByTimeAsync(500)
    await p
    expect(mockEmbedContent).toHaveBeenCalledTimes(2)
  })

  it('does not retry a bad key', async () => {
    mockEmbedContent.mockRejectedValue(apiError(401))
    await expect(aiEmbed('x')).rejects.toMatchObject({ kind: 'auth', status: 401 })
    expect(mockEmbedContent).toHaveBeenCalledTimes(1)
  })

  it('maps a timeout', async () => {
    mockEmbedContent.mockRejectedValue(Object.assign(new Error('timed out'), { name: 'TimeoutError' }))
    await expect(aiEmbed('x')).rejects.toMatchObject({ kind: 'timeout' })
  })

  it('stops retrying once the caller aborts', async () => {
    vi.useFakeTimers()
    const ctrl = new AbortController()
    mockEmbedContent.mockImplementation(async () => {
      ctrl.abort()
      throw apiError(429)
    })
    await expect(aiEmbed('x', { signal: ctrl.signal })).rejects.toMatchObject({ kind: 'rate_limit' })
    expect(mockEmbedContent).toHaveBeenCalledTimes(1)
  })

  it('never lets the API key reach an error message', async () => {
    mockEmbedContent.mockRejectedValue(apiError(400, `bad request for key ${SECRET}`))
    const err = await aiEmbed('x').catch((e) => e)
    expect(err.message).not.toContain(SECRET)
    expect(err.message).toContain('[redacted]')
  })

  it('wraps an OpenAI failure the same way', async () => {
    setActiveEmbedding(buildEmbedding('openai'))
    mockOpenAIEmbed.mockRejectedValue(apiError(401, `Incorrect API key provided: ${SECRET}`))
    const err = await aiEmbed('x').catch((e) => e)
    expect(err).toMatchObject({ provider: 'openai', kind: 'auth' })
    expect(err.message).not.toContain(SECRET)
  })
})
