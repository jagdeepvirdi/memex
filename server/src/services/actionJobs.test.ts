import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./ingestJobs', () => ({
  createJob: vi.fn().mockResolvedValue(undefined),
  saveJobDetails: vi.fn().mockResolvedValue(undefined),
  hasRunningJob: vi.fn().mockResolvedValue(false),
}))

import {
  AI_JOB_KINDS, AI_JOB_STALE_MINUTES, AI_JOB_TIMEOUT_MS, EXPLAIN_JOB_KIND, EXTRACT_RECIPE_JOB_KIND,
  anotherAiJobRunning, createAiJob, AI_JOB_BUSY_MESSAGE,
} from './actionJobs'
import { createJob, saveJobDetails, hasRunningJob } from './ingestJobs'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(hasRunningJob).mockResolvedValue(false)
  vi.mocked(saveJobDetails).mockResolvedValue(undefined)
})

describe('constants', () => {
  it('has two kinds, a stale window and a hard timeout', () => {
    expect(AI_JOB_KINDS).toEqual(['explain', 'extract-recipe'])
    expect(EXPLAIN_JOB_KIND).toBe('explain')
    expect(EXTRACT_RECIPE_JOB_KIND).toBe('extract-recipe')
    expect(AI_JOB_STALE_MINUTES).toBe(20)
    expect(AI_JOB_TIMEOUT_MS).toBe(15 * 60_000)
    expect(AI_JOB_BUSY_MESSAGE).toMatch(/still running/)
  })
})

describe('anotherAiJobRunning', () => {
  it('is false when no kind is running, checking every kind with the stale window', async () => {
    expect(await anotherAiJobRunning()).toBe(false)
    expect(vi.mocked(hasRunningJob).mock.calls).toEqual([['explain', 20], ['extract-recipe', 20]])
  })

  it.each([['explain'], ['extract-recipe']])('is true when only %s is running', async kind => {
    vi.mocked(hasRunningJob).mockImplementation(async k => k === kind)
    expect(await anotherAiJobRunning()).toBe(true)
  })

  it('stops at the first running kind', async () => {
    vi.mocked(hasRunningJob).mockResolvedValue(true)
    expect(await anotherAiJobRunning()).toBe(true)
    expect(hasRunningJob).toHaveBeenCalledTimes(1)
  })
})

describe('createAiJob', () => {
  it('creates a job row of that kind and returns a fresh id each time', async () => {
    const a = await createAiJob('extract-recipe', 'item-1')
    const b = await createAiJob('extract-recipe', 'item-1')
    expect(a).toMatch(/^[0-9a-f-]{36}$/)
    expect(a).not.toBe(b)
    expect(createJob).toHaveBeenCalledWith(a, 1, 'extract-recipe')
  })

  it('records which item it is for and that it is reading', async () => {
    const id = await createAiJob('explain', 'item-9')
    expect(saveJobDetails).toHaveBeenCalledWith(id, { itemId: 'item-9', stage: 'reading' })
  })

  it('still starts when the details cannot be saved (they are a courtesy)', async () => {
    vi.mocked(saveJobDetails).mockRejectedValue(new Error('db hiccup'))
    await expect(createAiJob('explain', 'item-1')).resolves.toMatch(/^[0-9a-f-]{36}$/)
  })

  it('fails (so the route can 500) if the job row cannot be created', async () => {
    vi.mocked(createJob).mockRejectedValueOnce(new Error('db down'))
    await expect(createAiJob('explain', 'item-1')).rejects.toThrow('db down')
  })
})
