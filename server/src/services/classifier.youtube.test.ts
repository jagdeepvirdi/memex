import { describe, it, expect, vi, beforeEach } from 'vitest'
import { classify, NO_TRANSCRIPT_MAX_CONFIDENCE } from './classifier'

vi.mock('./ai', () => ({ aiChat: vi.fn() }))
vi.mock('./settings', () => ({ getAiConfig: vi.fn().mockResolvedValue({ model: 'test-model' }) }))

import { aiChat } from './ai'

const mockAI = (obj: Record<string, unknown>) => vi.mocked(aiChat).mockResolvedValueOnce(JSON.stringify(obj))
const video = { videoId: 'dQw4w9WgXcQ', channel: 'Chef Joe', transcriptAvailable: true }
const base = { type: 'link', title: 'Great Pasta', tags: ['pasta'], summary: 'A pasta video.', confidence: 85 }

beforeEach(() => vi.mocked(aiChat).mockReset())

describe('classify — YouTube videos', () => {
  it('adds the video instructions to the prompt only for videos', async () => {
    mockAI({ ...base, categories: ['Food'], structured: {} })
    await classify('Title: x', { video })
    expect(vi.mocked(aiChat).mock.calls[0][1]).toContain('This item is a YouTube video')

    mockAI({ ...base, categories: ['Food'], structured: {} })
    await classify('Title: x')
    expect(vi.mocked(aiChat).mock.calls[1][1]).not.toContain('YouTube video')
  })

  it('files by topic, not platform, and records video metadata and kind', async () => {
    mockAI({ ...base, categories: ['Food', 'Savory', 'Italian'], structured: { videoKind: 'recipe' } })
    const r = await classify('Title: Great Pasta', { video })
    expect(r.type).toBe('link')
    expect(r.categories).toEqual(['Food', 'Savory', 'Italian'])
    expect(r.structured).toMatchObject({ videoKind: 'recipe', videoId: video.videoId, channel: 'Chef Joe', transcriptAvailable: true })
    expect(r.confidence).toBe(85)
  })

  it('keeps a cooking video a link even if the model says recipe', async () => {
    mockAI({ ...base, type: 'recipe', categories: ['Food'], structured: { ingredients: ['pasta'] } })
    expect((await classify('Title: x', { video })).type).toBe('link')
  })

  it.each([
    ['no categories', []],
    ['unmappable categories', ['Banana Stand']],
    ['bare Links', ['Links']],
  ])('falls back to Links > YouTube for %s', async (_n, categories) => {
    mockAI({ ...base, categories, structured: {} })
    expect((await classify('Title: x', { video })).categories).toEqual(['Links', 'YouTube'])
  })

  it('drops an invalid videoKind rather than storing junk', async () => {
    mockAI({ ...base, categories: ['Tech'], structured: { videoKind: 'banana' } })
    const r = await classify('Title: x', { video })
    expect(r.structured).not.toHaveProperty('videoKind')
  })

  it('caps confidence when there is no transcript', async () => {
    mockAI({ ...base, categories: ['Tech'], confidence: 95, structured: {} })
    const r = await classify('Title: x', { video: { ...video, transcriptAvailable: false } })
    expect(r.confidence).toBe(NO_TRANSCRIPT_MAX_CONFIDENCE)
    expect(r.structured).toMatchObject({ transcriptAvailable: false })
  })

  it('does not raise a confidence that is already lower than the cap', async () => {
    mockAI({ ...base, categories: ['Tech'], confidence: 10, structured: {} })
    expect((await classify('Title: x', { video: { ...video, transcriptAvailable: false } })).confidence).toBe(10)
  })

  it('lets a dev-knowledge explainer on YouTube file under Tech > AI (topic beats source)', async () => {
    mockAI({ ...base, categories: ['YouTube'], structured: { kind: 'explainer', videoKind: 'talk' } })
    const r = await classify('Title: How MCP works', { video })
    expect(r.categories).toEqual(['Tech', 'AI', 'Explainers'])
    expect(r.structured).toMatchObject({ videoKind: 'talk', videoId: video.videoId })
  })

  it('still produces a video item when both attempts return junk', async () => {
    vi.mocked(aiChat).mockResolvedValue('not json')
    const r = await classify('Title: Some Video\n\nTranscript unavailable.', { video: { ...video, transcriptAvailable: false } })
    expect(r).toMatchObject({ type: 'link', categories: ['Links', 'YouTube'], confidence: 0 })
    expect(r.structured).toMatchObject({ videoId: video.videoId, transcriptAvailable: false })
  })

  it('leaves non-video classification untouched', async () => {
    mockAI({ ...base, categories: ['Articles'], structured: {} })
    const r = await classify('Title: x')
    expect(r.categories).toEqual(['Links', 'Articles'])
    expect(r.structured).not.toHaveProperty('transcriptAvailable')
  })
})
