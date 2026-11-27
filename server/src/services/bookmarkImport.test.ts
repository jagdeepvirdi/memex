import { describe, it, expect, vi } from 'vitest'

vi.mock('../db/client', () => ({ pool: { query: vi.fn() } }))

import {
  parseBookmarksHtml, parseBookmarksCsv, parseCsv, readBookmarkUpload, planBookmarks, decodeEntities,
  saveBookmarks, bookmarkContent, MAX_BOOKMARKS, type PlanDeps, type PlannedBookmark,
} from './bookmarkImport'

// Synthetic exports only: example.com addresses, invented folder and tag names.
const CHROME = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
  <DT><H3 ADD_DATE="1700000000" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>
  <DL><p>
    <DT><A HREF="https://example.com/a" ADD_DATE="1700000100" ICON="data:image/png;base64,AAAA">Example A &amp; friends</A>
    <DT><H3>Recipes</H3>
    <DL><p>
      <DT><A HREF="https://example.com/soup" ADD_DATE="1700000200" TAGS="Dinner, quick meals">Soup</A>
    </DL><p>
    <DT><A HREF="https://example.com/b">Example B</A>
  </DL><p>
</DL><p>`

const POCKET = `<html><body><h1>Unread</h1><ul>
<li><a href="https://example.com/read-me" time_added="1650000000" tags="reading,tech">Read me</a></li>
</ul><h1>Read Archive</h1><ul>
<li><a href="https://example.org/old" time_added="1500000000" tags="">Old one</a></li>
</ul></body></html>`

describe('decodeEntities', () => {
  it('decodes named, decimal and hex entities and leaves unknown ones alone', () => {
    expect(decodeEntities('A &amp; B &lt;c&gt; &#65; &#x42; &bogus;')).toBe('A & B <c> A B &bogus;')
  })
})

describe('parseBookmarksHtml', () => {
  it('reads a Chrome/Netscape export: title, folder tag, own tags, dates, entities', () => {
    const items = parseBookmarksHtml(CHROME)
    expect(items.map((b) => b.url)).toEqual(['https://example.com/a', 'https://example.com/soup', 'https://example.com/b'])
    expect(items[0].title).toBe('Example A & friends')
    // "Bookmarks bar" is a browser root, not a topic
    expect(items[0].tags).toEqual([])
    expect(items[0].folder).toBeUndefined()
    expect(items[0].createdAt?.getTime()).toBe(1700000100 * 1000)
    // own tags first, then the folder
    expect(items[1].tags).toEqual(['dinner', 'quick-meals', 'recipes'])
    expect(items[1].folder).toBe('Recipes')
    // leaving the Recipes folder drops its tag again
    expect(items[2].tags).toEqual([])
  })

  it('reads a Pocket export: the list heading is the folder, empty tags are dropped', () => {
    const items = parseBookmarksHtml(POCKET)
    expect(items).toHaveLength(2)
    expect(items[0].tags).toEqual(['reading', 'tech', 'unread'])
    expect(items[1].tags).toEqual(['read-archive'])
    expect(items[1].createdAt?.getFullYear()).toBe(2017)
  })

  it('treats Firefox microsecond dates and absurd dates sensibly', () => {
    const [firefox] = parseBookmarksHtml('<DL><DT><A HREF="https://example.com/f" ADD_DATE="1700000000000000">F</A></DL>')
    expect(firefox.createdAt?.getTime()).toBe(1700000000 * 1000)
    const [bad] = parseBookmarksHtml('<DL><DT><A HREF="https://example.com/g" ADD_DATE="5">G</A></DL>')
    expect(bad.createdAt).toBeUndefined()
  })

  it('uses the host as the title when a bookmark has none, and ignores anchors without an address', () => {
    const items = parseBookmarksHtml('<DL><DT><A HREF="https://www.example.com/x"></A><DT><A NAME="top">no link</A></DL>')
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('example.com')
  })

  it('never throws on junk', () => {
    expect(parseBookmarksHtml('')).toEqual([])
    expect(() => parseBookmarksHtml('<a href=><<DL></DL></DL></h3>')).not.toThrow()
  })
})

describe('parseCsv / parseBookmarksCsv', () => {
  it('handles quotes, doubled quotes, commas and newlines inside a field', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi""\nthere"\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"\nthere']])
  })

  it('reads a Raindrop CSV', () => {
    const csv = 'id,title,note,excerpt,url,folder,tags,created,cover,highlights\n1,"Soup, hot",,,https://example.com/soup,Recipes,"dinner, quick",2024-05-01T10:00:00.000Z,,\n2,,,,https://example.com/two,Unsorted,,,,'
    const items = parseBookmarksCsv(csv)
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ url: 'https://example.com/soup', title: 'Soup, hot', tags: ['dinner', 'quick', 'recipes'], folder: 'Recipes' })
    expect(items[0].createdAt?.getUTCFullYear()).toBe(2024)
    expect(items[1].title).toBe('example.com')
    expect(items[1].tags).toEqual([]) // "Unsorted" is generic
  })

  it('says what is wrong when there is no url column', () => {
    expect(() => parseBookmarksCsv('title,folder\nx,y')).toThrow(/url/i)
  })
})

describe('readBookmarkUpload', () => {
  it('picks the reader from the file name, or from the content', () => {
    expect(readBookmarkUpload(Buffer.from(CHROME), 'bookmarks.html')).toHaveLength(3)
    expect(readBookmarkUpload(Buffer.from(CHROME), 'export')).toHaveLength(3)
    expect(readBookmarkUpload(Buffer.from('url,title\nhttps://example.com/c,C'), 'raindrop.csv')).toHaveLength(1)
  })

  it('refuses something that is not a bookmarks file, with a readable message', () => {
    expect(() => readBookmarkUpload(Buffer.from('just some text'), 'notes.txt')).toThrow(/bookmarks export/i)
  })
})

describe('planBookmarks', () => {
  const none: PlanDeps = { loadExisting: async () => new Map() }
  const b = (url: string) => ({ url, title: url, tags: [] as string[] })

  it('skips non-web addresses, repeats in the file (any spelling) and links already saved', async () => {
    const deps: PlanDeps = { loadExisting: async () => new Map([['example.com/have', 'item-1']]) }
    const planned = await planBookmarks([
      b('https://example.com/one'),
      b('http://www.example.com/one/?utm_source=x'),
      b('javascript:void(0)'),
      b('place:sort=8'),
      b('https://Example.com/have'),
      b('https://example.com/two'),
    ], deps)
    expect(planned.map((p) => p.status === 'new' ? 'new' : p.reason)).toEqual(['new', 'duplicate-in-file', 'not-a-link', 'not-a-link', 'already-saved', 'new'])
    expect(planned[4].existingId).toBe('item-1')
  })

  it('caps one import at the limit', async () => {
    const many = Array.from({ length: MAX_BOOKMARKS + 3 }, (_, i) => b(`https://example.com/p${i}`))
    const planned = await planBookmarks(many, none)
    expect(planned.filter((p) => p.status === 'new')).toHaveLength(MAX_BOOKMARKS)
    expect(planned.at(-1)?.reason).toBe('limit-reached')
  })
})

describe('saveBookmarks', () => {
  it('inserts link items with the address as source and tags them from-bookmarks', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ id: 'new-1' }] })
    const setTags = vi.fn().mockResolvedValue(undefined)
    const planned: PlannedBookmark = { index: 0, status: 'new', url: 'https://example.com/soup', title: 'Soup', tags: ['recipes'] }
    const ids = await saveBookmarks({ query } as never, [planned], setTags)
    expect(ids).toEqual(['new-1'])
    const [sql, params] = query.mock.calls[0]
    expect(sql).toMatch(/'link'/)
    expect(params[0]).toBe('Soup')
    expect(params[1]).toBe(bookmarkContent(planned))
    expect(params[2]).toBe('https://example.com/soup')
    expect(setTags).toHaveBeenCalledWith(expect.anything(), 'new-1', ['from-bookmarks', 'recipes'])
  })
})
