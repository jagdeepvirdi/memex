import type { Item, BookData } from '@shared/types'
import { CardBase, CardTitle, CardFooter, TypeBadge, Muted } from './CardBase'

interface Props {
  item: Item
  onClick?: () => void
}

const STATUS_LABEL: Record<NonNullable<BookData['status']>, { label: string; color: string }> = {
  'want-to-read': { label: 'Want to read', color: '#8C8472' },
  reading:        { label: 'Reading',       color: '#F59E0B' },
  read:           { label: 'Read ✓',        color: '#A8C5A0' },
}

export default function BookCard({ item, onClick }: Props) {
  const s = item.structured as Partial<BookData>
  const status = (s.status && STATUS_LABEL[s.status]) || STATUS_LABEL['want-to-read']

  return (
    <CardBase onClick={onClick}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <TypeBadge type="book" />
        {s.year && <Muted>{s.year}</Muted>}
      </div>

      {/* Title */}
      <CardTitle>{item.title}</CardTitle>

      {/* Author + genre */}
      <div className="flex flex-wrap items-center gap-2">
        {s.author && <Muted>by {s.author}</Muted>}
        {s.genre && (
          <span
            className="font-body text-xs px-2 py-0.5 rounded-full"
            style={{
              background: 'rgba(168,197,160,0.12)',
              color: '#A8C5A0',
              border: '1px solid rgba(168,197,160,0.2)',
            }}
          >
            {s.genre}
          </span>
        )}
      </div>

      {/* Reading status */}
      <span
        className="self-start inline-flex items-center gap-1.5 font-body text-xs"
        style={{ color: status.color }}
      >
        <span className="w-2 h-2 rounded-full" style={{ background: status.color }} />
        {status.label}
      </span>

      <CardFooter tags={item.tags} />
    </CardBase>
  )
}
