import { Router } from 'express'
import { pool } from '../db/client.js'
import { migrationStatus } from '../db/migrator.js'
import { checkOllamaHealth } from '../services/ollama.js'
import { describeDatabaseError } from '../lib/startupChecks.js'
import { autoMigrateEnabled } from '../lib/startup.js'

const router = Router()

// GET /api/health/status — a readable picture of whether Memex can work, for the first-run screen and for debugging.
// Public (like /api/health) so it works before an account exists; it holds no secrets: booleans, counts and plain sentences.
// `status` is "ok" when the database answers and no migration is pending, otherwise "degraded". Ollama being down is NOT
// a degradation: a cloud-only install never runs it.
router.get('/status', async (_req, res) => {
  let database: { ok: boolean; error?: string } = { ok: true }
  let migrations: { applied: number; pending: number; pendingNames: string[] } = { applied: 0, pending: 0, pendingNames: [] }
  try {
    const s = await migrationStatus(pool)
    migrations = { applied: s.applied.length, pending: s.pending.length, pendingNames: s.pending.slice(0, 5) }
  } catch (err) {
    database = { ok: false, error: describeDatabaseError(err, process.env.DATABASE_URL, { hideLocation: true }) }
  }
  const ollama = await checkOllamaHealth()
  res.json({
    status: database.ok && migrations.pending === 0 ? 'ok' : 'degraded',
    database,
    migrations,
    ollama: { ok: ollama },
    autoMigrate: autoMigrateEnabled(),
  })
})

export default router
