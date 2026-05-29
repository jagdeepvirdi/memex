import { useState, useEffect } from 'react'
import { 
  Download, 
  Trash2, 
  Cpu, 
  Check, 
  AlertCircle, 
  ArrowLeft,
  Settings as SettingsIcon,
  ShieldAlert,
  Database,
  Folder,
  Loader2,
  Edit2,
  X,
  Save
} from 'lucide-react'
import { Link } from 'react-router-dom'
import Sidebar from '../components/sidebar/Sidebar'
import { apiFetch, fetchCategories } from '../lib/api'
import type { Category } from '../../../shared/types'

export default function SettingsPage() {
  const [exporting, setExporting] = useState(false)
  const [exportingObsidian, setExportingObsidian] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [loadingCats, setLoadingCats] = useState(false)
  const [editingCat, setEditingCat] = useState<{id: string, name: string} | null>(null)
  const [ollamaStatus, setOllamaStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [enrichStatus, setEnrichStatus] = useState<{ pending: number; total: number } | null>(null)
  const [enriching, setEnriching] = useState(false)
  const [markitdownInstalled, setMarkitdownInstalled] = useState<boolean | null>(null)
  const [settings, setSettings] = useState<Record<string, any>>({
    ai_model: 'llama3.2',
    use_claude: false,
    auto_lock_timeout: '15'
  })

  useEffect(() => {
    loadCategories()
    apiFetch<{ pending: number; total: number }>('/items/enrichment')
      .then(setEnrichStatus)
      .catch(() => {})
    apiFetch<{ installed: boolean }>('/ingest/markitdown/health')
      .then(r => setMarkitdownInstalled(r.installed))
      .catch(() => setMarkitdownInstalled(false))
    apiFetch<Record<string, any>>('/settings')
      .then(setSettings)
      .catch(console.error)
  }, [])

  const handleUpdateSettings = async (newSettings: Record<string, any>) => {
    const updated = { ...settings, ...newSettings }
    setSettings(updated)
    try {
      await apiFetch('/settings', {
        method: 'PUT',
        body: JSON.stringify(newSettings)
      })
      setSuccess('Settings saved')
      setTimeout(() => setSuccess(null), 2000)
    } catch {
      setError('Failed to save settings')
    }
  }

  const handleReEnrich = async () => {
    setEnriching(true)
    try {
      const data = await apiFetch<{ queued: number }>('/items/enrich', { method: 'POST' })
      if (data.queued === 0) {
        setSuccess('All notes are already classified.')
      } else {
        setSuccess(`Re-queued ${data.queued} notes for AI classification. Check the sidebar for progress.`)
      }
      setTimeout(() => setSuccess(null), 5000)
    } catch {
      setError('Failed to start enrichment')
      setTimeout(() => setError(null), 3000)
    } finally {
      setEnriching(false)
    }
  }

  const loadCategories = async () => {
    setLoadingCats(true)
    try {
      const data = await fetchCategories()
      setCategories(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingCats(false)
    }
  }

  const handleExportObsidian = async () => {
    setExportingObsidian(true)
    setError(null)
    try {
      const token = JSON.parse(localStorage.getItem('memex-auth') || '{}')?.state?.token ?? ''
      const res = await fetch('/api/items/export/obsidian', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `memex-obsidian-${new Date().toISOString().split('T')[0]}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setSuccess('Obsidian vault exported')
      setTimeout(() => setSuccess(null), 3000)
    } catch {
      setError('Obsidian export failed')
    } finally {
      setExportingObsidian(false)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    setError(null)
    try {
      const data = await apiFetch<any[]>('/items')
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `memex-export-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setSuccess('Data exported successfully')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError('Export failed')
    } finally {
      setExporting(false)
    }
  }

  const handleRenameCategory = async () => {
    if (!editingCat) return
    try {
      await apiFetch(`/categories/${editingCat.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: editingCat.name })
      })
      setEditingCat(null)
      loadCategories()
      setSuccess('Category renamed')
      setTimeout(() => setSuccess(null), 2000)
    } catch (err) {
      setError('Failed to rename')
    }
  }

  const handleTestOllama = async () => {
    setOllamaStatus('testing')
    try {
      const data = await apiFetch<{ status: string }>('/health/ollama')
      setOllamaStatus(data.status === 'ok' ? 'ok' : 'error')
    } catch {
      setOllamaStatus('error')
    }
    setTimeout(() => setOllamaStatus('idle'), 4000)
  }

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Delete this category? (Only works if empty and no subcategories)')) return
    try {
      await apiFetch(`/categories/${id}`, { method: 'DELETE' })
      loadCategories()
      setSuccess('Category deleted')
      setTimeout(() => setSuccess(null), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
      setTimeout(() => setError(null), 3000)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex">
      <Sidebar activeSection="settings" />

      <main className="flex-1 flex flex-col relative overflow-y-auto">
        <header className="h-16 border-b border-white/5 flex items-center gap-6 px-8 bg-bg/80 backdrop-blur-md sticky top-0 z-10 shrink-0">
          <Link to="/" className="text-ink-muted hover:text-ink transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div className="flex items-center gap-3">
             <SettingsIcon size={20} className="text-accent" />
             <h1 className="font-display text-lg text-ink">System Settings</h1>
          </div>
        </header>

        <div className="p-12 max-w-3xl mx-auto w-full flex flex-col gap-12">
          {/* AI Config */}
          <section className="flex flex-col gap-6">
            <div className="flex items-center gap-3">
               <Cpu size={20} className="text-blue-400" />
               <h2 className="font-display text-xl text-ink">Intelligence Engine</h2>
            </div>
            <div className="bg-surface/50 border border-white/5 rounded-2xl p-6 space-y-6">
               <div className="flex items-center justify-between">
                  <div>
                     <p className="text-sm text-ink font-medium">Primary Model</p>
                     <p className="text-xs text-ink-muted mt-0.5">Used for auto-classification and summarization.</p>
                  </div>
                  <select 
                    className="bg-bg border border-white/10 rounded-lg px-3 py-1.5 text-xs text-ink outline-none cursor-pointer focus:border-accent/50 transition-colors"
                    value={settings.use_claude ? 'claude-3-5-sonnet' : settings.ai_model}
                    onChange={(e) => {
                      const val = e.target.value
                      if (val === 'claude-3-5-sonnet') {
                        handleUpdateSettings({ use_claude: true })
                      } else {
                        handleUpdateSettings({ use_claude: false, ai_model: val })
                      }
                    }}
                  >
                     <option value="llama3.2">llama3.2 (Local)</option>
                     <option value="gemma2:2b">gemma2:2b (Local)</option>
                     <option value="phi3:3.8b">phi3:3.8b (Local)</option>
                     <option value="qwen2.5-coder:14b">qwen2.5-coder:14b (Heavy)</option>
                     <option value="claude-3-5-sonnet">Claude 3.5 Sonnet (Cloud)</option>
                  </select>
               </div>
               
               <div className="flex items-center justify-between">
                  <div>
                     <p className="text-sm text-ink font-medium">Embedding Model</p>
                     <p className="text-xs text-ink-muted mt-0.5">Used for semantic search and related items.</p>
                  </div>
                  <span className="text-xs text-ink-muted font-mono bg-white/5 px-2 py-1 rounded">nomic-embed-text</span>
               </div>

               <div className="flex items-center justify-between">
                  <div>
                     <p className="text-sm text-ink font-medium">MarkItDown <span className="text-[10px] text-ink-muted font-sans ml-1">MIT · microsoft/markitdown</span></p>
                     <p className="text-xs text-ink-muted mt-0.5">Converts PDF, Word, Excel, PowerPoint, images → Markdown for AI ingestion.</p>
                     {markitdownInstalled === false && (
                       <code className="block mt-1.5 text-[10px] bg-bg text-accent px-2 py-1 rounded font-mono border border-white/10">
                         pip install 'markitdown[all]'
                       </code>
                     )}
                  </div>
                  {markitdownInstalled === null ? (
                    <Loader2 size={14} className="animate-spin text-ink-muted" />
                  ) : markitdownInstalled ? (
                    <span className="flex items-center gap-1 text-xs text-green-400 font-medium"><Check size={12} /> Installed</span>
                  ) : (
                    <span className="text-xs text-yellow-400 font-medium">Not installed</span>
                  )}
               </div>

               {enrichStatus && enrichStatus.total > 0 && (
                 <div className="flex items-center justify-between py-3 border-t border-white/5">
                   <div>
                     <p className="text-sm text-ink font-medium">AI Enrichment</p>
                     <p className="text-xs text-ink-muted mt-0.5">
                       {enrichStatus.pending === 0
                         ? `All ${enrichStatus.total} Keep notes classified`
                         : `${enrichStatus.total - enrichStatus.pending} / ${enrichStatus.total} classified — ${enrichStatus.pending} pending`}
                     </p>
                   </div>
                   {enrichStatus.pending > 0 && (
                     <button
                       onClick={handleReEnrich}
                       disabled={enriching}
                       className="flex items-center gap-2 text-xs bg-accent text-bg px-4 py-2 rounded-lg font-bold hover:bg-accent-deep transition-all disabled:opacity-50"
                     >
                       {enriching ? <Loader2 size={12} className="animate-spin" /> : null}
                       {enriching ? 'Starting...' : 'Re-run Enrichment'}
                     </button>
                   )}
                 </div>
               )}

               <div className="pt-4 border-t border-white/5 flex items-center gap-4">
                  <button
                    onClick={handleTestOllama}
                    disabled={ollamaStatus === 'testing'}
                    className="flex items-center gap-2 text-xs bg-white/5 hover:bg-white/10 text-ink px-4 py-2 rounded-lg transition-all font-medium disabled:opacity-50"
                  >
                    {ollamaStatus === 'testing' && <Loader2 size={12} className="animate-spin" />}
                    Test Ollama Connection
                  </button>
                  {ollamaStatus === 'ok' && (
                    <span className="flex items-center gap-1.5 text-xs text-green-400">
                      <Check size={13} /> Connected
                    </span>
                  )}
                  {ollamaStatus === 'error' && (
                    <span className="flex items-center gap-1.5 text-xs text-red-400">
                      <AlertCircle size={13} /> Ollama unreachable
                    </span>
                  )}
               </div>
            </div>
          </section>

          {/* Category Management */}
          <section className="flex flex-col gap-6">
            <div className="flex items-center gap-3">
               <Folder size={20} className="text-orange-400" />
               <h2 className="font-display text-xl text-ink">Categories</h2>
            </div>
            <div className="bg-surface/50 border border-white/5 rounded-2xl overflow-hidden">
               <div className="max-h-64 overflow-y-auto p-2">
                  {loadingCats ? (
                    <div className="flex justify-center py-8"><Loader2 className="animate-spin text-ink-muted" size={20} /></div>
                  ) : categories.map(cat => (
                    <div key={cat.id} className="flex items-center justify-between p-3 hover:bg-white/5 rounded-lg transition-colors group">
                       {editingCat?.id === cat.id ? (
                         <div className="flex items-center gap-2 flex-1 mr-4">
                            <input 
                              type="text" 
                              className="bg-bg border border-accent/50 rounded px-2 py-1 text-xs text-ink outline-none w-full"
                              value={editingCat.name}
                              onChange={(e) => setEditingCat({...editingCat, name: e.target.value})}
                              autoFocus
                            />
                            <button onClick={handleRenameCategory} className="text-green-500 hover:text-green-400"><Save size={14}/></button>
                            <button onClick={() => setEditingCat(null)} className="text-ink-muted hover:text-ink"><X size={14}/></button>
                         </div>
                       ) : (
                         <>
                            <div className="flex flex-col">
                               <span className="text-sm text-ink">{cat.name}</span>
                               <span className="text-[10px] text-ink-muted uppercase">{cat.itemCount} items</span>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                               <button onClick={() => setEditingCat({id: cat.id, name: cat.name})} className="p-1.5 text-ink-muted hover:text-accent transition-colors"><Edit2 size={14}/></button>
                               <button onClick={() => handleDeleteCategory(cat.id)} className="p-1.5 text-ink-muted hover:text-red-400 transition-colors"><Trash2 size={14}/></button>
                            </div>
                         </>
                       )}
                    </div>
                  ))}
               </div>
            </div>
          </section>

          {/* Data Management */}
          <section className="flex flex-col gap-6">
            <div className="flex items-center gap-3">
               <Database size={20} className="text-teal-400" />
               <h2 className="font-display text-xl text-ink">Data & Privacy</h2>
            </div>
            <div className="bg-surface/50 border border-white/5 rounded-2xl p-6 space-y-8">
               <div className="flex items-center justify-between">
                  <div>
                     <p className="text-sm text-ink font-medium">Export Workspace</p>
                     <p className="text-xs text-ink-muted mt-0.5">Download all your items and categories as JSON.</p>
                  </div>
                  <button
                    onClick={handleExport}
                    disabled={exporting}
                    className="flex items-center gap-2 text-xs bg-accent text-bg px-4 py-2 rounded-lg font-bold hover:bg-accent-dark transition-all"
                  >
                    {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                    Export JSON
                  </button>
               </div>

               <div className="flex items-center justify-between">
                  <div>
                     <p className="text-sm text-ink font-medium">Export as Obsidian Vault</p>
                     <p className="text-xs text-ink-muted mt-0.5">
                       ZIP of Markdown files with YAML frontmatter — drop into any Obsidian vault.
                       Encrypted vault items are excluded.
                     </p>
                  </div>
                  <button
                    onClick={handleExportObsidian}
                    disabled={exportingObsidian}
                    className="flex items-center gap-2 text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30 px-4 py-2 rounded-lg font-bold hover:bg-purple-500/30 transition-all"
                  >
                    {exportingObsidian ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                    Export Obsidian
                  </button>
               </div>

               <div className="flex items-center justify-between opacity-50 cursor-not-allowed">
                  <div>
                     <p className="text-sm text-ink font-medium">Import Google Keep</p>
                     <p className="text-xs text-ink-muted mt-0.5">Handled via the Quick Add panel.</p>
                  </div>
                  <span className="text-[10px] uppercase font-bold text-accent">Active in Ingest</span>
               </div>
            </div>
          </section>

          {/* Security */}
          <section className="flex flex-col gap-6">
            <div className="flex items-center gap-3">
               <ShieldAlert size={20} className="text-red-400" />
               <h2 className="font-display text-xl text-ink">Vault Security</h2>
            </div>
            <div className="bg-surface/50 border border-white/5 rounded-2xl p-6 space-y-6">
               <div className="flex items-center justify-between">
                  <div>
                     <p className="text-sm text-ink font-medium">Rotate Master Password</p>
                     <p className="text-xs text-ink-muted mt-0.5">Re-encrypts all vault items with a new key.</p>
                  </div>
                  <button className="text-xs text-red-400 hover:underline font-medium">Reset Password</button>
               </div>
               
               <div className="flex items-center justify-between">
                  <div>
                     <p className="text-sm text-ink font-medium">Auto-lock Timeout</p>
                     <p className="text-xs text-ink-muted mt-0.5">Duration of inactivity before vault locks.</p>
                  </div>
                  <select 
                    className="bg-bg border border-white/10 rounded-lg px-3 py-1.5 text-xs text-ink outline-none cursor-pointer focus:border-accent/50 transition-colors"
                    value={settings.auto_lock_timeout}
                    onChange={(e) => handleUpdateSettings({ auto_lock_timeout: e.target.value })}
                  >
                     <option value="5">5 Minutes</option>
                     <option value="15">15 Minutes</option>
                     <option value="30">30 Minutes</option>
                     <option value="60">1 Hour</option>
                  </select>
               </div>
               
               <div className="flex items-center justify-between">
                  <div>
                     <p className="text-sm text-ink font-medium">Strict Local Mode</p>
                     <p className="text-xs text-ink-muted mt-0.5">Disable URL scraping and force local-only execution.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={settings.strict_local_mode === 'true' || settings.strict_local_mode === true}
                      onChange={(e) => handleUpdateSettings({ strict_local_mode: e.target.checked.toString() })}
                    />
                    <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent"></div>
                  </label>
               </div>
            </div>
          </section>

          {/* Status Indicators */}
          {(success || error) && (
            <div className={`fixed bottom-8 right-8 p-4 rounded-xl border flex items-center gap-3 shadow-2xl animate-in slide-in-from-right-4 duration-300 ${
               success ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'
            }`}>
               {success ? <Check size={18} /> : <AlertCircle size={18} />}
               <p className="text-sm font-medium">{success || error}</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
