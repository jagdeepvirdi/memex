import { describe, it, expect, vi } from 'vitest'
import { MemexClient, MemexError } from './client.js'

const KEY = 'mxk_' + 'b'.repeat(48)
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function make(impl: (url: URL, init: RequestInit) => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (url: URL | string, init?: RequestInit) => impl(new URL(String(url)), init ?? {}))
  return { client: new MemexClient('http://localhost:3002', KEY, fetchMock as unknown as typeof fetch), fetchMock }
}

describe('MemexClient requests', () => {
  it('sends the key as a bearer token and the query as URL parameters, skipping empty ones', async () => {
    const { client, fetchMock } = make(() => json({ results: [], semantic: true, withheldPrivate: 0 }))
    await client.search('lemon chicken', { limit: 5, type: undefined, tag: '' })
    const [url, init] = fetchMock.mock.calls[0]
    const u = new URL(String(url))
    expect(u.pathname).toBe('/api/mcp/search')
    expect(u.searchParams.get('q')).toBe('lemon chicken')
    expect(u.searchParams.get('limit')).toBe('5')
    expect(u.searchParams.has('type')).toBe(false)
    expect(u.searchParams.has('tag')).toBe(false)
    expect((init!.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`)
    expect(init!.method).toBe('GET')
  })

  it('never puts the key in the URL', async () => {
    const { client, fetchMock } = make(() => json({ results: [], withheldPrivate: 0 }))
    await client.recent({ limit: 3 })
    expect(String(fetchMock.mock.calls[0][0])).not.toContain(KEY)
  })

  it('encodes the item id in the path', async () => {
    const { client, fetchMock } = make(() => json({ id: 'x' }))
    await client.getItem('a/b c')
    expect(new URL(String(fetchMock.mock.calls[0][0])).pathname).toBe('/api/mcp/items/a%2Fb%20c')
  })

  it('posts JSON bodies for saves', async () => {
    const { client, fetchMock } = make(() => json({ item: { id: '1', title: 'T', type: 'note' }, similarItems: [] }, 201))
    await client.saveNote({ content: 'hello', tags: ['x'] })
    await client.saveLink('https://example.com/a')
    const [, noteInit] = fetchMock.mock.calls[0]
    expect(noteInit!.method).toBe('POST')
    expect(JSON.parse(String(noteInit!.body))).toEqual({ content: 'hello', tags: ['x'] })
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]!.body))).toEqual({ url: 'https://example.com/a' })
    expect(new URL(String(fetchMock.mock.calls[1][0])).pathname).toBe('/api/mcp/links')
  })
})

describe('MemexClient errors are readable and never contain the key', () => {
  const expectMessage = async (p: Promise<unknown>, re: RegExp, status?: number) => {
    const err = await p.then(() => null, e => e)
    expect(err).toBeInstanceOf(MemexError)
    expect((err as MemexError).message).toMatch(re)
    expect((err as MemexError).message).not.toContain(KEY)
    if (status) expect((err as MemexError).status).toBe(status)
  }

  it('401: key rejected, with what to do', async () => {
    const { client } = make(() => json({ error: 'Invalid token' }, 401))
    await expectMessage(client.recent(), /rejected the key.*Settings > Capture/, 401)
  })

  it('403 and 400 and 404 pass Memex\'s own explanation on', async () => {
    await expectMessage(make(() => json({ error: 'This item is private in Memex and is not shared with assistants.' }, 403)).client.getItem('x'), /private in Memex/, 403)
    await expectMessage(make(() => json({ error: 'Strict Local Mode is on in Memex, so assistants cannot read or save notes.' }, 403)).client.search('x'), /Strict Local Mode/, 403)
    await expectMessage(make(() => json({ error: 'No item with that id' }, 404)).client.getItem('x'), /No item/, 404)
    await expectMessage(make(() => json({ error: 'Invalid search' }, 400)).client.search('x'), /Invalid search/, 400)
  })

  it('429: asks to wait', async () => {
    await expectMessage(make(() => json({ error: 'x' }, 429)).client.recent(), /too many requests/i, 429)
  })

  it('500 without a body still gives a sentence', async () => {
    await expectMessage(make(() => new Response('', { status: 500 })).client.recent(), /HTTP 500/, 500)
  })

  it('a connection failure says Memex is not reachable and how to start it', async () => {
    const { client } = make(() => { throw new TypeError('fetch failed') })
    await expectMessage(client.recent(), /Cannot reach Memex at http:\/\/localhost:3002.*Is it running/)
  })

  it('a timeout says so', async () => {
    const { client } = make(() => { throw Object.assign(new Error('timed out'), { name: 'TimeoutError' }) })
    await expectMessage(client.search('x'), /did not answer within 30 seconds/)
  })

  it('saves wait longer than reads', async () => {
    const { client } = make(() => { throw Object.assign(new Error('timed out'), { name: 'TimeoutError' }) })
    await expectMessage(client.saveLink('https://example.com'), /within 180 seconds/)
  })

  it('a page that is not JSON (wrong MEMEX_URL) is explained', async () => {
    const { client } = make(() => new Response('<html>hello</html>', { status: 200 }))
    await expectMessage(client.recent(), /not JSON.*MEMEX_URL/)
  })
})
