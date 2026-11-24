// GitHub repo metadata (stars, language, last push, licence…) for repo items.
//
// Unauthenticated REST (60 requests/hour per IP — plenty for saving a handful of repos; a lookup is one request and
// results are cached). Never used in Strict Local Mode. Never blocks saving: automatic lookups return null on any
// problem, the explicit "refresh" surfaces a readable reason.
//
// Nothing about the user or their library is sent: only the public `owner/repo` of a repository they saved, with a
// generic User-Agent (GitHub requires one).

import { getSetting, asBool } from './settings.js'
import { isValidRepoSlug } from './githubRepo.js'
import logger from '../lib/logger.js'
import type { GithubRepoMeta } from '../../../shared/types.js'

const API = 'https://api.github.com/repos'
const TIMEOUT_MS = 8_000
/** A looked-up repo is reused this long before asking GitHub again (stars move slowly). */
export const CACHE_TTL_MS = 6 * 60 * 60 * 1000
/** A repo that was not found is not asked about again for this long. */
export const NOT_FOUND_TTL_MS = 10 * 60 * 1000
const MAX_DESCRIPTION = 300
const MAX_TOPICS = 8

export type GithubLookupKind = 'invalid' | 'blocked' | 'not_found' | 'rate_limited' | 'unavailable'

export class GithubLookupError extends Error {
  constructor(
    public readonly kind: GithubLookupKind,
    message: string,
    /** When the rate limit resets (epoch ms), if GitHub said. */
    public readonly resetAt?: number,
  ) {
    super(message)
    this.name = 'GithubLookupError'
  }
}

// ── Pure: GitHub's JSON → our shape (untrusted input, so every field is type-checked) ─────────────

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const int = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : undefined)

export function parseGithubRepo(data: unknown, now = Date.now()): GithubRepoMeta | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  const fullName = str(d.full_name)
  const stars = int(d.stargazers_count)
  if (!fullName || !isValidRepoSlug(fullName) || stars === undefined) return null

  const htmlUrl = str(d.html_url)
  const homepage = str(d.homepage)
  const licence = d.license && typeof d.license === 'object' ? str((d.license as Record<string, unknown>).spdx_id) : undefined
  const topics = Array.isArray(d.topics)
    ? d.topics.filter((t): t is string => typeof t === 'string' && /^[a-z0-9][a-z0-9-]{0,49}$/.test(t)).slice(0, MAX_TOPICS)
    : []

  return {
    fullName,
    stars,
    forks: int(d.forks_count) ?? 0,
    language: str(d.language),
    description: str(d.description)?.slice(0, MAX_DESCRIPTION),
    topics,
    // NOASSERTION means "a licence file GitHub could not identify" — not worth showing as a licence.
    license: licence && licence !== 'NOASSERTION' ? licence : undefined,
    pushedAt: str(d.pushed_at),
    archived: d.archived === true,
    isFork: d.fork === true,
    htmlUrl: htmlUrl && htmlUrl.startsWith('https://github.com/') ? htmlUrl : undefined,
    homepage: homepage && /^https?:\/\//i.test(homepage) ? homepage : undefined,
    fetchedAt: new Date(now).toISOString(),
  }
}

// ── Cache + rate-limit gate (in memory: it only has to survive one server run) ────────────────────

const cache = new Map<string, { at: number; meta: GithubRepoMeta | null }>()
let rateLimitedUntil = 0 // epoch ms

/** For tests. */
export function resetGithubState(): void {
  cache.clear()
  rateLimitedUntil = 0
}

function fresh(entry: { at: number; meta: GithubRepoMeta | null }, now: number): boolean {
  return now - entry.at < (entry.meta ? CACHE_TTL_MS : NOT_FOUND_TTL_MS)
}

// ── Lookup ────────────────────────────────────────────────────────────────────────────────────────

export interface LookupOptions {
  /** Skip the cache (the user pressed Refresh). The rate-limit gate still applies. */
  fresh?: boolean
}

/** Throws GithubLookupError for every expected problem; the message is safe to show the user. */
export async function fetchGithubRepo(slug: string, opts: LookupOptions = {}): Promise<GithubRepoMeta> {
  const name = slug.trim().toLowerCase()
  if (!isValidRepoSlug(name)) throw new GithubLookupError('invalid', 'That is not a valid GitHub repository name.')

  if (asBool(await getSetting<unknown>('strict_local_mode', false))) {
    throw new GithubLookupError('blocked', 'Strict Local Mode is on, so GitHub cannot be contacted.')
  }

  const now = Date.now()
  const cached = cache.get(name)
  if (cached && !opts.fresh && fresh(cached, now)) {
    if (cached.meta) return cached.meta
    throw new GithubLookupError('not_found', 'Repository not found (it may be private, renamed or deleted).')
  }
  if (now < rateLimitedUntil) {
    throw new GithubLookupError('rate_limited', limitMessage(rateLimitedUntil), rateLimitedUntil)
  }

  const [owner, repo] = name.split('/')
  let res: Response
  try {
    res = await fetch(`${API}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'memex-local',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.name : 'error' }, 'GitHub lookup failed')
    throw new GithubLookupError('unavailable', 'Could not reach GitHub.')
  }

  if (res.status === 404) {
    cache.set(name, { at: now, meta: null })
    throw new GithubLookupError('not_found', 'Repository not found (it may be private, renamed or deleted).')
  }
  if (res.status === 403 || res.status === 429) {
    const reset = Number(res.headers.get('x-ratelimit-reset'))
    const retryAfter = Number(res.headers.get('retry-after'))
    const until = Number.isFinite(reset) && reset > 0 ? reset * 1000 : Number.isFinite(retryAfter) && retryAfter > 0 ? now + retryAfter * 1000 : now + 60 * 60 * 1000
    rateLimitedUntil = until
    throw new GithubLookupError('rate_limited', limitMessage(until), until)
  }
  if (!res.ok) {
    logger.warn({ status: res.status }, 'GitHub lookup returned an error status')
    throw new GithubLookupError('unavailable', `GitHub returned an error (${res.status}).`)
  }

  let meta: GithubRepoMeta | null
  try {
    meta = parseGithubRepo(await res.json(), now)
  } catch {
    meta = null
  }
  if (!meta) throw new GithubLookupError('unavailable', 'GitHub returned something unexpected.')

  // Running low on the allowance: stop asking before GitHub starts refusing.
  if (res.headers.get('x-ratelimit-remaining') === '0') {
    const reset = Number(res.headers.get('x-ratelimit-reset'))
    if (Number.isFinite(reset) && reset > 0) rateLimitedUntil = reset * 1000
  }
  cache.set(name, { at: now, meta })
  return meta
}

/** Longest README kept (characters); the classifier only reads the start anyway. */
export const MAX_README_CHARS = 20_000

/**
 * The repo's README as plain text/Markdown, from the same unauthenticated API (and the same rate-limit gate,
 * Strict Local rule and User-Agent) as `fetchGithubRepo`. Used when the page fetch (Jina) fails for a repo.
 * Throws GithubLookupError for every expected problem.
 */
export async function fetchGithubReadme(slug: string): Promise<string> {
  const name = slug.trim().toLowerCase()
  if (!isValidRepoSlug(name)) throw new GithubLookupError('invalid', 'That is not a valid GitHub repository name.')

  if (asBool(await getSetting<unknown>('strict_local_mode', false))) {
    throw new GithubLookupError('blocked', 'Strict Local Mode is on, so GitHub cannot be contacted.')
  }

  const now = Date.now()
  if (now < rateLimitedUntil) {
    throw new GithubLookupError('rate_limited', limitMessage(rateLimitedUntil), rateLimitedUntil)
  }

  const [owner, repo] = name.split('/')
  let res: Response
  try {
    res = await fetch(`${API}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`, {
      headers: {
        Accept: 'application/vnd.github.raw+json',
        'User-Agent': 'memex-local',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.name : 'error' }, 'GitHub README fetch failed')
    throw new GithubLookupError('unavailable', 'Could not reach GitHub.')
  }

  if (res.status === 404) throw new GithubLookupError('not_found', 'This repository has no README (or it is private).')
  if (res.status === 403 || res.status === 429) {
    const reset = Number(res.headers.get('x-ratelimit-reset'))
    const retryAfter = Number(res.headers.get('retry-after'))
    const until = Number.isFinite(reset) && reset > 0 ? reset * 1000 : Number.isFinite(retryAfter) && retryAfter > 0 ? now + retryAfter * 1000 : now + 60 * 60 * 1000
    rateLimitedUntil = until
    throw new GithubLookupError('rate_limited', limitMessage(until), until)
  }
  if (!res.ok) throw new GithubLookupError('unavailable', `GitHub returned an error (${res.status}).`)

  const text = (await res.text()).trim()
  if (!text) throw new GithubLookupError('not_found', 'This repository has an empty README.')
  return text.slice(0, MAX_README_CHARS)
}

function limitMessage(until: number): string {
  const mins = Math.max(1, Math.ceil((until - Date.now()) / 60_000))
  return `GitHub's request limit was reached. Try again in about ${mins} minute${mins === 1 ? '' : 's'}.`
}

/** Automatic lookup used while saving: null on ANY problem, never throws, never delays saving beyond the timeout. */
export async function lookupGithubRepo(slug: string): Promise<GithubRepoMeta | null> {
  try {
    return await fetchGithubRepo(slug)
  } catch {
    return null
  }
}
