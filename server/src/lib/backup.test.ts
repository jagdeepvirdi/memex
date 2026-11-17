import { describe, it, expect } from 'vitest'
import { ArgError, RESET_SCHEMA_SQL, backupFileName, checkDumpText, dumpCommand, parseBackupArgs, psqlCommand, validDatabaseName } from './backup'

const GOOD_DUMP = [
  '--', '-- PostgreSQL database dump', '--',
  'CREATE EXTENSION IF NOT EXISTS vector;',
  'CREATE TABLE public.items (id uuid);',
  'CREATE TABLE public.categories (id uuid);',
  'CREATE TABLE public.settings (key text);',
  '-- PostgreSQL database dump complete',
].join('\n')

describe('backupFileName', () => {
  it('is sortable local time with a prefix', () => {
    expect(backupFileName(new Date(2026, 10, 7, 9, 5, 3))).toBe('memex-backup-2026-11-07-090503.sql')
    expect(backupFileName(new Date(2026, 10, 7, 9, 5, 3), 'memex-before-restore')).toBe('memex-before-restore-2026-11-07-090503.sql')
  })
})

describe('validDatabaseName', () => {
  it.each(['memex', 'memex_restore_test', '_x', 'A1'])('accepts %s', (n) => expect(validDatabaseName(n)).toBe(true))
  it.each(['', '1abc', 'a-b', 'a b', 'x;DROP DATABASE memex', "x'", 'a'.repeat(64), '../x'])('rejects %j', (n) => expect(validDatabaseName(n)).toBe(false))
})

describe('parseBackupArgs', () => {
  it('has safe defaults', () => {
    expect(parseBackupArgs([])).toEqual({ database: 'memex', local: false, yes: false, create: false, safetyCopy: true })
  })

  it('reads every option, and a bare path as the file', () => {
    expect(parseBackupArgs(['b.sql', '--yes', '--local', '--create', '--no-safety-copy', '--database', 'scratch'])).toEqual({
      database: 'scratch', local: true, yes: true, create: true, safetyCopy: false, file: 'b.sql',
    })
    expect(parseBackupArgs(['--file', 'x.sql']).file).toBe('x.sql')
  })

  it.each([
    [['--database'], /needs a value/],
    [['--file', '--yes'], /needs a value/],
    [['--bogus'], /Unknown option --bogus/],
    [['a.sql', 'b.sql'], /Unexpected argument b.sql/],
    [['--database', 'x;drop'], /not a valid database name/],
  ])('refuses %j', (argv, message) => {
    expect(() => parseBackupArgs(argv)).toThrow(ArgError)
    expect(() => parseBackupArgs(argv)).toThrow(message)
  })
})

describe('commands', () => {
  it('dumps through the Docker postgres service by default, without owners or privileges', () => {
    expect(dumpCommand({ database: 'memex', local: false })).toEqual({
      cmd: 'docker',
      args: ['compose', 'exec', '-T', 'postgres', 'pg_dump', '-U', 'memex', '-d', 'memex', '--no-owner', '--no-privileges'],
    })
  })

  it('dumps with the local client through DATABASE_URL, and says so when there is none', () => {
    expect(dumpCommand({ database: 'memex', local: true }, 'postgresql://u:p@h:5432/memex')).toEqual({
      cmd: 'pg_dump', args: ['--no-owner', '--no-privileges', '--dbname', 'postgresql://u:p@h:5432/memex'],
    })
    expect(() => dumpCommand({ database: 'memex', local: true })).toThrow(/DATABASE_URL/)
  })

  it('runs psql that stops at the first error', () => {
    const c = psqlCommand({ database: 'memex', local: false })
    expect(c.args).toEqual(expect.arrayContaining(['-v', 'ON_ERROR_STOP=1', '-U', 'memex', '-d', 'memex']))
    expect(c.args).not.toContain('-c')
  })

  it('passes a statement with -c, and never through a shell string', () => {
    const c = psqlCommand({ database: 'memex', local: false }, undefined, RESET_SCHEMA_SQL)
    expect(c.args.slice(-2)).toEqual(['-c', RESET_SCHEMA_SQL])
  })

  it('resets only the public schema', () => {
    expect(RESET_SCHEMA_SQL).toBe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  })
})

describe('checkDumpText', () => {
  it('accepts a complete Memex dump', () => expect(checkDumpText(GOOD_DUMP)).toEqual({ ok: true }))

  it.each([
    ['', /empty/],
    ['   \n', /empty/],
    ['hello', /does not look like a pg_dump/],
    [GOOD_DUMP.replace('-- PostgreSQL database dump complete', ''), /cut off/],
    [GOOD_DUMP.replace('CREATE TABLE public.items (id uuid);', ''), /no "items" table/],
    [GOOD_DUMP.replace('public.settings', 'public.other'), /no "settings" table/],
  ])('refuses %j', (text, reason) => {
    const v = checkDumpText(text)
    expect(v.ok).toBe(false)
    expect(v.ok === false && v.reason).toMatch(reason)
  })

  it('also accepts the IF NOT EXISTS spelling', () => {
    expect(checkDumpText(GOOD_DUMP.replace(/CREATE TABLE /g, 'CREATE TABLE IF NOT EXISTS '))).toEqual({ ok: true })
  })
})
