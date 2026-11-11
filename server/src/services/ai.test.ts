import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockGetAiConfig = vi.fn()
vi.mock('./settings.js', () => ({ getAiConfig: () => mockGetAiConfig() }))

const mockOllamaChat = vi.fn()
vi.mock('./ollama.js', () => ({
  ollamaChat: (...a: unknown[]) => mockOllamaChat(...a),
  ollamaEmbed: vi.fn(),
}))

const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: (...a: unknown[]) => mockCreate(...a) }
  },
}))

import { aiChat, activeProvider } from './ai.js'

const OLD_KEY = process.env.ANTHROPIC_API_KEY

beforeEach(() => {
  vi.clearAllMocks()
  process.env.ANTHROPIC_API_KEY = 'test-key'
  mockOllamaChat.mockResolvedValue('from-ollama')
  mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'from-claude' }] })
})

afterEach(() => {
  if (OLD_KEY === undefined) delete process.env.ANTHROPIC_API_KEY
  else process.env.ANTHROPIC_API_KEY = OLD_KEY
})

describe('aiChat routing', () => {
  it('uses Ollama by default', async () => {
    mockGetAiConfig.mockResolvedValue({ model: 'llama3.2', useClaude: false, strictLocal: false })
    expect(await aiChat('hi')).toBe('from-ollama')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('uses Claude when opted in and a key is set', async () => {
    mockGetAiConfig.mockResolvedValue({ model: 'llama3.2', useClaude: true, strictLocal: false })
    expect(await aiChat('hi')).toBe('from-claude')
    expect(mockOllamaChat).not.toHaveBeenCalled()
  })

  it('falls back to Ollama when Claude is opted in but no key is set', async () => {
    delete process.env.ANTHROPIC_API_KEY
    mockGetAiConfig.mockResolvedValue({ model: 'llama3.2', useClaude: true, strictLocal: false })
    expect(await aiChat('hi')).toBe('from-ollama')
  })

  it('never calls Claude in strict local mode, even when opted in with a key', async () => {
    mockGetAiConfig.mockResolvedValue({ model: 'llama3.2', useClaude: true, strictLocal: true })
    expect(await aiChat('hi')).toBe('from-ollama')
    expect(mockCreate).not.toHaveBeenCalled()
  })
})

describe('activeProvider', () => {
  it('reports ollama in strict local mode regardless of the Claude toggle', async () => {
    mockGetAiConfig.mockResolvedValue({ model: 'llama3.2', useClaude: true, strictLocal: true })
    expect(await activeProvider()).toBe('ollama')
  })

  it('reports claude when opted in, keyed and not strict', async () => {
    mockGetAiConfig.mockResolvedValue({ model: 'llama3.2', useClaude: true, strictLocal: false })
    expect(await activeProvider()).toBe('claude')
  })
})
