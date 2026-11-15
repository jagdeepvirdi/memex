import { describe, it, expect, vi, beforeEach } from 'vitest'
import { findItemsBySourceUrl } from './duplicateService'
import { pool } from '../db/client'

vi.mock('../db/client', () => ({ pool: { query: vi.fn() } }))

beforeEach(() => vi.clearAllMocks())

// Older items (Keep imports, pasted links, bookmarks) keep the link only in `content`, with no source_url.
const withUrl = (id: string, source_url: string) => ({ id, title: `T${id}`, type: 'link', source_url, content: '' })
const legacy = (id: string, content: string) => ({ id, title: `T${id}`, type: 'link', source_url: null, content })
const rows = (...r: unknown[]) => vi.mocked(pool.query).mockResolvedValueOnce({ rows: r } as never)
const VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'

describe('findItemsBySourceUrl — items saved as a bare link (no source_url)', () => {
  it('finds a legacy item whose content is just the link, under any URL spelling', async () => {
    rows(legacy('a', 'https://youtu.be/dQw4w9WgXcQ'))
    expect(await findItemsBySourceUrl(VIDEO)).toEqual([{ id: 'a', title: 'Ta', type: 'link', similarity: 1 }])
  })

  it('accepts a short caption around the link', async () => {
    rows(legacy('a', 'must try this!\nhttps://youtu.be/dQw4w9WgXcQ'))
    expect((await findItemsBySourceUrl(VIDEO)).map(i => i.id)).toEqual(['a'])
  })

  it('does not report a long note that only mentions the link', async () => {
    rows(legacy('a', `${'word '.repeat(80)}https://youtu.be/dQw4w9WgXcQ`))
    expect(await findItemsBySourceUrl(VIDEO)).toEqual([])
  })

  it('does not report a list of different links', async () => {
    rows(legacy('a', 'https://youtu.be/dQw4w9WgXcQ\nhttps://youtu.be/aaaaaaaaaaa'))
    expect(await findItemsBySourceUrl(VIDEO)).toEqual([])
  })

  it('filters LIKE false positives (same prefix, different page)', async () => {
    rows(legacy('a', 'https://example.com/post-2'), legacy('b', 'https://www.example.com/post/?utm_source=x'))
    expect((await findItemsBySourceUrl('https://example.com/post')).map(i => i.id)).toEqual(['b'])
  })

  it('works for ordinary pages and repos too', async () => {
    rows(legacy('a', 'https://github.com/Anthropics/Claude-Code'))
    expect((await findItemsBySourceUrl('https://github.com/anthropics/claude-code')).map(i => i.id)).toEqual(['a'])
  })

  it('tolerates a row with no content', async () => {
    rows({ id: 'a', title: 'Ta', type: 'link', source_url: null })
    expect(await findItemsBySourceUrl(VIDEO)).toEqual([])
  })
})

describe('findItemsBySourceUrl — both kinds together', () => {
  it('returns source_url matches and legacy matches, respecting the limit', async () => {
    rows(withUrl('s1', 'https://youtu.be/dQw4w9WgXcQ'), legacy('l1', 'https://youtu.be/dQw4w9WgXcQ'), legacy('l2', 'https://youtu.be/dQw4w9WgXcQ'))
    expect((await findItemsBySourceUrl(VIDEO, 3)).map(i => i.id)).toEqual(['s1', 'l1', 'l2'])
    rows(withUrl('s1', 'https://youtu.be/dQw4w9WgXcQ'), legacy('l1', 'https://youtu.be/dQw4w9WgXcQ'))
    expect(await findItemsBySourceUrl(VIDEO, 1)).toHaveLength(1)
  })

  it('does not apply the bare-link rule to an item that HAS a source_url (that URL decides)', async () => {
    rows({ id: 'a', title: 'Ta', type: 'link', source_url: 'https://youtu.be/aaaaaaaaaaa', content: 'https://youtu.be/dQw4w9WgXcQ' })
    expect(await findItemsBySourceUrl(VIDEO)).toEqual([])
  })
})

describe('findItemsBySourceUrl — the query', () => {
  const sql = async () => {
    rows()
    await findItemsBySourceUrl(VIDEO)
    return String(vi.mocked(pool.query).mock.calls[0][0])
  }

  it('still uses one parameter (the escaped LIKE pattern)', async () => {
    rows()
    await findItemsBySourceUrl(VIDEO)
    expect(vi.mocked(pool.query).mock.calls[0][1]).toEqual(['%dQw4w9WgXcQ%'])
  })

  it('only looks at live items, and never at encrypted items or passwords for the content match', async () => {
    const q = await sql()
    expect(q).toMatch(/deleted_at IS NULL/)
    expect(q).toMatch(/source_url IS NULL AND encrypted = false AND type <> 'password'/)
  })

  it('limits the content match to short content, in SQL, so long notes are never scanned', async () => {
    expect(await sql()).toMatch(/length\(content\) <= 600/)
  })

  it('lists source_url matches before legacy ones', async () => {
    expect(await sql()).toMatch(/ORDER BY \(source_url IS NULL\), created_at DESC/)
  })

  it('still returns [] instead of throwing on a database error', async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(new Error('db down'))
    expect(await findItemsBySourceUrl(VIDEO)).toEqual([])
  })
})
