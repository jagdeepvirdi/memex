import type { Item, RepoData, DevKnowledgeKind } from '@shared/types'
import { CardBase, CardTitle, CardFooter, TypeBadge, Muted } from './CardBase'
import { PriorityBadge } from '../PriorityPicker'
import { Calendar } from 'lucide-react'

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

  const structured = (item.structured ?? {}) as Partial<RepoData> & { summary?: string }
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

      {/* Title */}
      <CardTitle>{item.title}</CardTitle>

      {/* owner/repo */}
      {devKind === 'repo' && structured.repoName && (
        <span className="font-mono text-xs text-ink-muted truncate">{structured.repoName}</span>
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
          ↗ {hostname ?? item.sourceUrl}
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
