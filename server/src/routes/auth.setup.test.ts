import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { app } from '../index'
import { pool } from '../db/client'
import { describeAccountProblem, MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH } from './auth'

vi.mock('../db/client', () => ({ pool: { query: vi.fn(), connect: vi.fn() } }))

const GOOD = 'a-long-enough-pass'

describe('describeAccountProblem', () => {
  it('accepts a normal email and a long enough password', () => {
    expect(describeAccountProblem('me@example.com', GOOD)).toBeNull()
    expect(describeAccountProblem('me@example.com', 'x'.repeat(MIN_PASSWORD_LENGTH))).toBeNull()
  })

  it.each([
    [undefined, GOOD], ['me@example.com', undefined], ['', GOOD], ['me@example.com', ''],
    [{ a: 1 }, GOOD], ['me@example.com', { a: 1 }], [42, GOOD], ['me@example.com', ['x']],
  ])('requires both, as text (%j / %j)', (e, p) => {
    expect(describeAccountProblem(e, p)).toBe('Email and password are required')
  })

  it.each(['plain', 'a@b', '@b.c', 'a b@c.d', 'a@@b.c', `${'x'.repeat(250)}@b.cd`])('rejects the email %j', (e) => {
    expect(describeAccountProblem(e, GOOD)).toBe('Enter a valid email address')
  })

  it('rejects a short password and says the minimum', () => {
    expect(describeAccountProblem('me@example.com', 'x'.repeat(MIN_PASSWORD_LENGTH - 1))).toBe(`Use a password of at least ${MIN_PASSWORD_LENGTH} characters`)
  })

  it('refuses a password bcrypt would silently cut, counting bytes not characters', () => {
    expect(describeAccountProblem('me@example.com', 'x'.repeat(MAX_PASSWORD_BYTES))).toBeNull()
    expect(describeAccountProblem('me@example.com', 'x'.repeat(MAX_PASSWORD_BYTES + 1))).toMatch(/at most 72 bytes/)
    expect(describeAccountProblem('me@example.com', 'é'.repeat(37))).toMatch(/at most 72 bytes/) // 74 bytes
  })
})

describe('POST /api/auth/setup', () => {
  beforeEach(() => vi.clearAllMocks())

  it('answers 400 with the reason for a weak password, before touching the database', async () => {
    const res = await request(app).post('/api/auth/setup').send({ email: 'me@example.com', password: 'short' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/at least 10 characters/)
    expect(pool.query).not.toHaveBeenCalled()
  })

  it('does not crash on a body that is not an object of strings', async () => {
    const res = await request(app).post('/api/auth/setup').send({ email: 'me@example.com', password: { $ne: 1 } })
    expect(res.status).toBe(400)
  })

  it('creates the account with a cost-12 bcrypt hash', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ count: '0' }] } as never)
      .mockResolvedValueOnce({ rows: [{ id: 'u1', email: 'me@example.com' }] } as never)
    const res = await request(app).post('/api/auth/setup').send({ email: 'me@example.com', password: GOOD })
    expect(res.status).toBe(201)
    const hash = vi.mocked(pool.query).mock.calls[1][1]![1] as string
    expect(bcrypt.getRounds(hash)).toBe(12)
    expect(await bcrypt.compare(GOOD, hash)).toBe(true)
  })

  it('still refuses a second account', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ count: '1' }] } as never)
    const res = await request(app).post('/api/auth/setup').send({ email: 'me@example.com', password: GOOD })
    expect(res.status).toBe(403)
  })
})
