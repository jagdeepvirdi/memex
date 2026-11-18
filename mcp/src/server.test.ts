import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { MemexClient } from './client.js'
import { createServer, INSTRUCTIONS } from './server.js'

// A real MCP round trip (client <-> server over an in-memory pipe) with the Memex HTTP API mocked. Synthetic data only.

const KEY = 'mxk_' + 'c'.repeat(48)
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const ENTRY = {
  id: '3f2b8c1e-0000-4000-8000-000000000001', title: 'Lemon garlic roast chicken', type: 'recipe',
  summary: 'A simple roast.', snippet: 'Roast thighs with lemon.', categories: ['Food', 'Savory'], tags: ['dinner'],
  createdAt: '2026-01-02T10:00:00.000Z',
}

let handler: (url: URL, init: RequestInit) => Response | Promise<Response>
const fetchMock = vi.fn(async (url: URL | string, init?: RequestInit) => handler(new URL(String(url)), init ?? {}))

async function connect() {
  const server = createServer(new MemexClient('http://localhost:3002', KEY, fetchMock as unknown as typeof fetch))
  const [a, b] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test-host', version: '0.0.0' })
  await Promise.all([server.connect(a), client.connect(b)])
  return client
}
const textOf = (res: Awaited<ReturnType<Client['callTool']>>) => (res.content as Array<{ type: string; text: string }>)[0].text

beforeEach(() => {
  fetchMock.mockClear()
  handler = () => json({})
})

describe('the server announces itself', () => {
  it('lists the five tools with read-only hints on the readers', async () => {
    const client = await connect()
    const { tools } = await client.listTools()
    expect(tools.map(t => t.name).sort()).toEqual(['get_memex_item', 'recent_memex_items', 'save_link_to_memex', 'save_note_to_memex', 'search_memex'])
    const byName = Object.fromEntries(tools.map(t => [t.name, t]))
    for (const n of ['search_memex', 'recent_memex_items', 'get_memex_item']) expect(byName[n].annotations?.readOnlyHint).toBe(true)
    for (const n of ['save_note_to_memex', 'save_link_to_memex']) {
      expect(byName[n].annotations?.readOnlyHint).toBe(false)
      expect(byName[n].annotations?.destructiveHint).toBe(false)
    }
    expect(byName.save_link_to_memex.annotations?.idempotentHint).toBe(true)
    expect(client.getInstructions()).toBe(INSTRUCTIONS)
  })

  it('has no tool that deletes, edits or exports', async () => {
    const { tools } = await (await connect()).listTools()
    expect(tools.some(t => /delete|remove|edit|update|export|vault|password|settings/i.test(t.name))).toBe(false)
  })
})

describe('search_memex', () => {
  it('formats results for the assistant and mentions held-back private matches', async () => {
    handler = () => json({ results: [ENTRY], semantic: true, withheldPrivate: 2 })
    const client = await connect()
    const res = await client.callTool({ name: 'search_memex', arguments: { query: 'chicken', limit: 3, type: 'recipe' } })
    expect(res.isError).toBeFalsy()
    const t = textOf(res)
    expect(t).toContain('Lemon garlic roast chicken')
    expect(t).toContain(`id: ${ENTRY.id}`)
    expect(t).toContain('A simple roast.')
    expect(t).toContain('recipe | Food > Savory | tags: dinner | 2026-01-02')
    expect(t).toContain('2 more matches are private in Memex and not shown')
    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.pathname).toBe('/api/mcp/search')
    expect(url.searchParams.get('type')).toBe('recipe')
    expect(url.searchParams.get('limit')).toBe('3')
  })

  it('says so when nothing matches, and when only keywords were used', async () => {
    handler = () => json({ results: [], semantic: false, withheldPrivate: 0 })
    const t = textOf(await (await connect()).callTool({ name: 'search_memex', arguments: { query: 'zzz' } }))
    expect(t).toContain('nothing found')
  })

  it('rejects an empty query before any request is made', async () => {
    const client = await connect()
    const res = await client.callTool({ name: 'search_memex', arguments: { query: '' } }).catch(e => ({ isError: true, thrown: String(e) }))
    expect(res.isError).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('turns a Memex error into a readable tool error, not a crash', async () => {
    handler = () => json({ error: 'Strict Local Mode is on in Memex, so assistants cannot read or save notes.' }, 403)
    const res = await (await connect()).callTool({ name: 'search_memex', arguments: { query: 'x' } })
    expect(res.isError).toBe(true)
    expect(textOf(res)).toMatch(/Strict Local Mode/)
  })

  it('hides unexpected errors behind a plain message (no stack, no key)', async () => {
    handler = () => { throw new Error(`boom with ${KEY}`) }
    const res = await (await connect()).callTool({ name: 'search_memex', arguments: { query: 'x' } })
    expect(res.isError).toBe(true)
    expect(textOf(res)).not.toContain(KEY)
  })
})

describe('recent_memex_items / get_memex_item', () => {
  it('lists recent items', async () => {
    handler = () => json({ results: [ENTRY], withheldPrivate: 0 })
    const t = textOf(await (await connect()).callTool({ name: 'recent_memex_items', arguments: {} }))
    expect(t).toContain('Recently saved in Memex')
    expect(t).toContain('Lemon garlic roast chicken')
  })

  it('reads one item in full', async () => {
    handler = () => json({ ...ENTRY, content: 'Roast thighs with lemon and thyme.', structured: {}, source: 'manual', updatedAt: '2026-01-03T10:00:00.000Z', contentTruncated: true })
    const t = textOf(await (await connect()).callTool({ name: 'get_memex_item', arguments: { id: ENTRY.id } }))
    expect(t).toContain('# Lemon garlic roast chicken')
    expect(t).toContain('Roast thighs with lemon and thyme.')
    expect(t).toContain('the end was cut off')
  })

  it('passes on the refusal for a private item', async () => {
    handler = () => json({ error: 'This item is private in Memex and is not shared with assistants.' }, 403)
    const res = await (await connect()).callTool({ name: 'get_memex_item', arguments: { id: 'x' } })
    expect(res.isError).toBe(true)
    expect(textOf(res)).toMatch(/private in Memex/)
  })
})

describe('saving', () => {
  it('saves a note and reports what was created', async () => {
    handler = () => json({ item: { id: 'n1', title: 'Shopping', type: 'note' }, similarItems: [] }, 201)
    const t = textOf(await (await connect()).callTool({ name: 'save_note_to_memex', arguments: { content: 'Buy lemons', tags: ['errands'] } }))
    expect(t).toBe('Saved to Memex as "Shopping" (note, id: n1).')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]!.body))).toEqual({ content: 'Buy lemons', tags: ['errands'] })
  })

  it('saves a link, and says when it was already there', async () => {
    handler = () => json({ item: { id: 'l1', title: 'A page', type: 'link' }, similarItems: [], duplicate: true }, 201)
    const t = textOf(await (await connect()).callTool({ name: 'save_link_to_memex', arguments: { url: 'https://example.com/a' } }))
    expect(t).toContain('already in Memex')
    expect(t).toContain('nothing new was saved')
  })

  it('refuses a URL that is not a URL before calling Memex', async () => {
    const client = await connect()
    const res = await client.callTool({ name: 'save_link_to_memex', arguments: { url: 'not a url' } }).catch(e => ({ isError: true, thrown: String(e) }))
    expect(res.isError).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
