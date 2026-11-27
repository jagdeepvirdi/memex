import { useEffect } from 'react'
import { FlaskConical } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useDemoStore } from '../store/demoStore'

/**
 * "Demo mode" pill for the header: shown while sample data is loaded, and it takes you to where it is cleared.
 * Renders nothing until the server has answered, and nothing when there is no sample data.
 */
export function DemoBanner() {
  const navigate = useNavigate()
  const items = useDemoStore((s) => s.items)
  const refresh = useDemoStore((s) => s.refresh)

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (!items) return null
  return (
    <button
      type="button"
      data-testid="demo-banner"
      onClick={() => navigate('/settings/library')}
      aria-label="Demo mode: sample data is loaded. Open Library settings to clear it."
      className="flex items-center gap-1.5 px-2.5 py-1 max-sm:px-2 rounded-lg border border-accent/30 bg-accent/10 text-accent text-[10px] font-bold font-mono uppercase tracking-wide hover:bg-accent/20 transition-colors"
      title={`${items} sample items are loaded. Click to clear them in Settings.`}
    >
      <FlaskConical size={12} aria-hidden="true" />
      <span className="max-sm:hidden">Demo mode</span>
    </button>
  )
}
