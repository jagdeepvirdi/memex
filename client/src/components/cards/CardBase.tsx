import type { ReactNode } from 'react'
import type { ItemType } from '@shared/types'

// ── Type badge config ─────────────────────────────────────────────────────────

const TYPE_BADGE: Record<ItemType, { label: string; color: string }> = {
  recipe:   { label: 'Recipe',   color: '#E8B4A0' },
  media:    { label: 'Movie',    color: '#BFB0E0' },
  book:     { label: 'Book',     color: '#A8C5A0' },
  note:     { label: 'Note',     color: '#D6CCB7' },
  link:     { label: 'Link',     color: '#9CC4E8' },
  stock:    { label: 'Stock',    color: '#F59E0B' },
  spec:     { label: 'Spec',     color: '#8C8472' },
  password: { label: 'Vault',    color: '#5EEAD4' },
  place:    { label: 'Place',    color: '#FBBF24' },
}

interface TypeBadgeProps {
  type: ItemType
  label?: string
}

export function TypeBadge({ type, label }: TypeBadgeProps) {
  const meta = TYPE_BADGE[type]
  return (
    <span
      className="badge"
      style={{ color: meta.color, borderColor: `${meta.color}55` }}
    >
      <span className="dot" style={{ background: meta.color }} />
      {label ?? meta.label}
    </span>
  )
}

// ── Tag pill ──────────────────────────────────────────────────────────────────

export function TagPill({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-body"
      style={{
        background: 'rgba(245,230,200,0.06)',
        color: '#8C8472',
        border: '1px solid rgba(245,230,200,0.08)',
      }}>
      {name}
    </span>
  )
}

// ── Card wrapper ──────────────────────────────────────────────────────────────

interface CardBaseProps {
  children: ReactNode
  onClick?: () => void
  className?: string
}

export function CardBase({ children, onClick, className = '' }: CardBaseProps) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
      className={`paper flex flex-col gap-3 p-4 transition-all duration-150 ${
        onClick
          ? 'cursor-pointer hover:border-line-strong hover:bg-surface-hover'
          : ''
      } ${className}`}
      style={onClick ? undefined : { cursor: 'default' }}
    >
      {children}
    </div>
  )
}

// ── Card title ────────────────────────────────────────────────────────────────

export function CardTitle({ children }: { children: ReactNode }) {
  return (
    <h3
      className="font-display text-ink leading-snug line-clamp-2"
      style={{ fontSize: '15px', letterSpacing: '-0.01em' }}
    >
      {children}
    </h3>
  )
}

// ── Card footer (tags row) ────────────────────────────────────────────────────

export function CardFooter({ tags, extra }: { tags: string[]; extra?: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-auto pt-1">
      {tags.slice(0, 3).map((t) => (
        <TagPill key={t} name={t} />
      ))}
      {extra && <div className="ml-auto">{extra}</div>}
    </div>
  )
}

// ── Muted text ────────────────────────────────────────────────────────────────

export function Muted({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`font-body text-ink-muted ${className}`} style={{ fontSize: '12px' }}>
      {children}
    </span>
  )
}
