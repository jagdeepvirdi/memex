import { useState } from 'react'
import { toast } from 'sonner'
import { Star, GitFork, RefreshCw, Loader2, Archive, Scale, Code2 } from 'lucide-react'
import { refreshGithubInfo } from '../../lib/api'
import { formatCount, relativeDays, monthsSince } from '../../lib/format'
import type { GithubRepoMeta, Item, RepoData } from '../../../../shared/types'

const GITHUB_REPO_URL = /^https?:\/\/(?:www\.)?github\.com\/[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]+/i
/** Not pushed to for this long counts as "may be unmaintained". */
const STALE_MONTHS = 12

/** Does this item point at a GitHub repository (so there is something to look up)? */
export function isGithubRepoItem(item: Item): boolean {
  if (item.encrypted) return false
  const s = (item.structured ?? {}) as Partial<RepoData>
  if (s.kind && (s.repoName || s.repoUrl)) return true
  return !!item.sourceUrl && GITHUB_REPO_URL.test(item.sourceUrl)
}

export function githubOf(item: Pick<Item, 'structured'>): GithubRepoMeta | undefined {
  const g = (item.structured as { github?: GithubRepoMeta } | undefined)?.github
  return g && typeof g.stars === 'number' ? g : undefined
}

interface Props {
  item: Item
  onItemUpdated: (item: Item) => void
}

/** Stars, language, licence and last push for a GitHub repo item, with a Refresh button. Renders nothing for other items. */
export default function GithubMeta({ item, onItemUpdated }: Props) {
  const [busy, setBusy] = useState(false)
  if (!isGithubRepoItem(item)) return null
  const g = githubOf(item)

  const refresh = async () => {
    setBusy(true)
    try {
      const res = await refreshGithubInfo(item.id)
      onItemUpdated(res.item)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not reach GitHub')
    } finally {
      setBusy(false)
    }
  }

  const button = (label: string) => (
    <button
      onClick={refresh}
      disabled={busy}
      className="flex items-center gap-1.5 text-[11px] text-ink-muted hover:text-ink border border-white/10 hover:bg-white/5 px-2.5 py-1 rounded-md transition-colors disabled:opacity-50"
    >
      {busy ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
      {busy ? 'Contacting GitHub…' : label}
    </button>
  )

  if (!g) {
    return (
      <div data-testid="github-meta" className="flex items-center gap-3">
        {button('Fetch GitHub info')}
        <span className="text-[11px] text-ink-muted/70">Stars, language, licence and last update — fetched from GitHub on request.</span>
      </div>
    )
  }

  const stale = (monthsSince(g.pushedAt) ?? 0) >= STALE_MONTHS
  return (
    <div data-testid="github-meta" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink">
        <span className="flex items-center gap-1" title={`${g.stars.toLocaleString()} stars`}><Star size={13} className="text-amber-400" /> {formatCount(g.stars)}</span>
        {g.forks > 0 && <span className="flex items-center gap-1 text-ink-muted" title={`${g.forks.toLocaleString()} forks`}><GitFork size={13} /> {formatCount(g.forks)}</span>}
        {g.language && <span className="flex items-center gap-1 text-ink-muted"><Code2 size={13} /> {g.language}</span>}
        {g.license && <span className="flex items-center gap-1 text-ink-muted"><Scale size={13} /> {g.license}</span>}
        {g.pushedAt && (
          <span className={stale ? 'text-amber-400' : 'text-ink-muted'} title={new Date(g.pushedAt).toLocaleString()}>
            updated {relativeDays(g.pushedAt)}{stale ? ' — may be unmaintained' : ''}
          </span>
        )}
        {g.archived && <span className="flex items-center gap-1 text-amber-400 border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 rounded-md"><Archive size={11} /> Archived</span>}
        {g.isFork && <span className="text-ink-muted border border-white/10 px-2 py-0.5 rounded-md">Fork</span>}
      </div>

      {g.description && <p className="text-xs text-ink-muted leading-relaxed">{g.description}</p>}

      {g.topics.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {g.topics.slice(0, 6).map(t => (
            <span key={t} className="text-[10px] text-sky-300/80 bg-sky-400/10 border border-sky-400/20 px-2 py-0.5 rounded-full">{t}</span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        {button('Refresh')}
        <span className="text-[11px] text-ink-muted/70">from GitHub · checked {relativeDays(g.fetchedAt)}</span>
      </div>
    </div>
  )
}
