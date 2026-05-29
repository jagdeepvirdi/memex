import { describe, it, expect, vi, beforeAll } from 'vitest'
import request from 'supertest'

// pool always "user not found" so login returns 401 (never 429 from the handler)
vi.mock('../db/client', () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }), connect: vi.fn() },
}))

let app: any
beforeAll(async () => {
  // Set a low limit BEFORE importing the app so authLimiter picks it up at construction.
  process.env.AUTH_RATE_LIMIT_MAX = '3'
  app = (await import('../index')).app
})

describe('auth rate limiting', () => {
  it('allows requests up to the limit, then returns 429', async () => {
    // limit = 3 → first 3 reach the handler (401), the 4th is blocked
    for (let i = 0; i < 3; i++) {
      const r = await request(app).post('/api/auth/login').send({ email: 'a@b.c', password: 'x' })
      expect(r.status).not.toBe(429)
    }
    const blocked = await request(app).post('/api/auth/login').send({ email: 'a@b.c', password: 'x' })
    expect(blocked.status).toBe(429)
    expect(blocked.body.error).toMatch(/too many/i)
  })

  it('also throttles the /setup endpoint', async () => {
    // shares the same limiter store/IP — already over the limit from the test above
    const r = await request(app).post('/api/auth/setup').send({ email: 'a@b.c', password: 'x' })
    expect(r.status).toBe(429)
  })
})
