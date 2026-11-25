import { useState } from 'react';
import { Loader2, Plus, Globe, X, FolderArchive, FileText, Paperclip, AlertTriangle, ExternalLink, Mic, ListPlus, BookText } from 'lucide-react';
import { toast } from 'sonner';
import { ingestUrl, createItem, apiFetch } from '../../lib/api';
import type { SimilarItem } from '../../lib/api';
import ItemCard from '../cards/ItemCard';
import KeepImportPanel from './KeepImportPanel';
import PasteImportPanel from './PasteImportPanel';
import MarkdownImportPanel from './MarkdownImportPanel';
import FileIngestPanel from './FileIngestPanel';
import VoiceIngestPanel from './VoiceIngestPanel';
import Editor from '../Editor';
import PriorityPicker from '../PriorityPicker';
import { previewToCreateRequest, type IngestPreview } from '../../lib/ingest';
import type { Item, ItemPriority } from '../../../../shared/types';

interface IngestPanelProps {
  onSuccess?: (item: Item) => void;
  onCancel?: () => void;
  initialUrl?: string;
  initialText?: string;
}

export default function IngestPanel({ onSuccess, onCancel, initialUrl, initialText }: IngestPanelProps) {
  const [activeTab, setActiveTab] = useState<'url' | 'keep' | 'manual' | 'paste' | 'markdown' | 'file' | 'voice'>(
    initialUrl ? 'url' : initialText ? 'manual' : 'url'
  );
  const [url, setUrl] = useState(initialUrl || '');
  const [manualText, setManualText] = useState(initialText || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<IngestPreview | null>(null);
  const [priority, setPriority] = useState<ItemPriority | null>(null);
  const [similarItems, setSimilarItems] = useState<SimilarItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  // Places found in the note that the user unticked (by name); everything else is saved as its own entry.
  const [skippedPlaces, setSkippedPlaces] = useState<Set<string>>(new Set());

  const togglePlace = (name: string) =>
    setSkippedPlaces((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setError(null);
    setPreview(null);
    setPriority(null);
    setSimilarItems([]);

    try {
      const { preview, similarItems } = await ingestUrl(url);
      setPreview(preview);
      setSimilarItems(similarItems ?? []);
      toast.success('URL analyzed successfully');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to ingest URL';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleManualClassify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualText) return;

    setLoading(true);
    setError(null);
    setPreview(null);
    setPriority(null);
    setSimilarItems([]);

    try {
      const data = await apiFetch<{ preview: IngestPreview; similarItems?: SimilarItem[] }>('/ingest/text', {
        method: 'POST',
        body: JSON.stringify({ text: manualText }),
      });
      // Keep the server's source/sourceUrl: pasted Instagram captions and GitHub links are detected there.
      setPreview({ ...data.preview, content: manualText });
      setSkippedPlaces(new Set());
      setSimilarItems(data.similarItems ?? []);
      toast.success('Note classified successfully');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to classify text';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!preview) return;

    setIsSaving(true);
    setError(null);

    try {
      const kept = (preview.places ?? []).filter((p) => !skippedPlaces.has(p.name));
      const savedItem = await createItem(previewToCreateRequest(preview, priority, kept));
      onSuccess?.(savedItem);
      toast.success(kept.length > 0 ? `Saved, plus ${kept.length} place${kept.length === 1 ? '' : 's'} as separate entries` : 'Item saved to Memex');
      setUrl('');
      setManualText('');
      setPreview(null);
      setPriority(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save item';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-surface rounded-xl border border-white/5 shadow-2xl max-w-2xl w-full mx-auto flex flex-col overflow-hidden">
      <div className="p-6 border-b border-white/5 flex justify-between items-center">
        <h2 className="font-display text-xl text-ink">Add to Memex</h2>
        {onCancel && (
          <button 
            onClick={onCancel}
            aria-label="Close"
            className="text-ink-muted hover:text-ink transition-colors"
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Capture type" className="flex overflow-x-auto border-b border-white/5">
        <button role="tab" aria-selected={activeTab === 'url'} type="button"
          onClick={() => setActiveTab('url')}
          className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-all ${
            activeTab === 'url' ? 'text-accent border-b-2 border-accent bg-accent/5' : 'text-ink-muted hover:text-ink hover:bg-white/5'
          }`}
        >
          <Globe size={16} />
          Single URL
        </button>
        <button role="tab" aria-selected={activeTab === 'manual'} type="button"
          onClick={() => setActiveTab('manual')}
          className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-all ${
            activeTab === 'manual' ? 'text-accent border-b-2 border-accent bg-accent/5' : 'text-ink-muted hover:text-ink hover:bg-white/5'
          }`}
        >
          <FileText size={16} />
          Manual Note
        </button>
        <button role="tab" aria-selected={activeTab === 'paste'} type="button"
          onClick={() => setActiveTab('paste')}
          className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-all ${
            activeTab === 'paste' ? 'text-accent border-b-2 border-accent bg-accent/5' : 'text-ink-muted hover:text-ink hover:bg-white/5'
          }`}
        >
          <ListPlus size={16} />
          Bulk Paste
        </button>
        <button role="tab" aria-selected={activeTab === 'keep'} type="button"
          onClick={() => setActiveTab('keep')}
          className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-all ${
            activeTab === 'keep' ? 'text-accent border-b-2 border-accent bg-accent/5' : 'text-ink-muted hover:text-ink hover:bg-white/5'
          }`}
        >
          <FolderArchive size={16} />
          Google Keep
        </button>
        <button role="tab" aria-selected={activeTab === 'markdown'} type="button"
          onClick={() => setActiveTab('markdown')}
          className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-all ${
            activeTab === 'markdown' ? 'text-accent border-b-2 border-accent bg-accent/5' : 'text-ink-muted hover:text-ink hover:bg-white/5'
          }`}
        >
          <BookText size={16} />
          Markdown
        </button>
        <button role="tab" aria-selected={activeTab === 'file'} type="button"
          onClick={() => setActiveTab('file')}
          className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-all ${
            activeTab === 'file' ? 'text-accent border-b-2 border-accent bg-accent/5' : 'text-ink-muted hover:text-ink hover:bg-white/5'
          }`}
        >
          <Paperclip size={16} />
          File
        </button>
        <button role="tab" aria-selected={activeTab === 'voice'} type="button"
          onClick={() => setActiveTab('voice')}
          className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-all ${
            activeTab === 'voice' ? 'text-accent border-b-2 border-accent bg-accent/5' : 'text-ink-muted hover:text-ink hover:bg-white/5'
          }`}
        >
          <Mic size={16} />
          Voice
        </button>
      </div>

      <div className="p-6">
        {activeTab === 'manual' ? (
          <>
            {!preview ? (
              <form onSubmit={handleManualClassify} className="space-y-4">
                <Editor 
                  content={manualText} 
                  onChange={setManualText} 
                  placeholder="Type or paste anything here... AI will classify it automatically."
                />

                <button
                  type="submit"
                  disabled={loading || !manualText || manualText === '<p></p>'}
                  className="w-full bg-accent hover:bg-accent-dark disabled:opacity-50 disabled:cursor-not-allowed text-bg font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg"
                >
                  {loading ? (
                    <Loader2 className="animate-spin" size={20} />
                  ) : (
                    <>
                      <Plus size={20} />
                      Classify & Add
                    </>
                  )}
                </button>
              </form>
            ) : (
              <PreviewState preview={preview} setPreview={setPreview} priority={priority} setPriority={setPriority} handleSave={handleSave} isSaving={isSaving} error={error} similarItems={similarItems} skippedPlaces={skippedPlaces} togglePlace={togglePlace} />
            )}
          </>
        ) : activeTab === 'url' ? (
          <>
            {!preview ? (
              <form onSubmit={handleIngest} className="space-y-4">
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" size={18} />
                  <input
                    type="url"
                    placeholder="Paste URL (YouTube, Instagram, or Web)"
                    className="w-full bg-bg border border-white/10 rounded-lg py-3 pl-10 pr-4 text-ink outline-none focus:border-accent/50 transition-all placeholder:text-ink-muted/30"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={loading}
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || !url}
                  className="w-full bg-accent hover:bg-accent-dark disabled:opacity-50 disabled:cursor-not-allowed text-bg font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg"
                >
                  {loading ? (
                    <Loader2 className="animate-spin" size={20} />
                  ) : (
                    <>
                      <Plus size={20} />
                      Analyze URL
                    </>
                  )}
                </button>
              </form>
            ) : (
              <PreviewState preview={preview} setPreview={setPreview} priority={priority} setPriority={setPriority} handleSave={handleSave} isSaving={isSaving} error={error} similarItems={similarItems} />
            )}
          </>
        ) : activeTab === 'paste' ? (
          <PasteImportPanel />
        ) : activeTab === 'keep' ? (
          <KeepImportPanel />
        ) : activeTab === 'markdown' ? (
          <MarkdownImportPanel />
        ) : activeTab === 'voice' ? (
          <VoiceIngestPanel onSuccess={onSuccess} />
        ) : (
          <FileIngestPanel onSuccess={onSuccess} />
        )}
      </div>
    </div>
  );
}

interface PreviewStateProps {
  preview: IngestPreview;
  setPreview: (val: null) => void;
  priority: ItemPriority | null;
  setPriority: (val: ItemPriority | null) => void;
  handleSave: () => Promise<void>;
  isSaving: boolean;
  error: string | null;
  similarItems?: SimilarItem[];
  skippedPlaces?: Set<string>;
  togglePlace?: (name: string) => void;
}

const PLACE_TYPE_LABEL: Record<string, string> = {
  restaurant: 'Restaurant', cafe: 'Café', hotel: 'Hotel', attraction: 'Attraction', destination: 'Destination', other: 'Place',
};

function PreviewState({ preview, setPreview, priority, setPriority, handleSave, isSaving, error, similarItems = [], skippedPlaces = new Set(), togglePlace }: PreviewStateProps) {
  const places = preview.places ?? [];
  const keptCount = places.filter((p) => !skippedPlaces.has(p.name)).length;
  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Duplicate warning */}
      {similarItems.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={13} className="text-amber-400 shrink-0" />
            <p className="text-xs text-amber-300 font-semibold">
              {similarItems.length === 1 ? 'Similar item already in Memex' : `${similarItems.length} similar items already in Memex`}
            </p>
          </div>
          <div className="space-y-1.5">
            {similarItems.map(s => (
              <div key={s.id} className="flex items-center justify-between gap-2 px-2 py-1.5 bg-white/5 rounded-lg">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] bg-white/10 text-ink-muted px-1.5 py-0.5 rounded font-medium shrink-0">{s.type}</span>
                  <span className="text-xs text-ink truncate">{s.title}</span>
                  <span className="text-[10px] text-ink-muted shrink-0">{Math.round(s.similarity * 100)}% match</span>
                </div>
                <a
                  href={`/item/${s.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-accent hover:text-accent/80 transition-colors"
                  title="View existing item"
                >
                  <ExternalLink size={12} />
                </a>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-amber-400/70 mt-2">You can still save — this might be an update or a different source.</p>
        </div>
      )}

      <div className="opacity-80 scale-[0.98] pointer-events-none">
        <ItemCard
          item={{
            ...preview,
            id: 'preview',
            createdAt: new Date(),
            updatedAt: new Date(),
          }}
        />
      </div>

      {places.length > 0 && togglePlace && (
        <fieldset className="rounded-xl border border-white/10 p-3">
          <legend className="px-1 text-xs font-semibold text-ink">
            Places in this note ({keptCount} of {places.length} will be saved as their own entries)
          </legend>
          <ul className="mt-1 space-y-1">
            {places.map((p) => (
              <li key={p.name}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5">
                  <input
                    type="checkbox"
                    checked={!skippedPlaces.has(p.name)}
                    onChange={() => togglePlace(p.name)}
                    disabled={isSaving}
                    className="accent-accent"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{p.name}</span>
                  <span className="shrink-0 text-[10px] text-ink-muted">
                    {[PLACE_TYPE_LABEL[p.type] ?? 'Place', p.city].filter(Boolean).join(' · ')}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-ink-muted">They are added as unreviewed places, marked "want to visit", and linked to this note.</p>
        </fieldset>
      )}

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-ink-muted">How important is this?</span>
        <PriorityPicker value={priority} onChange={setPriority} disabled={isSaving} />
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => setPreview(null)}
          className="flex-1 bg-white/5 hover:bg-white/10 text-ink py-3 rounded-lg font-medium transition-all"
        >
          Back
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex-[2] bg-accent hover:bg-accent-dark text-bg py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all shadow-lg"
        >
          {isSaving ? <Loader2 className="animate-spin" size={20} /> : 'Save to Memex'}
        </button>
      </div>

      {error && (
        <p className="text-red-400 text-sm bg-red-400/10 p-3 rounded-lg border border-red-400/20 text-center">
          {error}
        </p>
      )}
    </div>
  );
}
