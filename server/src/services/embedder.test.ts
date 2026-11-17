import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./ai', () => ({ aiEmbed: vi.fn().mockResolvedValue([0.1, 0.2]) }))

import { aiEmbed } from './ai'
import { embedItem, embedQuery } from './embedder'

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
