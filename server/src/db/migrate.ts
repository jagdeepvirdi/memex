import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readdir, readFile } from 'fs/promises'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../../.env') })

const { Pool } = pg

async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const client = await pool.connect()

  try {
    // Migrations tracking table (created outside a transaction so it persists on failure)
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id         SERIAL      PRIMARY KEY,
        name       TEXT        NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    const { rows } = await client.query<{ name: string }>(
      'SELECT name FROM _migrations ORDER BY id',
    )
    const applied = new Set(rows.map((r) => r.name))

    const migrationsDir = resolve(__dirname, 'migrations')
    const files = (await readdir(migrationsDir))
      .filter((f) => f.endsWith('.sql'))
      .sort()

    let count = 0
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`  skip  ${file}`)
        continue
      }

      const sql = await readFile(resolve(migrationsDir, file), 'utf8')

      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file])
        await client.query('COMMIT')
        console.log(`  ✓     ${file}`)
        count++
      } catch (err) {
        await client.query('ROLLBACK')
        throw new Error(`Migration ${file} failed: ${String(err)}`)
      }
    }

    if (count === 0) {
      console.log('  Nothing to migrate — schema is up to date.')
    } else {
      console.log(`\nApplied ${count} migration(s).`)
    }
  } finally {
    client.release()
    await pool.end()
  }
}

migrate().catch((err) => {
  console.error('\nMigration error:', err)
  process.exit(1)
})
