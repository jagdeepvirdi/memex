import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockStatus = vi.fn()
const mockRun = vi.fn()
vi.mock('../db/migrator', () => ({
  migrationStatus: (...a: unknown[]) => mockStatus(...a),
  runMigrations: (...a: unknown[]) => mockRun(...a),
}))

import { prepareStartup, autoMigrateEnabled } from './startup'
import { StartupError } from './startupChecks'

const STRONG = 'a3f9c2e87b1d4056aa91c0d3e5f7b2184c6d9e0f1a2b3c4d5e6f708192a3b4c5'
const DB_URL = 'postgresql://memex:pw@localhost:5436/memex'
const env = (o: Record<string, string | undefined> = {}) => ({ NODE_ENV: 'development', JWT_SECRET: STRONG, DATABASE_URL: DB_URL, ...o }) as NodeJS.ProcessEnv
const log = () => ({ info: vi.fn(), warn: vi.fn() })
const pool = (query: (sql: string) => unknown = async () => ({ rows: [] })) => ({ query: vi.fn(query), connect: vi.fn() }) as never

beforeEach(() => {
  vi.clearAllMocks()
  mockStatus.mockResolvedValue({ applied: ['001.sql'], pending: [], neverMigrated: false })
  mockRun.mockResolvedValue([])
})

describe('autoMigrateEnabled', () => {
  it.each([['true', true], ['1', true], ['false', false], ['0', false], ['yes', false], [undefined, false]])('MEMEX_AUTO_MIGRATE=%s -> %s', (v, on) => {
    expect(autoMigrateEnabled({ MEMEX_AUTO_MIGRATE: v } as NodeJS.ProcessEnv)).toBe(on)
  })
})

describe('prepareStartup', () => {
  it('starts quietly when everything is in order', async () => {
    const l = log()
    expect(await prepareStartup(env(), pool(), l)).toEqual({ migrated: [], pending: [] })
    expect(l.warn).not.toHaveBeenCalled()
    expect(mockRun).not.toHaveBeenCalled()
  })

  it('refuses a weak secret in production before touching the database', async () => {
    const p = pool()
    await expect(prepareStartup(env({ NODE_ENV: 'production', JWT_SECRET: 'changeme' }), p, log())).rejects.toBeInstanceOf(StartupError)
    expect((p as unknown as { query: ReturnType<typeof vi.fn> }).query).not.toHaveBeenCalled()
  })

  it('only warns about a weak secret in development and carries on', async () => {
    const l = log()
    await prepareStartup(env({ JWT_SECRET: 'short' }), pool(), l)
    expect(l.warn).toHaveBeenCalledWith(expect.stringMatching(/Weak secret/))
  })

  it('turns an unreachable database into the readable instructions', async () => {
    const down = pool(async () => { throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }) })
    const err = await prepareStartup(env(), down, log()).catch((e) => e)
    expect(err).toBeInstanceOf(StartupError)
    expect(err.message).toMatch(/docker compose up -d postgres/)
    expect(err.message).not.toContain(':pw@')
    expect(mockStatus).not.toHaveBeenCalled()
  })

  it('wraps a failure to read the migration state', async () => {
    mockStatus.mockRejectedValue(new Error('permission denied'))
    await expect(prepareStartup(env(), pool(), log())).rejects.toThrow(/Could not read the database migration state: permission denied/)
  })
})

describe('prepareStartup — pending migrations', () => {
  beforeEach(() => mockStatus.mockResolvedValue({ applied: ['001.sql'], pending: ['002.sql', '003.sql', '004.sql', '005.sql'], neverMigrated: false }))

  it('does NOT migrate by itself (migrations are the user\'s step outside Docker): it warns and says what to run', async () => {
    const l = log()
    const r = await prepareStartup(env(), pool(), l)
    expect(mockRun).not.toHaveBeenCalled()
    expect(r.pending).toHaveLength(4)
    expect(l.warn).toHaveBeenCalledWith(expect.stringMatching(/4 database migration\(s\) are pending \(002\.sql, 003\.sql, 004\.sql, \.\.\.\).*npm run db:migrate/))
  })

  it('says the database is empty on a brand-new install', async () => {
    mockStatus.mockResolvedValue({ applied: [], pending: ['001.sql'], neverMigrated: true })
    const l = log()
    await prepareStartup(env(), pool(), l)
    expect(l.warn).toHaveBeenCalledWith(expect.stringMatching(/no tables yet.*npm run db:migrate/))
  })

  it('applies them when MEMEX_AUTO_MIGRATE is on (the Docker image)', async () => {
    mockRun.mockResolvedValue(['002.sql', '003.sql', '004.sql', '005.sql'])
    const l = log()
    const r = await prepareStartup(env({ MEMEX_AUTO_MIGRATE: 'true' }), pool(), l)
    expect(r).toEqual({ migrated: ['002.sql', '003.sql', '004.sql', '005.sql'], pending: [] })
    expect(mockRun).toHaveBeenCalledTimes(1)
    expect(l.info).toHaveBeenCalledWith(expect.stringMatching(/Applying 4 database migration/))
    expect(l.warn).not.toHaveBeenCalled()
  })

  it('stops with a readable message when an automatic migration fails, saying nothing else changed', async () => {
    mockRun.mockRejectedValue(new Error('Migration 003.sql failed: boom'))
    const err = await prepareStartup(env({ MEMEX_AUTO_MIGRATE: 'true' }), pool(), log()).catch((e) => e)
    expect(err).toBeInstanceOf(StartupError)
    expect(err.message).toMatch(/Migration 003\.sql failed: boom/)
    expect(err.message).toMatch(/rolled back/)
    expect(err.message).toMatch(/will not start/)
  })

  it('routes migration progress through the logger', async () => {
    mockRun.mockImplementation(async (_p: unknown, o: { log: (l: string) => void }) => { o.log('  ✓     002.sql'); return ['002.sql'] })
    const l = log()
    await prepareStartup(env({ MEMEX_AUTO_MIGRATE: '1' }), pool(), l)
    expect(l.info).toHaveBeenCalledWith('✓     002.sql')
  })
})
