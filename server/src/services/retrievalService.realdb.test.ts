// Opt-in test against the REAL Postgres (set MEMEX_REALDB_TEST=1, with DATABASE_URL in .env and migration 025 applied).
// It proves the ranking SQL in a way mocks cannot: unembedded items must not sort first, and vectors from another model
// must not count. Everything runs inside one transaction that is rolled back, and a second connection checks that
// nothing leaked. The code under test issues no transaction statements of its own (plain SELECTs), so BEGIN/ROLLBACK is
// safe here; code that opens its own transaction would need SAVEPOINTs instead. Fixtures are synthetic.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'

const h = vi.hoisted(() => ({ client: null as null | { query: (...a: unknown[]) => Promise<unknown> } }))
vi.mock('../db/client', () => ({ pool: { query: (...a: unknown[]) => h.client!.query(...a) } }))
vi.mock('./embedder', () => ({ embedQuery: vi.fn() }))
vi.mock('../lib/logger', () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { embedQuery } from './embedder'
import { retrieveItems } from './retrievalService'

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') })
const enabled = process.env.MEMEX_REALDB_TEST === '1' && !!process.env.DATABASE_URL

const unit = (dim: number) => JSON.stringify(Array.from({ length: 768 }, (_, i) => (i === dim ? 1 : 0)))
const MARK = 'qzv9x'

describe.skipIf(!enabled)('retrieveItems against the real database (rolled back)', () => {
  let tx: pg.Client
  let probe: pg.Client
  let before = 0
  const ids: Record<string, string> = {}

  const count = async (c: pg.Client) =>
    Number((await c.query(`SELECT count(*) FROM items WHERE title LIKE '${MARK}%'`)).rows[0].count)

  beforeAll(async () => {
    tx = new pg.Client({ connectionString: process.env.DATABASE_URL })
    probe = new pg.Client({ connectionString: process.env.DATABASE_URL })
    await Promise.all([tx.connect(), probe.connect()])
    before = await count(probe)
    await tx.query('BEGIN')
    h.client = tx as never
    const add = async (name: string, vec: string | null, model: string | null) => {
      const { rows } = await tx.query(
        `INSERT INTO items (title, type, content, embedding, embedding_model)
         VALUES ($1, 'note', 'synthetic fixture', $2::vector, $3) RETURNING id`,
        [`${MARK} ${name}`, vec, model],
      )
      ids[name] = rows[0].id
    }
    await add('unembedded', null, null)
    await add('active-match', unit(0), 'ollama:nomic-embed-text')
    await add('other-model', unit(0), 'gemini:gemini-embedding-001')
  })

  afterAll(async () => {
    // A second connection must see nothing before the rollback, and the count must be unchanged after it.
    const during = await count(probe)
    await tx.query('ROLLBACK')
    const after = await count(probe)
    await Promise.all([tx.end(), probe.end()])
    expect(during).toBe(before)
    expect(after).toBe(before)
  })

  it('ranks the item with an active-model vector first, never the unembedded one', async () => {
    vi.mocked(embedQuery).mockResolvedValue(JSON.parse(unit(0)))
    const { items, semantic } = await retrieveItems({ query: MARK, limit: 5000 })
    expect(semantic).toBe(true)
    expect(items[0].id).toBe(ids['active-match'])
    // a vector from another model scores 0 for the semantic part, exactly like having none
    const pos = (n: string) => items.findIndex((i) => i.id === ids[n])
    expect(pos('unembedded')).toBeGreaterThan(-1) // all fixtures are on the page, so the comparisons below mean something
    expect(pos('other-model')).toBeGreaterThan(-1)
    expect(pos('active-match')).toBeLessThan(pos('unembedded'))
    expect(pos('active-match')).toBeLessThan(pos('other-model'))
  })

  it('Ask only retrieves items that have an active-model vector', async () => {
    vi.mocked(embedQuery).mockResolvedValue(JSON.parse(unit(0)))
    const { items } = await retrieveItems({ query: MARK, limit: 50, requireVector: true })
    const got = new Set(items.map((i) => i.id))
    expect(got.has(ids['active-match'])).toBe(true)
    expect(got.has(ids['unembedded'])).toBe(false)
    expect(got.has(ids['other-model'])).toBe(false)
  })

  it('falls back to keyword search when the query cannot be embedded', async () => {
    vi.mocked(embedQuery).mockRejectedValue(new Error('provider down'))
    const { items, semantic } = await retrieveItems({ query: MARK, limit: 10 })
    expect(semantic).toBe(false)
    expect(new Set(items.map((i) => i.id))).toEqual(new Set(Object.values(ids)))
  })
})
