import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../db/client', () => ({ pool: { query: vi.fn(), connect: vi.fn() } }))
vi.mock('./ingestJobs', () => ({
  updateJobProgress: vi.fn().mockResolvedValue(undefined),
  completeJob: vi.fn().mockResolvedValue(undefined),
  failJob: vi.fn().mockResolvedValue(undefined),
  saveJobDetails: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./scraper', () => ({ scrapeUrl: vi.fn() }))
vi.mock('./classifier', () => ({ classify: vi.fn() }))
vi.mock('./itemService', () => ({ applyClassificationResult: vi.fn() }))

import {
  planBackfill, textWithoutUrls, runBackfill, previewSample, isHardFailure,
  MAX_CONSECUTIVE_FAILURES, type BackfillRow, type BackfillDeps,
} from './youtubeBackfill'
import { completeJob, failJob } from './ingestJobs'
import type { ScrapedContent } from './scraper'
import type { ClassificationResult } from './classifier'

const A = 'dQw4w9WgXcQ'
const B = 'aaaaaaaaaaa'
const C = 'bbbbbbbbbbb'
const yt = (id: string) => `https://youtu.be/${id}`

const row = (id: string, content: string, over: Partial<BackfillRow> = {}): BackfillRow => ({
  id, title: `T-${id}`, content, source_url: null, reviewed: false, type: 'note', categories: [], tags: [], encrypted: false, ...over,
})

describe('textWithoutUrls', () => {
  it('strips links and collapses whitespace', () => {
    expect(textWithoutUrls(`Pasta   ${yt(A)}\n\n tonight`)).toBe('Pasta tonight')
  })
})

describe('planBackfill', () => {
  it('makes a bare link, and a link with a short caption, candidates with a canonical URL', () => {
    const plan = planBackfill([row('1', yt(A)), row('2', `great video ${yt(B)}`)], new Set())
    expect(plan.candidates).toEqual([
      { id: '1', title: 'T-1', videoId: A, url: `https://www.youtube.com/watch?v=${A}` },
      { id: '2', title: 'T-2', videoId: B, url: `https://www.youtube.com/watch?v=${B}` },
    ])
    expect(plan.skipped).toEqual([])
  })

  it('finds the video in source_url alone', () => {
    const plan = planBackfill([row('1', '', { source_url: `https://www.youtube.com/watch?v=${A}` })], new Set())
    expect(plan.candidates.map((c) => c.id)).toEqual(['1'])
  })

  it('ignores items with no YouTube video (not candidates, not reported)', () => {
    const plan = planBackfill([row('1', 'see youtube.com for videos'), row('2', 'https://example.com')], new Set())
    expect(plan.candidates).toEqual([])
    expect(plan.skipped).toEqual([])
  })

  it('leaves a long note that merely links a video untouched and reports it', () => {
    const plan = planBackfill([row('1', `${'My own long thoughts about cooking. '.repeat(10)} ${yt(A)}`)], new Set())
    expect(plan.candidates).toEqual([])
    expect(plan.skipped).toEqual([{ id: '1', title: 'T-1', reason: 'note-with-link', videoIds: [A] }])
  })

  it('reports multi-video items as needs-split', () => {
    const plan = planBackfill([row('1', `${yt(A)}\n${yt(B)}`)], new Set())
    expect(plan.skipped).toEqual([{ id: '1', title: 'T-1', reason: 'needs-split', videoIds: [A, B] }])
  })

  it('skips reviewed, already-backfilled and protected items', () => {
    const plan = planBackfill(
      [
        row('r', yt(A), { reviewed: true }),
        row('d', yt(B)),
        row('p', yt(C), { tags: ['private'] }),
      ],
      new Set(['d']),
    )
    expect(plan.candidates).toEqual([])
    expect(Object.fromEntries(plan.skipped.map((s) => [s.id, s.reason]))).toEqual({
      r: 'reviewed', d: 'already-backfilled', p: 'protected',
    })
  })

  it('reports the same video saved in several items (any URL spelling)', () => {
    const plan = planBackfill(
      [row('1', yt(A)), row('2', `https://www.youtube.com/watch?v=${A}&t=5`), row('3', yt(B))],
      new Set(),
    )
    expect(plan.duplicates).toEqual([{ videoId: A, itemIds: ['1', '2'] }])
  })
})

// ── runner ───────────────────────────────────────────────────────────────────

const classified = (title = 'Cooked pasta'): ClassificationResult =>
  ({ type: 'link', title, summary: 's', categories: ['Links', 'YouTube'], tags: [], confidence: 80, structured: { videoKind: 'recipe' } }) as unknown as ClassificationResult

const scraped = (over: Partial<ScrapedContent> = {}): ScrapedContent => ({
  title: 'Video', content: 'c', source: 'youtube', sourceUrl: 'u', videoId: A, channel: 'Chan',
  transcript: 'words', transcriptAvailable: true, ...over,
})

const makeDeps = (over: Partial<BackfillDeps> = {}): BackfillDeps => ({
  scrape: vi.fn().mockResolvedValue(scraped()),
  classify: vi.fn().mockResolvedValue(classified()),
  apply: vi.fn().mockResolvedValue('applied'),
  sleep: vi.fn().mockResolvedValue(undefined),
  ...over,
})

const planOf = (n: number) => planBackfill(Array.from({ length: n }, (_, i) => row(`i${i}`, yt(`${'x'.repeat(10)}${i}`))), new Set())

beforeEach(() => vi.clearAllMocks())

describe('isHardFailure', () => {
  it('is true only when there is neither transcript nor channel metadata', () => {
    expect(isHardFailure(scraped({ transcriptAvailable: false, channel: undefined }))).toBe(true)
    expect(isHardFailure(scraped({ transcriptAvailable: false, channel: 'Chan' }))).toBe(false)
    expect(isHardFailure(scraped({ transcriptAvailable: true, channel: undefined }))).toBe(false)
  })
})

describe('runBackfill', () => {
  it('applies every item, sleeps between (not before the first), and completes the job once', async () => {
    const deps = makeDeps()
    const summary = await runBackfill('job', planOf(3), deps)
    expect(summary).toEqual({ applied: 3, skipped: 0, failed: 0, aborted: false })
    expect(deps.apply).toHaveBeenCalledTimes(3)
    expect(deps.sleep).toHaveBeenCalledTimes(2)
    expect(completeJob).toHaveBeenCalledTimes(1)
    expect(failJob).not.toHaveBeenCalled()
  })

  it('passes the video hint to the classifier and the canonical URL to apply', async () => {
    const deps = makeDeps()
    await runBackfill('job', planOf(1), deps)
    const opts = vi.mocked(deps.classify).mock.calls[0][1]
    expect(opts?.video).toEqual({ videoId: A, channel: 'Chan', transcriptAvailable: true })
    expect(vi.mocked(deps.apply).mock.calls[0][1]).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=/)
  })

  it('records a failed video with its reason and keeps going', async () => {
    const scrape = vi.fn()
      .mockResolvedValueOnce(scraped({ transcriptAvailable: false, channel: undefined, failure: 'Video unavailable' }))
      .mockResolvedValue(scraped())
    const deps = makeDeps({ scrape })
    const summary = await runBackfill('job', planOf(2), deps)
    expect(summary).toMatchObject({ applied: 1, failed: 1 })
    expect(deps.apply).toHaveBeenCalledTimes(1)
    const details = vi.mocked(completeJob).mock.calls[0][1] as { results: { status: string; reason?: string }[] }
    expect(details.results[0]).toMatchObject({ status: 'failed', reason: 'Video unavailable' })
  })

  it('applies a transcript-less video from its metadata but flags a warning', async () => {
    const deps = makeDeps({ scrape: vi.fn().mockResolvedValue(scraped({ transcriptAvailable: false, transcript: undefined, failure: 'Transcripts disabled' })) })
    await runBackfill('job', planOf(1), deps)
    const details = vi.mocked(completeJob).mock.calls[0][1] as { results: { status: string; warning?: string }[] }
    expect(details.results[0].status).toBe('applied')
    expect(details.results[0].warning).toMatch(/Transcripts disabled/)
  })

  it('counts items reviewed since planning as skipped, not applied', async () => {
    const deps = makeDeps({ apply: vi.fn().mockResolvedValue('reviewed') })
    const summary = await runBackfill('job', planOf(1), deps)
    expect(summary).toMatchObject({ applied: 0, skipped: 1 })
  })

  it(`stops after ${MAX_CONSECUTIVE_FAILURES} failures in a row and fails the job (resumable)`, async () => {
    const deps = makeDeps({ scrape: vi.fn().mockRejectedValue(new Error('429')) })
    const summary = await runBackfill('job', planOf(10), deps)
    expect(summary).toMatchObject({ failed: MAX_CONSECUTIVE_FAILURES, aborted: true })
    expect(deps.scrape).toHaveBeenCalledTimes(MAX_CONSECUTIVE_FAILURES)
    expect(failJob).toHaveBeenCalledTimes(1)
    expect(completeJob).not.toHaveBeenCalled()
  })

  it('a success resets the consecutive-failure counter', async () => {
    const scrape = vi.fn()
    for (let i = 0; i < 4; i++) scrape.mockRejectedValueOnce(new Error('x'))
    scrape.mockResolvedValueOnce(scraped())
    for (let i = 0; i < 4; i++) scrape.mockRejectedValueOnce(new Error('x'))
    const summary = await runBackfill('job', planOf(9), makeDeps({ scrape }))
    expect(summary.aborted).toBe(false)
    expect(completeJob).toHaveBeenCalledTimes(1)
  })
})

describe('previewSample', () => {
  it('returns before/after for each sample and never calls apply', async () => {
    const deps = makeDeps()
    const out = await previewSample(planOf(2).candidates, new Map(), deps)
    expect(out.map((o) => o.status)).toEqual(['preview', 'preview'])
    expect(out[0].after).toMatchObject({ title: 'Cooked pasta', type: 'link', videoKind: 'recipe' })
    expect(deps.apply).not.toHaveBeenCalled()
  })

  it('reports a failing sample instead of throwing', async () => {
    const out = await previewSample(planOf(1).candidates, new Map(), makeDeps({ scrape: vi.fn().mockRejectedValue(new Error('boom')) }))
    expect(out[0]).toMatchObject({ status: 'failed', reason: 'boom' })
  })
})
