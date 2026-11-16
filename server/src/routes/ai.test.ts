import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../index'
import { pool } from '../db/client'

vi.mock('../db/client', () => {
  const client = { query: vi.fn(), release: vi.fn() }
  return { pool: { query: vi.fn(), connect: vi.fn().mockResolvedValue(client) } }
})
vi.mock('../services/ollama', async (orig) => ({
  ...(await orig<typeof import('../services/ollama')>()),
  listOllamaModels: vi.fn().mockResolvedValue(['llama3.2', 'gemma3:4b']),
}))
vi.mock('../services/ai', async (orig) => ({
  ...(await orig<typeof import('../services/ai')>()),
  aiChat: vi.fn(),
}))

import { aiChat, AiProviderError } from '../services/ai'

let AUTH = ''
beforeAll(() => {
  const secret = process.env.JWT_SECRET || 'memex-default-secret'
  AUTH = `Bearer ${jwt.sign({ userId: 'u1', email: 't@t.com' }, secret)}`
})

const OLD = { a: process.env.ANTHROPIC_API_KEY, g: process.env.GEMINI_API_KEY, o: process.env.OPENAI_API_KEY }
const settingsRows = (o: Record<string, unknown> = {}) =>
  vi.mocked(pool.query).mockResolvedValue({ rows: Object.entries(o).map(([key, value]) => ({ key, value })) } as any)

beforeEach(() => {
  vi.clearAllMocks()
  settingsRows()
  process.env.ANTHROPIC_API_KEY = 'sk-ant-secret-123'
  delete process.env.GEMINI_API_KEY
  delete process.env.OPENAI_API_KEY
})
afterEach(() => {
  if (OLD.o === undefined) delete process.env.OPENAI_API_KEY
  else process.env.OPENAI_API_KEY = OLD.o
  if (OLD.a === undefined) delete process.env.ANTHROPIC_API_KEY
  else process.env.ANTHROPIC_API_KEY = OLD.a
  if (OLD.g === undefined) delete process.env.GEMINI_API_KEY
  else process.env.GEMINI_API_KEY = OLD.g
})

describe('GET /api/ai/providers', () => {
  it('requires auth', async () => {
    expect((await request(app).get('/api/ai/providers')).status).toBe(401)
  })

  it('lists providers with configured flags and models, and never returns a key', async () => {
    const res = await request(app).get('/api/ai/providers').set('Authorization', AUTH)
    expect(res.status).toBe(200)
    expect(res.body.map((p: any) => [p.id, p.configured, p.cloud])).toEqual([
      ['ollama', true, false], ['claude', true, true], ['gemini', false, true], ['openai', false, true],
    ])
    expect(res.body[0].models).toEqual(['llama3.2', 'gemma3:4b'])
    expect(JSON.stringify(res.body)).not.toContain('sk-ant-secret-123')
  })

  it('suggests OpenAI models, with the configured one first', async () => {
    settingsRows({ openai_model: 'gpt-custom' })
    const res = await request(app).get('/api/ai/providers').set('Authorization', AUTH)
    const openai = res.body.find((p: any) => p.id === 'openai')
    expect(openai.models[0]).toBe('gpt-custom')
    expect(openai.models).toContain('gpt-5.4-mini')
  })

  it('puts the currently configured model first and de-duplicates', async () => {
    settingsRows({ claude_model: 'claude-opus-5-5', ai_model: 'custom:1b' })
    const res = await request(app).get('/api/ai/providers').set('Authorization', AUTH)
    const by = Object.fromEntries(res.body.map((p: any) => [p.id, p.models]))
    expect(by.claude[0]).toBe('claude-opus-5-5')
    expect(by.claude.filter((m: string) => m === 'claude-opus-5-5')).toHaveLength(1)
    expect(by.ollama[0]).toBe('custom:1b')
  })
})

describe('POST /api/ai/test', () => {
  const post = (body: unknown) =>
    request(app).post('/api/ai/test').set('Authorization', AUTH).send(body as object)

  it('requires auth', async () => {
    expect((await request(app).post('/api/ai/test').send({ provider: 'ollama' })).status).toBe(401)
  })

  it('rejects an unknown provider', async () => {
    expect((await post({ provider: 'mistral' })).status).toBe(400)
    expect((await post({})).status).toBe(400)
  })

  it('runs one explicit, user-initiated round-trip and reports the model and latency', async () => {
    vi.mocked(aiChat).mockImplementationOnce(async (...args: any[]) => {
      args[5].onProvider({ provider: 'claude', model: 'claude-x' })
      return ' OK \n'
    })
    const res = await post({ provider: 'claude' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ ok: true, provider: 'claude', model: 'claude-x', reply: 'OK' })
    expect(typeof res.body.latencyMs).toBe('number')
    expect(vi.mocked(aiChat).mock.calls[0][5]).toMatchObject({ provider: 'claude', userInitiated: true, task: 'test' })
  })

  it('reports a provider failure as ok:false with its kind', async () => {
    vi.mocked(aiChat).mockRejectedValueOnce(new AiProviderError('claude', 'rate_limit', 'slow down', 429))
    const res = await post({ provider: 'claude' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ ok: false, provider: 'claude', kind: 'rate_limit', error: 'slow down' })
  })

  it('reports a blocked provider (strict local / no consent / no key) as ok:false', async () => {
    vi.mocked(aiChat).mockRejectedValueOnce(
      new AiProviderError('gemini', 'blocked', 'Cannot use gemini: Strict Local Mode is on'))
    const res = await post({ provider: 'gemini' })
    expect(res.body).toMatchObject({ ok: false, kind: 'blocked' })
  })

  it('redacts API keys that a provider error message echoes back', async () => {
    vi.mocked(aiChat).mockRejectedValueOnce(
      new AiProviderError('claude', 'auth', 'invalid x-api-key: sk-ant-secret-123', 401))
    const res = await post({ provider: 'claude' })
    expect(res.body.error).not.toContain('sk-ant-secret-123')
    expect(res.body.error).toContain('[redacted]')
  })

  it('treats a plain Ollama failure as ok:false rather than a 500', async () => {
    vi.mocked(aiChat).mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
    const res = await post({ provider: 'ollama' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ ok: false, kind: 'unavailable' })
  })
})
