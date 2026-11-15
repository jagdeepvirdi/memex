import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockGetSetting = vi.fn()
vi.mock('./settings', () => ({
  getSetting: (...a: unknown[]) => mockGetSetting(...a),
  asBool: (v: unknown) => v === true || v === 'true',
}))
const warn = vi.fn()
vi.mock('../lib/logger', () => ({ default: { warn: (...a: unknown[]) => warn(...a), error: vi.fn(), info: vi.fn() } }))

import {
  parseGithubRepo, fetchGithubRepo, lookupGithubRepo, GithubLookupError, resetGithubState, CACHE_TTL_MS, NOT_FOUND_TTL_MS,
} from './githubApi'

const fetchMock = vi.fn()

const RAW = {
  full_name: 'anthropics/claude-code', stargazers_count: 12345, forks_count: 900, language: 'TypeScript',
  description: 'An agentic coding tool', topics: ['ai', 'cli', 'Bad Topic!'], license: { spdx_id: 'MIT' },
  pushed_at: '2026-11-01T10:00:00Z', archived: false, fork: false, html_url: 'https://github.com/anthropics/claude-code',
  homepage: 'https://claude.com/product/claude-code',
}
const ok = (body: unknown = RAW, headers: Record<string, string> = {}) =>
  ({ ok: true, status: 200, headers: new Headers(headers), json: async () => body })
const status = (code: number, headers: Record<string, string> = {}) =>
  ({ ok: false, status: code, headers: new Headers(headers), json: async () => ({}) })

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset().mockResolvedValue(ok())
  mockGetSetting.mockResolvedValue(false)
  resetGithubState()
})
afterEach(() => vi.unstubAllGlobals())

describe('parseGithubRepo', () => {
  const NOW = Date.parse('2026-11-15T00:00:00Z')

  it('maps the fields we use and stamps when it was fetched', () => {
    expect(parseGithubRepo(RAW, NOW)).toEqual({
      fullName: 'anthropics/claude-code', stars: 12345, forks: 900, language: 'TypeScript', description: 'An agentic coding tool',
      topics: ['ai', 'cli'], license: 'MIT', pushedAt: '2026-11-01T10:00:00Z', archived: false, isFork: false,
      htmlUrl: 'https://github.com/anthropics/claude-code', homepage: 'https://claude.com/product/claude-code',
      fetchedAt: '2026-11-15T00:00:00.000Z',
    })
  })

  it('copes with a bare-bones repo: nulls become absent, counts default', () => {
    const m = parseGithubRepo({ full_name: 'a/b', stargazers_count: 0, language: null, description: null, license: null, topics: undefined, homepage: '' }, NOW)!
    expect(m).toMatchObject({ fullName: 'a/b', stars: 0, forks: 0, topics: [], archived: false, isFork: false })
    expect(m.language).toBeUndefined()
    expect(m.description).toBeUndefined()
    expect(m.license).toBeUndefined()
    expect(m.homepage).toBeUndefined()
  })

  it('does not show an unidentified licence as a licence', () => {
    expect(parseGithubRepo({ ...RAW, license: { spdx_id: 'NOASSERTION' } }, NOW)!.license).toBeUndefined()
  })

  it('flags archived repos and forks', () => {
    const m = parseGithubRepo({ ...RAW, archived: true, fork: true }, NOW)!
    expect(m.archived).toBe(true)
    expect(m.isFork).toBe(true)
  })

  it('only trusts links that are really http(s) / github.com (it is shown as a link)', () => {
    const m = parseGithubRepo({ ...RAW, homepage: 'javascript:alert(1)', html_url: 'https://evil.example/x' }, NOW)!
    expect(m.homepage).toBeUndefined()
    expect(m.htmlUrl).toBeUndefined()
  })

  it('caps a long description and limits topics', () => {
    const m = parseGithubRepo({ ...RAW, description: 'd'.repeat(900), topics: Array.from({ length: 30 }, (_, i) => `t${i}`) }, NOW)!
    expect(m.description).toHaveLength(300)
    expect(m.topics).toHaveLength(8)
  })

  it.each([
    ['null', null], ['a string', 'x'], ['an array', []], ['no name', { stargazers_count: 1 }],
    ['an invalid name', { full_name: 'not a repo', stargazers_count: 1 }], ['no stars', { full_name: 'a/b' }],
    ['negative stars', { full_name: 'a/b', stargazers_count: -1 }], ['text stars', { full_name: 'a/b', stargazers_count: '5' }],
    ['a path-traversal name', { full_name: '../etc', stargazers_count: 1 }],
  ])('returns null for %s', (_n, data) => {
    expect(parseGithubRepo(data)).toBeNull()
  })
})

describe('fetchGithubRepo — the request', () => {
  it('asks the public repo endpoint with a generic User-Agent and no credentials', async () => {
    await fetchGithubRepo('anthropics/claude-code')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.github.com/repos/anthropics/claude-code')
    expect(init.headers).toMatchObject({ Accept: 'application/vnd.github+json', 'User-Agent': 'memex-local', 'X-GitHub-Api-Version': '2022-11-28' })
    expect(init.headers).not.toHaveProperty('Authorization')
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('sends only the public owner/repo — nothing about the user or the library', async () => {
    await fetchGithubRepo('anthropics/claude-code')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url) + JSON.stringify(init.headers)).not.toMatch(/@|memex.*item|library|jagdeep/i)
    expect(init.body).toBeUndefined()
    expect(init.method ?? 'GET').toBe('GET')
  })

  it('lower-cases the name and returns the parsed metadata', async () => {
    const m = await fetchGithubRepo('Anthropics/Claude-Code')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.github.com/repos/anthropics/claude-code')
    expect(m).toMatchObject({ fullName: 'anthropics/claude-code', stars: 12345, language: 'TypeScript' })
  })

  it.each(['not a repo', '', 'a', 'a/b/c', '../etc/passwd', 'a/..', 'owner/repo?x=1', 'owner/re po', '/repo', 'owner/'])(
    'refuses %j without calling GitHub',
    async bad => {
      await expect(fetchGithubRepo(bad)).rejects.toMatchObject({ kind: 'invalid' })
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )
})

describe('fetchGithubRepo — Strict Local Mode', () => {
  it('never contacts GitHub', async () => {
    mockGetSetting.mockResolvedValue(true)
    await expect(fetchGithubRepo('a/b')).rejects.toMatchObject({ kind: 'blocked', message: expect.stringMatching(/Strict Local Mode/) })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('also reads the legacy string setting "true"', async () => {
    mockGetSetting.mockResolvedValue('true')
    await expect(fetchGithubRepo('a/b')).rejects.toMatchObject({ kind: 'blocked' })
  })
})

describe('fetchGithubRepo — cache', () => {
  it('reuses a recent answer (case-insensitively) instead of asking again', async () => {
    await fetchGithubRepo('a/b')
    await fetchGithubRepo('A/B')
    await fetchGithubRepo('a/b')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('asks again once the answer is old', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-15T00:00:00Z'))
    await fetchGithubRepo('a/b')
    vi.setSystemTime(Date.now() + CACHE_TTL_MS + 1000)
    await fetchGithubRepo('a/b')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('"fresh" skips the cache (the user pressed Refresh)', async () => {
    await fetchGithubRepo('a/b')
    await fetchGithubRepo('a/b', { fresh: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('remembers a 404 for a short while, then tries again', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-15T00:00:00Z'))
    fetchMock.mockResolvedValue(status(404))
    await expect(fetchGithubRepo('a/gone')).rejects.toMatchObject({ kind: 'not_found' })
    await expect(fetchGithubRepo('a/gone')).rejects.toMatchObject({ kind: 'not_found' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.setSystemTime(Date.now() + NOT_FOUND_TTL_MS + 1000)
    await expect(fetchGithubRepo('a/gone')).rejects.toMatchObject({ kind: 'not_found' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not cache failures that might be temporary', async () => {
    fetchMock.mockResolvedValueOnce(status(500)).mockResolvedValueOnce(ok())
    await expect(fetchGithubRepo('a/b')).rejects.toMatchObject({ kind: 'unavailable' })
    await expect(fetchGithubRepo('a/b')).resolves.toMatchObject({ fullName: 'anthropics/claude-code' })
  })
})

describe('fetchGithubRepo — rate limit', () => {
  it('on 403 with a reset time: reports it, and stops calling GitHub until then', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-15T00:00:00Z'))
    const reset = Math.floor(Date.now() / 1000) + 25 * 60
    fetchMock.mockResolvedValue(status(403, { 'x-ratelimit-reset': String(reset), 'x-ratelimit-remaining': '0' }))
    const err = await fetchGithubRepo('a/b').catch(e => e)
    expect(err).toBeInstanceOf(GithubLookupError)
    expect(err.kind).toBe('rate_limited')
    expect(err.resetAt).toBe(reset * 1000)
    expect(err.message).toMatch(/about 25 minutes/)

    await expect(fetchGithubRepo('other/repo')).rejects.toMatchObject({ kind: 'rate_limited' })
    expect(fetchMock).toHaveBeenCalledTimes(1) // the second lookup never left the machine

    fetchMock.mockResolvedValue(ok())
    vi.setSystemTime(reset * 1000 + 1000)
    await expect(fetchGithubRepo('other/repo')).resolves.toBeTruthy() // allowed again after the reset
  })

  it('on 429 with Retry-After', async () => {
    fetchMock.mockResolvedValue(status(429, { 'retry-after': '120' }))
    const err = await fetchGithubRepo('a/b').catch(e => e)
    expect(err.kind).toBe('rate_limited')
    expect(err.message).toMatch(/about 2 minutes/)
  })

  it('on a limit with no timing information: backs off for an hour', async () => {
    fetchMock.mockResolvedValue(status(403))
    const err = await fetchGithubRepo('a/b').catch(e => e)
    expect(err.message).toMatch(/about 60 minutes/)
  })

  it('when a successful answer used up the allowance, it stops before GitHub starts refusing', async () => {
    const reset = Math.floor(Date.now() / 1000) + 600
    fetchMock.mockResolvedValue(ok(RAW, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) }))
    await expect(fetchGithubRepo('a/b')).resolves.toBeTruthy()
    await expect(fetchGithubRepo('c/d')).rejects.toMatchObject({ kind: 'rate_limited' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('a cached repo is still answered while rate limited (no request needed)', async () => {
    const reset = Math.floor(Date.now() / 1000) + 600
    fetchMock.mockResolvedValueOnce(ok(RAW, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) }))
    await fetchGithubRepo('a/b')
    await expect(fetchGithubRepo('a/b')).resolves.toBeTruthy()
  })
})

describe('fetchGithubRepo — failures', () => {
  it('a network failure is "unavailable", and logs only the error name — never the URL or details', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('getaddrinfo ENOTFOUND api.github.com secret-detail'), { name: 'TypeError' }))
    await expect(fetchGithubRepo('a/b')).rejects.toMatchObject({ kind: 'unavailable', message: 'Could not reach GitHub.' })
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-detail')
  })

  it('a server error is "unavailable" with the status', async () => {
    fetchMock.mockResolvedValue(status(503))
    await expect(fetchGithubRepo('a/b')).rejects.toMatchObject({ kind: 'unavailable', message: expect.stringContaining('503') })
  })

  it('unreadable or unexpected JSON is "unavailable"', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(), json: async () => { throw new Error('bad json') } })
    await expect(fetchGithubRepo('a/b')).rejects.toMatchObject({ kind: 'unavailable' })
    fetchMock.mockResolvedValueOnce(ok({ unexpected: true }))
    await expect(fetchGithubRepo('c/d')).rejects.toMatchObject({ kind: 'unavailable' })
  })
})

describe('lookupGithubRepo (the automatic one used while saving)', () => {
  it('returns the metadata on success', async () => {
    expect(await lookupGithubRepo('a/b')).toMatchObject({ stars: 12345 })
  })

  it.each([
    ['invalid name', () => {}, 'not a repo'],
    ['404', () => fetchMock.mockResolvedValue(status(404)), 'a/b'],
    ['rate limit', () => fetchMock.mockResolvedValue(status(429)), 'a/b'],
    ['network down', () => fetchMock.mockRejectedValue(new Error('down')), 'a/b'],
    ['strict local', () => mockGetSetting.mockResolvedValue(true), 'a/b'],
  ])('returns null, never throws: %s', async (_n, arrange, slug) => {
    arrange()
    await expect(lookupGithubRepo(slug)).resolves.toBeNull()
  })
})
