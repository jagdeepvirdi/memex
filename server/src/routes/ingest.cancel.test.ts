import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../index'
import { pool } from '../db/client'
import { registerJobAbort, unregisterJob, runningJobCount } from '../services/jobControl'

vi.mock('../db/client', () => ({ pool: { query: vi.fn(), connect: vi.fn() } }))
vi.mock('../services/embeddingWorker', () => ({ startEmbeddingWorker: vi.fn() }))

const JOB = '11111111-1111-4111-8111-111111111111'
let AUTH = ''
beforeAll(() => {
  const secret = process.env.JWT_SECRET || 'memex-default-secret'
  AUTH = `Bearer ${jwt.sign({ userId: 'u1', email: 't@t.com' }, secret)}`
})

/** pool.query routed by SQL: the job lookup and the cancel UPDATE. */
function jobDb(row: { status: string; kind: string | null } | null, cancelChanged = 1) {
  vi.mocked(pool.query).mockImplementation((async (sql: string) => {
    if (/SELECT status, kind FROM ingest_jobs/.test(sql)) return { rows: row ? [row] : [] }
    if (/SET status='cancelled'/.test(sql)) return { rows: [], rowCount: cancelChanged }
    return { rows: [] }
  }) as never)
}
const cancel = (id = JOB) => request(app).post(`/api/ingest/jobs/${id}/cancel`).set('Authorization', AUTH)
const updates = () => vi.mocked(pool.query).mock.calls.filter(c => /SET status='cancelled'/.test(String(c[0])))

beforeEach(() => {
  vi.clearAllMocks()
  unregisterJob(JOB)
})

describe('POST /api/ingest/jobs/:id/cancel', () => {
  it('requires auth', async () => {
    expect((await request(app).post(`/api/ingest/jobs/${JOB}/cancel`)).status).toBe(401)
  })

  it('404s for an id that is not a UUID, without querying', async () => {
    expect((await cancel('not-a-uuid')).status).toBe(404)
    expect(pool.query).not.toHaveBeenCalled()
  })

  it('404s for a job that does not exist', async () => {
    jobDb(null)
    expect((await cancel()).status).toBe(404)
    expect(updates()).toHaveLength(0)
  })

  it('202 "cancelling" when its runner is alive here: aborts the runner and leaves the row for the runner to mark', async () => {
    jobDb({ status: 'processing', kind: 'explain' })
    const control = registerJobAbort(JOB)
    const res = await cancel()
    expect(res.status).toBe(202)
    expect(res.body).toEqual({ status: 'cancelling' })
    expect(control.signal.aborted).toBe(true)
    expect(updates()).toHaveLength(0) // the runner records 'cancelled' once the model call has actually stopped
  })

  it('works for an Extract recipe job too', async () => {
    jobDb({ status: 'processing', kind: 'extract-recipe' })
    const control = registerJobAbort(JOB)
    expect((await cancel()).status).toBe(202)
    expect(control.signal.aborted).toBe(true)
  })

  it('200 "cancelled" for an orphaned job (no runner: the server restarted): clears the stale row', async () => {
    jobDb({ status: 'processing', kind: 'explain' })
    expect(runningJobCount()).toBe(0)
    const res = await cancel()
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'cancelled' })
    expect(updates()).toHaveLength(1)
    expect(updates()[0][1]).toEqual([JOB, null])
  })

  it.each(['completed', 'failed', 'cancelled'])('409 for a job that already %s, leaving its outcome alone', async status => {
    jobDb({ status, kind: 'explain' })
    const control = registerJobAbort(JOB)
    const res = await cancel()
    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({ error: expect.stringMatching(/already finished/), status })
    expect(control.signal.aborted).toBe(false)
    expect(updates()).toHaveLength(0)
  })

  it.each(['paste-import', 'youtube-backfill', null])('400 for a job of kind %s (only AI jobs can be cancelled)', async kind => {
    jobDb({ status: 'processing', kind })
    const control = registerJobAbort(JOB)
    const res = await cancel()
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/cannot be cancelled/)
    expect(control.signal.aborted).toBe(false)
    expect(updates()).toHaveLength(0)
  })

  it('500s if the lookup fails', async () => {
    vi.mocked(pool.query).mockRejectedValue(new Error('db down'))
    expect((await cancel()).status).toBe(500)
  })

  it('500s if clearing an orphaned job fails, rather than claiming success', async () => {
    vi.mocked(pool.query).mockImplementation((async (sql: string) => {
      if (/SELECT status, kind/.test(sql)) return { rows: [{ status: 'processing', kind: 'explain' }] }
      throw new Error('db down')
    }) as never)
    expect((await cancel()).status).toBe(500)
  })
})
