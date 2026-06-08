import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Calendar, Tag, Folder, ExternalLink, Trash2, Edit2, Loader2, Save, X, Sparkles, Shield, Plus, History, ChevronDown, ChevronUp, Check, Bot, Bell, BellOff, Share2, Copy, Link as LinkIcon } from 'lucide-react'
import { toast } from 'sonner'
import Sidebar from '../components/sidebar/Sidebar'
import { AppHeader } from '../components/AppHeader'
import ItemCard from '../components/cards/ItemCard'
import Editor from '../components/Editor'
import { apiFetch, migrateToVault, fetchItemExtractions, applyExtraction, reClassifyItem, setReminder, shareItem, unshareItem, updateItem } from '../lib/api'
import { useVaultStore } from '../store/vaultStore'
import { encryptVaultItem } from '../lib/crypto'
import type { Item, ItemExtraction } from '../../../shared/types'

export default function ItemPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [item, setItem] = useState<Item | null>(null)
  const [related, setRelated] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingRelated, setLoadingRelated] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editedTitle, setEditedTitle] = useState('')
  const [editedContent, setEditedContent] = useState('')
  const [editedCategories, setEditedCategories] = useState('')
  const [editedTags, setEditedTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [extractions, setExtractions] = useState<ItemExtraction[]>([])
  const [showExtractions, setShowExtractions] = useState(false)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [reClassifying, setReClassifying] = useState(false)
  const [reminderInput, setReminderInput] = useState('')
  const [settingReminder, setSettingReminder] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [copiedShare, setCopiedShare] = useState(false)
  const [editingCategory, setEditingCategory] = useState(false)
  const [categoryValue, setCategoryValue] = useState('')
  const [savingCategory, setSavingCategory] = useState(false)
  const categoryInputRef = useRef<HTMLInputElement>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)
  const { vaultKey, isLocked } = useVaultStore()

  useEffect(() => {
    if (!id) return;
    setLoading(true)
    apiFetch<Item>(`/items/${id}`)
      .then(res => {
        setItem(res)
        setEditedTitle(res.title)
        setEditedContent(res.content)
        setEditedCategories(res.categories.join(' > '))
        setEditedTags(res.tags)

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

    fetchItemExtractions(id).then(setExtractions).catch(() => {})
  }, [id])

  const handleApplyExtraction = async (extractionId: string) => {
    if (!id) return
    setApplyingId(extractionId)
    try {
      const updated = await applyExtraction(id, extractionId)
      setItem(updated)
      setExtractions(prev => prev.map(e => ({ ...e, applied: e.id === extractionId })))
      toast.success('Extraction applied')
    } catch (err) {
      toast.error('Failed to apply extraction')
      console.error(err)
    } finally {
      setApplyingId(null)
    }
  }

  const handleReClassify = async () => {
    if (!id) return
    setReClassifying(true)
    try {
      const newExt = await reClassifyItem(id)
      setExtractions(prev => [newExt, ...prev])
      setShowExtractions(true)
      toast.success('New extraction added — review below and apply if it looks right')
    } catch (err) {
      toast.error('Re-classification failed')
      console.error(err)
    } finally {
      setReClassifying(false)
    }
  }

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

  const handleMoveToVault = async () => {
    if (!item) return
    if (isLocked || !vaultKey) {
      toast('Vault is locked — unlock it to complete the move.', { icon: '🔒' })
      navigate(`/vault?migrateItemId=${item.id}`)
      return
    }

    if (!confirm('This will encrypt the content and move it to your secure vault. The original plain-text note will be deleted. Continue?')) return

    setMigrating(true)
    try {
      // 1. Encrypt content
      const { ciphertext, iv } = await encryptVaultItem(item.content, vaultKey)

      // 2. Call migration API
      await migrateToVault(item.id, {
        service: item.title,
        url: item.sourceUrl || undefined,
        ciphertext,
        iv
      })

      toast.success('Item moved to secure vault')
      navigate('/vault')
    } catch (err) {
      console.error(err)
      toast.error('Failed to move item to vault')
    } finally {
      setMigrating(false)
    }
  }

  const handleSave = async () => {
    if (!item) return
    setSaving(true)
    try {
      // Parse category path — accepts "Food > Savory > Indian" or "Food, Savory, Indian"
      const categories = editedCategories
        .split(/[>\/,]/)
        .map(s => s.trim())
        .filter(Boolean)

      const updated = await apiFetch<Item>(`/items/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: editedTitle,
          content: editedContent,
          categories,
          tags: editedTags,
        })
      })
      setItem(updated)
      setEditedCategories(updated.categories.join(' > '))
      setEditedTags(updated.tags)
      setIsEditing(false)
      toast.success('Changes saved')
    } catch (err) {
      toast.error('Failed to save changes')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const handleSetReminder = async () => {
    if (!id || !reminderInput) return
    setSettingReminder(true)
    try {
      const updated = await setReminder(id, new Date(reminderInput).toISOString())
      setItem(updated)
      toast.success('Reminder set')
      setReminderInput('')
    } catch {
      toast.error('Failed to set reminder')
    } finally {
      setSettingReminder(false)
    }
  }

  const handleClearReminder = async () => {
    if (!id) return
    setSettingReminder(true)
    try {
      const updated = await setReminder(id, null)
      setItem(updated)
      toast.success('Reminder cleared')
    } catch {
      toast.error('Failed to clear reminder')
    } finally {
      setSettingReminder(false)
    }
  }

  const shareUrl = (token: string) => `${window.location.origin}/share/${token}`

  const handleShare = async () => {
    if (!id) return
    setSharing(true)
    try {
      const { token } = await shareItem(id)
      setItem(prev => prev ? { ...prev, publicToken: token } : prev)
      toast.success('Public link created')
    } catch {
      toast.error('Failed to create share link')
    } finally {
      setSharing(false)
    }
  }

  const handleUnshare = async () => {
    if (!id) return
    setSharing(true)
    try {
      await unshareItem(id)
      setItem(prev => prev ? { ...prev, publicToken: null } : prev)
      toast.success('Sharing revoked')
    } catch {
      toast.error('Failed to revoke sharing')
    } finally {
      setSharing(false)
    }
  }

  const openCategoryEdit = () => {
    if (!item) return
    setCategoryValue(item.categories.join(' > '))
    setEditingCategory(true)
    setTimeout(() => categoryInputRef.current?.focus(), 50)
  }

  const handleSaveCategory = async () => {
    if (!item) return
    const categories = categoryValue.split(/[>\/,]/).map(s => s.trim()).filter(Boolean)
    if (categories.length === 0) { setEditingCategory(false); return }
    setSavingCategory(true)
    try {
      const updated = await updateItem(item.id, { categories })
      setItem(updated)
      setEditingCategory(false)
      toast.success('Category updated')
    } catch {
      toast.error('Failed to update category')
    } finally {
      setSavingCategory(false)
    }
  }

  const handleCopyShare = () => {
    if (!item?.publicToken) return
    navigator.clipboard.writeText(shareUrl(item.publicToken))
    setCopiedShare(true)
    setTimeout(() => setCopiedShare(false), 2000)
  }

  const startEditing = () => {
    if (!item) return
    setEditedTitle(item.title)
    setEditedContent(item.content)
    setEditedCategories(item.categories.join(' > '))
    setEditedTags(item.tags)
    setIsEditing(true)
  }

  const addTag = () => {
    const t = tagInput.trim().toLowerCase()
    if (t && !editedTags.includes(t)) setEditedTags(prev => [...prev, t])
    setTagInput('')
    tagInputRef.current?.focus()
  }

  const removeTag = (tag: string) => setEditedTags(prev => prev.filter(t => t !== tag))

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
        <AppHeader
          left={<div className="flex items-center gap-4"><button onClick={() => navigate(-1)} className="text-ink-muted hover:text-ink transition-colors"><ArrowLeft size={20} /></button><div className="w-1 h-1 bg-white/20 rounded-full" /><span className="text-[10px] text-ink-muted uppercase tracking-widest font-bold">{item.type}</span></div>}
          actions={<div className="flex items-center gap-3">{!isEditing ? (<><button onClick={handleMoveToVault} disabled={migrating} className="p-2 text-ink-muted hover:text-green-400 hover:bg-green-400/10 rounded-lg transition-all" title="Move to Secure Vault">{migrating ? <Loader2 size={18} className="animate-spin" /> : <Shield size={18} />}</button><button onClick={startEditing} className="p-2 text-ink-muted hover:text-accent hover:bg-accent/10 rounded-lg transition-all" title="Edit Item"><Edit2 size={18} /></button><button onClick={handleDelete} className="p-2 text-ink-muted hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all" title="Delete Item"><Trash2 size={18} /></button></>) : (<><button onClick={() => { setIsEditing(false); setEditedTitle(item.title); setEditedContent(item.content); setEditedCategories(item.categories.join(' > ')); setEditedTags(item.tags); }} className="p-2 text-ink-muted hover:text-ink hover:bg-white/5 rounded-lg transition-all" title="Cancel"><X size={18} /></button><button onClick={handleSave} disabled={saving} className="bg-accent text-bg px-4 py-1.5 rounded-lg font-bold flex items-center gap-2 text-sm shadow-lg shadow-accent/20">{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}Save</button></>)}</div>}
        />
        <AppHeader.Spacer />

        <div className="p-12 max-w-4xl mx-auto w-full flex flex-col gap-12">
          {/* Title Area */}
          <div className="flex flex-col gap-6">
            {isEditing ? (
              <input
                value={editedTitle}
                onChange={e => setEditedTitle(e.target.value)}
                className="font-display text-4xl text-ink leading-tight bg-transparent border-b-2 border-accent/50 outline-none w-full pb-1"
                placeholder="Title"
                autoFocus
              />
            ) : (
              <h1 className="font-display text-4xl text-ink leading-tight">{item.title}</h1>
            )}

            <div className="flex flex-wrap gap-4 text-xs">
              <div className="flex items-center gap-2 text-ink-muted bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
                <Calendar size={14} className="text-accent" />
                {new Date(item.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' })}
              </div>

              {isEditing ? (
                <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-lg border border-accent/30 flex-1 min-w-[260px]">
                  <Folder size={14} className="text-accent shrink-0" />
                  <input
                    value={editedCategories}
                    onChange={e => setEditedCategories(e.target.value)}
                    className="bg-transparent outline-none text-ink text-xs w-full"
                    placeholder="Food > Savory > Indian  (or type a new path)"
                  />
                </div>
              ) : editingCategory ? (
                <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-lg border border-accent/30 flex-1 min-w-[260px]">
                  <Folder size={14} className="text-accent shrink-0" />
                  <input
                    ref={categoryInputRef}
                    value={categoryValue}
                    onChange={e => setCategoryValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveCategory(); if (e.key === 'Escape') setEditingCategory(false) }}
                    className="bg-transparent outline-none text-ink text-xs w-full"
                    placeholder="Personal > Notes"
                  />
                  {savingCategory
                    ? <Loader2 size={13} className="animate-spin text-accent shrink-0" />
                    : <>
                        <button onClick={handleSaveCategory} className="text-green-400 hover:text-green-300 transition-colors shrink-0"><Check size={13} /></button>
                        <button onClick={() => setEditingCategory(false)} className="text-ink-muted hover:text-ink transition-colors shrink-0"><X size={13} /></button>
                      </>
                  }
                </div>
              ) : (
                <button
                  onClick={openCategoryEdit}
                  className="flex items-center gap-2 text-ink-muted bg-white/5 px-3 py-1.5 rounded-lg border border-white/5 hover:border-accent/30 hover:text-ink transition-all group"
                  title="Click to change category"
                >
                  <Folder size={14} className="text-accent" />
                  {item.categories.length > 0 ? item.categories.join(' › ') : <span className="italic opacity-50">No category</span>}
                  <Edit2 size={11} className="opacity-0 group-hover:opacity-50 transition-opacity ml-0.5" />
                </button>
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

              {item.intent && (
                <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium ${
                  item.intent === 'actionable'
                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                    : item.intent === 'idea'
                    ? 'bg-purple-500/10 border-purple-500/20 text-purple-400'
                    : 'bg-white/5 border-white/5 text-ink-muted'
                }`}>
                  {item.intent === 'actionable' ? '⚡' : item.intent === 'idea' ? '💡' : '📖'}
                  {item.intent}
                </span>
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
          {(item.tags.length > 0 || isEditing) && (
            <div className="flex flex-col gap-3">
              <h3 className="text-[10px] text-ink-muted uppercase tracking-widest font-bold flex items-center gap-2">
                <Tag size={12} /> Tags
              </h3>
              <div className="flex flex-wrap gap-2 items-center">
                {(isEditing ? editedTags : item.tags).map(tag => (
                  <span key={tag} className="flex items-center gap-1 px-3 py-1 bg-white/5 border border-white/5 rounded-full text-xs text-ink-muted group">
                    #{tag}
                    {isEditing && (
                      <button onClick={() => removeTag(tag)} className="text-ink-muted/50 hover:text-red-400 transition-colors ml-0.5">
                        <X size={10} />
                      </button>
                    )}
                  </span>
                ))}
                {isEditing && (
                  <div className="flex items-center gap-1">
                    <input
                      ref={tagInputRef}
                      value={tagInput}
                      onChange={e => setTagInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag() } }}
                      placeholder="Add tag..."
                      className="bg-white/5 border border-white/10 rounded-full px-3 py-1 text-xs text-ink outline-none focus:border-accent/50 w-28"
                    />
                    <button onClick={addTag} className="p-1 text-ink-muted hover:text-accent transition-colors">
                      <Plus size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Share */}
          {!isEditing && !item.encrypted && (
            <div className="flex flex-col gap-3">
              <h3 className="text-[10px] text-ink-muted uppercase tracking-widest font-bold flex items-center gap-2">
                <Share2 size={12} /> Public Share
              </h3>
              {item.publicToken ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 px-4 py-3 bg-sky-500/5 border border-sky-500/20 rounded-xl">
                    <LinkIcon size={14} className="text-sky-400 shrink-0" />
                    <span className="text-xs text-ink font-mono flex-1 truncate">{shareUrl(item.publicToken)}</span>
                    <button
                      onClick={handleCopyShare}
                      className="shrink-0 flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 transition-colors"
                    >
                      {copiedShare ? <Check size={12} /> : <Copy size={12} />}
                      {copiedShare ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <button
                    onClick={handleUnshare}
                    disabled={sharing}
                    className="self-start text-xs text-ink-muted hover:text-red-400 flex items-center gap-1 transition-colors"
                  >
                    {sharing ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                    Revoke public access
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleShare}
                  disabled={sharing}
                  className="self-start flex items-center gap-2 text-xs bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/20 px-3 py-1.5 rounded-lg font-semibold transition-all disabled:opacity-40"
                >
                  {sharing ? <Loader2 size={12} className="animate-spin" /> : <Share2 size={12} />}
                  Create public link
                </button>
              )}
            </div>
          )}

          {/* Remind Me */}
          {!isEditing && (
            <div className="flex flex-col gap-3">
              <h3 className="text-[10px] text-ink-muted uppercase tracking-widest font-bold flex items-center gap-2">
                <Bell size={12} /> Reminder
              </h3>
              {item.remindAt ? (
                <div className="flex items-center gap-3 px-4 py-3 bg-accent/5 border border-accent/20 rounded-xl">
                  <Bell size={14} className="text-accent shrink-0" />
                  <span className="text-sm text-ink flex-1">
                    {new Date(item.remindAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                  <button
                    onClick={handleClearReminder}
                    disabled={settingReminder}
                    className="text-xs text-ink-muted hover:text-red-400 flex items-center gap-1 transition-colors"
                  >
                    {settingReminder ? <Loader2 size={12} className="animate-spin" /> : <BellOff size={12} />}
                    Clear
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="datetime-local"
                    value={reminderInput}
                    onChange={e => setReminderInput(e.target.value)}
                    min={new Date().toISOString().slice(0, 16)}
                    className="flex-1 bg-bg border border-white/10 rounded-lg px-3 py-1.5 text-xs text-ink focus:outline-none focus:border-accent/50 transition-all"
                  />
                  <button
                    onClick={handleSetReminder}
                    disabled={settingReminder || !reminderInput}
                    className="flex items-center gap-1.5 text-xs bg-accent/10 hover:bg-accent/20 text-accent px-3 py-1.5 rounded-lg font-semibold disabled:opacity-40 transition-all"
                  >
                    {settingReminder ? <Loader2 size={12} className="animate-spin" /> : <Bell size={12} />}
                    Remind me
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Extraction History */}
          {(extractions.length > 0 || item) && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setShowExtractions(v => !v)}
                  className="flex items-center gap-2 text-[10px] text-ink-muted uppercase tracking-widest font-bold hover:text-ink transition-colors"
                >
                  <History size={12} />
                  Extraction History ({extractions.length})
                  {showExtractions ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  {extractions.some(e => !e.applied) && (
                    <span className="ml-1 px-1.5 py-0.5 bg-accent/20 text-accent rounded text-[9px] normal-case tracking-normal font-semibold">
                      newer available
                    </span>
                  )}
                </button>
                <button
                  onClick={handleReClassify}
                  disabled={reClassifying}
                  className="flex items-center gap-1.5 text-[10px] text-ink-muted hover:text-accent border border-white/10 hover:border-accent/30 px-2.5 py-1 rounded-lg transition-all disabled:opacity-40"
                  title="Re-run AI classification and add to history"
                >
                  {reClassifying ? <Loader2 size={10} className="animate-spin" /> : <Bot size={10} />}
                  Re-classify
                </button>
              </div>

              {showExtractions && (
                <div className="space-y-2">
                  {extractions.map(ext => (
                    <div
                      key={ext.id}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-xs transition-all ${
                        ext.applied
                          ? 'bg-accent/5 border-accent/20'
                          : 'bg-white/3 border-white/5'
                      }`}
                    >
                      <Bot size={14} className={ext.applied ? 'text-accent' : 'text-ink-muted'} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-ink font-medium truncate">{ext.model}</span>
                          {ext.applied && (
                            <span className="shrink-0 flex items-center gap-1 text-[10px] text-accent font-semibold">
                              <Check size={10} /> Active
                            </span>
                          )}
                        </div>
                        <div className="text-ink-muted mt-0.5 flex items-center gap-2">
                          <span>{ext.type}</span>
                          {ext.confidence != null && (
                            <span className={`${ext.confidence >= 80 ? 'text-green-400' : ext.confidence >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                              {ext.confidence}% confidence
                            </span>
                          )}
                          <span>{new Date(ext.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
                        </div>
                      </div>
                      {!ext.applied && (
                        <button
                          onClick={() => handleApplyExtraction(ext.id)}
                          disabled={applyingId === ext.id}
                          className="shrink-0 text-[10px] bg-accent/10 hover:bg-accent/20 text-accent px-3 py-1 rounded-lg font-semibold transition-all disabled:opacity-50"
                        >
                          {applyingId === ext.id ? <Loader2 size={10} className="animate-spin" /> : 'Apply'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
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
