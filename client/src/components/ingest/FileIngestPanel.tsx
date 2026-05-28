import { useState, useRef, useEffect } from 'react';
import { Loader2, Upload, FileText, AlertCircle, X, ExternalLink } from 'lucide-react';
import { apiFetch, createItem } from '../../lib/api';
import ItemCard from '../cards/ItemCard';
import type { Item, CreateItemRequest } from '../../../../shared/types';

const ACCEPT = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.gif,.webp,.html,.txt,.md,.epub,.xml,.json';

interface Props {
  onSuccess?: (item: Item) => void;
}

export default function FileIngestPanel({ onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'embedding'> | null>(null);
  const [markitdownOk, setMarkitdownOk] = useState<boolean | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiFetch<{ installed: boolean }>('/ingest/markitdown/health')
      .then(r => setMarkitdownOk(r.installed))
      .catch(() => setMarkitdownOk(false));
  }, []);

  const handleFile = (f: File) => {
    setFile(f);
    setPreview(null);
    setError(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleConvert = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);

    try {
      const form = new FormData();
      form.append('file', file);

      const res = await fetch('/api/ingest/file', {
        method: 'POST',
        body: form,
        headers: {
          Authorization: `Bearer ${JSON.parse(localStorage.getItem('memex-auth') || '{}')?.state?.token ?? ''}`,
        },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error ${res.status}`);
      }

      const { preview: p } = await res.json();
      setPreview({ ...p, reviewed: false, encrypted: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Conversion failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!preview) return;
    setSaving(true);
    try {
      const req: CreateItemRequest = {
        title: preview.title,
        type: preview.type,
        content: preview.content,
        categories: preview.categories,
        tags: preview.tags,
        source: preview.source,
      };
      const saved = await createItem(req);
      onSuccess?.(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // ── Not installed banner ────────────────────────────────────────────────────
  if (markitdownOk === false) {
    return (
      <div className="p-6 space-y-4">
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle size={18} className="text-yellow-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-ink font-medium">MarkItDown is not installed</p>
            <p className="text-xs text-ink-muted mt-1">
              File conversion requires the <code className="bg-white/10 px-1 rounded">markitdown</code> Python package.
            </p>
            <code className="block mt-2 text-xs bg-bg text-accent px-3 py-2 rounded-lg border border-white/10 font-mono">
              pip install 'markitdown[all]'
            </code>
            <p className="text-xs text-ink-muted mt-2">
              Requires Python 3.10+. After installing, restart the Memex server.
            </p>
            <a
              href="https://github.com/microsoft/markitdown"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-accent hover:underline mt-2"
            >
              <ExternalLink size={11} /> MarkItDown on GitHub (MIT License)
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── Preview state ───────────────────────────────────────────────────────────
  if (preview) {
    return (
      <div className="p-6 space-y-4 animate-in fade-in duration-200">
        <div className="opacity-80 pointer-events-none">
          <ItemCard item={{ ...preview, id: 'preview', createdAt: new Date(), updatedAt: new Date() }} />
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => { setPreview(null); setFile(null); }}
            className="flex-1 bg-white/5 hover:bg-white/10 text-ink py-3 rounded-lg font-medium transition-all"
          >
            Back
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-[2] bg-accent text-bg py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all shadow-lg"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : 'Save to Memex'}
          </button>
        </div>
        {error && <p className="text-xs text-red-400 bg-red-400/10 p-3 rounded-lg">{error}</p>}
      </div>
    );
  }

  // ── Upload state ────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !file && fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-3 transition-all ${
          dragging ? 'border-accent bg-accent/10' : 'border-white/10 hover:border-accent/40 hover:bg-accent/5 cursor-pointer'
        }`}
      >
        {file ? (
          <div className="flex items-center gap-3 w-full">
            <FileText size={20} className="text-accent shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-ink font-medium truncate">{file.name}</p>
              <p className="text-xs text-ink-muted">{(file.size / 1024).toFixed(0)} KB</p>
            </div>
            <button
              onClick={e => { e.stopPropagation(); setFile(null); setError(null); }}
              className="text-ink-muted hover:text-red-400 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <>
            <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center text-ink-muted">
              <Upload size={22} />
            </div>
            <div className="text-center">
              <p className="text-sm text-ink font-medium">Drop a file or click to browse</p>
              <p className="text-xs text-ink-muted mt-1">PDF · Word · PowerPoint · Excel · CSV · Images · HTML</p>
            </div>
          </>
        )}
        <input ref={fileInputRef} type="file" accept={ACCEPT} className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
      </div>

      {file && (
        <button
          onClick={handleConvert}
          disabled={loading}
          className="w-full bg-accent text-bg py-3 rounded-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Converting with MarkItDown...
            </>
          ) : (
            'Convert & Classify with AI'
          )}
        </button>
      )}

      {error && (
        <div className="flex items-start gap-2 text-xs text-red-400 bg-red-400/10 border border-red-400/20 p-3 rounded-lg">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      <p className="text-[10px] text-ink-muted text-center">
        Powered by{' '}
        <a href="https://github.com/microsoft/markitdown" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
          MarkItDown
        </a>{' '}
        (MIT) · Content stays local
      </p>
    </div>
  );
}
