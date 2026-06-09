import type { Item } from '@shared/types'
import { CardBase, CardTitle, CardFooter, TypeBadge, Muted } from './CardBase'
import { Calendar } from 'lucide-react'

interface Props {
  item: Item
  onClick?: () => void
}

export default function NoteCard({ item, onClick }: Props) {
  const structuredSummary = (item.structured as Record<string, unknown>)?.summary as string | undefined
  const preview = structuredSummary
    ? structuredSummary.slice(0, 160)
    : item.content.trim().replace(/\s+/g, ' ').slice(0, 120)
  const truncated = structuredSummary
    ? structuredSummary.length > 160
    : item.content.trim().length > 120

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

      {/* Summary or content preview */}
      {preview && (
        <Muted>
          {preview}
          {truncated && '…'}
        </Muted>
      )}

      <div className="flex items-center gap-1 text-[10px] text-ink-muted/60 mt-1">
        <Calendar size={10} />
        {new Date(item.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
      </div>

      <CardFooter tags={item.tags} />
    </CardBase>
  )
}
