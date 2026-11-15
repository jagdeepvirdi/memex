import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../db/client', () => ({ pool: { query: vi.fn() } }))
vi.mock('./explainService', async orig => ({ ...(await orig<typeof import('./explainService')>()), explainItem: vi.fn() }))
vi.mock('./ingestJobs', () => ({
  reportJobProgress: vi.fn().mockResolvedValue(undefined),
  completeJob: vi.fn().mockResolvedValue(undefined),
  failJob: vi.fn().mockResolvedValue(undefined),
  cancelJob: vi.fn().mockResolvedValue(true),
}))
vi.mock('../lib/logger', () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { runExplainJob, EXPLAIN_JOB_KIND, EXPLAIN_JOB_STALE_MINUTES, EXPLAIN_JOB_TIMEOUT_MS, type ExplainJobInput } from './explainJob'
import { explainItem, ExplainParseError } from './explainService'
import { reportJobProgress, completeJob, failJob, cancelJob } from './ingestJobs'
import { cancelRunningJob, runningJobCount } from './jobControl'
import { NoSourceTextError } from './itemSource'
import { AiProviderError } from './ai'
import { pool } from '../db/client'
import logger from '../lib/logger'

const INPUT: ExplainJobInput = {
  jobId: 'job-1', itemId: 'item-1', title: 'Vid', content: 'https://youtu.be/dQw4w9WgXcQ',
  sourceUrl: 'https://youtu.be/dQw4w9WgXcQ', provider: 'claude', cloudSafe: true,
}
const EXPLANATION = {
  summary: 's', keyPoints: ['k'], steps: [], takeaways: [], model: 'ollama:llama3.2',
  generatedAt: '2026-11-15T00:00:00.000Z', basis: 'transcript' as const, truncated: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never)
  vi.mocked(explainItem).mockResolvedValue(EXPLANATION as never)
})

describe('job constants', () => {
  it('is its own job kind, with a stale window and a hard timeout', () => {
    expect(EXPLAIN_JOB_KIND).toBe('explain')
    expect(EXPLAIN_JOB_STALE_MINUTES).toBe(20)
    expect(EXPLAIN_JOB_TIMEOUT_MS).toBe(15 * 60_000)
  })
})

describe('runExplainJob — success', () => {
  it('explains with the item, provider, privacy flag and a timeout signal', async () => {
    await runExplainJob(INPUT)
    const [item, opts] = vi.mocked(explainItem).mock.calls[0]
    expect(item).toEqual({ title: 'Vid', content: INPUT.content, sourceUrl: INPUT.sourceUrl })
    expect(opts).toMatchObject({ provider: 'claude', cloudSafe: true })
    expect(opts.signal).toBeInstanceOf(AbortSignal)
    expect(opts.signal!.aborted).toBe(false)
  })

  it('saves the explanation on the item (keeping its other fields) with the model, then completes the job', async () => {
    await runExplainJob(INPUT)
    const [sql, params] = vi.mocked(pool.query).mock.calls[0]
    expect(sql).toContain("jsonb_set(COALESCE(structured, '{}'::jsonb), '{explanation}'")
    expect(sql).toMatch(/deleted_at IS NULL/)
    expect(params).toEqual([JSON.stringify(EXPLANATION), 'ollama:llama3.2', 'item-1'])

    expect(completeJob).toHaveBeenCalledTimes(1)
    expect(completeJob).toHaveBeenCalledWith('job-1', { itemId: 'item-1', model: 'ollama:llama3.2' })
    expect(failJob).not.toHaveBeenCalled()
    // saved before the job is marked complete, so a poller that sees "completed" always finds the explanation
    expect(vi.mocked(pool.query).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(completeJob).mock.invocationCallOrder[0])
  })

  it('reports progress on the job row as the explainer reports it, including the item id for the UI', async () => {
    vi.mocked(explainItem).mockImplementation(async (_i, opts) => {
      opts.onProgress?.({ stage: 'reading', done: 0, total: 1 })
      opts.onProgress?.({ stage: 'summarising', done: 2, total: 7, part: 3, parts: 6 })
      opts.onProgress?.({ stage: 'writing', done: 7, total: 7 })
      return EXPLANATION as never
    })
    await runExplainJob(INPUT)
    expect(vi.mocked(reportJobProgress).mock.calls).toEqual([
      ['job-1', 0, 1, { itemId: 'item-1', stage: 'reading', part: undefined, parts: undefined }],
      ['job-1', 2, 7, { itemId: 'item-1', stage: 'summarising', part: 3, parts: 6 }],
      ['job-1', 7, 7, { itemId: 'item-1', stage: 'writing', part: undefined, parts: undefined }],
    ])
  })

  it('does not let a failing progress write stop the explanation', async () => {
    vi.mocked(reportJobProgress).mockRejectedValue(new Error('db hiccup'))
    vi.mocked(explainItem).mockImplementation(async (_i, opts) => {
      opts.onProgress?.({ stage: 'writing', done: 1, total: 1 })
      return EXPLANATION as never
    })
    await runExplainJob(INPUT)
    expect(completeJob).toHaveBeenCalledTimes(1)
    expect(failJob).not.toHaveBeenCalled()
  })

  it('still completes if the item was deleted meanwhile (the update simply changes nothing)', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 0 } as never)
    await runExplainJob(INPUT)
    expect(completeJob).toHaveBeenCalledTimes(1)
  })
})

describe('runExplainJob — failure is recorded on the job, never thrown', () => {
  const failed = () => vi.mocked(failJob).mock.calls[0]

  it.each([
    ['no transcript', new NoSourceTextError('No transcript is available for this video.'), 'No transcript is available for this video.', undefined],
    ['an unusable AI answer', new ExplainParseError(), 'The AI did not return a usable explanation. Try again or pick a different provider.', undefined],
    ['a blocked provider', new AiProviderError('claude', 'blocked', 'Cannot use claude: Strict Local Mode is on'), 'Cannot use claude: Strict Local Mode is on', 'blocked'],
    ['a rate limit', new AiProviderError('gemini', 'rate_limit', 'Slow down'), 'Slow down', 'rate_limit'],
    ['a provider timeout', new AiProviderError('claude', 'timeout', 'timed out'), 'timed out', 'timeout'],
    ['Strict Local Mode blocking the fetch', new Error('Strict Local Mode is enabled. External URL scraping is blocked.'), 'Strict Local Mode is enabled. External URL scraping is blocked.', undefined],
  ])('%s → job failed with a readable message', async (_n, err, message, kind) => {
    vi.mocked(explainItem).mockRejectedValue(err)
    await expect(runExplainJob(INPUT)).resolves.toBeUndefined()
    expect(failed()[0]).toBe('job-1')
    expect(failed()[1]).toBe(message)
    expect(failed()[2]).toEqual({ itemId: 'item-1', ...(kind ? { kind } : {}) })
    expect(completeJob).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled() // expected failures are not logged as errors
  })

  it('says it took too long when the overall timeout fires', async () => {
    vi.mocked(explainItem).mockRejectedValue(Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }))
    await runExplainJob(INPUT)
    expect(failed()[1]).toMatch(/took too long/)
  })

  it('logs an unexpected error and shows a generic message (never the raw error)', async () => {
    vi.mocked(explainItem).mockRejectedValue(new Error('ECONNRESET at 10.0.0.5:5432 password=hunter2'))
    await runExplainJob(INPUT)
    expect(logger.error).toHaveBeenCalled()
    expect(failed()[1]).toBe('Failed to explain item')
    expect(JSON.stringify(failed())).not.toContain('hunter2')
  })

  it('does not save anything on failure', async () => {
    vi.mocked(explainItem).mockRejectedValue(new ExplainParseError())
    await runExplainJob(INPUT)
    expect(pool.query).not.toHaveBeenCalled()
  })

  it('fails the job if saving the explanation fails', async () => {
    vi.mocked(pool.query).mockRejectedValue(new Error('disk full'))
    await runExplainJob(INPUT)
    expect(failJob).toHaveBeenCalledTimes(1)
    expect(completeJob).not.toHaveBeenCalled()
  })

  it('survives even the failure being unrecordable', async () => {
    vi.mocked(explainItem).mockRejectedValue(new ExplainParseError())
    vi.mocked(failJob).mockRejectedValue(new Error('db down'))
    await expect(runExplainJob(INPUT)).resolves.toBeUndefined()
  })
})

/** An explainItem that only ends when its signal aborts (as the real model call does). */
function hangUntilAborted() {
  vi.mocked(explainItem).mockImplementation((_item, opts) => new Promise((_resolve, reject) => {
    opts.signal!.addEventListener('abort', () => reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })))
  }))
}
const started = () => new Promise<void>(r => setTimeout(r, 0))

describe('runExplainJob — the user cancels', () => {
  it('stops the model call, marks the job cancelled (not failed), saves nothing, and logs no error', async () => {
    hangUntilAborted()
    const run = runExplainJob(INPUT)
    await started()
    expect(cancelRunningJob('job-1')).toBe(true)
    await run

    expect(cancelJob).toHaveBeenCalledTimes(1)
    expect(cancelJob).toHaveBeenCalledWith('job-1', { itemId: 'item-1' })
    expect(failJob).not.toHaveBeenCalled()
    expect(completeJob).not.toHaveBeenCalled()
    expect(pool.query).not.toHaveBeenCalled() // nothing was written to the item
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('treats a provider that reports the abort as a "timeout" error as a cancel too', async () => {
    vi.mocked(explainItem).mockImplementation((_item, opts) => new Promise((_resolve, reject) => {
      opts.signal!.addEventListener('abort', () => reject(new AiProviderError('claude', 'timeout', 'timed out')))
    }))
    const run = runExplainJob(INPUT)
    await started()
    cancelRunningJob('job-1')
    await run
    expect(cancelJob).toHaveBeenCalledTimes(1)
    expect(failJob).not.toHaveBeenCalled()
  })

  it('is honoured even if the explanation was just finishing: nothing is saved', async () => {
    vi.mocked(explainItem).mockImplementation(async () => {
      cancelRunningJob('job-1') // the user clicks Cancel as the last model call returns
      return EXPLANATION as never
    })
    await runExplainJob(INPUT)
    expect(pool.query).not.toHaveBeenCalled()
    expect(completeJob).not.toHaveBeenCalled()
    expect(cancelJob).toHaveBeenCalledTimes(1)
  })

  it('a timeout is still a failure, not a cancel', async () => {
    vi.mocked(explainItem).mockRejectedValue(Object.assign(new Error('aborted due to timeout'), { name: 'TimeoutError' }))
    await runExplainJob(INPUT)
    expect(failJob).toHaveBeenCalledTimes(1)
    expect(cancelJob).not.toHaveBeenCalled()
  })

  it('passes a signal the model call can be cancelled with, that is not already aborted', async () => {
    await runExplainJob(INPUT)
    const signal = vi.mocked(explainItem).mock.calls[0][1].signal!
    expect(signal).toBeInstanceOf(AbortSignal)
    expect(signal.aborted).toBe(false)
  })

  it('is registered while it runs and unregistered afterwards, whatever the outcome', async () => {
    let during = -1
    vi.mocked(explainItem).mockImplementation(async () => { during = runningJobCount(); return EXPLANATION as never })
    await runExplainJob(INPUT)
    expect(during).toBe(1)
    expect(runningJobCount()).toBe(0)

    vi.mocked(explainItem).mockRejectedValue(new ExplainParseError())
    await runExplainJob(INPUT)
    expect(runningJobCount()).toBe(0)

    hangUntilAborted()
    const run = runExplainJob(INPUT)
    await started()
    cancelRunningJob('job-1')
    await run
    expect(runningJobCount()).toBe(0)
    expect(cancelRunningJob('job-1')).toBe(false) // nothing left to cancel once it has ended
  })

  it('survives the cancellation being unrecordable', async () => {
    vi.mocked(cancelJob).mockRejectedValue(new Error('db down'))
    hangUntilAborted()
    const run = runExplainJob(INPUT)
    await started()
    cancelRunningJob('job-1')
    await expect(run).resolves.toBeUndefined()
  })
})
