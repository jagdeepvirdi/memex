import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  classify,
  mapToCategories,
  normalizeCategories,
  parseGithubRepoUrl,
  detectGithubRepoSubject,
} from './classifier'

vi.mock('./ai', () => ({ aiChat: vi.fn() }))
vi.mock('./githubApi', () => ({ lookupGithubRepo: vi.fn().mockResolvedValue(null) }))
vi.mock('./settings', () => ({ getAiConfig: vi.fn().mockResolvedValue({ model: 'test-model' }) }))

import { aiChat } from './ai'
import { lookupGithubRepo } from './githubApi'

const mockAI = (obj: Record<string, unknown>) => vi.mocked(aiChat).mockResolvedValueOnce(JSON.stringify(obj))

beforeEach(() => vi.mocked(aiChat).mockReset())

describe('parseGithubRepoUrl', () => {
  it('parses plain, www, http and trailing-path repo URLs', () => {
    expect(parseGithubRepoUrl('https://github.com/anthropics/claude-code')).toEqual({
      owner: 'anthropics', repo: 'claude-code', url: 'https://github.com/anthropics/claude-code',
    })
    expect(parseGithubRepoUrl('  http://www.github.com/a/b/  ')?.repo).toBe('b')
    expect(parseGithubRepoUrl('github.com/a/b/tree/main/docs')?.repo).toBe('b')
    expect(parseGithubRepoUrl('https://github.com/a/b.git')?.repo).toBe('b')
    expect(parseGithubRepoUrl('https://github.com/a/b?tab=readme#top')?.repo).toBe('b')
    expect(parseGithubRepoUrl('https://github.com/vercel/next.js')?.repo).toBe('next.js')
  })

  it('rejects non-repo and non-URL input', () => {
    expect(parseGithubRepoUrl('https://github.com/anthropics')).toBeNull()
    expect(parseGithubRepoUrl('https://github.com/settings/profile')).toBeNull()
    expect(parseGithubRepoUrl('https://github.com/topics/ai')).toBeNull()
    expect(parseGithubRepoUrl('https://gitlab.com/a/b')).toBeNull()
    expect(parseGithubRepoUrl('check out https://github.com/a/b')).toBeNull()
    expect(parseGithubRepoUrl('')).toBeNull()
  })
})

describe('detectGithubRepoSubject', () => {
  it('matches a bare URL, a leading URL line, or the saved source URL', () => {
    expect(detectGithubRepoSubject('https://github.com/a/b')?.repo).toBe('b')
    expect(detectGithubRepoSubject('\n\nhttps://github.com/a/b\nA cool tool')?.repo).toBe('b')
    expect(detectGithubRepoSubject('# README for the thing', 'https://github.com/a/b')?.repo).toBe('b')
  })

  it('sees through the HTML the Manual-tab editor posts', () => {
    expect(detectGithubRepoSubject('<p>https://github.com/a/b</p>')?.repo).toBe('b')
    expect(detectGithubRepoSubject('<p></p><p><a href="https://github.com/a/b">https://github.com/a/b</a></p><p>notes</p>')?.repo).toBe('b')
    expect(detectGithubRepoSubject('<p>intro</p><p>https://github.com/a/b</p>')).toBeNull()
    expect(detectGithubRepoSubject('<p>https://github.com/a/b</p><p>https://github.com/c/d</p>')).toBeNull()
  })

  it('does not match a repo merely mentioned in prose', () => {
    expect(detectGithubRepoSubject('I found this great tool at https://github.com/a/b last week')).toBeNull()
    expect(detectGithubRepoSubject('Great caption.\nhttps://github.com/a/b')).toBeNull()
  })

  it('does not match when several different repos are listed (multi-entity path)', () => {
    expect(detectGithubRepoSubject('https://github.com/a/b\nhttps://github.com/c/d')).toBeNull()
    expect(detectGithubRepoSubject('see github.com/c/d', 'https://github.com/a/b')).toBeNull()
  })

  it('treats repeated mentions of the same repo as one repo', () => {
    expect(detectGithubRepoSubject('https://github.com/a/b\nclone https://github.com/A/B.git')?.repo).toBe('b')
  })
})

describe('dev-knowledge mapping', () => {
  it('maps the new leaves and keeps existing keys unchanged', () => {
    expect(normalizeCategories(['Tech', 'AI', 'Repos'])).toEqual(['Tech', 'AI', 'Repos'])
    expect(normalizeCategories(['Prompts & Skills'])).toEqual(['Tech', 'AI', 'Prompts & Skills'])
    expect(normalizeCategories(['prompt'])).toEqual(['Tech', 'AI', 'Prompts & Skills'])
    expect(normalizeCategories(['Tech', 'AI', 'Explainers'])).toEqual(['Tech', 'AI', 'Explainers'])
    expect(normalizeCategories(['Tools'])).toEqual(['Tech', 'AI', 'Tools'])
    expect(normalizeCategories(['AI'])).toEqual(['Tech', 'AI'])
    // regression guards: pre-existing collisions are untouched
    expect(normalizeCategories(['notes'])).toEqual(['Finance', 'Notes'])
    expect(normalizeCategories(['instagram'])).toEqual(['Links', 'Instagram'])
    expect(normalizeCategories(['laptops'])).toEqual(['Tech', 'Laptops'])
    expect(normalizeCategories(['programming'])).toEqual(['Tech'])
  })

  it('files a link by structured.kind and leaves plain links under Links', () => {
    expect(mapToCategories('link', { kind: 'repo' })).toEqual(['Tech', 'AI', 'Repos'])
    expect(mapToCategories('link', { kind: 'skill' })).toEqual(['Tech', 'AI', 'Prompts & Skills'])
    expect(mapToCategories('link', { kind: 'explainer' })).toEqual(['Tech', 'AI', 'Explainers'])
    expect(mapToCategories('link', { kind: 'bogus' })).toEqual(['Links'])
    expect(mapToCategories('link', {})).toEqual(['Links'])
  })
})

describe('classify() dev-knowledge handling', () => {
  it('pre-pass: a bare GitHub URL lands in Tech > AI > Repos with repo structured data', async () => {
    mockAI({ type: 'note', title: 'x', categories: ['Links'], tags: [], summary: 'A CLI that does X.', structured: {} })
    const r = await classify('https://github.com/anthropics/claude-code')
    expect(r.type).toBe('link')
    expect(r.categories).toEqual(['Tech', 'AI', 'Repos'])
    expect(r.structured).toMatchObject({
      kind: 'repo', repoName: 'anthropics/claude-code', owner: 'anthropics',
      repoUrl: 'https://github.com/anthropics/claude-code', platform: 'github', whatItDoes: 'A CLI that does X.',
    })
  })

  it('pre-pass uses the saved sourceUrl when the text is a scraped README', async () => {
    mockAI({ type: 'note', title: 'x', categories: [], tags: [], summary: 's', structured: {} })
    const r = await classify('# Project\nSome readme text', { sourceUrl: 'https://github.com/a/b' })
    expect(r.categories).toEqual(['Tech', 'AI', 'Repos'])
    expect((r.structured as { repoName?: string }).repoName).toBe('a/b')
  })

  it('pre-pass still applies when the model fails and the fallback is used', async () => {
    vi.mocked(aiChat).mockResolvedValue('not json at all')
    const r = await classify('https://github.com/a/b')
    expect(r.confidence).toBe(0)
    expect(r.categories).toEqual(['Tech', 'AI', 'Repos'])
  })

  it('keeps the model whatItDoes over the summary when it provided one', async () => {
    mockAI({ type: 'link', title: 'x', categories: [], tags: [], summary: 'sum', structured: { whatItDoes: 'Does Y' } })
    const r = await classify('https://github.com/a/b')
    expect((r.structured as { whatItDoes?: string }).whatItDoes).toBe('Does Y')
  })

  it('does not hijack a note that only mentions a repo', async () => {
    mockAI({ type: 'note', title: 'n', categories: ['Finance', 'Notes'], tags: [], summary: 's', structured: {} })
    const r = await classify('Remember to look at https://github.com/a/b someday')
    expect(r.type).toBe('note')
    expect(r.categories).toEqual(['Finance', 'Notes'])
  })

  it('topic beats source: an Instagram caption about a prompt files under Prompts & Skills', async () => {
    mockAI({
      type: 'link', title: 'Cool prompt', categories: ['Links', 'Instagram'], tags: [], summary: 's',
      structured: { kind: 'prompt', promptText: 'You are...', platform: 'instagram' },
    })
    const r = await classify('caption: the best system prompt for coding agents ...')
    expect(r.categories).toEqual(['Tech', 'AI', 'Prompts & Skills'])
  })

  it('leaves ordinary links alone', async () => {
    mockAI({ type: 'link', title: 'Article', categories: ['Links', 'Articles'], tags: [], summary: 's', structured: {} })
    const r = await classify('https://example.com/post')
    expect(r.categories).toEqual(['Links', 'Articles'])
  })
})

// ── GitHub metadata ──────────────────────────────────────────────────────────

describe('classify — GitHub repo metadata', () => {
  const META = {
    fullName: 'anthropics/claude-code', stars: 12345, forks: 900, language: 'TypeScript', description: 'An agentic coding tool',
    topics: ['ai'], license: 'MIT', pushedAt: '2026-11-01T00:00:00Z', archived: false, isFork: false, fetchedAt: '2026-11-15T00:00:00Z',
  }
  const repoReply = { type: 'link', title: 'claude-code', categories: ['Tech'], tags: [], summary: 'A coding agent.', confidence: 80, structured: { kind: 'repo', repoName: 'Anthropics/Claude-Code' } }

  beforeEach(() => {
    vi.mocked(aiChat).mockReset()
    vi.mocked(lookupGithubRepo).mockReset().mockResolvedValue(null)
  })

  it('adds structured.github for a repo item, asking about the lower-cased owner/repo', async () => {
    vi.mocked(lookupGithubRepo).mockResolvedValue(META as never)
    mockAI(repoReply)
    const r = await classify('https://github.com/Anthropics/Claude-Code', { sourceUrl: 'https://github.com/Anthropics/Claude-Code' })
    expect(lookupGithubRepo).toHaveBeenCalledWith('anthropics/claude-code')
    expect((r.structured as { github?: unknown }).github).toEqual(META)
    expect(r.structured).toMatchObject({ kind: 'repo', repoName: 'Anthropics/Claude-Code' }) // everything else is kept
  })

  it('leaves the result exactly as it was when the lookup returns nothing (strict local, rate limit, 404…)', async () => {
    mockAI(repoReply)
    const r = await classify('https://github.com/anthropics/claude-code', { sourceUrl: 'https://github.com/anthropics/claude-code' })
    expect(lookupGithubRepo).toHaveBeenCalledTimes(1)
    expect(r.structured).not.toHaveProperty('github')
    expect(r.categories).toEqual(['Tech', 'AI', 'Repos'])
  })

  it('looks up a prompt/tool item that names a repo, but never an item with no repo', async () => {
    vi.mocked(lookupGithubRepo).mockResolvedValue(META as never)
    mockAI({ ...repoReply, structured: { kind: 'tool', repoUrl: 'https://github.com/anthropics/claude-code' } })
    await classify('a tool post')
    expect(lookupGithubRepo).toHaveBeenCalledWith('anthropics/claude-code')

    vi.mocked(lookupGithubRepo).mockClear()
    mockAI({ ...repoReply, structured: { kind: 'prompt', promptText: 'You are a reviewer' } })
    await classify('a prompt post')
    expect(lookupGithubRepo).not.toHaveBeenCalled()

    mockAI({ type: 'note', title: 'Groceries', categories: [], tags: [], summary: '', confidence: 90, structured: {} })
    await classify('milk, eggs')
    expect(lookupGithubRepo).not.toHaveBeenCalled()
  })

  it('does not look up a repo name the model made up (not a real owner/repo)', async () => {
    mockAI({ ...repoReply, structured: { kind: 'repo', repoName: 'some cool project', repoUrl: 'https://example.com/x' } })
    await classify('a repo post')
    expect(lookupGithubRepo).not.toHaveBeenCalled()
  })

  it('also applies on the retry path and the fallback path', async () => {
    vi.mocked(lookupGithubRepo).mockResolvedValue(META as never)
    vi.mocked(aiChat).mockResolvedValueOnce('not json').mockResolvedValueOnce(JSON.stringify(repoReply))
    const retried = await classify('https://github.com/anthropics/claude-code', { sourceUrl: 'https://github.com/anthropics/claude-code' })
    expect((retried.structured as { github?: unknown }).github).toEqual(META)

    vi.mocked(aiChat).mockResolvedValueOnce('nope').mockResolvedValueOnce('still nope')
    const fell = await classify('https://github.com/anthropics/claude-code', { sourceUrl: 'https://github.com/anthropics/claude-code' })
    expect((fell.structured as { github?: unknown }).github).toEqual(META) // a bare repo link still gets its facts
  })
})
