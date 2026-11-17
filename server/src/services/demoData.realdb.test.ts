// Opt-in test against the REAL Postgres (MEMEX_REALDB_TEST=1, DATABASE_URL in .env, all migrations applied).
// It proves what mocks cannot: the sample items insert with the real schema (categories, tags, entities, links), "clear"
// deletes exactly them, and the user's own item and entity survive. All work happens inside one transaction that is rolled
// back, and a second connection checks that nothing leaked (the library may hold real data, so only counts are compared).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'
import { DEMO_ITEMS, demoCount, deleteDemoData, insertDemoData } from './demoData'

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') })
const enabled = process.env.MEMEX_REALDB_TEST === '1' && !!process.env.DATABASE_URL

describe.skipIf(!enabled)('demo data against the real database (rolled back)', () => {
  let tx: pg.Client
  let probe: pg.Client
  let itemsBefore = 0
  let entitiesBefore = 0
  let tagsBefore = 0
  const n = async (c: pg.Client, table: string) => Number((await c.query(`SELECT count(*) FROM ${table}`)).rows[0].count)
  const asPool = () => tx as unknown as pg.PoolClient

  beforeAll(async () => {
    tx = new pg.Client({ connectionString: process.env.DATABASE_URL })
    probe = new pg.Client({ connectionString: process.env.DATABASE_URL })
    await tx.connect()
    await probe.connect()
    itemsBefore = await n(probe, 'items')
    entitiesBefore = await n(probe, 'entities')
    tagsBefore = await n(probe, 'tags')
    await tx.query('BEGIN')
  })

  afterAll(async () => {
    await tx.query('ROLLBACK')
    expect(await n(probe, 'items')).toBe(itemsBefore)
    expect(await n(probe, 'entities')).toBe(entitiesBefore)
    expect(await n(probe, 'tags')).toBe(tagsBefore)
    await tx.end()
    await probe.end()
  })

  it('loads, then clears, leaving the user own item and entity alone', async () => {
    const userItem = await tx.query(
      `INSERT INTO items (title, type, content, structured, source) VALUES ('zz-own-note-8k2', 'note', 'mine', '{}', 'manual') RETURNING id`)
    // The user already has this person as an entity: the sample must reuse it and never delete it.
    await tx.query(`INSERT INTO entities (name, type) VALUES ('Christopher Nolan', 'person') ON CONFLICT (name, type) DO NOTHING`)
    const before = await demoCount(tx)
    expect(before).toBe(0)

    expect(await insertDemoData(asPool())).toBe(DEMO_ITEMS.length)
    expect(await demoCount(tx)).toBe(DEMO_ITEMS.length)

    // Every sample item has its categories and tags, and the entity links exist.
    const noCats = await tx.query(`SELECT count(*) FROM items i WHERE i.structured->>'demo'='true' AND NOT EXISTS (SELECT 1 FROM item_categories c WHERE c.item_id=i.id)`)
    expect(Number(noCats.rows[0].count)).toBe(0)
    const noTags = await tx.query(`SELECT count(*) FROM items i WHERE i.structured->>'demo'='true' AND NOT EXISTS (SELECT 1 FROM item_tags t WHERE t.item_id=i.id)`)
    expect(Number(noTags.rows[0].count)).toBe(0)
    const links = await tx.query(`SELECT count(*) FROM item_entities ie JOIN items i ON i.id=ie.item_id WHERE i.structured->>'demo'='true'`)
    expect(Number(links.rows[0].count)).toBeGreaterThan(10)
    // The user's entity was reused, not marked as a sample one.
    const mine = await tx.query(`SELECT metadata FROM entities WHERE name='Christopher Nolan' AND type='person'`)
    expect(mine.rows[0].metadata?.demo).toBeUndefined()
    // A second load is refused.
    await expect(insertDemoData(asPool())).rejects.toThrow(/already loaded/)

    const cleared = await deleteDemoData(asPool())
    expect(cleared.items).toBe(DEMO_ITEMS.length)
    expect(await demoCount(tx)).toBe(0)
    expect(cleared.entities).toBeGreaterThan(0)
    // The user's item and entity are still there.
    expect((await tx.query('SELECT 1 FROM items WHERE id=$1', [userItem.rows[0].id])).rowCount).toBe(1)
    expect((await tx.query(`SELECT 1 FROM entities WHERE name='Christopher Nolan' AND type='person'`)).rowCount).toBe(1)
    // And nothing marked as sample is left behind.
    expect((await tx.query(`SELECT 1 FROM entities WHERE metadata->>'demo'='true'`)).rowCount).toBe(0)
  })
})
