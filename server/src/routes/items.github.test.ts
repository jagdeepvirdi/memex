import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../index'
import { pool } from '../db/client'
import { fetchGithubRepo, GithubLookupError } from '../services/githubApi'

vi.hoisted(() => { process.env.GITHUB_REFRESH_RATE_LIMIT_MAX = '1000' })

vi.mock('../db/client', () => ({ pool: { query: vi.fn(), connect: vi.fn() } }))
vi.mock('../services/embeddingWorker', () => ({ startEmbeddingWorker: vi.fn() }))
vi.mock('../services/githubApi', async orig => ({ ...(await orig<typeof import('../services/githubApi')>()), fetchGithubRepo: vi.fn() }))

let AUTH = ''
beforeAll(() => {
  const secret = process.env.JWT_SECRET || 'memex-default-secret'
  AUTH = `Bearer ${jwt.sign({ userId: 'u1', email: 't@t.com' }, secret)}`
})

const META = {
  fullName: 'anthropics/claude-code', stars: 12345, forks: 900, language: 'TypeScript', topics: ['ai'], license: 'MIT',
  pushedAt: '2026-11-01T00:00:00Z', archived: false, isFork: false, fetchedAt: '2026-11-15T00:00:00.000Z',
}
const ROW = {
  id: 'item-1', encrypted: false, source_url: 'https://github.com/Anthropics/Claude-Code',
  structured: { kind: 'repo', repoName: 'Anthropics/Claude-Code', summary: 's' },
}
const ITEM_ROW = {
  id: 'item-1', title: 'claude-code', type: 'link', content: 'c', structured: { ...ROW.structured, github: META }, source: 'url',
  source_url: ROW.source_url, encrypted: false, reviewed: false, created_at: new Date(), updated_at: new Date(), categories: [], tags: [],
}

/** pool.query routed by SQL (the lookup and the update); pool.connect serves the final read. */
function db(row: Record<string, unknown> | null = ROW) {
  vi.mocked(pool.query).mockImplementation((async (sql: string) =>
    /FROM items WHERE id = \$1 AND deleted_at IS NULL/.test(sql) ? { rows: row ? [row] : [] } : { rows: [], rowCount: 1 }) as never)
  vi.mocked(pool.connect).mockResolvedValue({ query: vi.fn().mockResolvedValue({ rows: [ITEM_ROW] }), release: vi.fn() } as never)
}
const post = (id = 'item-1') => request(app).post(`/api/items/${id}/github`).set('Authorization', AUTH)
const updates = () => vi.mocked(pool.query).mock.calls.filter(c => /jsonb_set/.test(String(c[0])))

beforeEach(() => {
  vi.clearAllMocks()
  db()
  vi.mocked(fetchGithubRepo).mockResolvedValue(META as never)
})

describe('POST /api/items/:id/github', () => {
  it('requires auth', async () => {
    expect((await request(app).post('/api/items/item-1/github')).status).toBe(401)
  })

  it('404s for a missing item without calling GitHub', async () => {
    db(null)
    expect((await post('nope')).status).toBe(404)
    expect(fetchGithubRepo).not.toHaveBeenCalled()
  })

  it('refuses encrypted items', async () => {
    db({ ...ROW, encrypted: true })
    expect((await post()).status).toBe(400)
    expect(fetchGithubRepo).not.toHaveBeenCalled()
  })

  it('422s for an item that is not a GitHub repository, without calling GitHub', async () => {
    db({ id: 'item-1', encrypted: false, source_url: 'https://example.com/a', structured: { summary: 'a web page' } })
    const res = await post()
    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/not a GitHub repository/)
    expect(fetchGithubRepo).not.toHaveBeenCalled()
  })

  it('refreshes using structured data: asks GitHub afresh for the lower-cased name, saves it, returns item + github', async () => {
    const res = await post()
    expect(res.status).toBe(200)
    expect(fetchGithubRepo).toHaveBeenCalledWith('anthropics/claude-code', { fresh: true })
    expect(res.body.github).toEqual(META)
    expect(res.body.item.id).toBe('item-1')

    expect(updates()).toHaveLength(1)
    const [sql, params] = updates()[0]
    expect(sql).toContain("jsonb_set(COALESCE(structured, '{}'::jsonb), '{github}'")
    expect(sql).toMatch(/deleted_at IS NULL/)
    expect(params).toEqual([JSON.stringify(META), 'item-1'])
  })

  it('falls back to the saved source URL when structured data has no repo yet', async () => {
    db({ id: 'item-1', encrypted: false, source_url: 'https://github.com/Foo/Bar', structured: {} })
    await post()
    expect(fetchGithubRepo).toHaveBeenCalledWith('foo/bar', { fresh: true })
  })

  it.each([
    ['not_found', 404], ['rate_limited', 429], ['blocked', 409], ['unavailable', 502], ['invalid', 422],
  ] as const)('maps a %s lookup failure to %i with the message, and saves nothing', async (kind, status) => {
    vi.mocked(fetchGithubRepo).mockRejectedValue(new GithubLookupError(kind, `message for ${kind}`))
    const res = await post()
    expect(res.status).toBe(status)
    expect(res.body).toMatchObject({ error: `message for ${kind}`, kind })
    expect(updates()).toHaveLength(0)
  })

  it('tells the UI when the rate limit resets', async () => {
    vi.mocked(fetchGithubRepo).mockRejectedValue(new GithubLookupError('rate_limited', 'limit reached', 1_800_000_000_000))
    const res = await post()
    expect(res.body.resetAt).toBe(1_800_000_000_000)
  })

  it('500s on an unexpected error, with a generic message', async () => {
    vi.mocked(fetchGithubRepo).mockRejectedValue(new Error('boom password=hunter2'))
    const res = await post()
    expect(res.status).toBe(500)
    expect(JSON.stringify(res.body)).not.toContain('hunter2')
  })

  it('500s if saving fails', async () => {
    vi.mocked(pool.query).mockImplementation((async (sql: string) => {
      if (/jsonb_set/.test(sql)) throw new Error('db down')
      return { rows: [ROW] }
    }) as never)
    expect((await post()).status).toBe(500)
  })
})
