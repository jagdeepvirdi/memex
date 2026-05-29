import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getAvailableVisionModel, isImageMime } from './visionService'

vi.mock('./settings', () => ({ getSetting: vi.fn().mockResolvedValue('') }))
import { getSetting } from './settings'

function mockTags(names: string[], ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    json: async () => ({ models: names.map(name => ({ name })) }),
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSetting).mockResolvedValue('')
})

describe('isImageMime', () => {
  it('accepts common image types', () => {
    expect(isImageMime('image/png')).toBe(true)
    expect(isImageMime('image/jpeg')).toBe(true)
    expect(isImageMime('image/webp')).toBe(true)
  })
  it('rejects non-image types', () => {
    expect(isImageMime('application/pdf')).toBe(false)
    expect(isImageMime('audio/webm')).toBe(false)
  })
})

describe('getAvailableVisionModel', () => {
  it('returns the only installed vision model', async () => {
    mockTags(['nomic-embed-text', 'llava:7b'])
    expect(await getAvailableVisionModel()).toBe('llava:7b')
  })

  it('respects the priority order when several are installed', async () => {
    mockTags(['llava:7b', 'llama3.2-vision:11b'])
    expect(await getAvailableVisionModel()).toBe('llama3.2-vision:11b') // higher priority
  })

  it('matches a tag by prefix (model:tag)', async () => {
    mockTags(['llama3.2-vision:latest'])
    expect(await getAvailableVisionModel()).toBe('llama3.2-vision:latest')
  })

  it('honors an explicit user preference when installed', async () => {
    vi.mocked(getSetting).mockResolvedValue('llava:7b')
    mockTags(['llama3.2-vision:11b', 'llava:7b'])
    expect(await getAvailableVisionModel()).toBe('llava:7b') // preference beats priority
  })

  it('ignores a user preference that is not installed', async () => {
    vi.mocked(getSetting).mockResolvedValue('llava:13b')
    mockTags(['llama3.2-vision:11b'])
    expect(await getAvailableVisionModel()).toBe('llama3.2-vision:11b')
  })

  it('returns null when no vision model is installed', async () => {
    mockTags(['mistral', 'nomic-embed-text'])
    expect(await getAvailableVisionModel()).toBeNull()
  })

  it('returns null when Ollama responds non-OK', async () => {
    mockTags([], false)
    expect(await getAvailableVisionModel()).toBeNull()
  })

  it('returns null (never throws) when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    expect(await getAvailableVisionModel()).toBeNull()
  })
})
