import { describe, it, expect, vi, beforeEach } from 'vitest'
import { quickSaveText, quickSaveUrl } from './quickSave'
import { pool } from '../db/client'
import { createItem } from '../db/helpers'
import { findItemsBySourceUrl, findSimilarItems } from './duplicateService'
import { scrapeUrl } from './scraper'
import { summarizeAndClassify } from './summarizer'
import { classify } from './classifier'
import { embedForDuplicateCheck } from './embedder'
import { embedAndStoreItem } from './embeddingService'
import { extractAndLinkEntities } from './entityService'

vi.mock('../db/client', () => ({ pool: { query: vi.fn(), connect: vi.fn() } }))
vi.mock('../db/helpers', () => ({ createItem: vi.fn() }))
vi.mock('./duplicateService', () => ({ findItemsBySourceUrl: vi.fn(), findSimilarItems: vi.fn() }))
vi.mock('./scraper', () => ({ scrapeUrl: vi.fn() }))
vi.mock('./summarizer', () => ({ summarizeAndClassify: vi.fn() }))
vi.mock('./classifier', () => ({ classify: vi.fn() }))
vi.mock('./embedder', () => ({ embedForDuplicateCheck: vi.fn() }))
vi.mock('./embeddingService', () => ({ embedAndStoreItem: vi.fn() }))
vi.mock('./entityService', () => ({ extractAndLinkEntities: vi.fn() }))

const client = { query: vi.fn(), release: vi.fn() }
const saved = { id: 'i1', title: 'Saved', type: 'note', structured: {}, categories: [], tags: [] }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(pool.connect).mockResolvedValue(client as never)
  client.query.mockResolvedValue({ rows: [] })
  vi.mocked(createItem).mockResolvedValue(saved as never)
  vi.mocked(findItemsBySourceUrl).mockResolvedValue([])
  vi.mocked(findSimilarItems).mockResolvedValue([])
  vi.mocked(embedForDuplicateCheck).mockResolvedValue([])
  vi.mocked(scrapeUrl).mockResolvedValue({ content: 'page text', title: 'Page' } as never)
  vi.mocked(summarizeAndClassify).mockResolvedValue({
    title: 'Page', type: 'link', content: 'page text', structured: { summary: 's' }, source: 'url', sourceUrl: 'https://example.com/a',
    categories: ['Links'], tags: ['web'], confidence: 80, intent: 'reference',
  } as never)
  vi.mocked(classify).mockResolvedValue({
    title: 'AI title', type: 'note', structured: { a: 1 }, summary: 'sum', categories: ['Personal'], tags: ['x', 'Dinner'], confidence: 70, intent: 'reference',
  } as never)
})

describe('quickSaveUrl', () => {
  it('returns the existing item and does no work when the page is already saved', async () => {
    vi.mocked(findItemsBySourceUrl).mockResolvedValue([{ id: 'old', title: 'Old', type: 'link' }] as never)
    const out = await quickSaveUrl('https://example.com/a')
    expect(out).toEqual({ item: { id: 'old', title: 'Old', type: 'link' }, similarItems: [], duplicate: true })
    expect(scrapeUrl).not.toHaveBeenCalled()
    expect(createItem).not.toHaveBeenCalled()
  })

  it('fetches, classifies, saves in a transaction, links entities and embeds in the background', async () => {
    const out = await quickSaveUrl('https://example.com/a', { extraTags: ['from-mcp', 'WEB'] })
    expect(out.item).toEqual({ id: 'i1', title: 'Saved', type: 'note' })
    expect(out.duplicate).toBeUndefined()
    expect(client.query.mock.calls.map(c => c[0])).toEqual(['BEGIN', 'COMMIT'])
    // Extra tags are added without duplicating one the AI already chose (case-insensitive).
    expect(vi.mocked(createItem).mock.calls[0][1].tags).toEqual(['web', 'from-mcp'])
    expect(vi.mocked(createItem).mock.calls[0][1]).toMatchObject({ reviewed: false, sourceUrl: 'https://example.com/a' })
    expect(extractAndLinkEntities).toHaveBeenCalledOnce()
    expect(embedAndStoreItem).toHaveBeenCalledWith(saved)
    expect(client.release).toHaveBeenCalledOnce()
  })

  it('rolls back and releases the connection when saving fails', async () => {
    vi.mocked(createItem).mockRejectedValue(new Error('insert failed'))
    await expect(quickSaveUrl('https://example.com/a')).rejects.toThrow('insert failed')
    expect(client.query.mock.calls.map(c => c[0])).toEqual(['BEGIN', 'ROLLBACK'])
    expect(client.release).toHaveBeenCalledOnce()
    expect(embedAndStoreItem).not.toHaveBeenCalled()
  })
})

describe('quickSaveText', () => {
  it('saves the text as given with the AI classification, and the caller title wins', async () => {
    await quickSaveText('Buy lemons and thyme', { title: '  Shopping  ', extraTags: ['from-mcp'] })
    const input = vi.mocked(createItem).mock.calls[0][1]
    expect(input.title).toBe('Shopping')
    expect(input.content).toBe('Buy lemons and thyme')
    expect(input.source).toBe('manual')
    expect(input.structured).toEqual({ a: 1, summary: 'sum' })
    expect(input.tags).toEqual(['x', 'Dinner', 'from-mcp'])
  })

  it('uses the AI title when none is given, and returns similar items', async () => {
    vi.mocked(findSimilarItems).mockResolvedValue([{ id: 's' }] as never)
    const out = await quickSaveText('some text')
    expect(vi.mocked(createItem).mock.calls[0][1].title).toBe('AI title')
    expect(out.similarItems).toEqual([{ id: 's' }])
  })

  it('a failed embedding for the duplicate hint does not fail the save (embedder returns [])', async () => {
    vi.mocked(embedForDuplicateCheck).mockResolvedValue([])
    await expect(quickSaveText('text')).resolves.toBeDefined()
  })
})
