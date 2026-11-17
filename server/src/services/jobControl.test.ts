import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./ingestJobs', () => ({ createJob: vi.fn(), saveJobDetails: vi.fn(), hasRunningJob: vi.fn() }))

import { registerJobAbort, unregisterJob, cancelRunningJob, isCancellableJobKind, runningJobCount } from './jobControl'

beforeEach(() => { for (const id of ['a', 'b', 'c']) unregisterJob(id) })

describe('job registry', () => {
  it('registering returns a live controller and counts the job as running', () => {
    const c = registerJobAbort('a')
    expect(c.signal.aborted).toBe(false)
    expect(runningJobCount()).toBe(1)
  })

  it('cancelling aborts that job\'s signal, and returns true', () => {
    const c = registerJobAbort('a')
    expect(cancelRunningJob('a')).toBe(true)
    expect(c.signal.aborted).toBe(true)
  })

  it('cancelling one job leaves the others alone', () => {
    const a = registerJobAbort('a'); const b = registerJobAbort('b')
    cancelRunningJob('a')
    expect(a.signal.aborted).toBe(true)
    expect(b.signal.aborted).toBe(false)
  })

  it('returns false when no runner exists for the id (never started, finished, or server restarted)', () => {
    expect(cancelRunningJob('nope')).toBe(false)
    registerJobAbort('a')
    unregisterJob('a')
    expect(cancelRunningJob('a')).toBe(false)
    expect(runningJobCount()).toBe(0)
  })

  it('cancelling twice is harmless', () => {
    registerJobAbort('a')
    expect(cancelRunningJob('a')).toBe(true)
    expect(cancelRunningJob('a')).toBe(true)
  })

  it('unregistering an unknown job is harmless', () => {
    expect(() => unregisterJob('never-registered')).not.toThrow()
  })

  it('an aborted controller can be combined with a timeout signal, and the combination follows the abort', () => {
    const c = registerJobAbort('a')
    const combined = AbortSignal.any([c.signal, AbortSignal.timeout(60_000)])
    expect(combined.aborted).toBe(false)
    cancelRunningJob('a')
    expect(combined.aborted).toBe(true)
  })
})

describe('isCancellableJobKind', () => {
  it('allows the AI jobs and the re-embed job only', () => {
    expect(isCancellableJobKind('explain')).toBe(true)
    expect(isCancellableJobKind('extract-recipe')).toBe(true)
    expect(isCancellableJobKind('reembed')).toBe(true)
  })
  it.each(['paste-import', 'youtube-backfill', 'keep', '', null, undefined, 42])('refuses %s', kind => {
    expect(isCancellableJobKind(kind)).toBe(false)
  })
})
