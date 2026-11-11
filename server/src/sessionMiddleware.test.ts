import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from './index'

vi.mock('./db/client', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}))

const SECRET = process.env.JWT_SECRET as string
const DAY = 24 * 60 * 60
const nowSec = () => Math.floor(Date.now() / 1000)

/** Sign a token as if it was issued `ageSeconds` ago (jsonwebtoken honours payload.iat). */
function tokenAged(ageSeconds: number, extra: Record<string, unknown> = {}) {
  return jwt.sign(
    { userId: 'u1', email: 'a@b.com', iat: nowSec() - ageSeconds, ...extra },
    SECRET,
    { expiresIn: '7d' },
  )
}

// Any protected route works: the header is set before the handler runs, so the
// handler's own status (500 with the mocked pool) is irrelevant here.
const protectedGet = (token?: string) => {
  const req = request(app).get('/api/items')
  return token ? req.set('Authorization', `Bearer ${token}`) : req
}

beforeEach(() => vi.clearAllMocks())

describe('auth middleware — sliding session', () => {
  it('does not issue a refreshed token for a fresh session', async () => {
    const res = await protectedGet(tokenAged(60))
    expect(res.status).not.toBe(401)
    expect(res.headers['x-refreshed-token']).toBeUndefined()
  })

  it('issues a refreshed token when the session token is over a day old', async () => {
    const res = await protectedGet(tokenAged(2 * DAY, { authTime: nowSec() - 2 * DAY }))
    expect(res.status).not.toBe(401)

    const refreshed = res.headers['x-refreshed-token']
    expect(refreshed).toBeTruthy()
    const decoded = jwt.verify(refreshed, SECRET) as jwt.JwtPayload
    expect(decoded.userId).toBe('u1')
    // New token is valid for a full 7 days from now, not from the old issue time.
    expect(decoded.exp as number).toBeGreaterThan(nowSec() + 6 * DAY)
  })

  it('exposes the refresh header to cross-origin clients', async () => {
    const res = await request(app)
      .options('/api/items')
      .set('Origin', 'http://localhost:5175')
      .set('Access-Control-Request-Method', 'GET')
    const exposed = (res.headers['access-control-expose-headers'] ?? '').toLowerCase()
    expect(exposed).toContain('x-refreshed-token')
  })

  it('does not extend a session past 30 days from the original sign-in', async () => {
    const res = await protectedGet(tokenAged(2 * DAY, { authTime: nowSec() - 31 * DAY }))
    expect(res.status).not.toBe(401)           // token itself is still valid...
    expect(res.headers['x-refreshed-token']).toBeUndefined() // ...but is no longer renewed
  })

  it('still rejects an expired token with 401 and no refreshed token', async () => {
    const res = await protectedGet(tokenAged(8 * DAY))
    expect(res.status).toBe(401)
    expect(res.headers['x-refreshed-token']).toBeUndefined()
  })

  it('still rejects a missing or malformed token with 401', async () => {
    expect((await protectedGet()).status).toBe(401)
    expect((await protectedGet('garbage.token.value')).status).toBe(401)
  })
})
