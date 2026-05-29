import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getOrCreateEntity, linkItemToEntity, extractAndLinkEntities } from './entityService'

vi.mock('./embedder', () => ({ embedQuery: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]) }))

// A mock PoolClient with a programmable query()
function mockClient() {
  return { query: vi.fn() } as any
}

beforeEach(() => vi.clearAllMocks())

describe('getOrCreateEntity', () => {
  it('returns an existing entity without inserting', async () => {
    const client = mockClient()
    client.query.mockResolvedValueOnce({ rows: [{ id: 'e1', name: 'Nolan', type: 'person' }] })
    const ent = await getOrCreateEntity(client, 'Nolan', 'person')
    expect(ent.id).toBe('e1')
    expect(client.query).toHaveBeenCalledTimes(1) // only the SELECT, no INSERT
  })

  it('creates a new entity (with embedding) when none exists', async () => {
    const client = mockClient()
    client.query
      .mockResolvedValueOnce({ rows: [] })                                   // SELECT — not found
      .mockResolvedValueOnce({ rows: [{ id: 'e2', name: 'Tarantino', type: 'person' }] }) // INSERT
    const ent = await getOrCreateEntity(client, 'Tarantino', 'person')
    expect(ent.id).toBe('e2')
    expect(client.query).toHaveBeenCalledTimes(2)
    // the INSERT should carry an embedding param (the 3rd value)
    const insertParams = client.query.mock.calls[1][1]
    expect(insertParams[0]).toBe('Tarantino')
    expect(insertParams[1]).toBe('person')
    expect(insertParams[2]).not.toBeNull()
  })

  it('trims whitespace from the entity name', async () => {
    const client = mockClient()
    client.query.mockResolvedValueOnce({ rows: [{ id: 'e3' }] })
    await getOrCreateEntity(client, '  Spielberg  ', 'person')
    expect(client.query.mock.calls[0][1]).toEqual(['Spielberg', 'person'])
  })

  it('throws on an empty name', async () => {
    const client = mockClient()
    await expect(getOrCreateEntity(client, '   ', 'person')).rejects.toThrow()
  })

  it('still creates the entity if embedding fails (null embedding)', async () => {
    const { embedQuery } = await import('./embedder')
    vi.mocked(embedQuery).mockRejectedValueOnce(new Error('ollama down'))
    const client = mockClient()
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'e4' }] })
    const ent = await getOrCreateEntity(client, 'NoEmbed', 'person')
    expect(ent.id).toBe('e4')
    expect(client.query.mock.calls[1][1][2]).toBeNull() // embedding param is null
  })
})

describe('linkItemToEntity', () => {
  it('inserts a link with ON CONFLICT DO NOTHING', async () => {
    const client = mockClient()
    client.query.mockResolvedValueOnce({ rows: [] })
    await linkItemToEntity(client, 'item1', 'ent1', 'director')
    const [sql, params] = client.query.mock.calls[0]
    expect(sql).toMatch(/ON CONFLICT/i)
    expect(params).toEqual(['item1', 'ent1', 'director'])
  })
})

describe('extractAndLinkEntities', () => {
  it('links a movie director and cast as person entities', async () => {
    const client = mockClient()
    // every query (SELECT/INSERT/link) resolves with a usable row
    client.query.mockResolvedValue({ rows: [{ id: 'e1' }] })
    await extractAndLinkEntities(client, 'item1', 'media', {
      director: 'Nolan', cast: ['Bale', 'Caine'],
    })
    // roles used should include director and cast
    const roles = client.query.mock.calls
      .map(c => c[1])
      .filter((p): p is unknown[] => Array.isArray(p) && p.length === 3)
      .map(p => p[2])
    expect(roles).toContain('director')
    expect(roles).toContain('cast')
  })

  it('links a book author', async () => {
    const client = mockClient()
    client.query.mockResolvedValue({ rows: [{ id: 'e1' }] })
    await extractAndLinkEntities(client, 'item1', 'book', { author: 'Tolkien' })
    const roles = client.query.mock.calls.map(c => c[1]).filter((p): p is unknown[] => Array.isArray(p) && p.length === 3).map(p => p[2])
    expect(roles).toContain('author')
  })

  it('links place city and country', async () => {
    const client = mockClient()
    client.query.mockResolvedValue({ rows: [{ id: 'e1' }] })
    await extractAndLinkEntities(client, 'item1', 'place', { city: 'Bangkok', country: 'Thailand' })
    const roles = client.query.mock.calls.map(c => c[1]).filter((p): p is unknown[] => Array.isArray(p) && p.length === 3).map(p => p[2])
    expect(roles).toContain('city')
    expect(roles).toContain('country')
  })

  it('does nothing for a note (no structured entities)', async () => {
    const client = mockClient()
    await extractAndLinkEntities(client, 'item1', 'note', {})
    expect(client.query).not.toHaveBeenCalled()
  })

  it('never throws when structured is null', async () => {
    const client = mockClient()
    await expect(extractAndLinkEntities(client, 'item1', 'media', null)).resolves.toBeUndefined()
  })
})
