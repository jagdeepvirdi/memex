import { describe, it, expect, vi, beforeEach } from 'vitest'
import { askKnowledge } from './ragService'

vi.mock('../db/client', () => ({ pool: { query: vi.fn() } }))
vi.mock('./embedder', () => ({ embedQuery: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]) }))
vi.mock('./ai', () => ({ aiChat: vi.fn() }))

import { pool } from '../db/client'
import { embedQuery } from './embedder'
import { aiChat } from './ai'

const sourceRow = {
  id: 's1', title: 'Bangkok trip', type: 'place', content: 'Visited Thai Garden, great pad thai.',
  structured: {}, source: 'keep', source_url: null, encrypted: false, reviewed: true,
  created_at: new Date(), updated_at: new Date(), categories: ['Travel'], tags: ['food'],
}

beforeEach(() => vi.clearAllMocks())

describe('askKnowledge', () => {
  it('embeds the question before retrieval', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [sourceRow] } as any)
    vi.mocked(aiChat).mockResolvedValueOnce('You visited Thai Garden [1].')
    await askKnowledge('where did I eat in Bangkok?')
    expect(embedQuery).toHaveBeenCalledWith('where did I eat in Bangkok?')
  })

  it('returns a synthesized answer and its sources', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [sourceRow] } as any)
    vi.mocked(aiChat).mockResolvedValueOnce('You visited Thai Garden [1].')
    const r = await askKnowledge('bangkok food?')
    expect(r.answer).toMatch(/Thai Garden/)
    expect(r.sources).toHaveLength(1)
    expect(r.sources[0].title).toBe('Bangkok trip')
  })

  it('short-circuits with a canned answer and no LLM call when nothing matches', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any)
    const r = await askKnowledge('something obscure')
    expect(r.sources).toEqual([])
    expect(r.answer).toMatch(/couldn't find|could not find/i)
    expect(aiChat).not.toHaveBeenCalled()
  })

  it('passes a RAG system prompt with citation rules to aiChat', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [sourceRow] } as any)
    vi.mocked(aiChat).mockResolvedValueOnce('answer')
    await askKnowledge('q')
    const systemPrompt = vi.mocked(aiChat).mock.calls[0][1] as string
    expect(systemPrompt).toMatch(/citation/i)
  })
})
