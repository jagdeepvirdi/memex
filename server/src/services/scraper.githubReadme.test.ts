import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('youtube-transcript', () => ({ YoutubeTranscript: { fetchTranscript: vi.fn() } }))
vi.mock('./settings.js', () => ({
  getSetting: vi.fn().mockResolvedValue(false),
  asBool: (v: unknown) => v === true || v === 'true',
}))
vi.mock('../lib/logger.js', () => ({ default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))
vi.mock('./youtubeApi.js', () => ({ fetchVideoDetails: vi.fn().mockResolvedValue(null) }))
const mockReadme = vi.fn()
vi.mock('./githubApi.js', () => ({
  fetchGithubReadme: (...a: unknown[]) => mockReadme(...a),
  GithubLookupError: class extends Error { constructor(public kind: string, m: string) { super(m) } },
}))

import { scrapeUrl } from './scraper'

const fetchMock = vi.fn()
const jinaOk = (content: string, title = 'Page') => ({ ok: true, status: 200, statusText: 'OK', json: async () => ({ data: { title, content } }) })
const jinaForbidden = { ok: false, status: 403, statusText: 'Forbidden', json: async () => ({}) }
const REPO = 'https://github.com/modelcontextprotocol/servers'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  mockReadme.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

describe('scrapeUrl: GitHub README fallback', () => {
  it('uses the README when Jina is forbidden for a repo URL', async () => {
    fetchMock.mockResolvedValue(jinaForbidden)
    mockReadme.mockResolvedValue('Reference MCP servers.')
    const r = await scrapeUrl(REPO)
    expect(mockReadme).toHaveBeenCalledWith('modelcontextprotocol/servers')
    expect(r).toMatchObject({ title: 'modelcontextprotocol/servers', source: 'url', sourceUrl: REPO })
    expect(r.content).toContain('Reference MCP servers.')
  })

  it('uses the README when Jina answers with empty content', async () => {
    fetchMock.mockResolvedValue(jinaOk('   '))
    mockReadme.mockResolvedValue('Readme text')
    expect((await scrapeUrl(REPO)).content).toContain('Readme text')
  })

  it('keeps Jina content when it has some, and never asks GitHub', async () => {
    fetchMock.mockResolvedValue(jinaOk('Real page text', 'servers'))
    const r = await scrapeUrl(REPO)
    expect(r.content).toBe('Real page text')
    expect(mockReadme).not.toHaveBeenCalled()
  })

  it('falls back to the placeholder when the README fetch fails too', async () => {
    fetchMock.mockResolvedValue(jinaForbidden)
    mockReadme.mockRejectedValue(new Error('rate limited'))
    const r = await scrapeUrl(REPO)
    expect(r.content).toBe('Failed to extract content from this URL.')
  })

  it('does not call GitHub for a non-repo URL', async () => {
    fetchMock.mockResolvedValue(jinaForbidden)
    for (const url of ['https://example.com/a', 'https://github.com/orgs/foo', 'https://github.com/someone']) {
      expect((await scrapeUrl(url)).content).toBe('Failed to extract content from this URL.')
    }
    expect(mockReadme).not.toHaveBeenCalled()
  })
})
