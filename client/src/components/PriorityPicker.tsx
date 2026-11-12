import type { ItemPriority } from '../../../shared/types'

interface Props {
  value: ItemPriority | null | undefined
  onChange: (next: ItemPriority | null) => void
  disabled?: boolean
}

const OPTIONS: Array<{ value: ItemPriority; label: string; active: string }> = [
  { value: 'essential', label: 'Essential', active: 'bg-accent/15 text-accent border-accent/40' },
  { value: 'useful', label: 'Useful', active: 'bg-sky-400/15 text-sky-300 border-sky-400/40' },
  { value: 'skip', label: 'Skip', active: 'bg-white/10 text-ink-muted border-white/20' },
]

/** Read-only chip for cards and tables. Renders nothing when the item has not been triaged. */
export function PriorityBadge({ value }: { value: ItemPriority | null | undefined }) {
  const opt = OPTIONS.find((o) => o.value === value)
  if (!opt) return null
  return (
    <span
      data-testid="priority-badge"
      className={`px-1.5 py-0.5 rounded-md border text-[10px] font-medium leading-none ${opt.active}`}
    >
      {opt.label}
    </span>
  )
}

/**
 * Three-way triage control. Clicking the active option clears it (back to "not triaged").
 * Priority is user-owned — the AI never sets or changes it.
 */
export default function PriorityPicker({ value, onChange, disabled }: Props) {
  return (
    <div role="group" aria-label="Priority" className="flex items-center gap-1.5">
      {OPTIONS.map((o) => {
        const selected = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onChange(selected ? null : o.value)}
            className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50 ${
              selected ? o.active : 'border-white/10 text-ink-muted hover:text-ink hover:bg-white/5'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
