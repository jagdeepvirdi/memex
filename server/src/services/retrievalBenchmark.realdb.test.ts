// Retrieval benchmark (R9-02). Opt-in like the other *.realdb tests (MEMEX_REALDB_TEST=1, a migrated Postgres with
// pgvector at DATABASE_URL); CI runs it against a throwaway service database. It loads the synthetic library from
// retrievalFixture.ts inside one transaction, embeds notes and queries with a deterministic hashed bag of words (no model,
// no network), runs the real `retrieveItems` SQL, and scores hit rates. It guards the ranking SQL and the 70/30 weights
// against regressions; it does NOT measure how good any embedding model is. Everything is rolled back.
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
import { activeEmbeddingId } from './embeddingService'
import { NOTES, QUERIES } from './retrievalFixture'
import { hashedEmbedding, scoreBenchmark, type Ranking } from './retrievalMetrics'

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') })
const enabled = process.env.MEMEX_REALDB_TEST === '1' && !!process.env.DATABASE_URL
const MARK = 'bench9'
// Baseline 1.00 (it was 0.55 while the terms were AND-ed); the gate leaves room for fixture growth.
const KEYWORD_GATE = 0.9


describe.skipIf(!enabled)('retrieval benchmark against the real database (rolled back)', () => {
  let tx: pg.Client
  let probe: pg.Client
  let before = 0
  const idOf = new Map<string, string>() // fixture id -> database id
  const noteOf = new Map<string, string>() // database id -> fixture id

  const count = async (c: pg.Client) =>
    Number((await c.query(`SELECT count(*) FROM items WHERE title LIKE '${MARK} %'`)).rows[0].count)

  beforeAll(async () => {
    tx = new pg.Client({ connectionString: process.env.DATABASE_URL })
    probe = new pg.Client({ connectionString: process.env.DATABASE_URL })
    await Promise.all([tx.connect(), probe.connect()])
    before = await count(probe)
    await tx.query('BEGIN')
    h.client = tx as never
    for (const n of NOTES) {
      const vec = JSON.stringify(hashedEmbedding(`${n.title}\n\n${n.content}`))
      const { rows } = await tx.query(
        `INSERT INTO items (title, type, content, embedding, embedding_model)
         VALUES ($1, 'note', $2, $3::vector, $4) RETURNING id`,
        [`${MARK} ${n.title}`, n.content, vec, activeEmbeddingId()],
      )
      idOf.set(n.id, rows[0].id)
      noteOf.set(rows[0].id, n.id)
    }
  })

  afterAll(async () => {
    const during = await count(probe)
    await tx.query('ROLLBACK')
    const after = await count(probe)
    await Promise.all([tx.end(), probe.end()])
    expect(during).toBe(before)
    expect(after).toBe(before)
  })

  const rankAll = async (embedFails = false): Promise<Map<string, Ranking>> => {
    if (embedFails) vi.mocked(embedQuery).mockRejectedValue(new Error('embedding model unavailable'))
    else vi.mocked(embedQuery).mockImplementation(async (q: string) => hashedEmbedding(q))
    const rankings = new Map<string, Ranking>()
    for (const q of QUERIES) {
      const { items, semantic } = await retrieveItems({ query: q.query, limit: 5 })
      expect(semantic).toBe(!embedFails)
      rankings.set(q.query, items.filter((i) => noteOf.has(i.id)).map((i) => noteOf.get(i.id)!))
    }
    return rankings
  }

  const report = (label: string, s: ReturnType<typeof scoreBenchmark>) =>
    // eslint-disable-next-line no-console
    console.log(`retrieval benchmark [${label}]: answerable=${s.answerable} hit@1=${s.hitAt1.toFixed(2)} hit@3=${s.hitAt3.toFixed(2)} hit@5=${s.hitAt5.toFixed(2)} mrr=${s.mrr.toFixed(2)} unanswerable returned results=${s.unanswerableReturned}/${s.unanswerable} misses=${JSON.stringify(s.misses)}`)

  // Baseline measured 2026-11-20 on this fixture: hit@1 0.95, hit@3 1.00, MRR 0.98. The gates sit a little below so that
  // a real ranking regression fails while harmless fixture growth does not. Raise them when the fixture grows.
  it('hybrid search finds the right note near the top for answerable questions', async () => {
    const score = scoreBenchmark(QUERIES, await rankAll())
    report('hybrid', score)
    expect(score.hitAt3).toBeGreaterThanOrEqual(0.95)
    expect(score.hitAt1).toBeGreaterThanOrEqual(0.85)
    expect(score.mrr).toBeGreaterThanOrEqual(0.9)
  })

  it('keyword-only fallback (embedding model unavailable) still finds most answers', async () => {
    const score = scoreBenchmark(QUERIES, await rankAll(true))
    report('keyword fallback', score)
    expect(score.hitAt5).toBeGreaterThanOrEqual(KEYWORD_GATE)
  })
})
