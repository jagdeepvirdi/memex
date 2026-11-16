import type { ReactNode } from 'react'

interface SectionProps {
  icon?: ReactNode
  title: string
  description?: string
  children: ReactNode
}

/** A titled card: the building block every Settings tab is made of. */
export function SettingsSection({ icon, title, description, children }: SectionProps) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <div className="flex items-center gap-3">
          {icon}
          <h2 className="font-display text-xl text-ink">{title}</h2>
        </div>
        {description && <p className="text-xs text-ink-muted mt-1.5 max-w-xl">{description}</p>}
      </div>
      <div className="bg-surface/50 border border-white/5 rounded-2xl p-6 space-y-6">{children}</div>
    </section>
  )
}

interface RowProps {
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  tone?: 'default' | 'danger'
}

/** A label + explanation on the left and its control on the right. */
export function SettingRow({ title, description, children, tone = 'default' }: RowProps) {
  return (
    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <p className={`text-sm font-medium ${tone === 'danger' ? 'text-red-400' : 'text-ink'}`}>{title}</p>
        {description && <p className="text-xs text-ink-muted mt-0.5 max-w-md">{description}</p>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  )
}

export function Divider() {
  return <div className="h-px bg-white/5" />
}
