import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { mkdtemp, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { listMigrationFiles, migrationStatus, runMigrations, MIGRATIONS_DIR } from './migrator'

let dir = ''
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'memex-migrations-'))
  await writeFile(join(dir, '002_second.sql'), 'CREATE TABLE b (id int);')
  await writeFile(join(dir, '001_first.sql'), 'CREATE TABLE a (id int);')
  await writeFile(join(dir, '003_enum.sql'), "ALTER TYPE thing ADD VALUE 'x';")
  await writeFile(join(dir, 'notes.txt'), 'not a migration')
})
afterAll(async () => { await rm(dir, { recursive: true, force: true }) })

/** A fake database: remembers which migrations are "applied", records every statement, and can fail one on demand. */
function fakeDb(opts: { applied?: string[]; neverMigrated?: boolean; failOn?: RegExp } = {}) {
  const sql: string[] = []
  const applied = [...(opts.applied ?? [])]
  const query = vi.fn(async (text: string, params?: unknown[]) => {
    const t = text.trim()
    sql.push(t)
    if (opts.failOn?.test(t)) throw new Error('syntax error near "x"')
    if (/to_regclass/.test(t)) return { rows: [{ t: opts.neverMigrated ? null : '_migrations' }] }
    if (/^SELECT name FROM _migrations/.test(t)) return { rows: applied.map((name) => ({ name })) }
    if (/^INSERT INTO _migrations/.test(t)) applied.push(String(params?.[0]))
    return { rows: [] }
  })
  const release = vi.fn()
  return { sql, applied, release, pool: { query, connect: async () => ({ query, release }) } as never }
}

describe('listMigrationFiles', () => {
  it('lists only .sql files, in name order', async () => {
    expect(await listMigrationFiles(dir)).toEqual(['001_first.sql', '002_second.sql', '003_enum.sql'])
  })
  it('finds the real migrations, starting at 001 and including the newest', async () => {
    const files = await listMigrationFiles(MIGRATIONS_DIR)
    expect(files[0]).toMatch(/^001_/)
    expect(files.some((f) => f.startsWith('026_'))).toBe(true)
    expect(files).toEqual([...files].sort())
  })
})

describe('migrationStatus', () => {
  it('reports everything pending, and never migrated, when the tracking table does not exist', async () => {
    const db = fakeDb({ neverMigrated: true })
    expect(await migrationStatus(db.pool, dir)).toEqual({ applied: [], pending: ['001_first.sql', '002_second.sql', '003_enum.sql'], neverMigrated: true })
    expect(db.sql.some((s) => /CREATE TABLE/.test(s))).toBe(false) // it only reads
  })

  it('splits applied from pending', async () => {
    const s = await migrationStatus(fakeDb({ applied: ['001_first.sql'] }).pool, dir)
    expect(s).toEqual({ applied: ['001_first.sql'], pending: ['002_second.sql', '003_enum.sql'], neverMigrated: false })
  })

  it('ignores a recorded migration whose file no longer exists', async () => {
    const s = await migrationStatus(fakeDb({ applied: ['001_first.sql', '000_removed.sql'] }).pool, dir)
    expect(s.applied).toEqual(['001_first.sql'])
  })
})

describe('runMigrations', () => {
  it('applies pending files in order, each in its own transaction, and records them', async () => {
    const db = fakeDb({ applied: ['001_first.sql'] })
    const done = await runMigrations(db.pool, { dir })
    expect(done).toEqual(['002_second.sql', '003_enum.sql'])
    const stmts = db.sql.filter((s) => !/^(SELECT|CREATE TABLE IF NOT EXISTS)/.test(s))
    expect(stmts).toEqual([
      'BEGIN', 'CREATE TABLE b (id int);', 'INSERT INTO _migrations (name) VALUES ($1)', 'COMMIT',
      "ALTER TYPE thing ADD VALUE 'x';", 'INSERT INTO _migrations (name) VALUES ($1)', // ADD VALUE cannot run in a transaction
    ])
    expect(db.release).toHaveBeenCalledTimes(1)
  })

  it('is idempotent: a second run applies nothing', async () => {
    const db = fakeDb()
    await runMigrations(db.pool, { dir })
    expect(await runMigrations(db.pool, { dir })).toEqual([])
  })

  it('creates the tracking table first, outside any transaction', async () => {
    const db = fakeDb({ neverMigrated: true })
    await runMigrations(db.pool, { dir })
    expect(db.sql[0]).toMatch(/CREATE TABLE IF NOT EXISTS _migrations/)
  })

  it('on failure rolls that migration back, names the file, stops, and still releases the connection', async () => {
    const db = fakeDb({ failOn: /CREATE TABLE b/ })
    await expect(runMigrations(db.pool, { dir })).rejects.toThrow(/Migration 002_second\.sql failed: .*syntax error/)
    expect(db.sql).toContain('ROLLBACK')
    expect(db.sql.filter((s) => s === 'COMMIT')).toHaveLength(1) // 001 committed; 002 did not
    expect(db.applied).toEqual(['001_first.sql']) // 002 was not recorded and 003 never ran
    expect(db.release).toHaveBeenCalledTimes(1)
  })

  it('reports each step through the logger, including skips', async () => {
    const lines: string[] = []
    await runMigrations(fakeDb({ applied: ['001_first.sql'] }).pool, { dir, log: (l) => lines.push(l) })
    expect(lines).toEqual(['  skip  001_first.sql', '  ✓     002_second.sql', '  ✓     003_enum.sql  (no-txn)'])
  })
})
