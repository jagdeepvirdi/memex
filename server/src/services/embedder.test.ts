import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./ai', () => ({ aiEmbed: vi.fn().mockResolvedValue([0.1, 0.2]) }))
vi.mock('../lib/logger', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))

import { aiEmbed } from './ai'
import logger from '../lib/logger'
import { embedItem, embedQuery, embedForDuplicateCheck } from './embedder'

beforeEach(() => vi.clearAllMocks())

describe('embedder', () => {
  it('embeds a stored item as a document, title first', async () => {
    await embedItem('Pad thai', 'Noodles')
    expect(aiEmbed).toHaveBeenCalledWith('Pad thai\n\nNoodles', { kind: 'document' })
  })

  it('embeds a search question as a query', async () => {
    await embedQuery('what noodles did I save?')
    expect(aiEmbed).toHaveBeenCalledWith('what noodles did I save?', { kind: 'query' })
  })

  it('caps the text sent to the model', async () => {
    await embedItem('t', 'x'.repeat(10_000))
    expect(String(vi.mocked(aiEmbed).mock.calls[0][0]).length).toBe(6000)
    await embedQuery('y'.repeat(10_000))
    expect(String(vi.mocked(aiEmbed).mock.calls[1][0]).length).toBe(6000)
  })
})

describe('embedForDuplicateCheck', () => {
  it('embeds like a query when it works', async () => {
    expect(await embedForDuplicateCheck('some text')).toEqual([0.1, 0.2])
    expect(aiEmbed).toHaveBeenCalledWith('some text', { kind: 'query' })
  })

  it('returns an empty embedding instead of throwing when the model fails, and logs why', async () => {
    vi.mocked(aiEmbed).mockRejectedValueOnce(new Error('ollama down'))
    await expect(embedForDuplicateCheck('some text')).resolves.toEqual([])
    expect(logger.warn).toHaveBeenCalledWith({ err: 'ollama down' }, expect.stringMatching(/duplicate check/i))
  })

  it('copes with a non-Error rejection', async () => {
    vi.mocked(aiEmbed).mockRejectedValueOnce('plain string')
    await expect(embedForDuplicateCheck('x')).resolves.toEqual([])
  })

  it('embedQuery itself still throws (search relies on that to fall back to keywords)', async () => {
    vi.mocked(aiEmbed).mockRejectedValueOnce(new Error('down'))
    await expect(embedQuery('x')).rejects.toThrow('down')
  })
})
