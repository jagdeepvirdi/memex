import type { Item, SpecData } from '@shared/types'
import { CardBase, CardTitle, CardFooter, TypeBadge, Muted } from './CardBase'

interface Props {
  item: Item
  onClick?: () => void
}

export default function SpecCard({ item, onClick }: Props) {
  const s = item.structured as Partial<SpecData>

  // Show up to 4 key-value pairs from structured data
  const pairs = Object.entries(s ?? {}).slice(0, 4)

  return (
    <CardBase onClick={onClick}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <TypeBadge type="spec" />
      </div>

      {/* Title */}
      <CardTitle>{item.title}</CardTitle>

      {/* Key-value pairs */}
      {pairs.length > 0 ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {pairs.map(([key, value]) => (
            <div key={key} className="flex flex-col min-w-0">
              <Muted className="truncate capitalize">{key}</Muted>
              <span
                className="font-mono truncate"
                style={{ fontSize: '12px', color: '#F2EAD8' }}
              >
                {String(value)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <Muted>{item.content.slice(0, 80)}</Muted>
      )}

      {Object.keys(s ?? {}).length > 4 && (
        <Muted>+{Object.keys(s ?? {}).length - 4} more fields</Muted>
      )}

      <CardFooter tags={item.tags} />
    </CardBase>
  )
}
