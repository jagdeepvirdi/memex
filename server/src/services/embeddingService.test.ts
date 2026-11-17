import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../db/client', () => ({ pool: { query: vi.fn() } }))
vi.mock('./embedder', async (orig) => ({ ...(await orig<typeof import('./embedder')>()), embedItem: vi.fn().mockResolvedValue([0.1, 0.2]) }))
vi.mock('../lib/logger', () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { pool } from '../db/client'
import { embedItem } from './embedder'
import {
  activeEmbedding, activeEmbeddingId, embeddingAllowed, embedAndStoreItem, clearEmbeddingSkip,
  type ActiveEmbedding,
} from './embeddingService'

const ITEM = { id: 'i1', title: 'Pad thai', content: 'Noodles' }
const GEMINI: ActiveEmbedding = { provider: 'gemini', model: 'gemini-embedding-001', id: 'gemini:gemini-embedding-001' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(embedItem).mockResolvedValue([0.1, 0.2])
  vi.mocked(pool.query).mockResolvedValue({ rows: [] } as any)
})

describe('activeEmbedding', () => {
  it('is the local nomic model by default', () => {
    expect(activeEmbedding()).toMatchObject({ provider: 'ollama', model: 'nomic-embed-text' })
    expect(activeEmbeddingId()).toBe('ollama:nomic-embed-text')
  })
})

describe('embeddingAllowed', () => {
  it('lets a local model embed anything, even private items', () => {
    expect(embeddingAllowed(activeEmbedding(), { encrypted: true })).toBe(true)
    expect(embeddingAllowed(activeEmbedding(), { tags: ['private'] })).toBe(true)
  })

  it.each([
    ['an encrypted item', { encrypted: true }],
    ['a password item', { type: 'password' }],
    ['a Passwords category', { categories: ['Passwords'] }],
    ['a Personal category', { categories: ['Personal', 'Numbers'] }],
    ['a private tag', { tags: ['Private'] }],
    ['a local-only tag', { tags: ['local-only'] }],
  ])('keeps %s away from a cloud model', (_name, item) => {
    expect(embeddingAllowed(GEMINI, item)).toBe(false)
  })

  it('lets an ordinary item go to a cloud model', () => {
    expect(embeddingAllowed(GEMINI, { type: 'recipe', categories: ['Food'], tags: ['dinner'] })).toBe(true)
  })
})

describe('embedAndStoreItem (local model)', () => {
  it('stores the vector with the model that made it and clears any skip marker', async () => {
    expect(await embedAndStoreItem(ITEM)).toBe('embedded')
    expect(embedItem).toHaveBeenCalledWith('Pad thai', 'Noodles', undefined)
    const [sql, params] = vi.mocked(pool.query).mock.calls[0]
    expect(sql).toMatch(/SET embedding = \$1, embedding_model = \$2, embedding_skip = NULL/)
    expect(params).toEqual([JSON.stringify([0.1, 0.2]), 'ollama:nomic-embed-text', 'i1'])
  })

  it('makes exactly one query (no privacy lookup is needed for a local model)', async () => {
    await embedAndStoreItem(ITEM)
    expect(pool.query).toHaveBeenCalledTimes(1)
  })

  it('never throws: a failed embed returns "failed" and writes nothing, so the worker retries later', async () => {
    vi.mocked(embedItem).mockRejectedValueOnce(new Error('ollama down'))
    expect(await embedAndStoreItem(ITEM)).toBe('failed')
    expect(pool.query).not.toHaveBeenCalled()
  })

  it('never throws when the database write fails', async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(new Error('db down'))
    expect(await embedAndStoreItem(ITEM)).toBe('failed')
  })
})

describe('embedAndStoreItem (cloud model)', () => {
  it('marks a private item skipped, keeps any older vector, and never calls the embedding model', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ type: 'note', encrypted: false, categories: ['Food'], tags: ['private'] }] } as any)
      .mockResolvedValueOnce({ rows: [] } as any)
    expect(await embedAndStoreItem(ITEM, GEMINI)).toBe('skipped')
    expect(embedItem).not.toHaveBeenCalled()
    const [sql, params] = vi.mocked(pool.query).mock.calls[1]
    expect(sql).toMatch(/SET embedding_skip = 'private' WHERE id = \$1/)
    expect(sql).not.toMatch(/embedding = NULL/) // the old vector belongs to another model: kept, so switching back is instant
    expect(params).toEqual(['i1'])
  })

  it('treats an item it cannot read as private', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any).mockResolvedValueOnce({ rows: [] } as any)
    expect(await embedAndStoreItem(ITEM, GEMINI)).toBe('skipped')
    expect(embedItem).not.toHaveBeenCalled()
  })

  it('embeds an ordinary item and records the cloud model id', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ type: 'recipe', encrypted: false, categories: ['Food'], tags: [] }] } as any)
      .mockResolvedValueOnce({ rows: [] } as any)
    expect(await embedAndStoreItem(ITEM, GEMINI)).toBe('embedded')
    expect(vi.mocked(pool.query).mock.calls[1][1]).toEqual([JSON.stringify([0.1, 0.2]), 'gemini:gemini-embedding-001', 'i1'])
  })
})

describe('embedAndStoreItem — text that looks sensitive', () => {
  const ordinary = { rows: [{ type: 'note', encrypted: false, categories: ['Food'], tags: [] }] }
  const SENSITIVE = { id: 'i1', title: 'Bank', content: 'Account number 1234 5678 9012 for rent' }

  it('is never sent to a cloud model, even though its category and tags are ordinary', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce(ordinary as never).mockResolvedValueOnce({ rows: [] } as never)
    expect(await embedAndStoreItem(SENSITIVE, GEMINI)).toBe('skipped')
    expect(embedItem).not.toHaveBeenCalled()
    expect(vi.mocked(pool.query).mock.calls[1][0]).toMatch(/embedding_skip = 'private'/)
  })

  it('is still embedded by the local model: nothing leaves the machine', async () => {
    expect(await embedAndStoreItem(SENSITIVE)).toBe('embedded')
    expect(embedItem).toHaveBeenCalled()
  })

  it('does not hold back an ordinary note, or one that only has a number inside a link', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce(ordinary as never).mockResolvedValueOnce({ rows: [] } as never)
    const link = { id: 'i2', title: 'Shop', content: 'Saved https://shop.example.com/item/1234567890123456 for later' }
    expect(await embedAndStoreItem(link, GEMINI)).toBe('embedded')
  })

  it('judges the text that would be sent: sensitive text beyond the embedding cap is not what the model sees', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce(ordinary as never).mockResolvedValueOnce({ rows: [] } as never)
    const late = { id: 'i3', title: 'Long note', content: `${'word '.repeat(1500)} account number 1234 5678 9012` }
    expect(await embedAndStoreItem(late, GEMINI)).toBe('embedded')
  })
})

describe('clearEmbeddingSkip', () => {
  it('only touches an item that is marked skipped', async () => {
    await clearEmbeddingSkip('i1')
    const [sql, params] = vi.mocked(pool.query).mock.calls[0]
    expect(sql).toMatch(/SET embedding_skip = NULL WHERE id = \$1 AND embedding_skip IS NOT NULL/)
    expect(params).toEqual(['i1'])
  })

  it('swallows a database error', async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(new Error('db down'))
    await expect(clearEmbeddingSkip('i1')).resolves.toBeUndefined()
  })
})
