import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))
vi.mock('../../lib/api', () => ({ refreshGithubInfo: vi.fn() }))

import GithubMeta, { isGithubRepoItem, githubOf } from './GithubMeta'
import { refreshGithubInfo } from '../../lib/api'
import type { Item, GithubRepoMeta } from '../../../../shared/types'

const NOW = new Date('2026-11-15T12:00:00Z')
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString()

const META: GithubRepoMeta = {
  fullName: 'anthropics/claude-code', stars: 12345, forks: 900, language: 'TypeScript', description: 'An agentic coding tool',
  topics: ['ai', 'cli', 'agents'], license: 'MIT', pushedAt: daysAgo(3), archived: false, isFork: false, fetchedAt: daysAgo(2),
}
const repo = (over: Partial<Item> = {}, github?: GithubRepoMeta): Item => ({
  id: 'r1', title: 'claude-code', type: 'link', content: '', source: 'url', sourceUrl: 'https://github.com/anthropics/claude-code',
  structured: { kind: 'repo', repoName: 'anthropics/claude-code', ...(github ? { github } : {}) }, categories: [], tags: [], reviewed: true,
  createdAt: new Date(), updatedAt: new Date(), ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(NOW)
})
afterEach(() => vi.useRealTimers())

describe('isGithubRepoItem', () => {
  it('is true for a repo item, or any item whose source URL is a GitHub repo', () => {
    expect(isGithubRepoItem(repo())).toBe(true)
    expect(isGithubRepoItem(repo({ structured: { kind: 'tool', repoUrl: 'https://github.com/a/b' } }))).toBe(true)
    expect(isGithubRepoItem(repo({ structured: {}, sourceUrl: 'https://www.github.com/a/b' }))).toBe(true)
  })

  it('is false for everything else, including encrypted items', () => {
    expect(isGithubRepoItem(repo({ structured: { kind: 'prompt', promptText: 'x' }, sourceUrl: 'https://example.com' }))).toBe(false)
    expect(isGithubRepoItem(repo({ structured: {}, sourceUrl: undefined }))).toBe(false)
    expect(isGithubRepoItem(repo({ structured: {}, sourceUrl: 'https://github.com/' }))).toBe(false)
    expect(isGithubRepoItem(repo({ encrypted: true }))).toBe(false)
  })
})

describe('githubOf', () => {
  it('returns the saved metadata only when it looks real', () => {
    expect(githubOf(repo({}, META))).toEqual(META)
    expect(githubOf(repo())).toBeUndefined()
    expect(githubOf({ structured: { github: 'junk' } } as never)).toBeUndefined()
    expect(githubOf({ structured: { github: { stars: 'many' } } } as never)).toBeUndefined()
  })
})

describe('GithubMeta — nothing saved yet', () => {
  it('renders nothing for an item that is not a GitHub repo', () => {
    const { container } = render(<GithubMeta item={repo({ structured: {}, sourceUrl: 'https://example.com' })} onItemUpdated={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('offers to fetch, explaining what it gets', () => {
    render(<GithubMeta item={repo()} onItemUpdated={vi.fn()} />)
    expect(screen.getByRole('button', { name: /fetch github info/i })).toBeInTheDocument()
    expect(screen.getByText(/stars, language, licence and last update/i)).toBeInTheDocument()
    expect(refreshGithubInfo).not.toHaveBeenCalled() // nothing is fetched until asked
  })

  it('fetches on click, shows progress, and hands the updated item up', async () => {
    const updated = repo({}, META)
    let resolve: (v: unknown) => void = () => {}
    vi.mocked(refreshGithubInfo).mockReturnValue(new Promise(r => { resolve = r }) as never)
    const onItemUpdated = vi.fn()
    render(<GithubMeta item={repo()} onItemUpdated={onItemUpdated} />)

    fireEvent.click(screen.getByRole('button', { name: /fetch github info/i }))
    expect(await screen.findByRole('button', { name: /contacting github/i })).toBeDisabled()
    expect(refreshGithubInfo).toHaveBeenCalledWith('r1')

    resolve({ item: updated, github: META })
    await waitFor(() => expect(onItemUpdated).toHaveBeenCalledWith(updated))
  })

  it('shows the reason when GitHub cannot be reached, and lets the user try again', async () => {
    vi.mocked(refreshGithubInfo).mockRejectedValue(new Error("GitHub's request limit was reached. Try again in about 25 minutes."))
    render(<GithubMeta item={repo()} onItemUpdated={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /fetch github info/i }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/about 25 minutes/)))
    expect(screen.getByRole('button', { name: /fetch github info/i })).toBeEnabled()
  })
})

describe('GithubMeta — with saved metadata', () => {
  it('shows stars, forks, language, licence and when it was last updated', () => {
    render(<GithubMeta item={repo({}, META)} onItemUpdated={vi.fn()} />)
    const box = screen.getByTestId('github-meta')
    expect(box).toHaveTextContent('12.3k')
    expect(box).toHaveTextContent('900')
    expect(box).toHaveTextContent('TypeScript')
    expect(box).toHaveTextContent('MIT')
    expect(box).toHaveTextContent('updated 3 days ago')
    expect(box).not.toHaveTextContent(/unmaintained/)
    expect(box).toHaveTextContent('An agentic coding tool')
    expect(box).toHaveTextContent('ai')
    expect(box).toHaveTextContent('from GitHub · checked 2 days ago')
  })

  it('shows exact star and fork counts on hover', () => {
    render(<GithubMeta item={repo({}, META)} onItemUpdated={vi.fn()} />)
    expect(screen.getByTitle('12,345 stars')).toBeInTheDocument()
    expect(screen.getByTitle('900 forks')).toBeInTheDocument()
  })

  it('warns when the last push was a year or more ago', () => {
    render(<GithubMeta item={repo({}, { ...META, pushedAt: daysAgo(500) })} onItemUpdated={vi.fn()} />)
    expect(screen.getByTestId('github-meta')).toHaveTextContent(/updated 1 year ago — may be unmaintained/)
  })

  it('flags archived repos and forks', () => {
    render(<GithubMeta item={repo({}, { ...META, archived: true, isFork: true })} onItemUpdated={vi.fn()} />)
    const box = screen.getByTestId('github-meta')
    expect(box).toHaveTextContent('Archived')
    expect(box).toHaveTextContent('Fork')
  })

  it('leaves out what GitHub did not give: no licence, language, forks, topics or description', () => {
    render(<GithubMeta item={repo({}, { ...META, license: undefined, language: undefined, forks: 0, topics: [], description: undefined })} onItemUpdated={vi.fn()} />)
    const box = screen.getByTestId('github-meta')
    expect(box).not.toHaveTextContent('MIT')
    expect(box).not.toHaveTextContent('TypeScript')
    expect(screen.queryByTitle(/forks/)).not.toBeInTheDocument()
    expect(box).not.toHaveTextContent('An agentic coding tool')
  })

  it('shows at most six topics', () => {
    render(<GithubMeta item={repo({}, { ...META, topics: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] })} onItemUpdated={vi.fn()} />)
    expect(screen.getByTestId('github-meta')).not.toHaveTextContent('gh') // 7th and 8th topics are cut
    expect(screen.queryByText('g')).not.toBeInTheDocument()
    expect(screen.getByText('f')).toBeInTheDocument()
  })

  it('refreshes on click and hands the updated item up', async () => {
    const updated = repo({}, { ...META, stars: 99999 })
    vi.mocked(refreshGithubInfo).mockResolvedValue({ item: updated, github: { ...META, stars: 99999 } })
    const onItemUpdated = vi.fn()
    render(<GithubMeta item={repo({}, META)} onItemUpdated={onItemUpdated} />)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(onItemUpdated).toHaveBeenCalledWith(updated))
  })

  it('keeps showing the old facts when a refresh fails', async () => {
    vi.mocked(refreshGithubInfo).mockRejectedValue(new Error('Repository not found (it may be private, renamed or deleted).'))
    render(<GithubMeta item={repo({}, META)} onItemUpdated={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/not found/)))
    expect(screen.getByTestId('github-meta')).toHaveTextContent('12.3k')
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled()
  })
})
