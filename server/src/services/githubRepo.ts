// Pure GitHub repo-URL helpers (no AI / DB dependencies).

// github.com paths that are not owner/repo pages
const GITHUB_RESERVED = new Set([
  'orgs', 'settings', 'topics', 'features', 'marketplace', 'sponsors', 'explore', 'login', 'pricing',
  'about', 'collections', 'trending', 'notifications', 'new', 'apps', 'enterprise', 'search', 'site',
  'security', 'customer-stories', 'readme', 'team', 'issues', 'pulls',
])

const REPO_SLUG = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/

/** True for a plain `owner/repo` name (the only shape ever put into a GitHub API URL). */
export function isValidRepoSlug(value: string): boolean {
  return REPO_SLUG.test(value) && !value.endsWith('.') && !value.split('/').some(part => part === '.' || part === '..')
}

export interface GithubRepoRef {
  owner: string
  repo: string
  url: string
}

const GITHUB_REPO_RE =
  /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]+?)(?:\.git)?(?:[/?#]\S*)?$/i

/** Parses a single string that is *only* a GitHub repo URL. */
export function parseGithubRepoUrl(raw: string): GithubRepoRef | null {
  const m = raw.trim().match(GITHUB_REPO_RE)
  if (!m) return null
  const [, owner, repo] = m
  if (GITHUB_RESERVED.has(owner.toLowerCase()) || repo === '.' || repo === '..') return null
  return { owner, repo, url: `https://github.com/${owner}/${repo}` }
}

/**
 * The lower-cased `owner/repo` an item's structured data points at: `repoName`, else the repo parsed from `repoUrl`.
 * Model output is untrusted, so anything that is not a real repo name yields undefined.
 */
export function repoSlugFromStructured(s: Record<string, unknown>): string | undefined {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  let repo = str(s.repoName).replace(/\.git$/i, '')
  if (!isValidRepoSlug(repo)) {
    const parsed = parseGithubRepoUrl(str(s.repoUrl))
    repo = parsed ? `${parsed.owner}/${parsed.repo}` : ''
  }
  return repo ? repo.toLowerCase() : undefined
}

/**
 * Returns the repo only when it is the *subject* of the item: the saved source URL, or a
 * leading line that is nothing but the URL. A repo merely mentioned in prose, or several
 * different repos in one caption (the multi-entity split path), does not qualify.
 */
export function detectGithubRepoSubject(text: string, sourceUrl?: string): GithubRepoRef | null {
  const mentioned = new Set<string>()
  for (const m of text.matchAll(/github\.com\/([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]+)/gi)) {
    mentioned.add(`${m[1]}/${m[2]}`.toLowerCase().replace(/\.git$/, ''))
  }
  const fromSource = sourceUrl ? parseGithubRepoUrl(sourceUrl) : null
  if (fromSource) mentioned.add(`${fromSource.owner}/${fromSource.repo}`.toLowerCase())
  if (mentioned.size > 1) return null
  if (fromSource) return fromSource
  // The Manual tab's editor posts HTML (`<p>https://github.com/a/b</p>`): turn block tags into line breaks
  // and strip the rest so the "leading line is just the URL" rule still works.
  const plain = text
    .replace(/<\/(?:p|div|li|h[1-6])>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
  const firstLine = plain.split('\n').find((l) => l.trim()) ?? ''
  return parseGithubRepoUrl(firstLine)
}
