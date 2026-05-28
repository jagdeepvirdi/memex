import { useState } from 'react';
import { Loader2, Plus, Globe, X, FolderArchive, FileText, Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import { ingestUrl, createItem } from '../../lib/api';
import ItemCard from '../cards/ItemCard';
import KeepImportPanel from './KeepImportPanel';
import FileIngestPanel from './FileIngestPanel';
import Editor from '../Editor';
import type { Item, ItemType, CreateItemRequest } from '../../../../shared/types';

interface IngestPanelProps {
  onSuccess?: (item: Item) => void;
  onCancel?: () => void;
}

export default function IngestPanel({ onSuccess, onCancel }: IngestPanelProps) {
  const [activeTab, setActiveTab] = useState<'url' | 'keep' | 'manual' | 'file'>('url');
  const [url, setUrl] = useState('');
  const [manualText, setManualText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'embedding'> | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setError(null);
    setPreview(null);

    try {
      const { preview } = await ingestUrl(url);
      setPreview(preview);
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

    try {
      const res = await fetch('/api/ingest/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: manualText }),
      });

      if (!res.ok) throw new Error('Classification failed');

      const data = await res.json();
      setPreview({
        ...data.preview,
        content: manualText,
        source: 'manual'
      });
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
      const createReq: CreateItemRequest = {
        title: preview.title,
        type: preview.type as ItemType,
        content: preview.content,
        categories: preview.categories,
        tags: preview.tags,
        source: preview.source,
        sourceUrl: preview.sourceUrl,
      };
      
      const savedItem = await createItem(createReq);
      onSuccess?.(savedItem);
      toast.success('Item saved to Memex');
      setUrl('');
      setManualText('');
      setPreview(null);
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
            className="text-ink-muted hover:text-ink transition-colors"
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/5">
        <button
          onClick={() => setActiveTab('url')}
          className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-all ${
            activeTab === 'url' ? 'text-accent border-b-2 border-accent bg-accent/5' : 'text-ink-muted hover:text-ink hover:bg-white/5'
          }`}
        >
          <Globe size={16} />
          Single URL
        </button>
        <button
          onClick={() => setActiveTab('manual')}
          className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-all ${
            activeTab === 'manual' ? 'text-accent border-b-2 border-accent bg-accent/5' : 'text-ink-muted hover:text-ink hover:bg-white/5'
          }`}
        >
          <FileText size={16} />
          Manual Note
        </button>
        <button
          onClick={() => setActiveTab('keep')}
          className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-all ${
            activeTab === 'keep' ? 'text-accent border-b-2 border-accent bg-accent/5' : 'text-ink-muted hover:text-ink hover:bg-white/5'
          }`}
        >
          <FolderArchive size={16} />
          Google Keep
        </button>
        <button
          onClick={() => setActiveTab('file')}
          className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-all ${
            activeTab === 'file' ? 'text-accent border-b-2 border-accent bg-accent/5' : 'text-ink-muted hover:text-ink hover:bg-white/5'
          }`}
        >
          <Paperclip size={16} />
          File
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
              <PreviewState preview={preview} setPreview={setPreview} handleSave={handleSave} isSaving={isSaving} error={error} />
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
              <PreviewState preview={preview} setPreview={setPreview} handleSave={handleSave} isSaving={isSaving} error={error} />
            )}
          </>
        ) : activeTab === 'keep' ? (
          <KeepImportPanel />
        ) : (
          <FileIngestPanel onSuccess={onSuccess} />
        )}
      </div>
    </div>
  );
}

interface PreviewStateProps {
  preview: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'embedding'>;
  setPreview: (val: null) => void;
  handleSave: () => Promise<void>;
  isSaving: boolean;
  error: string | null;
}

function PreviewState({ preview, setPreview, handleSave, isSaving, error }: PreviewStateProps) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="opacity-80 scale-[0.98] pointer-events-none">
        <ItemCard 
          item={{ 
            ...preview, 
            id: 'preview', 
            createdAt: new Date(), 
            updatedAt: new Date() 
          }} 
        />
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
          {isSaving ? (
            <Loader2 className="animate-spin" size={20} />
          ) : (
            <>Save to Memex</>
          )}
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
