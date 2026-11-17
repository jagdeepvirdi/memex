import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readdir, readFile } from 'fs/promises'
import type { Pool } from 'pg'

// Applies the SQL files in ./migrations in order and remembers which ran (`_migrations`). Used by `npm run migrate` and,
// only when MEMEX_AUTO_MIGRATE=true (the Docker image sets it), by the server at startup. Outside Docker migrations stay
// an explicit step the user runs.

const __dirname = dirname(fileURLToPath(import.meta.url))
export const MIGRATIONS_DIR = resolve(__dirname, 'migrations')

type Db = Pick<Pool, 'query'>

export interface MigrationStatus {
  applied: string[]
  pending: string[]
  /** The tracking table does not exist yet: nothing has ever been migrated. */
  neverMigrated: boolean
}

export async function listMigrationFiles(dir: string = MIGRATIONS_DIR): Promise<string[]> {
  return (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()
}

/** What has and has not been applied. Reads only; never creates the tracking table. */
export async function migrationStatus(db: Db, dir: string = MIGRATIONS_DIR): Promise<MigrationStatus> {
  const files = await listMigrationFiles(dir)
  const { rows: exists } = await db.query<{ t: string | null }>("SELECT to_regclass('public._migrations')::text AS t")
  if (!exists[0]?.t) return { applied: [], pending: files, neverMigrated: true }
  const { rows } = await db.query<{ name: string }>('SELECT name FROM _migrations ORDER BY id')
  const applied = new Set(rows.map((r) => r.name))
  return { applied: files.filter((f) => applied.has(f)), pending: files.filter((f) => !applied.has(f)), neverMigrated: false }
}

/** Applies every pending migration. Returns the names applied. Throws, naming the file, if one fails (it is rolled back). */
export async function runMigrations(
  pool: Pick<Pool, 'connect'>,
  opts: { dir?: string; log?: (line: string) => void } = {},
): Promise<string[]> {
  const dir = opts.dir ?? MIGRATIONS_DIR
  const log = opts.log ?? (() => {})
  const client = await pool.connect()
  try {
    // Tracking table (created outside a transaction so it persists on failure)
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id         SERIAL      PRIMARY KEY,
        name       TEXT        NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    const { rows } = await client.query<{ name: string }>('SELECT name FROM _migrations ORDER BY id')
    const done = new Set(rows.map((r) => r.name))
    const applied: string[] = []

    for (const file of await listMigrationFiles(dir)) {
      if (done.has(file)) {
        log(`  skip  ${file}`)
        continue
      }
      const sql = await readFile(resolve(dir, file), 'utf8')
      // ALTER TYPE ... ADD VALUE cannot run inside a transaction in PostgreSQL.
      const noTxn = /ALTER\s+TYPE\s+\S+\s+ADD\s+VALUE/i.test(sql)
      if (noTxn) {
        try {
          await client.query(sql)
          await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file])
        } catch (err) {
          throw new Error(`Migration ${file} failed: ${String(err)}`)
        }
        log(`  ✓     ${file}  (no-txn)`)
      } else {
        await client.query('BEGIN')
        try {
          await client.query(sql)
          await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file])
          await client.query('COMMIT')
        } catch (err) {
          await client.query('ROLLBACK')
          throw new Error(`Migration ${file} failed: ${String(err)}`)
        }
        log(`  ✓     ${file}`)
      }
      applied.push(file)
    }
    return applied
  } finally {
    client.release()
  }
}
