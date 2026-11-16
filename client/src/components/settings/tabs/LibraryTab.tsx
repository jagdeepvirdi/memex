import { useEffect, useState } from 'react'
import { Download, Trash2, Check, Folder, Database, Loader2, Edit2, X, Save, RefreshCw, Wand2 } from 'lucide-react'
import { apiFetch, fetchCategories, reprocessBulk } from '../../../lib/api'
import type { Category } from '../../../../../shared/types'
import { SettingsSection, SettingRow, Divider } from '../SettingsSection'
import type { SettingsTabProps } from '../settingsTabs'

type Props = Pick<SettingsTabProps, 'notify'>

const secondaryBtn =
  'flex items-center gap-2 text-xs bg-white/5 hover:bg-white/10 text-ink border border-white/10 px-4 py-2 rounded-lg font-medium transition-all disabled:opacity-50 shrink-0'

/** Categories, import/export, and the maintenance jobs that act on the whole library. */
export function LibraryTab({ notify }: Props) {
  const [categories, setCategories] = useState<Category[]>([])
  const [loadingCats, setLoadingCats] = useState(false)
  const [editingCat, setEditingCat] = useState<{ id: string; name: string } | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportingObsidian, setExportingObsidian] = useState(false)
  const [enrichStatus, setEnrichStatus] = useState<{ pending: number; total: number } | null>(null)
  const [enriching, setEnriching] = useState(false)
  const [reprocessing, setReprocessing] = useState(false)
  const [markitdownInstalled, setMarkitdownInstalled] = useState<boolean | null>(null)

  const loadCategories = async () => {
    setLoadingCats(true)
    try {
      setCategories(await fetchCategories())
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingCats(false)
    }
  }

  useEffect(() => {
    void loadCategories()
    apiFetch<{ pending: number; total: number }>('/items/enrichment').then(setEnrichStatus).catch(() => {})
    apiFetch<{ installed: boolean }>('/ingest/markitdown/health')
      .then(r => setMarkitdownInstalled(r.installed))
      .catch(() => setMarkitdownInstalled(false))
  }, [])

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
  const today = () => new Date().toISOString().split('T')[0]

  const handleExport = async () => {
    setExporting(true)
    try {
      const data = await apiFetch<any[]>('/items')
      downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `memex-export-${today()}.json`)
      notify.success('Data exported successfully', 3000)
    } catch {
      notify.error('Export failed')
    } finally {
      setExporting(false)
    }
  }

  const handleExportObsidian = async () => {
    setExportingObsidian(true)
    try {
      const token = JSON.parse(localStorage.getItem('memex-auth') || '{}')?.state?.token ?? ''
      const res = await fetch('/api/items/export/obsidian', { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error('Export failed')
      downloadBlob(await res.blob(), `memex-obsidian-${today()}.zip`)
      notify.success('Obsidian vault exported', 3000)
    } catch {
      notify.error('Obsidian export failed')
    } finally {
      setExportingObsidian(false)
    }
  }

  const handleRenameCategory = async () => {
    if (!editingCat) return
    try {
      await apiFetch(`/categories/${editingCat.id}`, { method: 'PUT', body: JSON.stringify({ name: editingCat.name }) })
      setEditingCat(null)
      void loadCategories()
      notify.success('Category renamed')
    } catch {
      notify.error('Failed to rename')
    }
  }

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Delete this category? (Only works if empty and no subcategories)')) return
    try {
      await apiFetch(`/categories/${id}`, { method: 'DELETE' })
      void loadCategories()
      notify.success('Category deleted')
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  const handleReEnrich = async () => {
    setEnriching(true)
    try {
      const data = await apiFetch<{ queued: number }>('/items/enrich', { method: 'POST' })
      notify.success(
        data.queued === 0
          ? 'All notes are already classified.'
          : `Re-queued ${data.queued} notes for AI classification. Check the sidebar for progress.`,
        5000,
      )
    } catch {
      notify.error('Failed to start enrichment')
    } finally {
      setEnriching(false)
    }
  }

  const handleReprocess = async () => {
    setReprocessing(true)
    try {
      const data = await reprocessBulk('unreviewed')
      notify.success(
        data.queued === 0
          ? 'No unreviewed items to re-process.'
          : `Re-processing ${data.queued} items with the current model. New extractions will appear in extraction history.`,
        6000,
      )
    } catch {
      notify.error('Failed to start re-processing')
    } finally {
      setReprocessing(false)
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <SettingsSection
        icon={<Folder size={20} className="text-orange-400" />}
        title="Categories"
        description="Rename or delete categories. A category can only be deleted when it is empty and has no subcategories."
      >
        <div className="-m-2 max-h-64 overflow-y-auto">
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
                    onChange={(e) => setEditingCat({ ...editingCat, name: e.target.value })}
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
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <button onClick={() => setEditingCat({ id: cat.id, name: cat.name })} aria-label={`Rename ${cat.name}`} className="p-1.5 text-ink-muted hover:text-accent transition-colors"><Edit2 size={14} /></button>
                    <button onClick={() => handleDeleteCategory(cat.id)} aria-label={`Delete ${cat.name}`} className="p-1.5 text-ink-muted hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection
        icon={<Database size={20} className="text-teal-400" />}
        title="Import & export"
        description="Your data is yours: take a full copy any time."
      >
        <SettingRow title="Export workspace" description="Download all your items and categories as JSON.">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 text-xs bg-accent text-bg px-4 py-2 rounded-lg font-bold hover:bg-accent-dark transition-all disabled:opacity-50"
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Export JSON
          </button>
        </SettingRow>

        <Divider />

        <SettingRow
          title="Export as Obsidian vault"
          description="ZIP of Markdown files with YAML frontmatter — drop into any Obsidian vault. Encrypted vault items are excluded."
        >
          <button
            onClick={handleExportObsidian}
            disabled={exportingObsidian}
            className="flex items-center gap-2 text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30 px-4 py-2 rounded-lg font-bold hover:bg-purple-500/30 transition-all disabled:opacity-50"
          >
            {exportingObsidian ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Export Obsidian
          </button>
        </SettingRow>

        <Divider />

        <SettingRow title="Import Google Keep" description="Done from the Quick Add panel on the dashboard.">
          <span className="text-[10px] uppercase font-bold text-accent">Active in Ingest</span>
        </SettingRow>
      </SettingsSection>

      <SettingsSection
        icon={<Wand2 size={20} className="text-blue-400" />}
        title="Processing"
        description="File conversion and AI jobs that run across your library."
      >
        <SettingRow
          title={<>MarkItDown <span className="text-[10px] text-ink-muted font-sans ml-1">MIT · microsoft/markitdown</span></>}
          description="Converts PDF, Word, Excel, PowerPoint and images to Markdown for AI ingestion."
        >
          {markitdownInstalled === null ? (
            <Loader2 size={14} className="animate-spin text-ink-muted" />
          ) : markitdownInstalled ? (
            <span className="flex items-center gap-1 text-xs text-green-400 font-medium"><Check size={12} /> Installed</span>
          ) : (
            <span className="text-xs text-yellow-400 font-medium">Not installed</span>
          )}
        </SettingRow>
        {markitdownInstalled === false && (
          <code className="block -mt-3 text-[10px] bg-bg text-accent px-2 py-1 rounded font-mono border border-white/10 w-fit">
            pip install 'markitdown[all]'
          </code>
        )}

        {enrichStatus && enrichStatus.total > 0 && (
          <>
            <Divider />
            <SettingRow
              title="AI enrichment"
              description={
                enrichStatus.pending === 0
                  ? `All ${enrichStatus.total} Keep notes classified`
                  : `${enrichStatus.total - enrichStatus.pending} / ${enrichStatus.total} classified — ${enrichStatus.pending} pending`
              }
            >
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
            </SettingRow>
          </>
        )}

        <Divider />

        <SettingRow
          title="Re-process with current model"
          description="Re-run AI classification on all unreviewed enriched items using the active model. New extractions are added to history — nothing is overwritten for reviewed items."
        >
          <button onClick={handleReprocess} disabled={reprocessing} className={secondaryBtn}>
            {reprocessing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {reprocessing ? 'Queued…' : 'Re-process'}
          </button>
        </SettingRow>
      </SettingsSection>
    </div>
  )
}
