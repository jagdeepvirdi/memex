import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../db/client', () => ({ pool: { query: vi.fn().mockResolvedValue({ rows: [] }) } }))

import { reportJobProgress } from './ingestJobs'
import { pool } from '../db/client'

beforeEach(() => vi.clearAllMocks())

describe('reportJobProgress', () => {
  it('writes completed, the (possibly changed) total, the percentage and the details in one statement', async () => {
    await reportJobProgress('job-1', 2, 7, { stage: 'summarising', part: 3, parts: 6 })
    const [sql, params] = vi.mocked(pool.query).mock.calls[0]
    expect(sql).toMatch(/UPDATE ingest_jobs SET completed=\$1, total=\$2, progress=\$3, details=COALESCE\(\$4::jsonb, details\) WHERE id=\$5/)
    expect(params).toEqual([2, 7, 29, JSON.stringify({ stage: 'summarising', part: 3, parts: 6 }), 'job-1'])
  })

  it('leaves the existing details alone when none are given', async () => {
    await reportJobProgress('job-1', 1, 1)
    expect(vi.mocked(pool.query).mock.calls[0][1]).toEqual([1, 1, 100, null, 'job-1'])
  })

  it('caps the percentage at 100 and treats an empty job as finished', async () => {
    await reportJobProgress('j', 9, 7)
    await reportJobProgress('j', 0, 0)
    expect(vi.mocked(pool.query).mock.calls[0][1]![2]).toBe(100)
    expect(vi.mocked(pool.query).mock.calls[1][1]![2]).toBe(100)
  })
})
