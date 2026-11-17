import { describe, it, expect } from 'vitest'
import { resolveAiSettings, truthy, isProvider } from './aiSettings'

describe('truthy', () => {
  it('accepts real booleans and the strings older versions saved', () => {
    expect(truthy(true)).toBe(true)
    expect(truthy('true')).toBe(true)
    expect(truthy(false)).toBe(false)
    expect(truthy('false')).toBe(false)
    expect(truthy(undefined)).toBe(false)
    expect(truthy('yes')).toBe(false)
  })
})

describe('isProvider', () => {
  it('knows every provider, including openai and groq', () => {
    for (const id of ['ollama', 'claude', 'gemini', 'openai', 'groq']) expect(isProvider(id)).toBe(true)
    expect(isProvider('mistral')).toBe(false)
    expect(isProvider(undefined)).toBe(false)
  })
})

describe('resolveAiSettings', () => {
  it('defaults to local Ollama with no cloud consent', () => {
    expect(resolveAiSettings({})).toEqual({ strictLocal: false, provider: 'ollama', allowCloud: false, perTask: {} })
  })

  it('reads an install that only ever set use_claude as Claude with consent', () => {
    expect(resolveAiSettings({ use_claude: true })).toMatchObject({ provider: 'claude', allowCloud: true })
    expect(resolveAiSettings({ use_claude: 'true' })).toMatchObject({ provider: 'claude', allowCloud: true })
  })

  it('prefers ai_provider and allow_cloud over the legacy flag', () => {
    expect(resolveAiSettings({ use_claude: true, ai_provider: 'ollama', allow_cloud: false }))
      .toMatchObject({ provider: 'ollama', allowCloud: false })
    expect(resolveAiSettings({ ai_provider: 'openai', allow_cloud: 'true' })).toMatchObject({ provider: 'openai', allowCloud: true })
  })

  it('lets Strict Local Mode force Ollama and withdraw consent', () => {
    expect(resolveAiSettings({ ai_provider: 'gemini', allow_cloud: true, strict_local_mode: true }))
      .toMatchObject({ strictLocal: true, provider: 'ollama', allowCloud: false })
    expect(resolveAiSettings({ strict_local_mode: 'true' }).strictLocal).toBe(true)
  })

  it('ignores an unknown provider and a malformed per-task value', () => {
    expect(resolveAiSettings({ ai_provider: 'mistral' }).provider).toBe('ollama')
    expect(resolveAiSettings({ ai_task_providers: ['claude'] }).perTask).toEqual({})
    expect(resolveAiSettings({ ai_task_providers: { ask: 'gemini' } }).perTask).toEqual({ ask: 'gemini' })
  })
})
