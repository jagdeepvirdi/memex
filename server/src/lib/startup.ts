import type { Pool } from 'pg'
import { StartupError, runSecretChecks, describeDatabaseError } from './startupChecks.js'
import { migrationStatus, runMigrations } from '../db/migrator.js'

export interface StartupLog {
  info: (msg: string) => void
  warn: (msg: string) => void
}

export interface StartupResult {
  /** Migrations this start applied (only with MEMEX_AUTO_MIGRATE). */
  migrated: string[]
  /** Migrations still waiting, which the user must apply. */
  pending: string[]
}

/** True for MEMEX_AUTO_MIGRATE=true / 1. Off by default: outside Docker, migrations are an explicit step. */
export function autoMigrateEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MEMEX_AUTO_MIGRATE === 'true' || env.MEMEX_AUTO_MIGRATE === '1'
}

/**
 * Everything that must be true before the server starts listening: strong-enough secrets, a reachable database, and a
 * known migration state (applied automatically only when asked to). Throws a StartupError whose message is the whole,
 * readable explanation.
 */
export async function prepareStartup(
  env: NodeJS.ProcessEnv,
  pool: Pick<Pool, 'query' | 'connect'>,
  log: StartupLog,
): Promise<StartupResult> {
  runSecretChecks(env, log.warn)

  try {
    await pool.query('SELECT 1')
  } catch (err) {
    throw new StartupError(describeDatabaseError(err, env.DATABASE_URL))
  }

  let status
  try {
    status = await migrationStatus(pool)
  } catch (err) {
    throw new StartupError(`Could not read the database migration state: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (status.pending.length === 0) return { migrated: [], pending: [] }

  if (autoMigrateEnabled(env)) {
    log.info(`Applying ${status.pending.length} database migration(s) (MEMEX_AUTO_MIGRATE is on)`)
    try {
      const migrated = await runMigrations(pool, { log: (line) => log.info(line.trim()) })
      return { migrated, pending: [] }
    } catch (err) {
      throw new StartupError(
        `A database migration failed, so Memex will not start:\n  ${err instanceof Error ? err.message : String(err)}\n` +
        '  The failed migration was rolled back and nothing else was changed. Fix the problem (or restore your database backup) and start again.',
      )
    }
  }

  const names = status.pending.slice(0, 3).join(', ') + (status.pending.length > 3 ? ', ...' : '')
  log.warn(
    status.neverMigrated
      ? 'The database has no tables yet. Run:  npm run db:migrate   (then restart Memex)'
      : `${status.pending.length} database migration(s) are pending (${names}). Run:  npm run db:migrate   (some features will fail until you do)`,
  )
  return { migrated: [], pending: status.pending }
}
