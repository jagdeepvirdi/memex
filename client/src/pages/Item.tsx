import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Calendar, Tag, Folder, ExternalLink, Trash2, Edit2, Loader2, Save, X, Sparkles, Shield } from 'lucide-react'
import { toast } from 'sonner'
import Sidebar from '../components/sidebar/Sidebar'
import ItemCard from '../components/cards/ItemCard'
import Editor from '../components/Editor'
import { apiFetch } from '../lib/api'
import type { Item } from '../../../shared/types'

export default function ItemPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [item, setItem] = useState<Item | null>(null)
  const [related, setRelated] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingRelated, setLoadingRelated] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!id) return;
    setLoading(true)
    apiFetch<Item>(`/items/${id}`)
      .then(res => {
        setItem(res)
        setEditedContent(res.content)
        
        setLoadingRelated(true)
        return apiFetch<Item[]>(`/items/${id}/related`)
      })
      .then(setRelated)
      .catch(err => {
        console.error(err)
        toast.error('Failed to load item')
      })
      .finally(() => {
        setLoading(false)
        setLoadingRelated(false)
      })
  }, [id])

  const handleDelete = async () => {
    if (!item || !confirm('Are you sure you want to delete this item?')) return
    try {
      await apiFetch(`/items/${item.id}`, { method: 'DELETE' })
      toast.success('Item deleted')
      navigate('/')
    } catch (err) {
      toast.error('Failed to delete item')
      console.error(err)
    }
  }

  const handleSave = async () => {
    if (!item) return
    setSaving(true)
    try {
      const updated = await apiFetch<Item>(`/items/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({ content: editedContent })
      })
      setItem(updated)
      setIsEditing(false)
      toast.success('Changes saved')
    } catch (err) {
      toast.error('Failed to save changes')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex">
        <Sidebar activeSection="dashboard" />
        <div className="flex-1 flex flex-col items-center justify-center text-ink-muted gap-4">
          <Loader2 className="animate-spin" size={40} />
          <p className="font-mono text-sm">Loading item details...</p>
        </div>
      </div>
    )
  }

  if (!item) {
    return (
      <div className="min-h-screen bg-bg flex">
        <Sidebar activeSection="dashboard" />
        <div className="flex-1 flex flex-col items-center justify-center text-ink-muted gap-6">
          <h2 className="font-display text-2xl text-ink">Item not found</h2>
          <Link to="/" className="text-accent hover:underline flex items-center gap-2">
            <ArrowLeft size={16} /> Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg flex">
      <Sidebar activeSection="dashboard" />

      <main className="flex-1 flex flex-col relative overflow-y-auto">
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-8 bg-bg/80 backdrop-blur-md sticky top-0 z-10 shrink-0">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate(-1)}
              className="text-ink-muted hover:text-ink transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="w-1 h-1 bg-white/20 rounded-full" />
            <span className="text-[10px] text-ink-muted uppercase tracking-widest font-bold">
              {item.type}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {!isEditing ? (
              <>
                <button 
                  onClick={() => setIsEditing(true)}
                  className="p-2 text-ink-muted hover:text-accent hover:bg-accent/10 rounded-lg transition-all"
                  title="Edit Item"
                >
                  <Edit2 size={18} />
                </button>
                <button 
                  onClick={handleDelete}
                  className="p-2 text-ink-muted hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                  title="Delete Item"
                >
                  <Trash2 size={18} />
                </button>
              </>
            ) : (
              <>
                <button 
                  onClick={() => { setIsEditing(false); setEditedContent(item.content); }}
                  className="p-2 text-ink-muted hover:text-ink hover:bg-white/5 rounded-lg transition-all"
                  title="Cancel"
                >
                  <X size={18} />
                </button>
                <button 
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-accent text-bg px-4 py-1.5 rounded-lg font-bold flex items-center gap-2 text-sm shadow-lg shadow-accent/20"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Save
                </button>
              </>
            )}
          </div>
        </header>

        <div className="p-12 max-w-4xl mx-auto w-full flex flex-col gap-12">
          {/* Title Area */}
          <div className="flex flex-col gap-6">
            <h1 className="font-display text-4xl text-ink leading-tight">{item.title}</h1>
            
            <div className="flex flex-wrap gap-4 text-xs">
              <div className="flex items-center gap-2 text-ink-muted bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
                <Calendar size={14} className="text-accent" />
                {new Date(item.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' })}
              </div>
              
              {item.categories.length > 0 && (
                <div className="flex items-center gap-2 text-ink-muted bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
                  <Folder size={14} className="text-accent" />
                  {item.categories.join(' › ')}
                </div>
              )}

              {item.sourceUrl && (
                <a 
                  href={item.sourceUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-accent bg-accent/5 px-3 py-1.5 rounded-lg border border-accent/10 hover:bg-accent/10 transition-all"
                >
                  <ExternalLink size={14} />
                  Original Source
                </a>
              )}
            </div>
          </div>

          {/* Content Area */}
          <div className="bg-surface/30 border border-white/5 rounded-2xl overflow-hidden min-h-[400px] flex flex-col shadow-2xl">
            <div className="px-6 py-3 border-b border-white/5 bg-white/5 flex items-center justify-between">
               <span className="text-[10px] text-ink-muted uppercase tracking-widest font-bold">Content</span>
               {item.encrypted && <span className="text-[10px] text-green-500 font-mono flex items-center gap-1"><Shield size={10} /> Encrypted</span>}
            </div>
            
            <div className="p-8 flex-1">
               {isEditing ? (
                 <Editor content={editedContent} onChange={setEditedContent} />
               ) : (
                 <Editor content={item.content} onChange={() => {}} readOnly />
               )}
            </div>
          </div>

          {/* Tags */}
          {item.tags.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="text-[10px] text-ink-muted uppercase tracking-widest font-bold flex items-center gap-2">
                <Tag size={12} /> Tags
              </h3>
              <div className="flex flex-wrap gap-2">
                {item.tags.map(tag => (
                  <span key={tag} className="px-3 py-1 bg-white/5 border border-white/5 rounded-full text-xs text-ink-muted">
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Related Items Section */}
          <section className="mt-12 flex flex-col gap-6 pb-20">
             <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-accent/10 text-accent rounded-lg flex items-center justify-center">
                   <Sparkles size={18} />
                </div>
                <h3 className="font-display text-xl text-ink">Related Intelligence</h3>
             </div>

             {loadingRelated ? (
                <div className="flex justify-center py-12">
                   <Loader2 className="animate-spin text-ink-muted" size={24} />
                </div>
             ) : related.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   {related.map(rel => (
                      <ItemCard key={rel.id} item={rel} onClick={() => navigate(`/item/${rel.id}`)} />
                   ))}
                </div>
             ) : (
                <p className="text-sm text-ink-muted italic bg-white/5 p-8 rounded-xl border border-dashed border-white/5 text-center">
                   No semantically related items found yet.
                </p>
             )}
          </section>
        </div>
      </main>
    </div>
  )
}
