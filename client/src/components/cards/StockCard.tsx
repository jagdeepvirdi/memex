import type { Item, StockData } from '@shared/types'
import { CardBase, CardTitle, CardFooter, TypeBadge, Muted } from './CardBase'

interface Props {
  item: Item
  onClick?: () => void
}

export default function StockCard({ item, onClick }: Props) {
  const s = item.structured as Partial<StockData>

  const notes = item.content.trim().replace(/\s+/g, ' ').slice(0, 100)

  return (
    <CardBase onClick={onClick}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <TypeBadge type="stock" />
        {s.exchange && <Muted>{s.exchange}</Muted>}
      </div>

      {/* Ticker — large mono */}
      {s.ticker && (
        <span
          className="font-mono font-semibold tracking-wide"
          style={{ fontSize: '22px', color: '#F59E0B', letterSpacing: '0.04em' }}
        >
          {s.ticker.toUpperCase()}
        </span>
      )}

      {/* Title (company name if different from ticker) */}
      {item.title !== s.ticker && (
        <CardTitle>{item.title}</CardTitle>
      )}

      {/* Personal notes preview */}
      {notes && (
        <Muted>
          {notes}
          {item.content.trim().length > 100 ? '…' : ''}
        </Muted>
      )}

      <CardFooter tags={item.tags} />
    </CardBase>
  )
}
