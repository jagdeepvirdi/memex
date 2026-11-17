import { describe, it, expect, vi, beforeEach } from 'vitest'

const client = { query: vi.fn(), release: vi.fn() }
vi.mock('../db/client', () => ({ pool: { query: vi.fn(), connect: vi.fn() } }))
vi.mock('./recipeExtractor', async orig => ({ ...(await orig<typeof import('./recipeExtractor')>()), extractRecipe: vi.fn() }))
vi.mock('./ingestJobs', () => ({
  reportJobProgress: vi.fn().mockResolvedValue(undefined),
  completeJob: vi.fn().mockResolvedValue(undefined),
  failJob: vi.fn().mockResolvedValue(undefined),
  cancelJob: vi.fn().mockResolvedValue(true),
}))
vi.mock('../db/helpers', () => ({ createItem: vi.fn() }))
vi.mock('./classifier', () => ({ mapToCategories: vi.fn().mockReturnValue(['Food', 'Savory']) }))
vi.mock('./embedder', () => ({ embedItem: vi.fn().mockResolvedValue([0.1, 0.2]) }))
vi.mock('../lib/logger', () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { runExtractRecipeJob, type ExtractRecipeJobInput } from './extractRecipeJob'
import { extractRecipe } from './recipeExtractor'
import { reportJobProgress, completeJob, failJob, cancelJob } from './ingestJobs'
import { cancelRunningJob, runningJobCount } from './jobControl'
import { createItem } from '../db/helpers'
import { embedItem } from './embedder'
import { NoSourceTextError } from './itemSource'
import { AiProviderError } from './ai'
import { pool } from '../db/client'
import logger from '../lib/logger'

const VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
const INPUT: ExtractRecipeJobInput = {
  jobId: 'job-1', itemId: 'vid-1', title: 'Cook with Joe', content: 'https://youtu.be/dQw4w9WgXcQ',
  sourceUrl: VIDEO, source: 'youtube', provider: 'gemini', cloudSafe: true,
}
const FOUND = {
  found: true as const, title: 'Aglio e Olio', confidence: 82, model: 'ollama:llama3.2',
  recipe: { ingredients: ['200g spaghetti', '4 cloves garlic', '1/2 cup olive oil'], steps: ['Boil', 'Fry'], servings: '2' },
}

beforeEach(() => {
  vi.clearAllMocks()
  client.query.mockReset().mockResolvedValue({ rows: [] })
  vi.mocked(pool.connect).mockResolvedValue(client as never)
  vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never)
  vi.mocked(extractRecipe).mockResolvedValue(FOUND)
  vi.mocked(embedItem).mockResolvedValue([0.1, 0.2])
  vi.mocked(createItem).mockResolvedValue({ id: 'rec-1', title: 'Aglio e Olio', content: 'rendered' } as never)
})

describe('runExtractRecipeJob — a recipe is found', () => {
  it('extracts with the item, provider, privacy flag and a timeout signal', async () => {
    await runExtractRecipeJob(INPUT)
    const [item, opts] = vi.mocked(extractRecipe).mock.calls[0]
    expect(item).toEqual({ title: 'Cook with Joe', content: INPUT.content, sourceUrl: VIDEO })
    expect(opts).toMatchObject({ provider: 'gemini', cloudSafe: true })
    expect(opts.signal).toBeInstanceOf(AbortSignal)
  })

  it('creates ONE new unreviewed recipe item linked to the source, in a transaction, then commits', async () => {
    await runExtractRecipeJob(INPUT)
    expect(createItem).toHaveBeenCalledTimes(1)
    const [c, data] = vi.mocked(createItem).mock.calls[0]
    expect(c).toBe(client)
    expect(data).toMatchObject({
      title: 'Aglio e Olio', type: 'recipe', source: 'youtube', sourceUrl: VIDEO,
      categories: ['Food', 'Savory'], tags: ['recipe'], reviewed: false, confidence: 82, intent: 'actionable', derivedFrom: 'vid-1',
    })
    expect(data.content).toContain('Ingredients:')
    expect(data.content).toContain('- 200g spaghetti')

    const sql = client.query.mock.calls.map(c => String(c[0]))
    expect(sql[0]).toBe('BEGIN')
    expect(sql).toContain('COMMIT')
    expect(sql.some(q => /UPDATE items SET extraction_model/.test(q))).toBe(true)
    expect(client.query.mock.calls.find(c => /extraction_model/.test(String(c[0])))![1]).toEqual(['ollama:llama3.2', 'rec-1'])
    expect(client.release).toHaveBeenCalledTimes(1)
  })

  it('completes the job with found:true, the recipe id, confidence and model', async () => {
    await runExtractRecipeJob(INPUT)
    expect(completeJob).toHaveBeenCalledTimes(1)
    expect(completeJob).toHaveBeenCalledWith('job-1', { itemId: 'vid-1', found: true, recipeId: 'rec-1', confidence: 82, model: 'ollama:llama3.2' })
    expect(failJob).not.toHaveBeenCalled()
    // the recipe is committed before the job says it is done, so a poller that sees "completed" can always load it
    expect(client.query.mock.invocationCallOrder.at(-1)!).toBeLessThan(vi.mocked(completeJob).mock.invocationCallOrder[0])
  })

  it('uses the source item\'s own source, and the video URL, when the item is not saved as a video', async () => {
    await runExtractRecipeJob({ ...INPUT, source: 'manual', sourceUrl: null, content: 'see https://youtu.be/dQw4w9WgXcQ' })
    expect(vi.mocked(createItem).mock.calls[0][1]).toMatchObject({ source: 'youtube', sourceUrl: expect.stringContaining('dQw4w9WgXcQ') })

    vi.mocked(createItem).mockClear()
    await runExtractRecipeJob({ ...INPUT, source: 'url', sourceUrl: 'https://example.com/pasta', content: 'a pasta page' })
    expect(vi.mocked(createItem).mock.calls[0][1]).toMatchObject({ source: 'url', sourceUrl: 'https://example.com/pasta' })
  })

  it('embeds the new recipe in the background and does not wait for it, or fail on it', async () => {
    vi.mocked(embedItem).mockRejectedValue(new Error('ollama down'))
    await expect(runExtractRecipeJob(INPUT)).resolves.toBeUndefined()
    expect(embedItem).toHaveBeenCalledWith('Aglio e Olio', 'rendered', undefined)
    expect(completeJob).toHaveBeenCalledTimes(1)
    await new Promise(r => setTimeout(r, 0))
    expect(logger.error).toHaveBeenCalled() // logged, not thrown
  })

  it('stores the embedding when it works', async () => {
    await runExtractRecipeJob(INPUT)
    await vi.waitFor(() => expect(vi.mocked(pool.query).mock.calls.some(c => /UPDATE items SET embedding/.test(String(c[0])))).toBe(true))
    expect(vi.mocked(pool.query).mock.calls.find(c => /SET embedding/.test(String(c[0])))![1]).toEqual([JSON.stringify([0.1, 0.2]), 'ollama:nomic-embed-text', 'rec-1'])
  })
})

describe('runExtractRecipeJob — nothing found is a normal answer, not a failure', () => {
  it('completes the job with found:false and the reason, and saves nothing', async () => {
    vi.mocked(extractRecipe).mockResolvedValue({ found: false, reason: 'This does not look like a recipe or cooking video.', model: 'ollama:llama3.2' })
    await runExtractRecipeJob(INPUT)
    expect(completeJob).toHaveBeenCalledWith('job-1', {
      itemId: 'vid-1', found: false, reason: 'This does not look like a recipe or cooking video.', model: 'ollama:llama3.2',
    })
    expect(failJob).not.toHaveBeenCalled()
    expect(pool.connect).not.toHaveBeenCalled()
    expect(createItem).not.toHaveBeenCalled()
    expect(embedItem).not.toHaveBeenCalled()
  })
})

describe('runExtractRecipeJob — progress', () => {
  it('reports each stage on the job row, with the item id', async () => {
    vi.mocked(extractRecipe).mockImplementation(async (_i, opts) => {
      opts.onProgress?.({ stage: 'reading', done: 0, total: 3 })
      opts.onProgress?.({ stage: 'checking', done: 1, total: 3 })
      opts.onProgress?.({ stage: 'extracting', done: 2, total: 3 })
      opts.onProgress?.({ stage: 'extracting', done: 3, total: 3 })
      return FOUND
    })
    await runExtractRecipeJob(INPUT)
    expect(vi.mocked(reportJobProgress).mock.calls).toEqual([
      ['job-1', 0, 3, { itemId: 'vid-1', stage: 'reading' }],
      ['job-1', 1, 3, { itemId: 'vid-1', stage: 'checking' }],
      ['job-1', 2, 3, { itemId: 'vid-1', stage: 'extracting' }],
      ['job-1', 3, 3, { itemId: 'vid-1', stage: 'extracting' }],
    ])
  })

  it('does not let a failing progress write stop the extraction', async () => {
    vi.mocked(reportJobProgress).mockRejectedValue(new Error('db hiccup'))
    vi.mocked(extractRecipe).mockImplementation(async (_i, opts) => {
      opts.onProgress?.({ stage: 'checking', done: 1, total: 3 })
      return FOUND
    })
    await runExtractRecipeJob(INPUT)
    expect(completeJob).toHaveBeenCalledTimes(1)
    expect(failJob).not.toHaveBeenCalled()
  })
})

describe('runExtractRecipeJob — failure is recorded on the job, never thrown', () => {
  const failed = () => vi.mocked(failJob).mock.calls[0]

  it.each([
    ['no transcript', new NoSourceTextError('No transcript is available for this video.'), 'No transcript is available for this video.', undefined],
    ['a blocked provider', new AiProviderError('claude', 'blocked', 'Cannot use claude: Strict Local Mode is on'), 'Cannot use claude: Strict Local Mode is on', 'blocked'],
    ['a rate limit', new AiProviderError('gemini', 'rate_limit', 'Slow down'), 'Slow down', 'rate_limit'],
    ['Strict Local Mode blocking the fetch', new Error('Strict Local Mode is enabled. External URL scraping is blocked.'), 'Strict Local Mode is enabled. External URL scraping is blocked.', undefined],
  ])('%s → job failed with a readable message', async (_n, err, message, kind) => {
    vi.mocked(extractRecipe).mockRejectedValue(err)
    await expect(runExtractRecipeJob(INPUT)).resolves.toBeUndefined()
    expect(failed()[0]).toBe('job-1')
    expect(failed()[1]).toBe(message)
    expect(failed()[2]).toEqual({ itemId: 'vid-1', ...(kind ? { kind } : {}) })
    expect(completeJob).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('says it took too long when the overall timeout fires', async () => {
    vi.mocked(extractRecipe).mockRejectedValue(Object.assign(new Error('aborted due to timeout'), { name: 'TimeoutError' }))
    await runExtractRecipeJob(INPUT)
    expect(failed()[1]).toMatch(/took too long/)
  })

  it('logs an unexpected error and shows a generic message (never the raw error)', async () => {
    vi.mocked(extractRecipe).mockRejectedValue(new Error('ECONNRESET password=hunter2'))
    await runExtractRecipeJob(INPUT)
    expect(logger.error).toHaveBeenCalled()
    expect(failed()[1]).toBe('Failed to extract recipe')
    expect(JSON.stringify(failed())).not.toContain('hunter2')
  })

  it('rolls back, releases the connection and fails the job if saving the recipe fails — nothing is half-saved', async () => {
    vi.mocked(createItem).mockRejectedValue(new Error('insert failed'))
    await runExtractRecipeJob(INPUT)
    const sql = client.query.mock.calls.map(c => String(c[0]))
    expect(sql).toContain('ROLLBACK')
    expect(sql).not.toContain('COMMIT')
    expect(client.release).toHaveBeenCalledTimes(1)
    expect(failJob).toHaveBeenCalledTimes(1)
    expect(completeJob).not.toHaveBeenCalled()
    expect(embedItem).not.toHaveBeenCalled()
  })

  it('survives even the failure being unrecordable', async () => {
    vi.mocked(extractRecipe).mockRejectedValue(new NoSourceTextError('x'))
    vi.mocked(failJob).mockRejectedValue(new Error('db down'))
    await expect(runExtractRecipeJob(INPUT)).resolves.toBeUndefined()
  })
})

/** An extractRecipe that only ends when its signal aborts (as the real model call does). */
function hangUntilAborted() {
  vi.mocked(extractRecipe).mockImplementation((_item, opts) => new Promise((_resolve, reject) => {
    opts.signal!.addEventListener('abort', () => reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })))
  }))
}
const started = () => new Promise<void>(r => setTimeout(r, 0))

describe('runExtractRecipeJob — the user cancels', () => {
  it('stops the model call, marks the job cancelled (not failed), creates nothing, and logs no error', async () => {
    hangUntilAborted()
    const run = runExtractRecipeJob(INPUT)
    await started()
    expect(cancelRunningJob('job-1')).toBe(true)
    await run

    expect(cancelJob).toHaveBeenCalledTimes(1)
    expect(cancelJob).toHaveBeenCalledWith('job-1', { itemId: 'vid-1' })
    expect(failJob).not.toHaveBeenCalled()
    expect(completeJob).not.toHaveBeenCalled()
    expect(pool.connect).not.toHaveBeenCalled()
    expect(createItem).not.toHaveBeenCalled()
    expect(embedItem).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('is honoured even if a recipe was just found: no item is created', async () => {
    vi.mocked(extractRecipe).mockImplementation(async () => {
      cancelRunningJob('job-1') // the user clicks Cancel as the last model call returns
      return FOUND
    })
    await runExtractRecipeJob(INPUT)
    expect(createItem).not.toHaveBeenCalled()
    expect(pool.connect).not.toHaveBeenCalled()
    expect(completeJob).not.toHaveBeenCalled()
    expect(cancelJob).toHaveBeenCalledTimes(1)
  })

  it('is honoured when nothing was found too: the job ends cancelled, not completed', async () => {
    vi.mocked(extractRecipe).mockImplementation(async () => {
      cancelRunningJob('job-1')
      return { found: false, reason: 'No recipe', model: 'm' }
    })
    await runExtractRecipeJob(INPUT)
    expect(completeJob).not.toHaveBeenCalled()
    expect(cancelJob).toHaveBeenCalledTimes(1)
  })

  it('a timeout is still a failure, not a cancel', async () => {
    vi.mocked(extractRecipe).mockRejectedValue(Object.assign(new Error('aborted due to timeout'), { name: 'TimeoutError' }))
    await runExtractRecipeJob(INPUT)
    expect(failJob).toHaveBeenCalledTimes(1)
    expect(cancelJob).not.toHaveBeenCalled()
  })

  it('is registered while it runs and unregistered afterwards, whatever the outcome', async () => {
    let during = -1
    vi.mocked(extractRecipe).mockImplementation(async () => { during = runningJobCount(); return FOUND })
    await runExtractRecipeJob(INPUT)
    expect(during).toBe(1)
    expect(runningJobCount()).toBe(0)

    vi.mocked(extractRecipe).mockRejectedValue(new NoSourceTextError('x'))
    await runExtractRecipeJob(INPUT)
    expect(runningJobCount()).toBe(0)

    hangUntilAborted()
    const run = runExtractRecipeJob(INPUT)
    await started()
    cancelRunningJob('job-1')
    await run
    expect(runningJobCount()).toBe(0)
  })

  it('survives the cancellation being unrecordable', async () => {
    vi.mocked(cancelJob).mockRejectedValue(new Error('db down'))
    hangUntilAborted()
    const run = runExtractRecipeJob(INPUT)
    await started()
    cancelRunningJob('job-1')
    await expect(run).resolves.toBeUndefined()
  })
})
