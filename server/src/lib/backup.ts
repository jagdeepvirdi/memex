// Backup and restore of the whole Memex database (items, categories, tags, entities, settings, the encrypted vault and its
// verifier, saved API keys). Pure helpers: the scripts (`scripts/backup.ts`, `scripts/restore.ts`) run the commands built here.
//
// What a backup does NOT contain, and what you must keep yourself:
//   - the vault master password (it never leaves your browser, so no file can hold it; without it vault items stay locked)
//   - JWT_SECRET / KEY_ENCRYPTION_SECRET from .env (saved API keys are encrypted with a key derived from one of them)

export const DEFAULT_DB_USER = 'memex'
export const DEFAULT_DB_NAME = 'memex'
export const BACKUP_DIR = 'backups'

/** Only plain identifiers: the name is placed into SQL and a command line. */
const DB_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/

export function validDatabaseName(name: string): boolean {
  return DB_NAME.test(name)
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0')

/** `memex-backup-2026-11-17-224905.sql` (local time, sortable). */
export function backupFileName(date: Date, prefix = 'memex-backup'): string {
  return `${prefix}-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.sql`
}

export interface BackupArgs {
  database: string
  /** Run pg_dump / psql on this machine against DATABASE_URL instead of inside the Docker postgres service. */
  local: boolean
  file?: string
  yes: boolean
  create: boolean
  safetyCopy: boolean
}

export class ArgError extends Error {}

/** `--database <name>`, `--local`, `--file <path>` (or a bare path), `--yes`, `--create`, `--no-safety-copy`. */
export function parseBackupArgs(argv: string[]): BackupArgs {
  const out: BackupArgs = { database: DEFAULT_DB_NAME, local: false, yes: false, create: false, safetyCopy: true }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--local') out.local = true
    else if (a === '--yes') out.yes = true
    else if (a === '--create') out.create = true
    else if (a === '--no-safety-copy') out.safetyCopy = false
    else if (a === '--database' || a === '--file') {
      const v = argv[++i]
      if (!v || v.startsWith('--')) throw new ArgError(`${a} needs a value`)
      if (a === '--database') out.database = v
      else out.file = v
    } else if (a.startsWith('--')) throw new ArgError(`Unknown option ${a}`)
    else if (out.file === undefined) out.file = a
    else throw new ArgError(`Unexpected argument ${a}`)
  }
  if (!validDatabaseName(out.database)) throw new ArgError(`"${out.database}" is not a valid database name (letters, digits and underscores only)`)
  return out
}

export interface Command {
  cmd: string
  args: string[]
}

/** The tool inside the Docker postgres service (the default; the local alternative is built by each command). */
function inDockerPostgres(tool: string, toolArgs: string[]): Command {
  return { cmd: 'docker', args: ['compose', 'exec', '-T', 'postgres', tool, ...toolArgs] }
}

/** A plain-SQL dump of one database, without ownership/privileges so it restores into any install. */
export function dumpCommand(a: Pick<BackupArgs, 'database' | 'local'>, databaseUrl?: string): Command {
  if (a.local) {
    if (!databaseUrl) throw new ArgError('--local needs DATABASE_URL in .env')
    return { cmd: 'pg_dump', args: ['--no-owner', '--no-privileges', '--dbname', databaseUrl] }
  }
  return inDockerPostgres('pg_dump', ['-U', DEFAULT_DB_USER, '-d', a.database, '--no-owner', '--no-privileges'])
}

/** psql reading a script from stdin, stopping at the first error. */
export function psqlCommand(a: Pick<BackupArgs, 'database' | 'local'>, databaseUrl?: string, sql?: string): Command {
  const base = ['-v', 'ON_ERROR_STOP=1', '-q']
  if (a.local) {
    if (!databaseUrl) throw new ArgError('--local needs DATABASE_URL in .env')
    return { cmd: 'psql', args: [...base, '--dbname', databaseUrl, ...(sql ? ['-c', sql] : [])] }
  }
  return inDockerPostgres('psql', [...base, '-U', DEFAULT_DB_USER, '-d', a.database, ...(sql ? ['-c', sql] : [])])
}

/** Resets the public schema so a restore never merges into leftovers. The dump recreates the vector extension. */
export const RESET_SCHEMA_SQL = 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'

/**
 * Refuses a file that is plainly not a Memex dump before anything is dropped. Looks only for the tables a Memex database
 * always has, so an unrelated or truncated file stops the restore while the database is still intact.
 */
export function checkDumpText(text: string): { ok: true } | { ok: false; reason: string } {
  if (!text.trim()) return { ok: false, reason: 'the file is empty' }
  if (!/PostgreSQL database dump/.test(text)) return { ok: false, reason: 'it does not look like a pg_dump file' }
  if (!/PostgreSQL database dump complete/.test(text)) return { ok: false, reason: 'the dump looks cut off (no "dump complete" footer)' }
  for (const table of ['items', 'categories', 'settings']) {
    if (!new RegExp(`CREATE TABLE (IF NOT EXISTS )?public\\.${table}\\b`).test(text)) {
      return { ok: false, reason: `it has no "${table}" table, so it is not a Memex backup` }
    }
  }
  return { ok: true }
}

export const KEEP_SAFE_REMINDER = [
  'Keep these safe yourself (they are not in the file):',
  '  - your vault master password: it never leaves your browser, so no backup can hold it',
  '  - JWT_SECRET (and KEY_ENCRYPTION_SECRET if you set it) from .env: saved API keys are encrypted with them',
].join('\n')
