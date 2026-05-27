import type { Item } from '@shared/types'
import { CardBase, CardTitle, CardFooter, TypeBadge, Muted } from './CardBase'

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

export default function LinkCard({ item, onClick }: Props) {
  const sourceLabel = SOURCE_LABEL[item.source] ?? 'Link'
  const sourceColor = SOURCE_COLOR[item.source] ?? '#9CC4E8'

  const summary = (item.structured as Record<string, unknown>)?.summary as string | undefined
  const preview = (summary ?? item.content).trim().replace(/\s+/g, ' ').slice(0, 100)

  const hostname = item.sourceUrl
    ? (() => { try { return new URL(item.sourceUrl).hostname.replace('www.', '') } catch { return item.sourceUrl } })()
    : null

  return (
    <CardBase onClick={onClick}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <TypeBadge type="link" label={sourceLabel} />
        {hostname && (
          <Muted className="truncate max-w-[120px]">{hostname}</Muted>
        )}
      </div>

      {/* Title */}
      <CardTitle>{item.title}</CardTitle>

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

      <CardFooter tags={item.tags} />
    </CardBase>
  )
}
