import { describe, it, expect, vi, beforeEach } from 'vitest'
import { classify, videoHeader, NO_TRANSCRIPT_MAX_CONFIDENCE } from './classifier'

vi.mock('./ai', () => ({ aiChat: vi.fn() }))
vi.mock('./githubApi', () => ({ lookupGithubRepo: vi.fn().mockResolvedValue(null) }))
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
    expect(vi.mocked(aiChat).mock.calls.at(-1)![1]).not.toContain('YouTube video')
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

describe('classify — focused video kind', () => {
  const kindReply = (kind: unknown) => vi.mocked(aiChat).mockResolvedValueOnce(JSON.stringify({ kind }))
  const TEXT = 'Title: Easy Pasta\nChannel: Chef Joe\n\nDescription:\nsecret words\n\nTranscript excerpt:\nlong transcript here'

  it("asks one focused question about the title and channel only, then uses its answer over the model's", async () => {
    mockAI({ ...base, categories: ['Food'], structured: { videoKind: 'tutorial' } }) // the big call gets it wrong
    kindReply('recipe')
    const r = await classify(TEXT, { video })

    expect(vi.mocked(aiChat)).toHaveBeenCalledTimes(2)
    const [prompt, system, format, options] = vi.mocked(aiChat).mock.calls[1]
    expect(prompt).toBe('Title: Easy Pasta\nChannel: Chef Joe')
    expect(String(prompt)).not.toMatch(/transcript|secret words/i) // measured: more context made a small model worse
    expect(system).toContain('Judge by what the video DOES')
    expect(format).toBe('json')
    expect(options).toMatchObject({ temperature: 0 })
    expect((r.structured as { videoKind?: string }).videoKind).toBe('recipe')
  })

  it('supplies a kind when the model gave none', async () => {
    mockAI({ ...base, categories: ['Tech'], structured: {} })
    kindReply('tutorial')
    expect(((await classify(TEXT, { video })).structured as { videoKind?: string }).videoKind).toBe('tutorial')
  })

  it.each([
    ['the call fails', () => vi.mocked(aiChat).mockRejectedValueOnce(new Error('ollama down'))],
    ['the answer is not JSON', () => vi.mocked(aiChat).mockResolvedValueOnce('nope')],
    ['the answer is not a known kind', () => kindReply('documentary')],
    ['the answer has no kind', () => vi.mocked(aiChat).mockResolvedValueOnce('{}')],
  ])("keeps the model's own kind when %s", async (_n, arrange) => {
    mockAI({ ...base, categories: ['Food'], structured: { videoKind: 'review' } })
    arrange()
    const r = await classify(TEXT, { video })
    expect((r.structured as { videoKind?: string }).videoKind).toBe('review')
    expect(r.type).toBe('link') // and classification itself is unaffected
  })

  it('is not asked for anything but videos, nor when there is no title to judge', async () => {
    mockAI({ ...base, categories: ['Food'], structured: {} })
    await classify(TEXT)
    expect(vi.mocked(aiChat)).toHaveBeenCalledTimes(1)

    vi.mocked(aiChat).mockClear()
    mockAI({ ...base, categories: ['Food'], structured: {} })
    await classify('just some words, no header', { video })
    expect(vi.mocked(aiChat)).toHaveBeenCalledTimes(1)
  })

  it('uses the same provider routing options as the main call (cloudSafe, task)', async () => {
    mockAI({ ...base, categories: ['Food'], structured: {} })
    kindReply('recipe')
    await classify(TEXT, { video, cloudSafe: false })
    const first = vi.mocked(aiChat).mock.calls[0][5]
    const second = vi.mocked(aiChat).mock.calls[1][5]
    expect(second).toMatchObject({ task: 'classify', cloudSafe: false })
    expect(second).toEqual(first)
  })
})

describe('videoHeader', () => {
  it('keeps the title and channel lines only', () => {
    expect(videoHeader('Title: A\nChannel: B\n\nDescription:\nx')).toBe('Title: A\nChannel: B')
    expect(videoHeader('Title: A\r\nChannel: B\r\n')).toBe('Title: A\nChannel: B')
    expect(videoHeader('Title: A\n\nTranscript')).toBe('Title: A')
  })
  it('is empty when there is no header', () => {
    expect(videoHeader('hello\nworld')).toBe('')
    expect(videoHeader('Title:   \nChannel: B')).toBe('Channel: B')
  })
})
