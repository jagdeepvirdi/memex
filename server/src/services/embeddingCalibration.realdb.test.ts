// Opt-in test against the REAL Postgres (set MEMEX_REALDB_TEST=1, DATABASE_URL in .env, migration 025 applied).
// The calibration helpers take their database as an argument, so every call here goes through ONE connection that sits
// inside BEGIN ... ROLLBACK: the real library is only READ (its vectors are what is being measured) and the settings rows
// the helpers write exist only inside the transaction. None of these helpers issues BEGIN/COMMIT itself. A second,
// independent connection checks that nothing was written before and after the rollback.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'
import {
  loadSampleVectors, measureReference, readReference, saveReference, snapshotReference, applyThresholds,
  sortedPairSimilarities, MIN_ITEMS_FOR_REFERENCE,
} from './embeddingCalibration'

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') })
const enabled = process.env.MEMEX_REALDB_TEST === '1' && !!process.env.DATABASE_URL

const NOMIC = 'ollama:nomic-embed-text'
const KEYS = ['embedding_calibration_reference', 'embedding_thresholds']

describe.skipIf(!enabled)('calibration against the real database (rolled back)', () => {
  let tx: pg.Client
  let probe: pg.Client
  let before: Record<string, string> = {}

  const snapshot = async (c: pg.Client) =>
    Object.fromEntries((await c.query('SELECT key, value::text AS v FROM settings WHERE key = ANY($1)', [KEYS])).rows.map(r => [r.key, r.v]))

  beforeAll(async () => {
    tx = new pg.Client({ connectionString: process.env.DATABASE_URL })
    probe = new pg.Client({ connectionString: process.env.DATABASE_URL })
    await Promise.all([tx.connect(), probe.connect()])
    before = await snapshot(probe)
    await tx.query('BEGIN')
    // Start from "no reference stored" inside the transaction, whatever the real database holds.
    await tx.query("DELETE FROM settings WHERE key = ANY($1)", [KEYS])
  })

  afterAll(async () => {
    // A second connection must see exactly what it saw before, both before and after the rollback.
    const during = await snapshot(probe)
    await tx.query('ROLLBACK')
    const after = await snapshot(probe)
    await Promise.all([tx.end(), probe.end()])
    expect(during).toEqual(before)
    expect(after).toEqual(before)
  })

  it('reads real vectors as numbers of the right size, and only vectors', async () => {
    const vectors = await loadSampleVectors(NOMIC, 40, tx)
    if (vectors.length === 0) return // an empty library has nothing to check
    expect(vectors.length).toBeLessThanOrEqual(40)
    for (const v of vectors) {
      expect(v).toHaveLength(768)
      expect(v.every(Number.isFinite)).toBe(true)
    }
  })

  it('pair similarities of real vectors are valid cosines', async () => {
    const vectors = await loadSampleVectors(NOMIC, 60, tx)
    if (vectors.length < 2) return
    const s = sortedPairSimilarities(vectors)
    expect(s).toHaveLength((vectors.length * (vectors.length - 1)) / 2)
    expect(s[0]).toBeGreaterThanOrEqual(-1.000001)
    expect(s[s.length - 1]).toBeLessThanOrEqual(1.000001)
  })

  it('a reference can be saved, read back, and replaced', async () => {
    expect(await readReference(tx)).toBeNull()
    const ref = { model: NOMIC, items: 100, pairs: 4950, fractions: { duplicate: 0.003, graph: 0.005 }, savedAt: '2026-11-17T00:00:00.000Z' }
    await saveReference(ref, tx)
    expect(await readReference(tx)).toEqual(ref)
    await saveReference({ ...ref, items: 200 }, tx)
    expect((await readReference(tx))!.items).toBe(200)
    await tx.query("DELETE FROM settings WHERE key = 'embedding_calibration_reference'")
  })

  it('snapshotReference measures the real library and saves it once, never overwriting', async () => {
    const vectors = await loadSampleVectors(NOMIC, MIN_ITEMS_FOR_REFERENCE, tx)
    if (vectors.length < MIN_ITEMS_FOR_REFERENCE) return // too small a library to snapshot: nothing to assert
    expect(await snapshotReference(NOMIC, tx)).toBe('saved')
    const ref = (await readReference(tx))!
    expect(ref.model).toBe(NOMIC)
    expect(ref.pairs).toBeGreaterThan(0)
    expect(ref.fractions.duplicate).toBeGreaterThanOrEqual(0)
    expect(ref.fractions.duplicate).toBeLessThanOrEqual(1)
    expect(await snapshotReference(NOMIC, tx)).toBe('kept')
    expect(await measureReference(NOMIC, tx, 60)).toMatchObject({ model: NOMIC })
  })

  it('applied thresholds are stored per model and merged, not replaced', async () => {
    await applyThresholds('gemini:gemini-embedding-001', { duplicate: 0.95, graph: 0.82 }, tx)
    await applyThresholds('openai:text-embedding-3-small', { duplicate: 0.9 }, tx)
    await applyThresholds('gemini:gemini-embedding-001', { graph: 0.83 }, tx)
    const stored = (await tx.query("SELECT value FROM settings WHERE key = 'embedding_thresholds'")).rows[0].value
    expect(stored).toEqual({
      'gemini:gemini-embedding-001': { duplicate: 0.95, graph: 0.83 },
      'openai:text-embedding-3-small': { duplicate: 0.9 },
    })
  })
})
