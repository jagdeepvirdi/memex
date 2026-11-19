import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, KeyboardEvent, ReactNode } from 'react'
import { useId } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-bg hover:bg-accent/90 border border-transparent',
  secondary: 'bg-surface-2 text-ink border border-white/10 hover:bg-surface-hover',
  quiet: 'bg-transparent text-ink-muted border border-transparent hover:bg-white/5 hover:text-ink',
  danger: 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/15',
}

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'min-h-8 px-3 text-sm',
  md: 'min-h-10 px-4 text-sm',
  lg: 'min-h-11 px-5 text-base',
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

export function Button({ variant = 'secondary', size = 'md', loading = false, disabled, type = 'button', className = '', children, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-btn font-medium transition-colors duration-150 ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-50 ${buttonVariants[variant]} ${buttonSizes[size]} ${className}`}
    >
      {loading && <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />}
      {children}
    </button>
  )
}

export type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  hint?: string
  error?: string
}

export function TextField({ id, label, hint, error, className = '', ...props }: TextFieldProps) {
  const generatedId = useId()
  const inputId = id ?? props.name ?? generatedId
  const hintId = hint ? `${inputId}-hint` : undefined
  const errorId = error ? `${inputId}-error` : undefined
  return (
    <div className="grid gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-ink">{label}</label>
      <input
        {...props}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        className={`min-h-10 w-full rounded-input border bg-bg px-3 py-2 text-ink placeholder:text-ink-muted/70 focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${error ? 'border-red-400' : 'border-white/10'} ${className}`}
      />
      {hint && <p id={hintId} className="text-sm text-ink-muted">{hint}</p>}
      {error && <p id={errorId} className="text-sm text-red-400" role="alert">{error}</p>}
    </div>
  )
}

export function SearchField(props: Omit<TextFieldProps, 'type'>) {
  return <TextField {...props} type="search" />
}

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`rounded-card border border-white/10 bg-surface-card shadow-card ${className}`} />
}

type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'
const badgeTones: Record<BadgeTone, string> = {
  neutral: 'border-white/10 bg-white/5 text-ink-muted',
  accent: 'border-accent/25 bg-accent/10 text-accent',
  success: 'border-green-400/25 bg-green-400/10 text-green-400',
  warning: 'border-amber-400/25 bg-amber-400/10 text-amber-400',
  danger: 'border-red-400/25 bg-red-400/10 text-red-400',
}

export function Badge({ tone = 'neutral', className = '', ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return <span {...props} className={`inline-flex items-center rounded-badge border px-2 py-0.5 text-xs font-medium leading-5 ${badgeTones[tone]} ${className}`} />
}

export function Tabs({ label, value, onChange, items }: {
  label: string
  value: string
  onChange: (value: string) => void
  items: Array<{ value: string; label: ReactNode; disabled?: boolean }>
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const enabled = items.filter(item => !item.disabled)
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key) || enabled.length === 0) return
    event.preventDefault()
    const currentIndex = enabled.findIndex(item => item.value === value)
    const nextIndex = event.key === 'Home' ? 0
      : event.key === 'End' ? enabled.length - 1
      : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length
    const next = enabled[nextIndex]
    onChange(next.value)
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[items.findIndex(item => item.value === next.value)]?.focus()
  }
  return (
    <div role="tablist" aria-label={label} onKeyDown={handleKeyDown} className="inline-flex max-w-full gap-1 overflow-x-auto rounded-control border border-white/10 bg-bg-2 p-1">
      {items.map(item => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          disabled={item.disabled}
          tabIndex={value === item.value ? 0 : -1}
          onClick={() => onChange(item.value)}
          className="min-h-9 shrink-0 rounded-sm px-3 text-sm text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent aria-selected:bg-surface aria-selected:text-ink aria-selected:shadow-card disabled:opacity-50"
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

export function EmptyState({ title, children, action, className = '' }: { title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <section className={`grid justify-items-center gap-3 rounded-panel border border-dashed border-white/15 px-6 py-10 text-center ${className}`}>
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {children && <div className="max-w-md text-sm text-ink-muted">{children}</div>}
      {action}
    </section>
  )
}

export function LoadingState({ label = 'Loading', className = '' }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={`inline-flex items-center gap-2 text-sm text-ink-muted ${className}`}>
      <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
      <span>{label}</span>
    </div>
  )
}
