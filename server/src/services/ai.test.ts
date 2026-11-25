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

// The real key store reads the database; keep this file deterministic. Env keys behave as before and
// `stored` simulates a key saved from Settings (env wins, like the real thing).
const stored: Record<string, string | undefined> = {}
const ENV_NAME: Record<string, string> = {
  claude: 'ANTHROPIC_API_KEY', gemini: 'GEMINI_API_KEY', openai: 'OPENAI_API_KEY', youtube: 'YOUTUBE_API_KEY',
}
const mockEnsureLoaded = vi.fn().mockResolvedValue(undefined)
vi.mock('./apiKeys.js', () => ({
  peekApiKey: (p: string) => process.env[ENV_NAME[p]] || stored[p],
  ensureApiKeysLoaded: () => mockEnsureLoaded(),
  redactSecrets: (t: string) => {
    let out = t
    for (const p of Object.keys(ENV_NAME)) {
      const k = process.env[ENV_NAME[p]] || stored[p]
      if (k) out = out.split(k).join('[redacted]')
    }
    return out
  },
}))

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

const mockOpenAI = vi.fn()
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: (...a: unknown[]) => mockOpenAI(...a) } }
  },
}))

import { aiChat, activeProvider, activeModelLabel, listProviders, AiProviderError } from './ai.js'

const OLD = { a: process.env.ANTHROPIC_API_KEY, g: process.env.GEMINI_API_KEY, o: process.env.OPENAI_API_KEY }

function cfg(over: Partial<AiConfig> = {}): AiConfig {
  return {
    model: 'llama3.2', useClaude: false, strictLocal: false,
    provider: 'ollama', claudeModel: 'claude-test', geminiModel: 'gemini-test', openaiModel: 'gpt-test', groqModel: 'groq-test',
    perTask: {}, allowCloud: false,
    ...over,
  }
}
const cloud = (over: Partial<AiConfig> = {}) => cfg({ allowCloud: true, ...over })

beforeEach(() => {
  vi.clearAllMocks()
  process.env.ANTHROPIC_API_KEY = 'test-key'
  process.env.GEMINI_API_KEY = 'test-key'
  process.env.OPENAI_API_KEY = 'test-key'
  for (const k of Object.keys(stored)) delete stored[k]
  mockOllamaChat.mockResolvedValue('from-ollama')
  mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'from-claude' }] })
  mockGenerate.mockResolvedValue({ text: 'from-gemini' })
  mockOpenAI.mockResolvedValue({ choices: [{ message: { content: 'from-openai' }, finish_reason: 'stop' }] })
})

afterEach(() => {
  if (OLD.a === undefined) delete process.env.ANTHROPIC_API_KEY
  else process.env.ANTHROPIC_API_KEY = OLD.a
  if (OLD.g === undefined) delete process.env.GEMINI_API_KEY
  else process.env.GEMINI_API_KEY = OLD.g
  if (OLD.o === undefined) delete process.env.OPENAI_API_KEY
  else process.env.OPENAI_API_KEY = OLD.o
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

describe('OpenAI provider', () => {
  const sent = () => mockOpenAI.mock.calls[0][0]

  it('uses OpenAI when it is the provider, with the configured model and a system + user message', async () => {
    mockGetAiConfig.mockResolvedValue(cloud({ provider: 'openai', openaiModel: 'gpt-4.1-mini' }))
    expect(await aiChat('hello', 'be brief')).toBe('from-openai')
    expect(mockOllamaChat).not.toHaveBeenCalled()
    expect(sent().model).toBe('gpt-4.1-mini')
    expect(sent().messages).toEqual([{ role: 'system', content: 'be brief' }, { role: 'user', content: 'hello' }])
    expect(sent().response_format).toBeUndefined()
  })

  it('omits the system message when there is none', async () => {
    mockGetAiConfig.mockResolvedValue(cloud({ provider: 'openai' }))
    await aiChat('hello')
    expect(sent().messages).toEqual([{ role: 'user', content: 'hello' }])
  })

  it('passes temperature and the token cap to a non-reasoning model', async () => {
    mockGetAiConfig.mockResolvedValue(cloud({ provider: 'openai', openaiModel: 'gpt-4.1-mini' }))
    await aiChat('hi', undefined, undefined, { temperature: 0, num_predict: 300 })
    expect(sent().temperature).toBe(0)
    expect(sent().max_completion_tokens).toBe(300)
    expect(sent().max_tokens).toBeUndefined()
  })

  it.each(['gpt-5.4-mini', 'gpt-5.2', 'o4-mini'])(
    'drops temperature and raises a tiny token cap for the reasoning model %s',
    async (openaiModel) => {
      mockGetAiConfig.mockResolvedValue(cloud({ provider: 'openai', openaiModel }))
      await aiChat('hi', undefined, undefined, { temperature: 0, num_predict: 16 })
      expect(sent()).not.toHaveProperty('temperature')
      expect(sent().max_completion_tokens).toBeGreaterThanOrEqual(1024)
    },
  )

  it('does not shrink a large cap for a reasoning model', async () => {
    mockGetAiConfig.mockResolvedValue(cloud({ provider: 'openai', openaiModel: 'gpt-5.4-mini' }))
    await aiChat('hi', undefined, undefined, { num_predict: 4000 })
    expect(sent().max_completion_tokens).toBe(4000)
  })

  it('requests JSON mode, asks for JSON in the system prompt and strips code fences', async () => {
    mockGetAiConfig.mockResolvedValue(cloud({ provider: 'openai' }))
    mockOpenAI.mockResolvedValue({ choices: [{ message: { content: '```json\n{"a":1}\n```' }, finish_reason: 'stop' }] })
    expect(await aiChat('hi', 'You classify.', 'json')).toBe('{"a":1}')
    expect(sent().response_format).toEqual({ type: 'json_object' })
    expect(sent().messages[0].content).toContain('You classify.')
    expect(sent().messages[0].content).toContain('ONLY valid JSON')
  })

  it('treats an empty response as a bad_response and names the finish reason', async () => {
    mockGetAiConfig.mockResolvedValue(cloud())
    mockOpenAI.mockResolvedValue({ choices: [{ message: { content: '' }, finish_reason: 'length' }] })
    await expect(
      aiChat('hi', undefined, undefined, undefined, undefined, { provider: 'openai' }),
    ).rejects.toMatchObject({ kind: 'bad_response', provider: 'openai', message: expect.stringContaining('length') })
  })

  it('maps a 401 to an auth error and a 429 to rate_limit, surfaced for explicit requests', async () => {
    mockGetAiConfig.mockResolvedValue(cloud())
    const explicit = () => aiChat('hi', undefined, undefined, undefined, undefined, { provider: 'openai' })
    mockOpenAI.mockRejectedValueOnce(Object.assign(new Error('bad key'), { status: 401 }))
    await expect(explicit()).rejects.toMatchObject({ kind: 'auth', provider: 'openai', status: 401 })
    mockOpenAI.mockRejectedValueOnce(Object.assign(new Error('slow down'), { status: 429 }))
    await expect(explicit()).rejects.toMatchObject({ kind: 'rate_limit', provider: 'openai' })
  })

  it('falls back to Ollama for a background call when OpenAI fails', async () => {
    mockGetAiConfig.mockResolvedValue(cloud({ provider: 'openai' }))
    mockOpenAI.mockRejectedValue(Object.assign(new Error('down'), { status: 500 }))
    expect(await aiChat('hi')).toBe('from-ollama')
  })

  it('is refused when the key is missing, and never called in strict local mode or on private content', async () => {
    const explicit = (extra = {}) => aiChat('hi', undefined, undefined, undefined, undefined, { provider: 'openai', ...extra })
    mockGetAiConfig.mockResolvedValue(cloud())
    delete process.env.OPENAI_API_KEY
    await expect(explicit()).rejects.toMatchObject({ kind: 'blocked' })
    process.env.OPENAI_API_KEY = 'test-key'
    mockGetAiConfig.mockResolvedValue(cloud({ strictLocal: true }))
    await expect(explicit()).rejects.toMatchObject({ kind: 'blocked' })
    mockGetAiConfig.mockResolvedValue(cloud())
    await expect(explicit({ cloudSafe: false })).rejects.toMatchObject({ kind: 'blocked' })
    expect(mockOpenAI).not.toHaveBeenCalled()
  })

  it('works from a key saved in Settings, redacts it from errors, and labels the model', async () => {
    delete process.env.OPENAI_API_KEY
    stored.openai = 'sk-saved-openai-secret'
    mockGetAiConfig.mockResolvedValue(cloud({ provider: 'openai' }))
    expect(await aiChat('hi')).toBe('from-openai')
    expect(await activeModelLabel()).toBe('openai:gpt-test')
    mockOpenAI.mockRejectedValueOnce(Object.assign(new Error('Incorrect key sk-saved-openai-secret'), { status: 401 }))
    await expect(
      aiChat('hi', undefined, undefined, undefined, undefined, { provider: 'openai' }),
    ).rejects.toMatchObject({ message: 'Incorrect key [redacted]' })
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

  it('gives Gemini room to think: a tiny output cap is raised, a big one is left alone', async () => {
    mockGetAiConfig.mockResolvedValue(cloud({ provider: 'gemini' }))
    await aiChat('hi', undefined, 'json', { temperature: 0, num_predict: 60 })
    expect(mockGenerate.mock.calls[0][0].config.maxOutputTokens).toBe(1024)
    await aiChat('hi', undefined, 'json', { temperature: 0, num_predict: 4000 })
    expect(mockGenerate.mock.calls[1][0].config.maxOutputTokens).toBe(4000)
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

  it('lists provider availability without exposing keys', async () => {
    delete process.env.GEMINI_API_KEY
    const list = await listProviders()
    expect(list).toEqual([
      { id: 'ollama', configured: true },
      { id: 'claude', configured: true },
      { id: 'gemini', configured: false },
      { id: 'openai', configured: true },
      { id: 'groq', configured: false },
    ])
    expect(JSON.stringify(list)).not.toContain('test-key')
  })
})

describe('an invalid key is an auth error whichever way the provider reports it', () => {
  const GOOGLE_400 = '{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT","details":[{"reason":"API_KEY_INVALID"}]}}'

  it('maps Google\'s HTTP 400 API_KEY_INVALID to auth, so the UI can say "check your key"', async () => {
    mockGetAiConfig.mockResolvedValue(cloud({ provider: 'gemini' }))
    mockGenerate.mockRejectedValue(Object.assign(new Error(GOOGLE_400), { status: 400 }))
    await expect(aiChat('hi', undefined, undefined, undefined, undefined, { provider: 'gemini' }))
      .rejects.toMatchObject({ provider: 'gemini', kind: 'auth', status: 400 })
  })

  it('does not call every 400 an auth error', async () => {
    mockGetAiConfig.mockResolvedValue(cloud({ provider: 'gemini' }))
    mockGenerate.mockRejectedValue(Object.assign(new Error('Unable to process input image'), { status: 400 }))
    await expect(aiChat('hi', undefined, undefined, undefined, undefined, { provider: 'gemini' }))
      .rejects.toMatchObject({ kind: 'unavailable', status: 400 })
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

describe('keys saved from Settings', () => {
  const NO_ENV = () => {
    delete process.env.ANTHROPIC_API_KEY; delete process.env.GEMINI_API_KEY; delete process.env.OPENAI_API_KEY
  }

  it('makes a provider available when only a saved key exists', async () => {
    NO_ENV()
    expect(await listProviders()).toEqual([
      { id: 'ollama', configured: true }, { id: 'claude', configured: false },
      { id: 'gemini', configured: false }, { id: 'openai', configured: false }, { id: 'groq', configured: false },
    ])
    stored.claude = 'sk-saved-claude-key'
    expect((await listProviders()).find(p => p.id === 'claude')!.configured).toBe(true)
  })

  it('loads the saved keys before every call, so a key added at runtime is seen', async () => {
    NO_ENV()
    stored.gemini = 'saved-gemini-key'
    mockGetAiConfig.mockResolvedValue(cloud({ provider: 'gemini' }))
    await aiChat('hi')
    expect(mockEnsureLoaded).toHaveBeenCalled()
    expect(mockGenerate).toHaveBeenCalledTimes(1)
    expect(mockOllamaChat).not.toHaveBeenCalled()
  })

  it('still refuses (and stays on Ollama) when neither env nor a saved key exists', async () => {
    NO_ENV()
    mockGetAiConfig.mockResolvedValue(cloud({ provider: 'claude' }))
    await aiChat('hi')
    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockOllamaChat).toHaveBeenCalledTimes(1)
    await expect(aiChat('hi', undefined, undefined, undefined, undefined, { provider: 'claude' })).rejects.toMatchObject({ kind: 'blocked' })
  })

  it('an environment key wins over a saved one', async () => {
    process.env.ANTHROPIC_API_KEY = 'env-key-value'
    stored.claude = 'saved-key-value'
    mockGetAiConfig.mockResolvedValue(cloud({ provider: 'claude' }))
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] })
    await aiChat('hi')
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('never lets a key appear in a provider error', async () => {
    NO_ENV()
    stored.claude = 'sk-ant-SECRET-VALUE-123'
    mockGetAiConfig.mockResolvedValue(cloud({ provider: 'claude' }))
    mockCreate.mockRejectedValue(Object.assign(new Error('401 invalid x-api-key: sk-ant-SECRET-VALUE-123'), { status: 401 }))
    const err = await aiChat('hi', undefined, undefined, undefined, undefined, { provider: 'claude', userInitiated: true }).catch(e => e)
    expect(err).toBeInstanceOf(AiProviderError)
    expect(err.kind).toBe('auth')
    expect(err.message).not.toContain('SECRET-VALUE')
    expect(err.message).toContain('[redacted]')
  })
})
