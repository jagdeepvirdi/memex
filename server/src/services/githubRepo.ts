// Pure GitHub repo-URL helpers (no AI / DB dependencies).

// github.com paths that are not owner/repo pages
const GITHUB_RESERVED = new Set([
  'orgs', 'settings', 'topics', 'features', 'marketplace', 'sponsors', 'explore', 'login', 'pricing',
  'about', 'collections', 'trending', 'notifications', 'new', 'apps', 'enterprise', 'search', 'site',
  'security', 'customer-stories', 'readme', 'team', 'issues', 'pulls',
])

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
  const firstLine = text.split('\n').find((l) => l.trim()) ?? ''
  return parseGithubRepoUrl(firstLine)
}
