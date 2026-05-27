import type { Item, MediaData } from '@shared/types'
import { CardBase, CardTitle, CardFooter, TypeBadge, Muted } from './CardBase'

interface Props {
  item: Item
  onClick?: () => void
}

export default function MediaCard({ item, onClick }: Props) {
  const s = item.structured as Partial<MediaData>

  return (
    <CardBase onClick={onClick}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <TypeBadge type="media" />
        {s.year && <Muted>{s.year}</Muted>}
      </div>

      {/* Title */}
      <CardTitle>{item.title}</CardTitle>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-2">
        {s.genre && (
          <span
            className="font-body text-xs px-2 py-0.5 rounded-full"
            style={{
              background: 'rgba(191,176,224,0.12)',
              color: '#BFB0E0',
              border: '1px solid rgba(191,176,224,0.2)',
            }}
          >
            {s.genre}
          </span>
        )}
        {s.director && <Muted>dir. {s.director}</Muted>}
      </div>

      {/* Watch status */}
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 font-body text-xs"
          style={{ color: s.watched ? '#A8C5A0' : '#8C8472' }}
        >
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: s.watched ? '#A8C5A0' : '#5A5446' }}
          />
          {s.watched ? 'Watched' : 'Want to watch'}
        </span>
      </div>

      <CardFooter tags={item.tags} />
    </CardBase>
  )
}
