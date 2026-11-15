import type { Item, RepoData, DevKnowledgeKind } from '@shared/types'
import { CardBase, CardTitle, CardFooter, TypeBadge, Muted } from './CardBase'
import { PriorityBadge } from '../PriorityPicker'
import { Calendar, Star } from 'lucide-react'
import { formatCount } from '../../lib/format'

interface Props {
  item: Item
  onClick?: () => void
}

const SOURCE_LABEL: Record<string, string> = {
  youtube:   'YouTube',
  instagram: 'Instagram',
  url:       'Web',
  keep:      'Keep',
  manual:    'Link',
}

const SOURCE_COLOR: Record<string, string> = {
  youtube:   '#E8B4A0',
  instagram: '#BFB0E0',
  url:       '#9CC4E8',
  keep:      '#A8C5A0',
  manual:    '#9CC4E8',
}

const DEV_KIND_LABEL: Record<DevKnowledgeKind, string> = {
  repo:      'Repo',
  prompt:    'Prompt',
  skill:     'Skill',
  explainer: 'Explainer',
  tool:      'Tool',
}

export default function LinkCard({ item, onClick }: Props) {
  const sourceLabel = SOURCE_LABEL[item.source] ?? 'Link'
  const sourceColor = SOURCE_COLOR[item.source] ?? '#9CC4E8'

  const structured = (item.structured ?? {}) as Partial<RepoData> & { summary?: string; videoId?: string; channel?: string }
  const videoId = item.source === 'youtube' && structured.videoId && /^[\w-]{11}$/.test(structured.videoId)
    ? structured.videoId
    : undefined
  const devKind = structured.kind && structured.kind in DEV_KIND_LABEL ? structured.kind : undefined
  // Dev-knowledge items lead with what they are; the source (Instagram, Web…) moves to the chip below.
  const badgeLabel = devKind ? DEV_KIND_LABEL[devKind] : sourceLabel

  const summary = devKind ? (structured.whatItDoes ?? structured.summary) : structured.summary
  const preview = (summary ?? item.content).trim().replace(/\s+/g, ' ').slice(0, 100)

  const hostname = item.sourceUrl
    ? (() => { try { return new URL(item.sourceUrl).hostname.replace('www.', '') } catch { return item.sourceUrl } })()
    : null

  return (
    <CardBase onClick={onClick}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <TypeBadge type="link" label={badgeLabel} />
        <div className="flex items-center gap-1.5 min-w-0">
          <PriorityBadge value={item.priority} />
          {hostname && (
            <Muted className="truncate max-w-[120px]">{hostname}</Muted>
          )}
        </div>
      </div>

      {/* Video thumbnail */}
      {videoId && (
        <img
          src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
          alt=""
          loading="lazy"
          className="w-full aspect-video object-cover rounded-lg bg-white/5"
        />
      )}

      {/* Title */}
      <CardTitle>{item.title}</CardTitle>

      {/* Channel */}
      {videoId && structured.channel && (
        <span className="text-xs text-ink-muted truncate">{structured.channel}</span>
      )}

      {/* owner/repo */}
      {devKind === 'repo' && structured.repoName && (
        <span className="font-mono text-xs text-ink-muted truncate">{structured.repoName}</span>
      )}

      {/* stars / language, when GitHub was asked */}
      {structured.github && typeof structured.github.stars === 'number' && (
        <span data-testid="card-github" className="flex items-center gap-2 text-xs text-ink-muted">
          <span className="flex items-center gap-1"><Star size={11} className="text-amber-400" /> {formatCount(structured.github.stars)}</span>
          {structured.github.language && <span>{structured.github.language}</span>}
          {structured.github.archived && <span className="text-amber-400">Archived</span>}
        </span>
      )}

      {/* Summary / content preview */}
      {preview && <Muted>{preview}{preview.length >= 100 ? '…' : ''}</Muted>}

      {/* Source URL chip */}
      {item.sourceUrl && (
        <a
          href={item.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="self-start font-body text-xs truncate max-w-full"
          style={{ color: sourceColor, textDecoration: 'none' }}
        >
          {videoId ? '▶ Open on YouTube' : `↗ ${hostname ?? item.sourceUrl}`}
        </a>
      )}

      <div className="flex items-center gap-1 text-[10px] text-ink-muted/60 mt-1">
        <Calendar size={10} />
        {new Date(item.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
      </div>

      <CardFooter tags={item.tags} />
    </CardBase>
  )
}
