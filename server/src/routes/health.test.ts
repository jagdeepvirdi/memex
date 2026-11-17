import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { app } from '../index'

vi.mock('../db/client', () => ({ pool: { query: vi.fn(), connect: vi.fn() } }))
const mockStatus = vi.fn()
vi.mock('../db/migrator', () => ({ migrationStatus: (...a: unknown[]) => mockStatus(...a), runMigrations: vi.fn() }))
const mockOllama = vi.fn()
vi.mock('../services/ollama', async (orig) => ({ ...(await orig<typeof import('../services/ollama')>()), checkOllamaHealth: () => mockOllama() }))

const OLD = process.env.MEMEX_AUTO_MIGRATE
beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.MEMEX_AUTO_MIGRATE
  mockStatus.mockResolvedValue({ applied: ['a', 'b'], pending: [], neverMigrated: false })
  mockOllama.mockResolvedValue(true)
})
afterEach(() => {
  if (OLD === undefined) delete process.env.MEMEX_AUTO_MIGRATE
  else process.env.MEMEX_AUTO_MIGRATE = OLD
})

describe('GET /api/health/status', () => {
  it('is public: it works before an account exists, with no token', async () => {
    const res = await request(app).get('/api/health/status')
    expect(res.status).toBe(200)
  })

  it('reports ok when the database answers and nothing is pending', async () => {
    const res = await request(app).get('/api/health/status')
    expect(res.body).toEqual({
      status: 'ok', database: { ok: true }, migrations: { applied: 2, pending: 0, pendingNames: [] }, ollama: { ok: true }, autoMigrate: false,
    })
  })

  it('is degraded, and names what to run, while migrations are pending', async () => {
    mockStatus.mockResolvedValue({ applied: ['a'], pending: ['b', 'c', 'd', 'e', 'f', 'g', 'h'], neverMigrated: false })
    const res = await request(app).get('/api/health/status')
    expect(res.body.status).toBe('degraded')
    expect(res.body.migrations).toEqual({ applied: 1, pending: 7, pendingNames: ['b', 'c', 'd', 'e', 'f'] }) // capped at five names
  })

  it('is degraded with a readable reason when the database cannot be reached', async () => {
    mockStatus.mockRejectedValue(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }))
    const res = await request(app).get('/api/health/status')
    expect(res.status).toBe(200) // the endpoint itself works: that is the point of it
    expect(res.body.status).toBe('degraded')
    expect(res.body.database.ok).toBe(false)
    expect(res.body.database.error).toMatch(/docker compose up -d postgres/)
  })

  it('does NOT treat Ollama being down as a problem: a cloud-only install never runs it', async () => {
    mockOllama.mockResolvedValue(false)
    const res = await request(app).get('/api/health/status')
    expect(res.body.status).toBe('ok')
    expect(res.body.ollama).toEqual({ ok: false })
  })

  it('says whether this server migrates by itself', async () => {
    process.env.MEMEX_AUTO_MIGRATE = 'true'
    expect((await request(app).get('/api/health/status')).body.autoMigrate).toBe(true)
  })

  it('never includes a secret or a connection string', async () => {
    mockStatus.mockRejectedValue(new Error('password authentication failed'))
    const body = JSON.stringify((await request(app).get('/api/health/status')).body)
    expect(body).not.toMatch(/postgresql:\/\//)
    expect(body).not.toContain(process.env.JWT_SECRET ?? 'no-such-secret')
  })
})
