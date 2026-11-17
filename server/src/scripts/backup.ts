/**
 * Full backup of the Memex database to one SQL file in ./backups (git-ignored).
 *
 *   npm run backup                       from the project root; uses the Docker postgres service
 *   npm run backup -- --local            uses pg_dump on this machine and DATABASE_URL from .env
 *   npm run backup -- --file my.sql      choose the file
 *
 * The file holds everything: items, categories, tags, entities, settings, the encrypted vault (and its verifier) and saved
 * API keys. It is NOT encrypted as a whole, so treat it like your notes: keep it somewhere private. It never contains the
 * vault master password or JWT_SECRET; keep those yourself (see the reminder this prints).
 */
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createWriteStream, mkdirSync, statSync, unlinkSync } from 'fs'
import { spawn } from 'child_process'
import { ArgError, BACKUP_DIR, KEEP_SAFE_REMINDER, backupFileName, dumpCommand, parseBackupArgs, type Command } from '../lib/backup.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
config({ path: resolve(root, '.env') })

/** Runs a command with its stdout written to `file`. Resolves on exit code 0, rejects with stderr otherwise. */
export function runToFile(c: Command, file: string, cwd: string): Promise<void> {
  return new Promise((ok, fail) => {
    const out = createWriteStream(file)
    const child = spawn(c.cmd, c.args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: false })
    let err = ''
    child.stderr!.on('data', (d) => { err += String(d) })
    child.stdout!.pipe(out)
    child.on('error', (e) => fail(new Error(`Could not start ${c.cmd}: ${e.message}`)))
    out.on('error', fail)
    child.on('close', (code) => {
      out.end(() => (code === 0 ? ok() : fail(new Error(err.trim() || `${c.cmd} exited with code ${code}`))))
    })
  })
}

/** Writes a backup of `database` and returns the file path. Removes the partial file when the dump fails. */
export async function makeBackup(opts: { database: string; local: boolean; file?: string; prefix?: string }): Promise<string> {
  const dir = resolve(root, BACKUP_DIR)
  mkdirSync(dir, { recursive: true })
  const file = opts.file ? resolve(root, opts.file) : resolve(dir, backupFileName(new Date(), opts.prefix))
  try {
    await runToFile(dumpCommand(opts, process.env.DATABASE_URL), file, root)
  } catch (e) {
    try { unlinkSync(file) } catch { /* nothing was written */ }
    throw e
  }
  return file
}

async function main() {
  const a = parseBackupArgs(process.argv.slice(2))
  const file = await makeBackup({ database: a.database, local: a.local, file: a.file })
  const kb = Math.max(1, Math.round(statSync(file).size / 1024))
  console.log(`Backup written: ${file} (${kb} KB)`)
  console.log(KEEP_SAFE_REMINDER)
  console.log('\nTo restore it: npm run restore -- <file> --yes')
}

// Run only when started directly (restore.ts imports makeBackup).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof ArgError ? `${e.message}\nUsage: npm run backup [-- --local] [--file <path>] [--database <name>]` : `Backup failed: ${e.message}`)
    process.exitCode = e instanceof ArgError ? 2 : 1
  })
}
