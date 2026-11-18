import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, Tag, Folder, Calendar, ExternalLink } from 'lucide-react'
import { fetchSharedItem } from '../lib/api'
import type { Item } from '../../../shared/types'

function TypeBadge({ type }: { type: string }) {
  const colours: Record<string, string> = {
    note: 'bg-white/10 text-gray-300',
    recipe: 'bg-amber-500/20 text-amber-300',
    media: 'bg-blue-500/20 text-blue-300',
    book: 'bg-purple-500/20 text-purple-300',
    place: 'bg-green-500/20 text-green-300',
    link: 'bg-sky-500/20 text-sky-300',
    stock: 'bg-emerald-500/20 text-emerald-300',
    spec: 'bg-orange-500/20 text-orange-300',
  }
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold uppercase tracking-wide ${colours[type] ?? 'bg-white/10 text-gray-300'}`}>
      {type}
    </span>
  )
}

export default function PublicItemPage() {
  const { token } = useParams<{ token: string }>()
  const [item, setItem] = useState<Item | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    fetchSharedItem(token)
      .then(setItem)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [token])

  return (
    <div className="min-h-screen bg-bg text-ink-primary font-sans">
      {/* Minimal top bar */}
      <div className="border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-accent rounded flex items-center justify-center text-bg font-bold text-xs">M</div>
          <span className="text-sm font-medium text-ink-dimmed">Memex · Shared Item</span>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-6 py-12">
        {loading && (
          <div className="flex items-center gap-3 text-ink-dimmed py-20 justify-center">
            <Loader2 size={24} className="animate-spin" />
            <span>Loading…</span>
          </div>
        )}

        {error && (
          <div className="py-20 text-center">
            <p className="text-lg font-semibold text-ink-primary mb-2">Item not found</p>
            <p className="text-sm text-ink-dimmed">This link may have expired or sharing may have been revoked.</p>
          </div>
        )}

        {item && !loading && (
          <div className="space-y-8">
            {/* Header */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <TypeBadge type={item.type} />
                {item.categories.length > 0 && (
                  <span className="flex items-center gap-1.5 text-xs text-ink-dimmed">
                    <Folder size={12} />
                    {item.categories.join(' › ')}
                  </span>
                )}
                <span className="flex items-center gap-1.5 text-xs text-ink-dimmed">
                  <Calendar size={12} />
                  {new Date(item.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' })}
                </span>
              </div>

              <h1 className="text-3xl font-bold text-ink-primary leading-tight">{item.title}</h1>

              {item.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 items-center">
                  <Tag size={12} className="text-ink-dimmed" />
                  {item.tags.map(t => (
                    <span key={t} className="text-xs text-accent/80">#{t}</span>
                  ))}
                </div>
              )}

              {item.sourceUrl && (
                <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-accent hover:text-accent/80 transition-colors">
                  <ExternalLink size={12} /> Original source
                </a>
              )}
            </div>

            {/* AI summary */}
            {!!(item.structured as Record<string, unknown>)?.summary && (
              <blockquote className="border-l-2 border-accent/40 pl-4 text-sm text-ink-dimmed italic leading-relaxed">
                {String((item.structured as Record<string, unknown>).summary)}
              </blockquote>
            )}

            {/* Content */}
            <div className="bg-surface border border-white/5 rounded-xl p-8">
              <div className="prose prose-invert prose-sm max-w-none text-ink-primary/80 leading-relaxed whitespace-pre-wrap break-words">
                {item.content}
              </div>
            </div>

            {/* Structured data (non-summary fields) */}
            {Object.keys(item.structured as Record<string, unknown>).filter(k => k !== 'summary').length > 0 && (
              <div className="bg-surface border border-white/5 rounded-xl p-6">
                <p className="text-[10px] text-ink-dimmed uppercase tracking-widest font-bold mb-4">Details</p>
                <dl className="grid grid-cols-2 gap-x-8 gap-y-3">
                  {Object.entries(item.structured as Record<string, unknown>)
                    .filter(([k, v]) => k !== 'summary' && v !== null && v !== undefined && v !== '')
                    .map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-[10px] text-ink-dimmed uppercase tracking-wide font-bold">{k}</dt>
                        <dd className="text-sm text-ink-primary mt-0.5">
                          {Array.isArray(v) ? v.join(', ') : String(v)}
                        </dd>
                      </div>
                    ))}
                </dl>
              </div>
            )}

            {/* Footer */}
            <p className="text-[11px] text-ink-dimmed/50 text-center pt-4 border-t border-white/5">
              Shared via Memex · Personal Knowledge OS
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
