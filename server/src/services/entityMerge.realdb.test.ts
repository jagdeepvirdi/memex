// Opt-in test against the REAL Postgres (set MEMEX_REALDB_TEST=1, DATABASE_URL in .env, migration 025 applied).
// It proves the entity-merge SQL that mocks cannot: the pair query, and that a merge relinks, removes colliding links
// and deletes the entity without ever aborting its transaction.
//
// `mergeEntities` issues its own BEGIN / COMMIT / ROLLBACK. Running that on a connection that is itself inside a
// BEGIN ... ROLLBACK wrapper would let the code's COMMIT commit the wrapper's work into the real database (this has
// happened before in this project). So here those three statements are translated into a SAVEPOINT on the one outer
// connection, and a second, independent connection checks that nothing leaked before and after the final ROLLBACK.
// Fixtures are synthetic. Real library entities are present too, so checks look at the fixtures by their marker name.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'
import { planEntityMerges, mergeEntities } from './entityMerge'

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') })
const enabled = process.env.MEMEX_REALDB_TEST === '1' && !!process.env.DATABASE_URL

const MARK = 'mrg8k'
const NOMIC = 'ollama:nomic-embed-text'
const GEMINI = 'gemini:gemini-embedding-001'
const vec = (...head: number[]) => JSON.stringify(Array.from({ length: 768 }, (_, i) => head[i] ?? 0))

describe.skipIf(!enabled)('entity merge against the real database (rolled back)', () => {
  let tx: pg.Client
  let probe: pg.Client
  let before = 0
  const e: Record<string, string> = {}
  const it_: Record<string, string> = {}

  const count = async (c: pg.Client) =>
    Number((await c.query(`SELECT count(*) FROM entities WHERE name LIKE '${MARK}%'`)).rows[0].count)

  // BEGIN / COMMIT / ROLLBACK from the code under test become savepoints, so the outer transaction is never ended.
  const wrapped = {
    query: (sql: string, params?: unknown[]) => {
      const s = sql.trim().toUpperCase()
      if (s === 'BEGIN') return tx.query('SAVEPOINT merge_step')
      if (s === 'COMMIT') return tx.query('RELEASE SAVEPOINT merge_step')
      if (s === 'ROLLBACK') return tx.query('ROLLBACK TO SAVEPOINT merge_step')
      return tx.query(sql, params)
    },
  }

  const links = async (entityName: string) =>
    (await tx.query(
      `SELECT i.title, ie.role FROM item_entities ie JOIN items i ON i.id = ie.item_id JOIN entities en ON en.id = ie.entity_id
       WHERE en.name = $1 ORDER BY i.title, ie.role`, [entityName],
    )).rows.map(r => `${r.title}/${r.role}`)

  beforeAll(async () => {
    tx = new pg.Client({ connectionString: process.env.DATABASE_URL })
    probe = new pg.Client({ connectionString: process.env.DATABASE_URL })
    await Promise.all([tx.connect(), probe.connect()])
    before = await count(probe)
    await tx.query('BEGIN')

    const entity = async (key: string, model: string | null, v: string | null) => {
      const { rows } = await tx.query(
        `INSERT INTO entities (name, type, embedding, embedding_model) VALUES ($1, 'person', $2::vector, $3) RETURNING id`,
        [`${MARK} ${key}`, v, model],
      )
      e[key] = rows[0].id
    }
    // Two near-identical names under the local model, two identical ones under a cloud model, and one far away.
    await entity('nolan-short', NOMIC, vec(1, 0.001))
    await entity('nolan-long', NOMIC, vec(1))
    await entity('cloud-a', GEMINI, vec(0, 1))
    await entity('cloud-b', GEMINI, vec(0, 1))
    await entity('unrelated', NOMIC, vec(0, 0, 1))

    const item = async (key: string) => {
      const { rows } = await tx.query(`INSERT INTO items (title, type, content) VALUES ($1, 'note', 'synthetic') RETURNING id`, [`${MARK} item-${key}`])
      it_[key] = rows[0].id
    }
    for (const k of ['1', '2', '3', '4']) await item(k)
    const link = (ent: string, itm: string, role: string) =>
      tx.query('INSERT INTO item_entities (item_id, entity_id, role) VALUES ($1, $2, $3)', [it_[itm], e[ent], role])
    // nolan-short: one link that collides with nolan-long's (item 1, director) and one that must move (item 3, author).
    await link('nolan-short', '1', 'director')
    await link('nolan-short', '3', 'author')
    // nolan-long has more links, so it is the one that stays.
    await link('nolan-long', '1', 'director')
    await link('nolan-long', '2', 'director')
    await link('nolan-long', '4', 'director')
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

  it('proposes exactly the near-identical same-model pair, keeping the entity with more links', async () => {
    const plan = await planEntityMerges(tx)
    const mine = plan.candidates.filter(c => c.keepName.startsWith(MARK) || c.dropName.startsWith(MARK))
    expect(mine).toHaveLength(1)
    expect(mine[0]).toMatchObject({
      keepId: e['nolan-long'], keepName: `${MARK} nolan-long`, keepLinks: 3,
      dropId: e['nolan-short'], dropName: `${MARK} nolan-short`, dropLinks: 2, model: NOMIC,
    })
    expect(mine[0].score).toBeGreaterThan(0.99)
  })

  it('never proposes identical names that were embedded by a cloud model, and reports the model as skipped', async () => {
    const plan = await planEntityMerges(tx)
    expect(plan.candidates.some(c => [c.keepId, c.dropId].some(id => id === e['cloud-a'] || id === e['cloud-b']))).toBe(false)
    expect(plan.skippedModels.find(s => s.model === GEMINI)?.pairs).toBeGreaterThanOrEqual(1)
  })

  it('never pairs entities across models', async () => {
    const plan = await planEntityMerges(tx)
    expect(plan.candidates.some(c => [c.keepId, c.dropId].includes(e['unrelated']))).toBe(false)
  })

  it('a merge that fails rolls back and leaves everything as it was', async () => {
    const stay = await links(`${MARK} nolan-long`)
    await expect(mergeEntities(wrapped as never, e['nolan-long'], '00000000-0000-4000-8000-00000000dead')).rejects.toThrow(/no longer exists/)
    expect(await links(`${MARK} nolan-long`)).toEqual(stay)
    expect(await count(tx)).toBe(before + 5)
  })

  it('merges: the colliding link is removed, the other link moves, and the dropped entity is gone', async () => {
    const r = await mergeEntities(wrapped as never, e['nolan-long'], e['nolan-short'])
    expect(r).toEqual({ relinked: 1, alreadyLinked: 1 })
    expect(await links(`${MARK} nolan-long`)).toEqual([
      `${MARK} item-1/director`, `${MARK} item-2/director`, `${MARK} item-3/author`, `${MARK} item-4/director`,
    ])
    expect(await links(`${MARK} nolan-short`)).toEqual([])
    const gone = await tx.query('SELECT 1 FROM entities WHERE id = $1', [e['nolan-short']])
    expect(gone.rowCount).toBe(0)
    // the transaction survived the merge: the connection is still usable
    expect((await tx.query('SELECT 1 AS ok')).rows[0].ok).toBe(1)
  })

  it('after the merge, the pair is no longer proposed', async () => {
    const plan = await planEntityMerges(tx)
    expect(plan.candidates.some(c => c.keepName.startsWith(MARK) || c.dropName.startsWith(MARK))).toBe(false)
  })
})
