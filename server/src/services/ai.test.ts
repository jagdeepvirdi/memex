import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AiConfig } from './settings.js'

const mockGetAiConfig = vi.fn()
vi.mock('./settings.js', () => ({ getAiConfig: () => mockGetAiConfig() }))

const mockOllamaChat = vi.fn()
vi.mock('./ollama.js', () => ({
  ollamaChat: (...a: unknown[]) => mockOllamaChat(...a),
  ollamaEmbed: vi.fn(),
}))

vi.mock('../lib/logger.js', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))

const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: (...a: unknown[]) => mockCreate(...a) }
  },
}))

const mockGenerate = vi.fn()
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: (...a: unknown[]) => mockGenerate(...a) }
  },
}))

import { aiChat, activeProvider, activeModelLabel, listProviders, AiProviderError } from './ai.js'

const OLD = { a: process.env.ANTHROPIC_API_KEY, g: process.env.GEMINI_API_KEY }

function cfg(over: Partial<AiConfig> = {}): AiConfig {
  return {
    model: 'llama3.2', useClaude: false, strictLocal: false,
    provider: 'ollama', claudeModel: 'claude-test', geminiModel: 'gemini-test',
    perTask: {}, allowCloud: false,
    ...over,
  }
}
const cloud = (over: Partial<AiConfig> = {}) => cfg({ allowCloud: true, ...over })

beforeEach(() => {
  vi.clearAllMocks()
  process.env.ANTHROPIC_API_KEY = 'test-key'
  process.env.GEMINI_API_KEY = 'test-key'
  mockOllamaChat.mockResolvedValue('from-ollama')
  mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'from-claude' }] })
  mockGenerate.mockResolvedValue({ text: 'from-gemini' })
})

afterEach(() => {
  if (OLD.a === undefined) delete process.env.ANTHROPIC_API_KEY
  else process.env.ANTHROPIC_API_KEY = OLD.a
  if (OLD.g === undefined) delete process.env.GEMINI_API_KEY
  else process.env.GEMINI_API_KEY = OLD.g
})

describe('aiChat routing', () => {
  it('uses Ollama by default', async () => {
    mockGetAiConfig.mockResolvedValue(cfg())
    expect(await aiChat('hi')).toBe('from-ollama')
    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it('uses Claude when it is the provider, consent is given and a key is set', async () => {
    mockGetAiConfig.mockResolvedValue(cloud({ provider: 'claude' }))
    expect(await aiChat('hi')).toBe('from-claude')
    expect(mockOllamaChat).not.toHaveBeenCalled()
    expect(mockCreate.mock.calls[0][0].model).toBe('claude-test')
  })

  it('uses Gemini when it is the provider', async () => {
    mockGetAiConfig.mockResolvedValue(cloud({ provider: 'gemini' }))
    expect(await aiChat('hi')).toBe('from-gemini')
    expect(mockGenerate.mock.calls[0][0].model).toBe('gemini-test')
  })

  it('stays on Ollama when the cloud provider has no key', async () => {
    delete process.env.ANTHROPIC_API_KEY
    mockGetAiConfig.mockResolvedValue(cloud({ provider: 'claude' }))
    expect(await aiChat('hi')).toBe('from-ollama')
  })

  it('stays on Ollama when cloud consent is off, even with a key', async () => {
    mockGetAiConfig.mockResolvedValue(cfg({ provider: 'claude', allowCloud: false }))
    expect(await aiChat('hi')).toBe('from-ollama')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('never calls a cloud provider in strict local mode', async () => {
    mockGetAiConfig.mockResolvedValue(cloud({ provider: 'claude', strictLocal: true, perTask: { x: 'gemini' } }))
    expect(await aiChat('hi', undefined, undefined, undefined, undefined, { task: 'x' })).toBe('from-ollama')
    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it('honours a per-task provider over the default', async () => {
    mockGetAiConfig.mockResolvedValue(cloud({ provider: 'ollama', perTask: { explain: 'gemini' } }))
    expect(await aiChat('hi', undefined, undefined, undefined, undefined, { task: 'explain' })).toBe('from-gemini')
    expect(await aiChat('hi', undefined, undefined, undefined, undefined, { task: 'classify' })).toBe('from-ollama')
  })

  it('lets a per-task "ollama" override a cloud default', async () => {
    mockGetAiConfig.mockResolvedValue(cloud({ provider: 'claude', perTask: { classify: 'ollama' } }))
    expect(await aiChat('hi', undefined, undefined, undefined, undefined, { task: 'classify' })).toBe('from-ollama')
  })

  it('pins the call to Ollama when the content is not cloud-safe', async () => {
    mockGetAiConfig.mockResolvedValue(cloud({ provider: 'claude' }))
    expect(await aiChat('hi', undefined, undefined, undefined, undefined, { cloudSafe: false })).toBe('from-ollama')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('passes the abort signal through to Ollama', async () => {
    mockGetAiConfig.mockResolvedValue(cfg())
    const ctl = new AbortController()
    await aiChat('hi', 'sys', 'json', { temperature: 0 }, ctl.signal)
    expect(mockOllamaChat).toHaveBeenCalledWith('hi', 'sys', 'llama3.2', 'json', { temperature: 0 }, ctl.signal)
  })
})

describe('explicit provider requests', () => {
  const explicit = (provider: 'claude' | 'gemini', extra = {}) =>
    aiChat('hi', undefined, undefined, undefined, undefined, { provider, ...extra })

  it('runs on the chosen provider', async () => {
    mockGetAiConfig.mockResolvedValue(cloud())
    expect(await explicit('gemini')).toBe('from-gemini')
  })

  it.each([
    ['strict local mode', cloud({ strictLocal: true }), {}],
    ['cloud consent off', cfg(), {}],
    ['private content', cloud(), { cloudSafe: false }],
  ])('is refused (not silently downgraded) under %s', async (_name, config, extra) => {
    mockGetAiConfig.mockResolvedValue(config)
    await expect(explicit('claude', extra)).rejects.toMatchObject({ name: 'AiProviderError', kind: 'blocked' })
    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockOllamaChat).not.toHaveBeenCalled()
  })

  it('is refused when the key is missing', async () => {
    delete process.env.GEMINI_API_KEY
    mockGetAiConfig.mockResolvedValue(cloud())
    await expect(explicit('gemini')).rejects.toMatchObject({ kind: 'blocked' })
  })
})

describe('JSON mode', () => {
  it('asks Claude for JSON in the system prompt and strips code fences', async () => {
    mockGetAiConfig.mockResolvedValue(cloud({ provider: 'claude' }))
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '```json\n{"a":1}\n```' }] })
    const out = await aiChat('hi', 'You classify.', 'json')
    expect(out).toBe('{"a":1}')
    expect(mockCreate.mock.calls[0][0].system).toContain('You classify.')
    expect(mockCreate.mock.calls[0][0].system).toContain('ONLY valid JSON')
  })

  it('does not alter plain-text Claude responses', async () => {
    mockGetAiConfig.mockResolvedValue(cloud({ provider: 'claude' }))
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '```not json```' }] })
    expect(await aiChat('hi')).toBe('```not json```')
    expect(mockCreate.mock.calls[0][0].system).toBeUndefined()
  })

  it('sets responseMimeType for Gemini JSON calls only', async () => {
    mockGetAiConfig.mockResolvedValue(cloud({ provider: 'gemini' }))
    await aiChat('hi', undefined, 'json', { temperature: 0 })
    expect(mockGenerate.mock.calls[0][0].config).toMatchObject({ responseMimeType: 'application/json', temperature: 0 })
    await aiChat('hi')
    expect(mockGenerate.mock.calls[1][0].config.responseMimeType).toBeUndefined()
  })

  it('includes a schema object in the JSON instruction', async () => {
    mockGetAiConfig.mockResolvedValue(cloud({ provider: 'claude' }))
    await aiChat('hi', undefined, { type: 'object' })
    expect(mockCreate.mock.calls[0][0].system).toContain('{"type":"object"}')
  })

  it('maps num_predict/max_tokens onto the cloud token cap', async () => {
    mockGetAiConfig.mockResolvedValue(cloud({ provider: 'claude' }))
    await aiChat('hi', undefined, undefined, { num_predict: 512 })
    expect(mockCreate.mock.calls[0][0].max_tokens).toBe(512)
  })
})

describe('provider failures', () => {
  it('falls back to Ollama for background calls on a 429', async () => {
    mockGetAiConfig.mockResolvedValue(cloud({ provider: 'claude' }))
    mockCreate.mockRejectedValue(Object.assign(new Error('slow down'), { status: 429 }))
    expect(await aiChat('hi')).toBe('from-ollama')
  })

  it('surfaces the error for user-initiated calls', async () => {
    mockGetAiConfig.mockResolvedValue(cloud({ provider: 'claude' }))
    mockCreate.mockRejectedValue(Object.assign(new Error('slow down'), { status: 429 }))
    await expect(
      aiChat('hi', undefined, undefined, undefined, undefined, { userInitiated: true })
    ).rejects.toMatchObject({ name: 'AiProviderError', kind: 'rate_limit', provider: 'claude', status: 429 })
    expect(mockOllamaChat).not.toHaveBeenCalled()
  })

  it('surfaces the error when the provider was chosen explicitly', async () => {
    mockGetAiConfig.mockResolvedValue(cloud())
    mockGenerate.mockRejectedValue(Object.assign(new Error('bad key'), { status: 401 }))
    await expect(
      aiChat('hi', undefined, undefined, undefined, undefined, { provider: 'gemini' })
    ).rejects.toMatchObject({ kind: 'auth', provider: 'gemini' })
  })

  it('maps timeouts and unknown failures to one error type', async () => {
    mockGetAiConfig.mockResolvedValue(cloud())
    const opts = { provider: 'claude' as const }
    mockCreate.mockRejectedValueOnce(Object.assign(new Error('t'), { name: 'AbortError' }))
    await expect(aiChat('hi', undefined, undefined, undefined, undefined, opts)).rejects.toMatchObject({ kind: 'timeout' })
    mockCreate.mockRejectedValueOnce(new Error('boom'))
    await expect(aiChat('hi', undefined, undefined, undefined, undefined, opts)).rejects.toBeInstanceOf(AiProviderError)
  })

  it('treats an empty Gemini response as a bad_response', async () => {
    mockGetAiConfig.mockResolvedValue(cloud())
    mockGenerate.mockResolvedValue({ text: undefined })
    await expect(
      aiChat('hi', undefined, undefined, undefined, undefined, { provider: 'gemini' })
    ).rejects.toMatchObject({ kind: 'bad_response' })
  })

  it('does not fall back when the caller aborted', async () => {
    mockGetAiConfig.mockResolvedValue(cloud({ provider: 'claude' }))
    const ctl = new AbortController()
    ctl.abort()
    mockCreate.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    await expect(aiChat('hi', undefined, undefined, undefined, ctl.signal)).rejects.toBeInstanceOf(AiProviderError)
    expect(mockOllamaChat).not.toHaveBeenCalled()
  })
})

describe('activeProvider / activeModelLabel / listProviders', () => {
  it('reports ollama in strict local mode regardless of provider settings', async () => {
    mockGetAiConfig.mockResolvedValue(cloud({ provider: 'claude', strictLocal: true }))
    expect(await activeProvider()).toBe('ollama')
  })

  it('reports the resolved cloud provider, honouring per-task overrides', async () => {
    mockGetAiConfig.mockResolvedValue(cloud({ provider: 'claude', perTask: { explain: 'gemini' } }))
    expect(await activeProvider()).toBe('claude')
    expect(await activeProvider({ task: 'explain' })).toBe('gemini')
  })

  it('does not throw for a blocked explicit provider — it reports ollama', async () => {
    mockGetAiConfig.mockResolvedValue(cfg())
    expect(await activeProvider({ provider: 'claude' })).toBe('ollama')
  })

  it('labels extraction models as <provider>:<model>', async () => {
    mockGetAiConfig.mockResolvedValue(cloud({ provider: 'claude' }))
    expect(await activeModelLabel()).toBe('claude:claude-test')
    mockGetAiConfig.mockResolvedValue(cfg())
    expect(await activeModelLabel()).toBe('ollama:llama3.2')
  })

  it('lists provider availability without exposing keys', () => {
    delete process.env.GEMINI_API_KEY
    const list = listProviders()
    expect(list).toEqual([
      { id: 'ollama', configured: true },
      { id: 'claude', configured: true },
      { id: 'gemini', configured: false },
    ])
    expect(JSON.stringify(list)).not.toContain('test-key')
  })
})

describe('onProvider callback', () => {
  const call = (onProvider: (i: unknown) => void, extra = {}) =>
    aiChat('hi', undefined, undefined, undefined, undefined, { onProvider, ...extra })

  it('reports the provider and model that answered', async () => {
    mockGetAiConfig.mockResolvedValue(cloud({ provider: 'gemini' }))
    const seen = vi.fn()
    await call(seen)
    expect(seen).toHaveBeenCalledWith({ provider: 'gemini', model: 'gemini-test' })
  })

  it('reports ollama when the call stays local', async () => {
    mockGetAiConfig.mockResolvedValue(cfg())
    const seen = vi.fn()
    await call(seen)
    expect(seen).toHaveBeenCalledWith({ provider: 'ollama', model: 'llama3.2' })
  })

  it('reports ollama after a cloud failure falls back', async () => {
    mockGetAiConfig.mockResolvedValue(cloud({ provider: 'claude' }))
    mockCreate.mockRejectedValue(Object.assign(new Error('x'), { status: 429 }))
    const seen = vi.fn()
    await call(seen)
    expect(seen).toHaveBeenCalledTimes(1)
    expect(seen).toHaveBeenCalledWith({ provider: 'ollama', model: 'llama3.2' })
  })

  it('does not report when the call fails', async () => {
    mockGetAiConfig.mockResolvedValue(cloud())
    mockCreate.mockRejectedValue(new Error('x'))
    const seen = vi.fn()
    await expect(call(seen, { provider: 'claude' })).rejects.toBeInstanceOf(AiProviderError)
    expect(seen).not.toHaveBeenCalled()
  })
})
