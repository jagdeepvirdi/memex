// Opt-in test against the REAL Postgres (set MEMEX_REALDB_TEST=1, DATABASE_URL in .env, migration 025 applied).
// It proves the re-embed SQL that mocks cannot: which items the estimate, the status counts and the job actually pick.
// Everything runs inside one transaction that is rolled back, and a second connection checks nothing leaked. The code
// under test issues no BEGIN/COMMIT of its own (plain reads, plus writes on job rows that do not exist here), so
// BEGIN/ROLLBACK is safe. The model call is mocked: nothing is ever sent to a provider. Fixtures are synthetic.
// Real library rows are present too, so every check compares against a baseline taken before the fixtures go in.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'

const h = vi.hoisted(() => ({ client: null as null | { query: (...a: unknown[]) => Promise<unknown> } }))
vi.mock('../db/client', () => ({ pool: { query: (...a: unknown[]) => h.client!.query(...a) } }))
vi.mock('../lib/logger', () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
const seen: string[] = []
vi.mock('./embeddingService', () => ({
  embedAndStoreItemDetailed: vi.fn(async (row: { id: string }) => { seen.push(row.id); return { outcome: 'embedded' } }),
}))

import { estimateReembed } from './embeddingSwitch'
import { getEmbeddingStatus } from './embeddingStatus'
import { runReembedJob } from './reembedJob'
import { buildEmbedding, setActiveEmbedding } from './embeddingConfig'

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') })
const enabled = process.env.MEMEX_REALDB_TEST === '1' && !!process.env.DATABASE_URL

const GEMINI = buildEmbedding('gemini')
const unit = () => JSON.stringify(Array.from({ length: 768 }, (_, i) => (i === 0 ? 1 : 0)))
const MARK = 'rqv7z'

describe.skipIf(!enabled)('re-embed SQL against the real database (rolled back)', () => {
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
    setActiveEmbedding(GEMINI)
  })

  afterAll(async () => {
    setActiveEmbedding(null)
    // A second connection must see nothing before the rollback, and the count must be unchanged after it.
    const during = await count(probe)
    await tx.query('ROLLBACK')
    const after = await count(probe)
    await Promise.all([tx.end(), probe.end()])
    expect(during).toBe(before)
    expect(after).toBe(before)
  })

  const add = async (name: string, o: { vec?: boolean; model?: string | null; skip?: string | null; encrypted?: boolean; tag?: string } = {}) => {
    const { rows } = await tx.query(
      `INSERT INTO items (title, type, content, embedding, embedding_model, embedding_skip, encrypted)
       VALUES ($1, 'note', $2, $3::vector, $4, $5, $6) RETURNING id`,
      [`${MARK} ${name}`, 'x'.repeat(100), o.vec ? unit() : null, o.model ?? null, o.skip ?? null, o.encrypted ?? false],
    )
    ids[name] = rows[0].id
    if (o.tag) {
      const t = await tx.query(`INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`, [o.tag])
      await tx.query('INSERT INTO item_tags (item_id, tag_id) VALUES ($1, $2)', [ids[name], t.rows[0].id])
    }
  }

  it('picks exactly the items that need a vector from the target model, and keeps private ones home', async () => {
    const baseEst = await estimateReembed(GEMINI)
    const baseStatus = await getEmbeddingStatus()

    await add('A-no-vector')
    await add('B-other-model', { vec: true, model: 'ollama:nomic-embed-text' })
    await add('C-already-done', { vec: true, model: GEMINI.id })
    await add('D-private-tag', { tag: 'private' })
    await add('E-encrypted', { encrypted: true })
    await add('F-skipped-with-old-vector', { vec: true, model: 'ollama:nomic-embed-text', skip: 'private' })

    const est = await estimateReembed(GEMINI)
    expect(est.items - baseEst.items).toBe(2)               // A and B are sent
    const sent = ['A-no-vector', 'B-other-model'].reduce((sum, n) => sum + `${MARK} ${n}`.length + 2 + 100, 0) // title + 2 + content
    expect(est.characters - baseEst.characters).toBe(sent)
    expect(est.alreadyDone - baseEst.alreadyDone).toBe(1)   // C
    expect(est.skippedPrivate - baseEst.skippedPrivate).toBe(2) // D (private tag) and F (already marked)
    // E (encrypted) is in no number at all.

    const status = await getEmbeddingStatus()
    expect(status.counts.embedded - baseStatus.counts.embedded).toBe(1)        // C
    expect(status.counts.needsReembed - baseStatus.counts.needsReembed).toBe(1) // B only: F is skipped, not "needs"
    expect(status.counts.pending - baseStatus.counts.pending).toBe(2)          // A and D have no vector
    expect(status.counts.skippedPrivate - baseStatus.counts.skippedPrivate).toBe(1) // F (D is not marked yet)
    expect(status.counts.total - baseStatus.counts.total).toBe(5)              // everything except the encrypted E
  })

  it('the job selects A, B and D (the writer decides D is private) and never C, E or F', async () => {
    seen.length = 0
    await runReembedJob({ jobId: '00000000-0000-4000-8000-000000000001', target: GEMINI })
    const mine = Object.entries(ids).filter(([, id]) => seen.includes(id)).map(([name]) => name).sort()
    expect(mine).toEqual(['A-no-vector', 'B-other-model', 'D-private-tag'])
    // keyset paging must not repeat or skip rows: every selected id is unique
    expect(new Set(seen).size).toBe(seen.length)
  })
})
