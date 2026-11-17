import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'
import { runMigrations } from './migrator.js'

// `npm run migrate`: applies pending migrations. The logic lives in migrator.ts (shared with the server's opt-in
// MEMEX_AUTO_MIGRATE); this is only the command-line wrapper.

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../../.env') })

const { Pool } = pg

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    const applied = await runMigrations(pool, { log: (line) => console.log(line) })
    if (applied.length === 0) console.log('  Nothing to migrate — schema is up to date.')
    else console.log(`\nApplied ${applied.length} migration(s).`)
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error('\nMigration error:', err)
  process.exit(1)
})
