import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../db/client', () => ({ pool: { query: vi.fn() } }))

import { cancelJob, hasRunningJob } from './ingestJobs'
import { pool } from '../db/client'

beforeEach(() => vi.clearAllMocks())

describe('cancelJob', () => {
  it('marks a processing job cancelled with a completion time, and reports that it changed', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 1 } as never)
    expect(await cancelJob('job-1', { itemId: 'item-1' })).toBe(true)
    const [sql, params] = vi.mocked(pool.query).mock.calls[0]
    expect(sql).toMatch(/SET status='cancelled', completed_at=NOW\(\), details=COALESCE\(\$2::jsonb, details\)/)
    expect(params).toEqual(['job-1', JSON.stringify({ itemId: 'item-1' })])
  })

  it('only ever changes a job that is still processing, so a job that already finished keeps its outcome', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 0 } as never)
    expect(await cancelJob('job-1')).toBe(false)
    expect(String(vi.mocked(pool.query).mock.calls[0][0])).toMatch(/WHERE id=\$1 AND status='processing'/)
  })

  it('keeps the existing details when none are given', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 1 } as never)
    await cancelJob('job-1')
    expect(vi.mocked(pool.query).mock.calls[0][1]).toEqual(['job-1', null])
  })

  it('treats a missing row count as "nothing changed"', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: null } as never)
    expect(await cancelJob('job-1')).toBe(false)
  })

  it('a cancelled job no longer counts as running, so it frees the one-at-a-time lock', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never)
    await hasRunningJob('explain', 20)
    expect(String(vi.mocked(pool.query).mock.calls[0][0])).toMatch(/status='processing'/)
  })
})
