import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../db/client', () => ({ pool: { query: vi.fn() } }))

import { planEntityMerges, mergeEntities, SCAN_FLOOR } from './entityMerge'
import { setThresholdOverrides } from './embeddingConfig'

const NOMIC = 'ollama:nomic-embed-text'
const T0 = new Date('2026-01-01T00:00:00Z')
const T1 = new Date('2026-02-01T00:00:00Z')

let n = 0
/** A row as the pair query returns it. */
function pair(o: Partial<Record<string, unknown>> = {}) {
  n++
  return {
    id1: `a${n}`, name1: `Name A${n}`, links1: 1, created1: T0,
    id2: `b${n}`, name2: `Name B${n}`, links2: 1, created2: T0,
    type: 'person', model: NOMIC, score: 0.95, ...o,
  }
}
const db = (...rows: unknown[]) => ({ query: vi.fn().mockResolvedValue({ rows }) }) as never
const plan = (...rows: unknown[]) => planEntityMerges(db(...rows))

beforeEach(() => { n = 0 })
afterEach(() => setThresholdOverrides(null))

describe('planEntityMerges — thresholds', () => {
  it('reads only same-model, same-type pairs above the scan floor, strongest first', async () => {
    const d = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    await planEntityMerges(d as never)
    const [sql, params] = d.query.mock.calls[0]
    expect(String(sql)).toMatch(/a\.embedding_model = b\.embedding_model/)
    expect(String(sql)).toMatch(/a\.type = b\.type/)
    expect(String(sql)).toMatch(/ORDER BY score DESC/)
    expect(params).toEqual([SCAN_FLOOR])
  })

  it('proposes a pair above the model\'s entity threshold', async () => {
    const p = await plan(pair({ score: 0.95 }))
    expect(p.candidates).toHaveLength(1)
    expect(p.candidates[0]).toMatchObject({ model: NOMIC, score: 0.95 })
  })

  it('does not propose a pair at or below the threshold (strictly greater is required)', async () => {
    expect((await plan(pair({ score: 0.92 }), pair({ score: 0.9 }))).candidates).toEqual([])
  })

  it('reads the score when the driver returns it as a string', async () => {
    expect((await plan(pair({ score: '0.97' }))).candidates[0].score).toBe(0.97)
  })

  it('uses each model\'s own threshold: a score that merges under one model does not under another', async () => {
    setThresholdOverrides({ 'ollama:other-model': { entity: 0.99 } })
    const p = await plan(pair({ model: 'ollama:other-model', score: 0.97 }), pair({ model: NOMIC, score: 0.97 }))
    expect(p.candidates.map(c => c.model)).toEqual([NOMIC])
  })

  it('never merges entities of a model that has no entity threshold, and says which model was skipped', async () => {
    const p = await plan(
      pair({ model: 'gemini:gemini-embedding-001', score: 0.99 }),
      pair({ model: 'gemini:gemini-embedding-001', score: 0.98 }),
      pair({ model: 'ollama:unmeasured', score: 0.99 }),
    )
    expect(p.candidates).toEqual([])
    expect(p.skippedModels).toEqual(expect.arrayContaining([
      { model: 'gemini:gemini-embedding-001', pairs: 2 }, { model: 'ollama:unmeasured', pairs: 1 },
    ]))
  })

  it('honours a calibrated entity threshold for a model that had none', async () => {
    setThresholdOverrides({ 'ollama:unmeasured': { entity: 0.96 } })
    expect((await plan(pair({ model: 'ollama:unmeasured', score: 0.97 }))).candidates).toHaveLength(1)
  })
})

describe('planEntityMerges — which entity stays', () => {
  it('keeps the entity that is linked from more items', async () => {
    const c = (await plan(pair({ id1: 'x', id2: 'y', links1: 1, links2: 7 }))).candidates[0]
    expect(c).toMatchObject({ keepId: 'y', dropId: 'x', keepLinks: 7, dropLinks: 1 })
  })

  it('keeps the first when it has more links', async () => {
    const c = (await plan(pair({ id1: 'x', id2: 'y', links1: 5, links2: 2 }))).candidates[0]
    expect(c).toMatchObject({ keepId: 'x', dropId: 'y' })
  })

  it('on equal links keeps the older entity', async () => {
    const c = (await plan(pair({ id1: 'x', id2: 'y', created1: T1, created2: T0 }))).candidates[0]
    expect(c).toMatchObject({ keepId: 'y', dropId: 'x' })
  })

  it('on a full tie keeps the lower id, so the choice is stable between runs', async () => {
    const c = (await plan(pair({ id1: 'a', id2: 'b' }))).candidates[0]
    expect(c).toMatchObject({ keepId: 'a', dropId: 'b' })
  })

  it('carries the names so the dry run can show them', async () => {
    const c = (await plan(pair({ id1: 'x', name1: 'Chris Nolan', id2: 'y', name2: 'Christopher Nolan', links2: 9 }))).candidates[0]
    expect(c).toMatchObject({ keepName: 'Christopher Nolan', dropName: 'Chris Nolan' })
  })
})

describe('planEntityMerges — chains', () => {
  it('lets an entity take part in only one merge per run, and counts what waits', async () => {
    // A~B 0.99, B~C 0.97, A~C 0.95: only the strongest pair merges now.
    const p = await plan(
      pair({ id1: 'A', id2: 'B', score: 0.99 }),
      pair({ id1: 'B', id2: 'C', score: 0.97 }),
      pair({ id1: 'A', id2: 'C', score: 0.95 }),
    )
    expect(p.candidates).toHaveLength(1)
    expect([p.candidates[0].keepId, p.candidates[0].dropId].sort()).toEqual(['A', 'B'])
    expect(p.deferred).toBe(2)
  })

  it('merges independent pairs in the same run', async () => {
    const p = await plan(pair({ id1: 'A', id2: 'B', score: 0.99 }), pair({ id1: 'C', id2: 'D', score: 0.96 }))
    expect(p.candidates).toHaveLength(2)
    expect(p.deferred).toBe(0)
  })

  it('does not count below-threshold pairs as deferred', async () => {
    const p = await plan(pair({ id1: 'A', id2: 'B', score: 0.99 }), pair({ id1: 'B', id2: 'C', score: 0.5 }))
    expect(p.deferred).toBe(0)
  })

  it('returns an empty plan for no pairs', async () => {
    expect(await plan()).toEqual({ candidates: [], deferred: 0, skippedModels: [] })
  })
})

describe('mergeEntities', () => {
  function client(over: { dup?: number | null; moved?: number | null; gone?: number | null; failAt?: RegExp } = {}) {
    const calls: Array<{ sql: string; params: unknown[] }> = []
    const q = vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql: String(sql), params })
      if (over.failAt?.test(String(sql))) throw new Error('boom')
      if (/^DELETE FROM item_entities/.test(String(sql))) return { rowCount: over.dup ?? 0 }
      if (/^UPDATE item_entities/.test(String(sql))) return { rowCount: over.moved ?? 0 }
      if (/^DELETE FROM entities/.test(String(sql))) return { rowCount: over.gone === undefined ? 1 : over.gone }
      return { rowCount: 0 }
    })
    return { q, calls, client: { query: q } as never }
  }

  it('runs in one transaction: collisions removed first, then links moved, then the entity deleted', async () => {
    const c = client({ dup: 2, moved: 5 })
    const r = await mergeEntities(c.client, 'keep', 'drop')
    expect(c.calls.map(x => x.sql.split(/\s+/)[0] + ' ' + (x.sql.match(/(item_entities|entities)/)?.[0] ?? ''))).toEqual([
      'BEGIN ', 'DELETE item_entities', 'UPDATE item_entities', 'DELETE entities', 'COMMIT ',
    ])
    expect(r).toEqual({ relinked: 5, alreadyLinked: 2 })
  })

  it('removes only links the kept entity already has (same item and role), treating a missing role as equal', async () => {
    const c = client()
    await mergeEntities(c.client, 'keep', 'drop')
    const del = c.calls[1]
    expect(del.sql).toMatch(/k\.entity_id = \$1 AND k\.item_id = ie\.item_id AND k\.role IS NOT DISTINCT FROM ie\.role/)
    expect(del.params).toEqual(['keep', 'drop'])
    expect(c.calls[2].params).toEqual(['keep', 'drop'])
    expect(c.calls[3].params).toEqual(['drop'])
  })

  it('rolls the whole merge back and rethrows when a step fails', async () => {
    const c = client({ failAt: /^UPDATE item_entities/ })
    await expect(mergeEntities(c.client, 'keep', 'drop')).rejects.toThrow('boom')
    const sqls = c.calls.map(x => x.sql)
    expect(sqls).toContain('ROLLBACK')
    expect(sqls).not.toContain('COMMIT')
    expect(sqls.some(s => /^DELETE FROM entities/.test(s))).toBe(false) // the entity is not deleted after a failed relink
  })

  it('rolls back, and does not delete anything, if the dropped entity is already gone', async () => {
    const c = client({ gone: 0 })
    await expect(mergeEntities(c.client, 'keep', 'drop')).rejects.toThrow(/no longer exists/)
    expect(c.calls.map(x => x.sql)).toContain('ROLLBACK')
    expect(c.calls.map(x => x.sql)).not.toContain('COMMIT')
  })

  it('still reports the original error when the rollback itself fails', async () => {
    const q = vi.fn(async (sql: string) => {
      if (/^UPDATE/.test(String(sql))) throw new Error('first failure')
      if (/^ROLLBACK/.test(String(sql))) throw new Error('connection lost')
      return { rowCount: 0 }
    })
    await expect(mergeEntities({ query: q } as never, 'keep', 'drop')).rejects.toThrow('first failure')
  })

  it('refuses to merge an entity into itself without touching the database', async () => {
    const c = client()
    await expect(mergeEntities(c.client, 'same', 'same')).rejects.toThrow(/itself/)
    expect(c.q).not.toHaveBeenCalled()
  })
})
