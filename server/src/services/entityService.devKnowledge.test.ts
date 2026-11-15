import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getOrCreateEntity, extractAndLinkEntities, devEntityRefs, hasDevMarkers, DEV_LINK_ROLES,
} from './entityService'
import { embedQuery } from './embedder'

vi.mock('./embedder', () => ({ embedQuery: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]) }))

function mockClient() {
  return { query: vi.fn() } as any
}

beforeEach(() => vi.clearAllMocks())

describe('hasDevMarkers', () => {
  it('is true for a known kind or a videoId, false otherwise', () => {
    expect(hasDevMarkers({ kind: 'repo' })).toBe(true)
    expect(hasDevMarkers({ kind: 'explainer' })).toBe(true)
    expect(hasDevMarkers({ videoId: 'dQw4w9WgXcQ' })).toBe(true)
    expect(hasDevMarkers({ kind: 'bogus' })).toBe(false)
    expect(hasDevMarkers({ summary: 'x' })).toBe(false)
    expect(hasDevMarkers({})).toBe(false)
  })
})

describe('devEntityRefs', () => {
  it('derives repo, owner and creator, normalising case, .git and a leading @', () => {
    expect(devEntityRefs({ kind: 'repo', repoName: 'Anthropics/Claude-Code.git', creatorHandle: '@SomeOne' })).toEqual({
      repo: 'anthropics/claude-code', owner: 'anthropics', creator: '@someone',
    })
  })

  it('falls back to repoUrl when repoName is missing or malformed', () => {
    expect(devEntityRefs({ kind: 'repo', repoName: 'not a repo', repoUrl: 'https://github.com/a/b' })).toMatchObject({ repo: 'a/b', owner: 'a' })
    expect(devEntityRefs({ kind: 'tool', repoUrl: 'https://github.com/Foo/Bar/' })).toMatchObject({ repo: 'foo/bar' })
  })

  it('ignores junk instead of creating graph nodes from it', () => {
    expect(devEntityRefs({ kind: 'repo', repoName: 'just-words', repoUrl: 'https://example.com/x', creatorHandle: 'some creator name' })).toEqual({})
    expect(devEntityRefs({ kind: 'repo', repoName: '../../etc/passwd' })).toEqual({})
    expect(devEntityRefs({ kind: 'repo', creatorHandle: 'x'.repeat(31) })).toEqual({})
    expect(devEntityRefs({ kind: 'repo', repoName: 42, creatorHandle: { a: 1 } })).toEqual({})
  })

  it('uses a bare owner only when there is no repo', () => {
    expect(devEntityRefs({ kind: 'repo', owner: 'Anthropics' })).toEqual({ owner: 'anthropics' })
    expect(devEntityRefs({ kind: 'repo', owner: 'other', repoName: 'a/b' })).toMatchObject({ owner: 'a' })
  })

  it('links a creator for prompts, skills and explainers that have no repo', () => {
    expect(devEntityRefs({ kind: 'prompt', creatorHandle: 'promptguy' })).toEqual({ creator: '@promptguy' })
  })

  it('takes the YouTube channel only from video items', () => {
    expect(devEntityRefs({ videoId: 'dQw4w9WgXcQ', channel: ' Fireship ' })).toEqual({ channel: 'Fireship' })
    expect(devEntityRefs({ channel: 'Fireship' })).toEqual({})
    expect(devEntityRefs({ videoId: 'dQw4w9WgXcQ', channel: 'c'.repeat(101) })).toEqual({})
  })

  it('can return both dev and channel refs for an explainer video', () => {
    expect(devEntityRefs({ kind: 'explainer', videoId: 'dQw4w9WgXcQ', channel: 'Fireship', repoName: 'a/b' })).toMatchObject({
      repo: 'a/b', channel: 'Fireship',
    })
  })
})

describe('getOrCreateEntity — identifiers', () => {
  it('skips the embedding when embed is false, so identifiers are never fuzzy-merged', async () => {
    const client = mockClient()
    client.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 'e9' }] })
    await getOrCreateEntity(client, 'a/b', 'other', { embed: false })
    expect(embedQuery).not.toHaveBeenCalled()
    expect(client.query.mock.calls[1][1]).toEqual(['a/b', 'other', null])
  })

  it('inserts with ON CONFLICT so a concurrent create cannot abort the transaction', async () => {
    const client = mockClient()
    client.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 'e1' }] })
    await getOrCreateEntity(client, 'Someone', 'person')
    expect(String(client.query.mock.calls[1][0])).toMatch(/ON CONFLICT \(name, type\) DO UPDATE/)
  })
})

describe('extractAndLinkEntities — developer knowledge', () => {
  /** Answers entity lookups with a row whose id encodes type and name, so links are traceable. */
  function trackingClient() {
    const client = mockClient()
    client.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (/FROM entities WHERE/.test(sql)) return { rows: [{ id: `ent:${params[1]}:${params[0]}` }] }
      return { rows: [] }
    })
    return client
  }
  const links = (client: any) =>
    (client.query.mock.calls as unknown[][])
      .filter(c => /INSERT INTO item_entities/.test(String(c[0])))
      .map(c => (c[1] as string[]).slice(1))

  it('links a repo item to its repo, owner and creator with the right entity types', async () => {
    const client = trackingClient()
    await extractAndLinkEntities(client, 'item1', 'link', { kind: 'repo', repoName: 'Anthropics/Claude-Code', creatorHandle: '@dev' })
    expect(links(client)).toEqual([
      ['ent:other:anthropics/claude-code', 'repo'],
      ['ent:organization:anthropics', 'owner'],
      ['ent:person:@dev', 'creator'],
    ])
  })

  it('does not embed identifier entities', async () => {
    const client = mockClient()
    client.query.mockResolvedValue({ rows: [{ id: 'e1' }] })
    await extractAndLinkEntities(client, 'item1', 'link', { kind: 'repo', repoName: 'a/b', creatorHandle: 'x' })
    expect(embedQuery).not.toHaveBeenCalled()
  })

  it('links a YouTube channel as an organization', async () => {
    const client = trackingClient()
    await extractAndLinkEntities(client, 'item1', 'link', { videoId: 'dQw4w9WgXcQ', channel: 'Fireship' })
    expect(links(client)).toEqual([['ent:organization:Fireship', 'channel']])
  })

  it('replaces earlier links first: deletes the managed roles before linking', async () => {
    const client = trackingClient()
    await extractAndLinkEntities(client, 'item1', 'link', { kind: 'repo', repoName: 'a/b' })
    const [sql, params] = client.query.mock.calls[0]
    expect(sql).toMatch(/DELETE FROM item_entities/)
    expect(params).toEqual(['item1', [...DEV_LINK_ROLES]])
    expect(DEV_LINK_ROLES).toEqual(['repo', 'owner', 'creator', 'channel'])
  })

  it('removes stale links even when the new data has nothing linkable', async () => {
    const client = trackingClient()
    await extractAndLinkEntities(client, 'item1', 'link', { kind: 'prompt', summary: 'no handle' })
    expect(String(client.query.mock.calls[0][0])).toMatch(/DELETE FROM item_entities/)
    expect(links(client)).toEqual([])
  })

  it('is idempotent: linking twice issues the same statements, and links use ON CONFLICT DO NOTHING', async () => {
    const a = trackingClient()
    const b = trackingClient()
    const data = { kind: 'repo', repoName: 'a/b', creatorHandle: 'x' }
    await extractAndLinkEntities(a, 'item1', 'link', data)
    await extractAndLinkEntities(b, 'item1', 'link', data)
    expect(links(a)).toEqual(links(b))
    const insert = a.query.mock.calls.find((c: any[]) => /INSERT INTO item_entities/.test(c[0]))!
    expect(String(insert[0])).toMatch(/ON CONFLICT/)
  })

  it('does not touch the graph for an ordinary link or a note with an unknown kind', async () => {
    const client = mockClient()
    await extractAndLinkEntities(client, 'item1', 'link', { summary: 'a web page' })
    await extractAndLinkEntities(client, 'item1', 'note', { kind: 'bogus' })
    expect(client.query).not.toHaveBeenCalled()
  })

  it('works whatever the item type, since it keys on structured.kind', async () => {
    const client = trackingClient()
    await extractAndLinkEntities(client, 'item1', 'note', { kind: 'tool', repoName: 'a/b' })
    expect(links(client).map(l => l[1])).toEqual(['repo', 'owner'])
  })

  it('never throws if the graph write fails', async () => {
    const client = mockClient()
    client.query.mockRejectedValue(new Error('db down'))
    await expect(extractAndLinkEntities(client, 'item1', 'link', { kind: 'repo', repoName: 'a/b' })).resolves.toBeUndefined()
  })
})
