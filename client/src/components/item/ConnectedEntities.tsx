import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Network, User, Building2, MapPin, GitBranch } from 'lucide-react'
import { fetchItemEntities } from '../../lib/api'
import type { ConnectedEntity, EntityType } from '../../../../shared/types'

const ROLE_LABEL: Record<string, string> = {
  repo: 'Repository',
  owner: 'Owner',
  creator: 'Shared by',
  channel: 'Channel',
  director: 'Director',
  cast: 'Cast',
  author: 'Author',
  city: 'City',
  country: 'Country',
  exchange: 'Exchange',
}

export function roleLabel(roles: string[]): string {
  return roles.map(r => ROLE_LABEL[r] ?? r).join(' · ') || 'Linked'
}

function EntityIcon({ type, roles }: { type: EntityType; roles: string[] }) {
  const props = { size: 13, className: 'shrink-0 text-ink-muted' }
  if (roles.includes('repo')) return <GitBranch {...props} />
  if (type === 'person') return <User {...props} />
  if (type === 'organization') return <Building2 {...props} />
  if (type === 'place') return <MapPin {...props} />
  return <Network {...props} />
}

/**
 * "Connected": the people, organisations, repos and places this item is linked to, and which other
 * items share each one ("everything by this creator"). Renders nothing until there is something to show.
 */
export default function ConnectedEntities({ itemId }: { itemId: string }) {
  const [entities, setEntities] = useState<ConnectedEntity[]>([])

  useEffect(() => {
    let live = true
    setEntities([])
    fetchItemEntities(itemId)
      .then(list => { if (live) setEntities(list) })
      .catch(() => {}) // a missing graph is not worth an error toast
    return () => { live = false }
  }, [itemId])

  if (entities.length === 0) return null

  return (
    <section data-testid="connected" className="flex flex-col gap-3">
      <h3 className="text-[10px] text-ink-muted uppercase tracking-widest font-bold flex items-center gap-2">
        <Network size={12} /> Connected
      </h3>
      <ul className="flex flex-col gap-2">
        {entities.map(e => (
          <li key={e.id} data-testid="connected-entity" className="bg-white/3 border border-white/5 rounded-xl px-4 py-3 flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-sm">
              <EntityIcon type={e.type} roles={e.roles} />
              <span className="text-ink font-medium break-all">{e.name}</span>
              <span className="text-[10px] uppercase tracking-wide text-ink-muted bg-white/5 px-1.5 py-0.5 rounded shrink-0">
                {roleLabel(e.roles)}
              </span>
              <span className="ml-auto text-xs text-ink-muted shrink-0">
                {e.total === 0 ? 'no other items' : `${e.total} other item${e.total === 1 ? '' : 's'}`}
              </span>
            </div>
            {e.others.length > 0 && (
              <ul className="pl-5 flex flex-col gap-1">
                {e.others.map(o => (
                  <li key={o.id} className="text-xs">
                    <Link to={`/item/${o.id}`} className="text-accent hover:underline">{o.title || 'Untitled'}</Link>
                    <span className="text-ink-muted/60"> · {o.type}</span>
                  </li>
                ))}
                {e.total > e.others.length && (
                  <li className="text-xs text-ink-muted">+{e.total - e.others.length} more</li>
                )}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
