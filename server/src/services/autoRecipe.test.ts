import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../db/client', () => ({ pool: { query: vi.fn() } }))
vi.mock('./actionJobs', () => ({
  anotherAiJobRunning: vi.fn().mockResolvedValue(false),
  createAiJob: vi.fn().mockResolvedValue('job-1'),
  EXTRACT_RECIPE_JOB_KIND: 'extract-recipe',
}))
vi.mock('./extractRecipeJob', () => ({ runExtractRecipeJob: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../lib/logger', () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { pool } from '../db/client'
import { anotherAiJobRunning, createAiJob } from './actionJobs'
import { runExtractRecipeJob, type ExtractRecipeJobInput } from './extractRecipeJob'
import {
  shouldAutoExtractRecipe, queueRecipeExtraction, resetRecipeQueueForTests, AUTO_RECIPE_POLL_MS,
} from './autoRecipe'

const video = (over: Record<string, unknown> = {}) => ({
  id: 'vid-1', title: 'Garlic pasta', type: 'link', source: 'youtube', sourceUrl: 'https://www.youtube.com/watch?v=abc',
  content: 'transcript', structured: { videoKind: 'recipe', videoId: 'abc' }, categories: ['Food', 'Savory', 'Italian'],
  encrypted: false, tags: [], ...over,
}) as never

const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve() }

const stillWanted = (ok: boolean) =>
  vi.mocked(pool.query).mockImplementation((async (sql: string) => (/SELECT NOT EXISTS/.test(sql) ? { rows: [{ ok }] } : { rows: [] })) as never)

beforeEach(() => {
  vi.clearAllMocks()
  resetRecipeQueueForTests()
  vi.mocked(anotherAiJobRunning).mockResolvedValue(false)
  vi.mocked(createAiJob).mockResolvedValue('job-1')
  vi.mocked(runExtractRecipeJob).mockResolvedValue(undefined)
  stillWanted(true) // every other query (the status writes) is a no-op
})
afterEach(() => vi.useRealTimers())

describe('shouldAutoExtractRecipe', () => {
  it('takes a YouTube video the classifier called a recipe', () => {
    expect(shouldAutoExtractRecipe(video())).toBe(true)
  })
  it('skips videos of any other kind, and videos with no kind', () => {
    expect(shouldAutoExtractRecipe(video({ structured: { videoKind: 'tutorial', videoId: 'abc' } }))).toBe(false)
    expect(shouldAutoExtractRecipe(video({ structured: { videoId: 'abc' } }))).toBe(false)
  })
  it('takes a saved web link filed under Food, but not other links', () => {
    expect(shouldAutoExtractRecipe(video({ source: 'url', structured: {}, categories: ['Food'] }))).toBe(true)
    expect(shouldAutoExtractRecipe(video({ source: 'url', structured: {}, categories: ['Tech'] }))).toBe(false)
  })
  it('skips recipes (already extracted), encrypted items and anything already tried', () => {
    expect(shouldAutoExtractRecipe(video({ type: 'recipe', source: 'url', structured: {} }))).toBe(false)
    expect(shouldAutoExtractRecipe(video({ encrypted: true }))).toBe(false)
    expect(shouldAutoExtractRecipe(video({ structured: { videoKind: 'recipe', videoId: 'abc', recipeExtraction: { status: 'none' } } }))).toBe(false)
  })
})

describe('queueRecipeExtraction', () => {
  it('does nothing for an item that does not qualify', async () => {
    expect(await queueRecipeExtraction(video({ structured: { videoKind: 'talk', videoId: 'abc' } }))).toBe(false)
    expect(createAiJob).not.toHaveBeenCalled()
    expect(pool.query).not.toHaveBeenCalled()
  })

  it('marks the item queued, then runs the existing extract job for it with the privacy flag', async () => {
    expect(await queueRecipeExtraction(video())).toBe(true)
    await settle()
    const first = vi.mocked(pool.query).mock.calls[0]
    expect(String(first[0])).toMatch(/structured \|\| \$2::jsonb/)
    expect(JSON.parse(String(first[1]![1]))).toMatchObject({ recipeExtraction: { status: 'queued' } })
    expect(createAiJob).toHaveBeenCalledWith('extract-recipe', 'vid-1')
    const input = vi.mocked(runExtractRecipeJob).mock.calls[0][0] as ExtractRecipeJobInput
    expect(input).toMatchObject({ jobId: 'job-1', itemId: 'vid-1', title: 'Garlic pasta', sourceUrl: 'https://www.youtube.com/watch?v=abc', cloudSafe: true })
  })

  it('a private item is told to stay on this machine', async () => {
    await queueRecipeExtraction(video({ tags: ['private'] }))
    await settle()
    expect((vi.mocked(runExtractRecipeJob).mock.calls[0][0] as ExtractRecipeJobInput).cloudSafe).toBe(false)
  })

  it('records what the run found, did not find, or failed on', async () => {
    await queueRecipeExtraction(video())
    await settle()
    const { onOutcome } = vi.mocked(runExtractRecipeJob).mock.calls[0][0] as ExtractRecipeJobInput
    const written = () => JSON.parse(String(vi.mocked(pool.query).mock.calls.at(-1)![1]![1])).recipeExtraction

    await onOutcome!({ kind: 'found', recipeId: 'rec-1' })
    expect(written()).toMatchObject({ status: 'found', recipeId: 'rec-1' })
    await onOutcome!({ kind: 'none', reason: 'No recipe was found in this content.' })
    expect(written()).toMatchObject({ status: 'none', reason: 'No recipe was found in this content.' })
    await onOutcome!({ kind: 'failed', reason: 'The AI provider is down.' })
    expect(written()).toMatchObject({ status: 'failed', reason: 'The AI provider is down.' })
  })

  it('a cancelled run clears the status so the button stays the way to retry', async () => {
    await queueRecipeExtraction(video())
    await settle()
    const { onOutcome } = vi.mocked(runExtractRecipeJob).mock.calls[0][0] as ExtractRecipeJobInput
    await onOutcome!({ kind: 'cancelled' })
    expect(String(vi.mocked(pool.query).mock.calls.at(-1)![0])).toMatch(/structured - 'recipeExtraction'/)
  })

  it('does not extract again when the user already did it by hand while it waited', async () => {
    stillWanted(false)
    await queueRecipeExtraction(video())
    await settle()
    expect(runExtractRecipeJob).not.toHaveBeenCalled()
  })

  it('waits for the running AI job instead of starting a second one', async () => {
    vi.useFakeTimers()
    vi.mocked(anotherAiJobRunning).mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValue(false)
    await queueRecipeExtraction(video())
    await vi.advanceTimersByTimeAsync(0)
    expect(runExtractRecipeJob).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(AUTO_RECIPE_POLL_MS * 2)
    expect(runExtractRecipeJob).toHaveBeenCalledTimes(1)
  })

  it('runs several saved videos one after another', async () => {
    await queueRecipeExtraction(video({ id: 'a' }))
    await queueRecipeExtraction(video({ id: 'b' }))
    await settle()
    expect(vi.mocked(runExtractRecipeJob).mock.calls.map((c) => (c[0] as ExtractRecipeJobInput).itemId)).toEqual(['a', 'b'])
  })

  it('never throws to the caller, even if the status write fails', async () => {
    vi.mocked(pool.query).mockRejectedValue(new Error('db down'))
    await expect(queueRecipeExtraction(video())).resolves.toBe(false)
  })
})
