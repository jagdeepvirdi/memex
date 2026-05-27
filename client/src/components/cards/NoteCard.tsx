import type { Item } from '@shared/types'
import { CardBase, CardTitle, CardFooter, TypeBadge, Muted } from './CardBase'

interface Props {
  item: Item
  onClick?: () => void
}

export default function NoteCard({ item, onClick }: Props) {
  // Show first ~120 chars of content as a preview
  const preview = item.content.trim().replace(/\s+/g, ' ').slice(0, 120)
  const truncated = item.content.trim().length > 120

  const source = item.source !== 'manual' ? item.source : null

  return (
    <CardBase onClick={onClick}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <TypeBadge type="note" />
        {source && <Muted className="capitalize">{source}</Muted>}
      </div>

      {/* Title */}
      <CardTitle>{item.title}</CardTitle>

      {/* Content preview */}
      {preview && (
        <Muted>
          {preview}
          {truncated && '…'}
        </Muted>
      )}

      <CardFooter tags={item.tags} />
    </CardBase>
  )
}
