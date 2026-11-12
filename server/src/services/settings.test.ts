import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../db/client', () => ({ pool: { query: vi.fn() } }))
vi.mock('../lib/logger.js', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))

import { pool } from '../db/client'
import { getAiConfig } from './settings'

const rows = (o: Record<string, unknown>) =>
  vi.mocked(pool.query).mockResolvedValue({ rows: Object.entries(o).map(([key, value]) => ({ key, value })) } as never)

const ENV = { c: process.env.CLAUDE_MODEL, g: process.env.GEMINI_MODEL }
beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.CLAUDE_MODEL
  delete process.env.GEMINI_MODEL
})
afterEach(() => {
  if (ENV.c !== undefined) process.env.CLAUDE_MODEL = ENV.c
  if (ENV.g !== undefined) process.env.GEMINI_MODEL = ENV.g
})

describe('getAiConfig', () => {
  it('defaults to local-only Ollama when nothing is set', async () => {
    rows({})
    expect(await getAiConfig()).toMatchObject({
      model: 'llama3.2', provider: 'ollama', allowCloud: false, strictLocal: false, useClaude: false, perTask: {},
    })
  })

  it('reads all AI settings in a single query', async () => {
    rows({})
    await getAiConfig()
    expect(pool.query).toHaveBeenCalledTimes(1)
  })

  it('migrates legacy use_claude=true to provider=claude with cloud consent', async () => {
    rows({ use_claude: true })
    expect(await getAiConfig()).toMatchObject({ provider: 'claude', allowCloud: true, useClaude: true })
  })

  it('prefers the new ai_provider / allow_cloud settings over the legacy toggle', async () => {
    rows({ use_claude: true, ai_provider: 'gemini', allow_cloud: false })
    expect(await getAiConfig()).toMatchObject({ provider: 'gemini', allowCloud: false })
  })

  it('forces ollama and no consent in strict-local mode, whatever else is set', async () => {
    rows({ ai_provider: 'claude', allow_cloud: true, strict_local_mode: true, ai_task_providers: { explain: 'gemini' } })
    expect(await getAiConfig()).toMatchObject({ provider: 'ollama', allowCloud: false, strictLocal: true, perTask: {} })
  })

  // Regression: the Settings UI saved booleans as the strings 'true' / 'false'.
  it("reads string-form booleans: 'true' enables strict local, 'false' does not", async () => {
    rows({ ai_provider: 'claude', allow_cloud: true, strict_local_mode: 'true' })
    expect(await getAiConfig()).toMatchObject({ strictLocal: true, provider: 'ollama', allowCloud: false })

    rows({ ai_provider: 'claude', allow_cloud: 'true', strict_local_mode: 'false' })
    expect(await getAiConfig()).toMatchObject({ strictLocal: false, provider: 'claude', allowCloud: true })
  })

  it("treats string 'false' consent and legacy toggle as off", async () => {
    rows({ use_claude: 'false', allow_cloud: 'false' })
    expect(await getAiConfig()).toMatchObject({ useClaude: false, allowCloud: false, provider: 'ollama' })
  })

  it('keeps only valid per-task providers', async () => {
    rows({ ai_task_providers: { explain: 'gemini', classify: 'ollama', bad: 'openai', worse: 5 } })
    expect((await getAiConfig()).perTask).toEqual({ explain: 'gemini', classify: 'ollama' })
  })

  it('ignores a malformed ai_provider and non-object per-task values', async () => {
    rows({ ai_provider: 'skynet', ai_task_providers: ['gemini'] })
    expect(await getAiConfig()).toMatchObject({ provider: 'ollama', perTask: {} })
  })

  it('resolves cloud model names from settings, then env, then defaults', async () => {
    rows({ claude_model: 'claude-custom' })
    process.env.GEMINI_MODEL = 'gemini-from-env'
    expect(await getAiConfig()).toMatchObject({ claudeModel: 'claude-custom', geminiModel: 'gemini-from-env' })
  })

  it('falls back to defaults if the database is unavailable', async () => {
    vi.mocked(pool.query).mockRejectedValue(new Error('db down'))
    expect(await getAiConfig()).toMatchObject({ provider: 'ollama', allowCloud: false, model: 'llama3.2' })
  })
})
