import { describe, it, expect } from 'vitest'
import jwt from 'jsonwebtoken'
import {
  signSessionToken,
  refreshedSessionToken,
  REFRESH_AFTER_SECONDS,
  MAX_SESSION_SECONDS,
} from './session'

const SECRET = 'unit-test-secret'
const DAY = 24 * 60 * 60
const user = { id: 'u1', email: 'a@b.com' }

/** Verified-payload shape as produced by jwt.verify for a token signed `ageSeconds` ago. */
function payloadAged(ageSeconds: number, now: number, extra: Record<string, unknown> = {}) {
  return { userId: 'u1', email: 'a@b.com', iat: now - ageSeconds, exp: now - ageSeconds + 7 * DAY, ...extra }
}

describe('signSessionToken', () => {
  it('signs a 7-day token carrying the user and the original sign-in time', () => {
    const before = Math.floor(Date.now() / 1000)
    const token = signSessionToken(user, SECRET)
    const decoded = jwt.verify(token, SECRET) as jwt.JwtPayload
    expect(decoded.userId).toBe('u1')
    expect(decoded.email).toBe('a@b.com')
    expect(decoded.authTime).toBeGreaterThanOrEqual(before)
    expect((decoded.exp as number) - (decoded.iat as number)).toBe(7 * DAY)
  })

  it('honours an explicit authTime', () => {
    const decoded = jwt.verify(signSessionToken(user, SECRET, 1_000_000), SECRET) as jwt.JwtPayload
    expect(decoded.authTime).toBe(1_000_000)
  })
})

describe('refreshedSessionToken', () => {
  const now = 2_000_000_000

  it('keeps a fresh token (no refresh before the one-day mark)', () => {
    expect(refreshedSessionToken(payloadAged(REFRESH_AFTER_SECONDS - 60, now), SECRET, now)).toBeNull()
  })

  it('issues a new 7-day token once the current one is a day old', () => {
    const token = refreshedSessionToken(payloadAged(2 * DAY, now, { authTime: now - 2 * DAY }), SECRET, now)
    expect(token).not.toBeNull()
    // Verify against a real clock-independent decode (the new token is stamped with real "now").
    const decoded = jwt.decode(token as string) as jwt.JwtPayload
    expect(decoded.userId).toBe('u1')
    expect(decoded.email).toBe('a@b.com')
    expect((decoded.exp as number) - (decoded.iat as number)).toBe(7 * DAY)
  })

  it('preserves the original sign-in time across refreshes', () => {
    const authTime = now - 10 * DAY
    const token = refreshedSessionToken(payloadAged(2 * DAY, now, { authTime }), SECRET, now)
    expect((jwt.decode(token as string) as jwt.JwtPayload).authTime).toBe(authTime)
  })

  it('falls back to iat for tokens issued before authTime existed', () => {
    const p = payloadAged(2 * DAY, now) // no authTime
    const token = refreshedSessionToken(p, SECRET, now)
    expect((jwt.decode(token as string) as jwt.JwtPayload).authTime).toBe(p.iat)
  })

  it('stops refreshing once 30 days have passed since the original sign-in', () => {
    const justUnder = payloadAged(2 * DAY, now, { authTime: now - (MAX_SESSION_SECONDS - 60) })
    const atCap = payloadAged(2 * DAY, now, { authTime: now - MAX_SESSION_SECONDS })
    expect(refreshedSessionToken(justUnder, SECRET, now)).not.toBeNull()
    expect(refreshedSessionToken(atCap, SECRET, now)).toBeNull()
  })

  it.each([
    ['a string payload', 'not-an-object'],
    ['null', null],
    ['missing userId', { email: 'a@b.com', iat: 1 }],
    ['missing email', { userId: 'u1', iat: 1 }],
    ['missing iat', { userId: 'u1', email: 'a@b.com' }],
    ['non-string userId', { userId: 5, email: 'a@b.com', iat: 1 }],
  ])('returns null for %s', (_name, payload) => {
    expect(refreshedSessionToken(payload, SECRET, now)).toBeNull()
  })
})
