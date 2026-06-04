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
  Save,
  Bookmark,
  Copy,
  RefreshCw,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import Sidebar from '../components/sidebar/Sidebar'
import { AppHeader } from '../components/AppHeader'
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
  const [showVaultReset, setShowVaultReset] = useState(false)
  const [vaultResetConfirm, setVaultResetConfirm] = useState('')
  const [vaultResetting, setVaultResetting] = useState(false)

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

  const handleVaultReset = async () => {
    if (vaultResetConfirm !== 'RESET') return
    setVaultResetting(true)
    try {
      await apiFetch('/vault/reset', { method: 'POST' })
      setShowVaultReset(false)
      setVaultResetConfirm('')
      setSuccess('Vault reset — all secrets deleted and password cleared.')
      setTimeout(() => setSuccess(null), 4000)
    } catch {
      setError('Failed to reset vault')
      setTimeout(() => setError(null), 3000)
    } finally {
      setVaultResetting(false)
    }
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
        <AppHeader
          left={<div className="flex items-center gap-6"><Link to="/" className="text-ink-muted hover:text-ink transition-colors"><ArrowLeft size={20} /></Link><div className="flex items-center gap-3"><SettingsIcon size={20} className="text-accent" /><h1 className="font-display text-lg text-ink">System Settings</h1></div></div>}
        />
        <AppHeader.Spacer />

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
                            <button onClick={handleRenameCategory} aria-label="Save category name" className="text-green-500 hover:text-green-400"><Save size={14} aria-hidden="true" /></button>
                            <button onClick={() => setEditingCat(null)} aria-label="Cancel rename" className="text-ink-muted hover:text-ink"><X size={14} aria-hidden="true" /></button>
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

          {/* Bookmarklet */}
          <BookmarkletSection />

          {/* Security */}
          <section className="flex flex-col gap-6">
            <div className="flex items-center gap-3">
               <ShieldAlert size={20} className="text-red-400" />
               <h2 className="font-display text-xl text-ink">Vault Security</h2>
            </div>
            <div className="bg-surface/50 border border-white/5 rounded-2xl p-6 space-y-6">
               {/* Change password — only possible while vault is unlocked */}
               <div className="flex items-center justify-between">
                  <div>
                     <p className="text-sm text-ink font-medium">Change Vault Password</p>
                     <p className="text-xs text-ink-muted mt-0.5">Re-encrypts all secrets with a new password. Open the Vault to use this.</p>
                  </div>
                  <Link
                    to="/vault"
                    className="text-xs text-accent hover:underline font-medium"
                  >
                    Go to Vault →
                  </Link>
               </div>

               <div className="h-px bg-white/5" />

               {/* Auto-lock */}
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

               <div className="h-px bg-white/5" />

               {/* Strict local mode */}
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

               <div className="h-px bg-white/5" />

               {/* Reset vault — nuclear option */}
               <div className="flex items-center justify-between">
                  <div>
                     <p className="text-sm text-ink font-medium text-red-400">Reset Vault</p>
                     <p className="text-xs text-ink-muted mt-0.5">Permanently deletes all secrets and clears the vault password. Cannot be undone.</p>
                  </div>
                  <button
                    onClick={() => setShowVaultReset(true)}
                    className="text-xs text-red-400 border border-red-400/30 hover:bg-red-400/10 px-3 py-1.5 rounded-lg font-medium transition-all"
                  >
                    Reset Vault
                  </button>
               </div>
            </div>
          </section>

          {/* Vault Reset Confirmation Modal */}
          {showVaultReset && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg/80 backdrop-blur-sm">
              <div className="w-full max-w-md bg-surface border border-white/10 rounded-2xl shadow-2xl p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-500/10 rounded-full flex items-center justify-center shrink-0">
                    <ShieldAlert size={20} className="text-red-400" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg text-ink">Reset Vault?</h3>
                    <p className="text-xs text-ink-muted">This cannot be undone</p>
                  </div>
                </div>
                <p className="text-sm text-ink-muted leading-relaxed">
                  All encrypted secrets will be permanently deleted and the vault password will be cleared.
                  You will need to set a new vault password next time you open the vault.
                </p>
                <div>
                  <label className="text-xs text-ink-muted mb-1.5 block">
                    Type <span className="font-mono text-red-400 font-bold">RESET</span> to confirm
                  </label>
                  <input
                    type="text"
                    placeholder="RESET"
                    className="w-full bg-bg border border-white/10 focus:border-red-400/50 rounded-lg py-2.5 px-4 text-ink outline-none transition-all font-mono"
                    value={vaultResetConfirm}
                    onChange={e => setVaultResetConfirm(e.target.value.toUpperCase())}
                    autoFocus
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => { setShowVaultReset(false); setVaultResetConfirm('') }}
                    disabled={vaultResetting}
                    className="flex-1 py-2.5 rounded-lg border border-white/10 text-sm text-ink-muted hover:text-ink hover:bg-white/5 transition-all disabled:opacity-40"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleVaultReset}
                    disabled={vaultResetting || vaultResetConfirm !== 'RESET'}
                    className="flex-1 py-2.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 font-bold text-sm hover:bg-red-500/30 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {vaultResetting ? <Loader2 size={15} className="animate-spin" /> : null}
                    Delete Everything
                  </button>
                </div>
              </div>
            </div>
          )}

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

// ── Bookmarklet Section ───────────────────────────────────────────────────────

function buildBookmarklet(key: string): string {
  // Minified JS that runs on any page — posts current URL to Memex quicksave
  const js = `(function(){
var u=location.href,el=document.createElement('div');
el.setAttribute('style','position:fixed;top:16px;right:16px;z-index:2147483647;background:#1E1E1E;color:#F5F5F5;padding:12px 18px;border-radius:12px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;font-weight:500;border:1px solid rgba(245,158,11,0.4);box-shadow:0 8px 32px rgba(0,0,0,0.6);max-width:320px');
el.textContent='Saving to Memex…';document.body.appendChild(el);
fetch('http://localhost:3002/api/ingest/quicksave',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer ${key}'},body:JSON.stringify({url:u})})
.then(function(r){return r.json()})
.then(function(d){
  if(d.error){el.textContent='❌ '+d.error;el.style.borderColor='rgba(239,68,68,0.4)'}
  else{
    var sim=d.similarItems&&d.similarItems.length?' (similar item exists)':'';
    el.textContent='✅ Saved: '+d.item.title+sim;
    el.style.borderColor='rgba(34,197,94,0.4)'
  }
  setTimeout(function(){el.remove()},3500)
})
.catch(function(){
  el.textContent='❌ Could not reach Memex — is it running?';
  el.style.borderColor='rgba(239,68,68,0.4)';
  setTimeout(function(){el.remove()},4000)
})
})();`
  return 'javascript:' + encodeURIComponent(js.replace(/\n/g, ''))
}

function BookmarkletSection() {
  const [key, setKey] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    apiFetch<Record<string, any>>('/settings')
      .then(s => { if (s.bookmarklet_key) setKey(s.bookmarklet_key) })
      .catch(() => {})
  }, [])

  const generate = async () => {
    setGenerating(true)
    try {
      const { key: k } = await apiFetch<{ key: string }>('/settings/bookmarklet-key', { method: 'POST' })
      setKey(k)
    } catch {
      // ignore
    } finally {
      setGenerating(false)
    }
  }

  const copyLink = () => {
    if (!key) return
    navigator.clipboard.writeText(buildBookmarklet(key))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const bookmarkletUrl = key ? buildBookmarklet(key) : '#'

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Bookmark size={20} className="text-sky-400" />
        <h2 className="font-display text-xl text-ink">Bookmarklet</h2>
      </div>
      <div className="bg-surface/50 border border-white/5 rounded-2xl p-6 space-y-5">
        <div>
          <p className="text-sm text-ink font-medium mb-1">One-click save from any webpage</p>
          <p className="text-xs text-ink-muted">
            Add this to your browser's bookmarks bar. Click it on any page to instantly save the URL to Memex — no tab switching needed.
          </p>
        </div>

        {!key ? (
          <button
            onClick={generate}
            disabled={generating}
            className="flex items-center gap-2 text-xs bg-sky-500/20 text-sky-300 border border-sky-500/30 px-4 py-2 rounded-lg font-bold hover:bg-sky-500/30 transition-all"
          >
            {generating ? <Loader2 size={14} className="animate-spin" /> : <Bookmark size={14} />}
            Generate Bookmarklet
          </button>
        ) : (
          <div className="space-y-4">
            {/* Draggable bookmark link */}
            <div className="flex flex-col gap-2">
              <p className="text-[10px] text-ink-muted uppercase tracking-widest font-bold">
                Step 1 — drag this to your bookmarks bar
              </p>
              <a
                href={bookmarkletUrl}
                className="inline-flex items-center gap-2 self-start px-4 py-2 bg-sky-500/20 text-sky-300 border border-sky-500/30 rounded-lg text-sm font-semibold cursor-grab select-none hover:bg-sky-500/30 transition-all"
                onClick={e => e.preventDefault()}
                title="Drag me to your bookmarks bar"
              >
                <Bookmark size={14} />
                Save to Memex
              </a>
              <p className="text-[10px] text-ink-muted">
                Click the link above and drag it to your browser's bookmarks bar. Or use the copy button below.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-[10px] text-ink-muted uppercase tracking-widest font-bold">
                Step 2 — or copy the link manually
              </p>
              <div className="flex gap-2">
                <button
                  onClick={copyLink}
                  className="flex items-center gap-2 text-xs bg-white/5 hover:bg-white/10 text-ink px-4 py-2 rounded-lg font-medium transition-all"
                >
                  {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                  {copied ? 'Copied!' : 'Copy bookmarklet link'}
                </button>
                <button
                  onClick={generate}
                  disabled={generating}
                  className="flex items-center gap-2 text-xs text-ink-muted hover:text-ink px-3 py-2 rounded-lg transition-all"
                  title="Regenerate key"
                >
                  {generating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  Regenerate key
                </button>
              </div>
            </div>

            <div className="bg-white/3 rounded-lg p-3 text-[11px] text-ink-muted space-y-1 border border-white/5">
              <p className="flex items-start gap-1.5">
                <span className="text-green-400 shrink-0 mt-0.5">✓</span>
                Works on any website — click the bookmark while browsing
              </p>
              <p className="flex items-start gap-1.5">
                <span className="text-green-400 shrink-0 mt-0.5">✓</span>
                Shows a confirmation toast on the page with the saved title
              </p>
              <p className="flex items-start gap-1.5">
                <span className="text-green-400 shrink-0 mt-0.5">✓</span>
                Warns if a similar item already exists
              </p>
              <p className="flex items-start gap-1.5">
                <span className="text-amber-400 shrink-0 mt-0.5">⚠</span>
                Requires Memex to be running on <code className="bg-white/10 px-1 rounded">localhost:3002</code>
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
