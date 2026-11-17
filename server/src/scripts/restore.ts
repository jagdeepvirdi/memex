/**
 * Restores a Memex backup, REPLACING everything in the database.
 *
 *   npm run restore -- backups/memex-backup-....sql --yes
 *   npm run restore -- <file> --yes --local            pg tools on this machine, DATABASE_URL from .env
 *   npm run restore -- <file> --yes --database scratch --create     restore into another database (safe to try)
 *
 * Safeguards: nothing happens without --yes; the file is checked before anything is dropped (an unrelated or cut-off file
 * is refused with the database untouched); a safety copy of the current database is written first (skip with
 * --no-safety-copy); psql stops at the first error. Stop the app while restoring, then start it again: it runs any
 * migrations the backup predates.
 */
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createReadStream, existsSync, readFileSync } from 'fs'
import { spawn } from 'child_process'
import { ArgError, KEEP_SAFE_REMINDER, RESET_SCHEMA_SQL, checkDumpText, parseBackupArgs, psqlCommand, type Command } from '../lib/backup.js'
import { makeBackup } from './backup.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
config({ path: resolve(root, '.env') })

function run(c: Command, stdinFile?: string): Promise<string> {
  return new Promise((ok, fail) => {
    const child = spawn(c.cmd, c.args, { cwd: root, stdio: [stdinFile ? 'pipe' : 'ignore', 'pipe', 'pipe'], shell: false })
    let out = ''
    let err = ''
    child.stdout!.on('data', (d) => { out += String(d) })
    child.stderr!.on('data', (d) => { err += String(d) })
    child.on('error', (e) => fail(new Error(`Could not start ${c.cmd}: ${e.message}`)))
    child.on('close', (code) => (code === 0 ? ok(out) : fail(new Error(err.trim() || `${c.cmd} exited with code ${code}`))))
    if (stdinFile) createReadStream(stdinFile).pipe(child.stdin!)
  })
}

async function main() {
  const a = parseBackupArgs(process.argv.slice(2))
  if (!a.file) throw new ArgError('Say which backup file to restore')
  // A relative path is relative to the project root (npm runs this from server/, which is not where you typed it).
  const file = resolve(root, a.file)
  if (!existsSync(file)) throw new ArgError(`File not found: ${file}`)
  if (!a.yes) {
    throw new ArgError(`This replaces everything in the "${a.database}" database with the contents of ${file}. Run it again with --yes to go ahead.`)
  }

  const verdict = checkDumpText(readFileSync(file, 'utf8'))
  if (!verdict.ok) throw new ArgError(`Not restoring: ${verdict.reason}. The database was not touched.`)

  const url = process.env.DATABASE_URL
  if (a.create) {
    // CREATE DATABASE cannot run inside the target; connect to the maintenance database to do it, only if missing.
    const maint = { database: 'postgres', local: a.local }
    const exists = await run(psqlCommand(maint, a.local ? url?.replace(/\/[^/?]+(\?|$)/, '/postgres$1') : undefined, `SELECT 1 FROM pg_database WHERE datname = '${a.database}'`))
    if (!/\b1\b/.test(exists)) await run(psqlCommand(maint, a.local ? url?.replace(/\/[^/?]+(\?|$)/, '/postgres$1') : undefined, `CREATE DATABASE ${a.database}`))
  }

  if (a.safetyCopy) {
    try {
      const safety = await makeBackup({ database: a.database, local: a.local, prefix: 'memex-before-restore' })
      console.log(`Safety copy of the current database: ${safety}`)
    } catch (e) {
      throw new Error(`Could not take the safety copy, so nothing was changed (${(e as Error).message}). Fix that, or pass --no-safety-copy.`)
    }
  }

  await run(psqlCommand(a, url, RESET_SCHEMA_SQL))
  await run(psqlCommand(a, url), file)
  const counts = await run(psqlCommand(a, url, 'SELECT (SELECT count(*) FROM items) AS items, (SELECT count(*) FROM categories) AS categories'))
  console.log(`Restored into "${a.database}".`)
  if (counts.trim()) console.log(counts.trim())
  console.log('Start the app again (it applies any newer migrations), then unlock the vault with your master password.')
  console.log(KEEP_SAFE_REMINDER)
}

main().catch((e) => {
  console.error(e instanceof ArgError ? e.message : `Restore failed: ${e.message}`)
  process.exitCode = e instanceof ArgError ? 2 : 1
})
