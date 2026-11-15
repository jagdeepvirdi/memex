import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockGetApiKey = vi.fn()
vi.mock('./apiKeys', () => ({
  getApiKey: (...a: unknown[]) => mockGetApiKey(...a),
  redactSecrets: (t: string) => t.split('AIzaSecretKeyValue1234567890').join('[redacted]'),
}))
const mockGetSetting = vi.fn()
vi.mock('./settings', () => ({
  getSetting: (...a: unknown[]) => mockGetSetting(...a),
  asBool: (v: unknown) => v === true || v === 'true',
}))
const warn = vi.fn()
vi.mock('../lib/logger', () => ({ default: { warn: (...a: unknown[]) => warn(...a), error: vi.fn(), info: vi.fn() } }))

import { parseIsoDuration, fetchVideoDetails, checkYoutubeKey, MAX_DESCRIPTION_CHARS } from './youtubeApi'

const KEY = 'AIzaSecretKeyValue1234567890'
const fetchMock = vi.fn()

const ok = (item: unknown) => ({ ok: true, status: 200, json: async () => ({ items: item ? [item] : [] }) })
const failing = (status: number, reason: string, message = 'boom') =>
  ({ ok: false, status, json: async () => ({ error: { message, errors: [{ reason }] } }) })
const VIDEO = {
  snippet: { description: '  Ingredients: 2 cups flour\nSteps...  ', channelTitle: 'Chef Joe', publishedAt: '2024-05-01T10:00:00Z' },
  contentDetails: { duration: 'PT1H2M3S' },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  mockGetApiKey.mockResolvedValue(KEY)
  mockGetSetting.mockResolvedValue(false)
})
afterEach(() => vi.unstubAllGlobals())

describe('parseIsoDuration', () => {
  it.each([
    ['PT45S', 45], ['PT5M', 300], ['PT1H', 3600], ['PT1H2M3S', 3723], ['P1DT1H', 90000], ['PT0S', undefined],
    ['P0D', undefined], ['', undefined], ['garbage', undefined], [undefined, undefined], [42, undefined],
  ])('%s → %s', (iso, secs) => {
    expect(parseIsoDuration(iso)).toBe(secs)
  })
})

describe('fetchVideoDetails', () => {
  it('returns null without calling the API when no key is configured', async () => {
    mockGetApiKey.mockResolvedValue(undefined)
    expect(await fetchVideoDetails('dQw4w9WgXcQ')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns null without calling the API in Strict Local Mode', async () => {
    mockGetSetting.mockResolvedValue(true)
    expect(await fetchVideoDetails('dQw4w9WgXcQ')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns description, channel, date and duration', async () => {
    fetchMock.mockResolvedValue(ok(VIDEO))
    expect(await fetchVideoDetails('dQw4w9WgXcQ')).toEqual({
      description: 'Ingredients: 2 cups flour\nSteps...', channelTitle: 'Chef Joe',
      publishedAt: '2024-05-01T10:00:00Z', durationSeconds: 3723,
    })
  })

  it('sends the key in a header, never in the URL', async () => {
    fetchMock.mockResolvedValue(ok(VIDEO))
    await fetchVideoDetails('dQw4w9WgXcQ')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('googleapis.com/youtube/v3/videos')
    expect(String(url)).toContain('id=dQw4w9WgXcQ')
    expect(String(url)).not.toContain(KEY)
    expect(String(url)).not.toMatch(/[?&]key=/)
    expect(init.headers['x-goog-api-key']).toBe(KEY)
  })

  it('caps very long descriptions', async () => {
    fetchMock.mockResolvedValue(ok({ ...VIDEO, snippet: { description: 'x'.repeat(MAX_DESCRIPTION_CHARS + 2000) } }))
    expect((await fetchVideoDetails('dQw4w9WgXcQ'))!.description).toHaveLength(MAX_DESCRIPTION_CHARS)
  })

  it('returns null for a private or removed video (no items)', async () => {
    fetchMock.mockResolvedValue(ok(null))
    expect(await fetchVideoDetails('dQw4w9WgXcQ')).toBeNull()
  })

  it('returns null, never throws, on quota / auth / network failures, logging only the kind', async () => {
    for (const r of [failing(403, 'quotaExceeded'), failing(400, 'keyInvalid'), failing(500, 'backendError')]) {
      fetchMock.mockResolvedValueOnce(r)
      expect(await fetchVideoDetails('dQw4w9WgXcQ')).toBeNull()
    }
    fetchMock.mockRejectedValueOnce(new Error('network down'))
    expect(await fetchVideoDetails('dQw4w9WgXcQ')).toBeNull()
    const logged = JSON.stringify(warn.mock.calls)
    expect(logged).toContain('quota')
    expect(logged).not.toContain(KEY)
  })

  it('never lets the key into a log line, even if the error text contains it', async () => {
    fetchMock.mockRejectedValue(new Error(`request to https://x?key=${KEY} failed`))
    await fetchVideoDetails('dQw4w9WgXcQ')
    expect(JSON.stringify(warn.mock.calls)).not.toContain(KEY)
  })
})

describe('checkYoutubeKey', () => {
  it('is ok when the API returns the test video', async () => {
    fetchMock.mockResolvedValue(ok(VIDEO))
    expect(await checkYoutubeKey()).toEqual({ ok: true })
    expect(String(fetchMock.mock.calls[0][0])).toContain('id=dQw4w9WgXcQ')
  })

  it('reports a missing key without calling the API', async () => {
    mockGetApiKey.mockResolvedValue(undefined)
    expect(await checkYoutubeKey()).toMatchObject({ ok: false, kind: 'missing' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports Strict Local Mode without calling the API', async () => {
    mockGetSetting.mockResolvedValue(true)
    expect(await checkYoutubeKey()).toMatchObject({ ok: false, kind: 'blocked' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['an invalid key', failing(400, 'keyInvalid', 'API key not valid. Please pass a valid API key.'), 'auth'],
    ['the API not enabled', failing(403, 'accessNotConfigured', 'YouTube Data API v3 has not been used in project 1'), 'auth'],
    ['an exhausted quota', failing(403, 'quotaExceeded', 'quota exceeded'), 'quota'],
    ['a server error', failing(503, 'backendError', 'try later'), 'unavailable'],
  ])('classifies %s as %s', async (_n, response, kind) => {
    fetchMock.mockResolvedValue(response)
    const out = await checkYoutubeKey()
    expect(out).toMatchObject({ ok: false, kind })
    expect((out as { error: string }).error.length).toBeGreaterThan(0)
  })

  it('redacts the key from an error message', async () => {
    fetchMock.mockResolvedValue(failing(400, 'keyInvalid', `key ${KEY} is bad`))
    const out = await checkYoutubeKey()
    expect((out as { error: string }).error).not.toContain(KEY)
    expect((out as { error: string }).error).toContain('[redacted]')
  })

  it('reports a network failure as unavailable', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))
    expect(await checkYoutubeKey()).toMatchObject({ ok: false, kind: 'unavailable' })
  })

  it('treats a valid key whose test video returns nothing as a (distinct) failure', async () => {
    fetchMock.mockResolvedValue(ok(null))
    expect(await checkYoutubeKey()).toMatchObject({ ok: false, kind: 'unavailable' })
  })
})
