import { useEffect, useState } from 'react'
import { FlaskConical, Loader2, Trash2 } from 'lucide-react'
import { useDemoStore } from '../../store/demoStore'
import { SettingRow } from './SettingsSection'
import type { Notify } from './settingsTabs'

interface Props {
  notify: Notify
}

const btn =
  'flex items-center gap-2 text-xs bg-white/5 hover:bg-white/10 text-ink border border-white/10 px-4 py-2 rounded-lg font-medium transition-all disabled:opacity-50 shrink-0'

/** Load or clear the sample library. Clearing asks first, and only ever removes the sample items. */
export function SampleDataPanel({ notify }: Props) {
  const { items, busy, refresh, load, clear } = useDemoStore()
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    void refresh()
  }, [refresh])

  const run = async (action: () => Promise<unknown>, done: (r: never) => string, failed: string) => {
    try {
      const r = await action()
      notify.success(done(r as never))
    } catch (err) {
      notify.error(err instanceof Error && err.message ? err.message : failed)
    } finally {
      setConfirming(false)
    }
  }

  if (items === null) return <p className="text-xs text-ink-muted">Checking for sample data...</p>

  if (items === 0) {
    return (
      <SettingRow
        title="Try Memex with sample data"
        description="Adds about forty made-up notes, recipes, films, books, places and links so you can look around. No AI is called, and one click removes them again."
      >
        <button
          className={btn}
          disabled={busy}
          onClick={() => run(load, (n: number) => `Loaded ${n} sample items`, 'Could not load the sample data')}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />}
          Load sample data
        </button>
      </SettingRow>
    )
  }

  return (
    <SettingRow
      title={`Sample data is loaded (${items} items)`}
      description="Clearing removes only the sample items. Anything you added yourself stays."
    >
      {confirming ? (
        <div className="flex items-center gap-2">
          <button
            className={`${btn} !bg-red-500/10 !border-red-500/30 text-red-300`}
            disabled={busy}
            onClick={() => run(clear, (r: { items: number }) => `Removed ${r.items} sample items`, 'Could not clear the sample data')}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Yes, clear the sample data
          </button>
          <button className={btn} disabled={busy} onClick={() => setConfirming(false)}>Keep it</button>
        </div>
      ) : (
        <button className={btn} onClick={() => setConfirming(true)}>
          <Trash2 size={14} />
          Clear sample data
        </button>
      )}
    </SettingRow>
  )
}
