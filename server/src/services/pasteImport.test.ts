import { describe, it, expect, vi } from 'vitest'

vi.mock('../db/client', () => ({ pool: { query: vi.fn(), connect: vi.fn() } }))

import { splitPaste, planPaste, savePlanned, MAX_ENTRY_CHARS, type PlannedEntry } from './pasteImport'

const none = { findBySourceUrl: vi.fn().mockResolvedValue([]) }

describe('splitPaste', () => {
  it('returns nothing for empty / whitespace input', () => {
    expect(splitPaste('')).toEqual([])
    expect(splitPaste('  \n \r\n ')).toEqual([])
  })

  it('treats a list of bare URLs as one entry per line', () => {
    expect(splitPaste('https://github.com/a/b\nhttps://github.com/c/d\n\nhttps://youtu.be/dQw4w9WgXcQ')).toEqual([
      'https://github.com/a/b', 'https://github.com/c/d', 'https://youtu.be/dQw4w9WgXcQ',
    ])
  })

  it('splits on blank lines and keeps multi-line blocks together', () => {
    expect(splitPaste('Caption one\nline two\n\n\n  \nCaption two')).toEqual(['Caption one\nline two', 'Caption two'])
  })

  it('prefers explicit --- separators over blank lines', () => {
    const out = splitPaste('First para\n\nstill first\n---\nSecond\n-----\nThird')
    expect(out).toEqual(['First para\n\nstill first', 'Second', 'Third'])
  })

  it('normalises CRLF and drops empty blocks', () => {
    expect(splitPaste('a\r\n\r\nb\r\n---\r\n---\r\nc')).toEqual(['a\n\nb', 'c'])
  })

  it('does not treat a URL mixed with prose as a URL list', () => {
    expect(splitPaste('Check this out\nhttps://github.com/a/b')).toEqual(['Check this out\nhttps://github.com/a/b'])
  })
})

describe('planPaste', () => {
  it('detects source and sourceUrl per entry', async () => {
    const out = await planPaste(
      ['https://github.com/anthropics/claude-code', 'see https://www.instagram.com/p/ABC123/ nice', 'just a thought'],
      none,
    )
    expect(out.map(e => [e.source, e.sourceUrl])).toEqual([
      ['url', 'https://github.com/anthropics/claude-code'],
      ['instagram', 'https://www.instagram.com/p/ABC123/'],
      ['manual', undefined],
    ])
    expect(out.every(e => e.status === 'new')).toBe(true)
  })

  it('skips a repeat of the same URL in one paste, however it is spelled', async () => {
    const out = await planPaste(
      ['https://github.com/a/b', 'http://www.github.com/A/B.git?utm_source=x', 'https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=zz'],
      none,
    )
    expect(out.map(e => e.status)).toEqual(['new', 'skipped', 'new', 'skipped'])
    expect(out[1].reason).toBe('duplicate-in-paste')
    expect(out[3].reason).toBe('duplicate-in-paste')
  })

  it('skips identical text (ignoring case and whitespace) in one paste', async () => {
    const out = await planPaste(['Buy  milk', 'buy milk'], none)
    expect(out[1]).toMatchObject({ status: 'skipped', reason: 'duplicate-in-paste' })
  })

  it('skips entries whose URL is already saved and reports the existing item', async () => {
    const find = vi.fn().mockImplementation(async (url: string) =>
      url.includes('a/b') ? [{ id: 'old-1', title: 'Saved repo', type: 'link', similarity: 1 }] : [])
    const out = await planPaste(['https://github.com/a/b', 'https://github.com/c/d'], { findBySourceUrl: find })
    expect(out[0]).toMatchObject({ status: 'skipped', reason: 'already-saved', existingId: 'old-1', existingTitle: 'Saved repo' })
    expect(out[1].status).toBe('new')
    expect(find).toHaveBeenCalledTimes(2)
  })

  it('does not look up the DB for text-only or already-skipped entries', async () => {
    const find = vi.fn().mockResolvedValue([])
    await planPaste(['plain note', 'https://github.com/a/b', 'https://github.com/a/b'], { findBySourceUrl: find })
    expect(find).toHaveBeenCalledTimes(1)
  })

  it('skips an over-long entry instead of truncating it', async () => {
    const out = await planPaste(['x'.repeat(MAX_ENTRY_CHARS + 1)], none)
    expect(out[0]).toMatchObject({ status: 'skipped', reason: 'too-long' })
  })

  it('labels entries with their first line, shortened', async () => {
    const out = await planPaste([`${'w'.repeat(120)}\nsecond line`], none)
    expect(out[0].title).toHaveLength(78)
    expect(out[0].title.endsWith('…')).toBe(true)
  })

  it('keeps the original index so results line up with the paste', async () => {
    const out = await planPaste(['a', 'a', 'b'], none)
    expect(out.map(e => e.index)).toEqual([0, 1, 2])
  })
})

describe('savePlanned', () => {
  it('inserts each entry as an unreviewed note with its source and URL, returning ids in order', async () => {
    let n = 0
    const client = { query: vi.fn().mockImplementation(async () => ({ rows: [{ id: `id-${++n}` }] })) }
    const entries = [
      { index: 0, text: 'https://github.com/a/b', title: 'https://github.com/a/b', source: 'url', sourceUrl: 'https://github.com/a/b', status: 'new' },
      { index: 2, text: 'a thought', title: 'a thought', source: 'manual', status: 'new' },
    ] as PlannedEntry[]

    const ids = await savePlanned(client as never, entries)

    expect(ids).toEqual(['id-1', 'id-2'])
    const [sql, params] = client.query.mock.calls[0]
    expect(sql).toMatch(/INSERT INTO items/)
    expect(sql).toMatch(/'note'/)
    expect(sql).toMatch(/FALSE/)
    expect(params).toEqual(['https://github.com/a/b', 'https://github.com/a/b', 'url', 'https://github.com/a/b'])
    expect(client.query.mock.calls[1][1]).toEqual(['a thought', 'a thought', 'manual', null])
  })
})
