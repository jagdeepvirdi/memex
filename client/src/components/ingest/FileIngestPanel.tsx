import { useState, useRef, useEffect } from 'react';
import { Loader2, Upload, FileText, AlertCircle, X, ExternalLink, Eye, ImageIcon, CheckCircle2 } from 'lucide-react';
import { apiFetch, createItem, fetchVisionHealth } from '../../lib/api';
import ItemCard from '../cards/ItemCard';
import type { Item, CreateItemRequest } from '../../../../shared/types';

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']);

function isImage(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return file.type.startsWith('image/') || IMAGE_EXTS.has(ext);
}

interface Props {
  onSuccess?: (item: Item) => void;
}

export default function FileIngestPanel({ onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'embedding'> | null>(null);
  const [markitdownOk, setMarkitdownOk] = useState<boolean | null>(null);
  const [visionModel, setVisionModel] = useState<string | null>(null);
  const [visionChecked, setVisionChecked] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiFetch<{ installed: boolean }>('/ingest/markitdown/health')
      .then(r => setMarkitdownOk(r.installed))
      .catch(() => setMarkitdownOk(false));

    fetchVisionHealth()
      .then(r => { setVisionModel(r.model); setVisionChecked(true); })
      .catch(() => setVisionChecked(true));
  }, []);

  const handleFile = (f: File) => {
    setFile(f);
    setPreview(null);
    setError(null);

    // Generate thumbnail for images
    if (isImage(f)) {
      const url = URL.createObjectURL(f);
      setImagePreviewUrl(url);
    } else {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
      setImagePreviewUrl(null);
    }
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
        // If vision model missing, surface install instructions
        if (data.code === 'NO_VISION_MODEL') {
          setVisionModel(null);
          throw new Error(data.error || 'No vision model available');
        }
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
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
      onSuccess?.(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const fileIsImage = file ? isImage(file) : false;
  const canProcessImage = fileIsImage && !!visionModel;
  const canProcessDoc = !fileIsImage && markitdownOk;

  // ── No tool available for this file type ───────────────────────────────────
  const showNoVisionWarning = fileIsImage && visionChecked && !visionModel;
  const showNoMarkitdownWarning = !fileIsImage && markitdownOk === false && !file;

  // ── Preview state ───────────────────────────────────────────────────────────
  if (preview) {
    return (
      <div className="p-6 space-y-4 animate-in fade-in duration-200">
        <div className="opacity-80 pointer-events-none">
          <ItemCard item={{ ...preview, id: 'preview', createdAt: new Date(), updatedAt: new Date() }} />
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => { setPreview(null); setFile(null); setImagePreviewUrl(null); }}
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

  // ── MarkItDown not installed (no file selected yet) ─────────────────────────
  if (showNoMarkitdownWarning) {
    return (
      <div className="p-6 space-y-4">
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle size={18} className="text-yellow-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-ink font-medium">MarkItDown is not installed</p>
            <p className="text-xs text-ink-muted mt-1">
              Document conversion requires the <code className="bg-white/10 px-1 rounded">markitdown</code> Python package.
            </p>
            <code className="block mt-2 text-xs bg-bg text-accent px-3 py-2 rounded-lg border border-white/10 font-mono">
              pip install 'markitdown[all]'
            </code>
            <p className="text-xs text-ink-muted mt-2">
              Requires Python 3.10+. After installing, restart the Memex server.
            </p>
            <p className="text-xs text-ink-muted mt-3 flex items-center gap-1">
              <ImageIcon size={11} className="text-accent" />
              <span>Images work without MarkItDown — just drop an image to use Vision AI.</span>
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

        {/* Still allow image drops even without markitdown */}
        <DropZone
          file={file}
          imagePreviewUrl={imagePreviewUrl}
          dragging={dragging}
          fileInputRef={fileInputRef}
          onFile={handleFile}
          onDrop={handleDrop}
          onDragOver={() => setDragging(true)}
          onDragLeave={() => setDragging(false)}
          imagesOnly
        />
      </div>
    );
  }

  // ── Upload state ────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-4">
      <DropZone
        file={file}
        imagePreviewUrl={imagePreviewUrl}
        dragging={dragging}
        fileInputRef={fileInputRef}
        onFile={handleFile}
        onDrop={handleDrop}
        onDragOver={() => setDragging(true)}
        onDragLeave={() => setDragging(false)}
      />

      {/* Status badges */}
      {file && (
        <div className="flex items-center gap-2 flex-wrap">
          {fileIsImage ? (
            visionModel ? (
              <span className="flex items-center gap-1.5 text-[10px] bg-purple-500/10 text-purple-300 border border-purple-500/20 rounded-full px-2.5 py-1 font-medium">
                <Eye size={10} />
                Vision AI · {visionModel}
              </span>
            ) : visionChecked ? (
              <span className="flex items-center gap-1.5 text-[10px] bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded-full px-2.5 py-1 font-medium">
                <AlertCircle size={10} />
                No vision model installed
              </span>
            ) : null
          ) : (
            markitdownOk ? (
              <span className="flex items-center gap-1.5 text-[10px] bg-accent/10 text-accent border border-accent/20 rounded-full px-2.5 py-1 font-medium">
                <CheckCircle2 size={10} />
                MarkItDown ready
              </span>
            ) : markitdownOk === false ? (
              <span className="flex items-center gap-1.5 text-[10px] bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded-full px-2.5 py-1 font-medium">
                <AlertCircle size={10} />
                MarkItDown not installed
              </span>
            ) : null
          )}
        </div>
      )}

      {/* No vision model warning for images */}
      {showNoVisionWarning && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle size={16} className="text-yellow-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-ink font-medium">No vision model installed</p>
            <p className="text-xs text-ink-muted mt-1">Pull one of these in Ollama to analyse images:</p>
            <code className="block mt-2 text-xs bg-bg text-accent px-3 py-2 rounded-lg border border-white/10 font-mono leading-relaxed">
              # Fast, 4.7 GB{'\n'}
              ollama pull llava:7b{'\n\n'}
              # Better quality, 7.9 GB{'\n'}
              ollama pull llama3.2-vision:11b
            </code>
            <p className="text-xs text-ink-muted mt-2">After pulling, try again — no server restart needed.</p>
          </div>
        </div>
      )}

      {file && (fileIsImage ? canProcessImage : canProcessDoc !== false) && (
        <button
          onClick={handleConvert}
          disabled={loading || (fileIsImage && !canProcessImage)}
          className="w-full bg-accent text-bg py-3 rounded-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-all shadow-lg shadow-accent/10"
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              {fileIsImage ? 'Analysing image…' : 'Converting with MarkItDown…'}
            </>
          ) : (
            <>
              {fileIsImage ? <Eye size={16} /> : <FileText size={16} />}
              {fileIsImage ? 'Analyse with Vision AI' : 'Convert & Classify with AI'}
            </>
          )}
        </button>
      )}

      {error && (
        <div className="flex items-start gap-2 text-xs text-red-400 bg-red-400/10 border border-red-400/20 p-3 rounded-lg">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <p className="whitespace-pre-wrap">{error}</p>
        </div>
      )}

      <p className="text-[10px] text-ink-muted text-center">
        {fileIsImage
          ? 'Images analysed locally by Ollama vision · no data leaves your machine'
          : <>Powered by{' '}
              <a href="https://github.com/microsoft/markitdown" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                MarkItDown
              </a>{' '}
              (MIT) · Content stays local</>
        }
      </p>
    </div>
  );
}

// ── Drop zone sub-component ────────────────────────────────────────────────────

interface DropZoneProps {
  file: File | null;
  imagePreviewUrl: string | null;
  dragging: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFile: (f: File) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  imagesOnly?: boolean;
}

function DropZone({ file, imagePreviewUrl, dragging, fileInputRef, onFile, onDrop, onDragOver, onDragLeave, imagesOnly }: DropZoneProps) {
  const accept = imagesOnly ? '.jpg,.jpeg,.png,.gif,.webp' : '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.gif,.webp,.html,.txt,.md,.epub,.xml,.json';

  return (
    <div
      onDragOver={e => { e.preventDefault(); onDragOver(); }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => !file && fileInputRef.current?.click()}
      className={`border-2 border-dashed rounded-xl transition-all ${
        dragging ? 'border-accent bg-accent/10' : 'border-white/10 hover:border-accent/40 hover:bg-accent/5'
      } ${!file ? 'cursor-pointer' : ''}`}
    >
      {file && imagePreviewUrl ? (
        // Image preview with thumbnail
        <div className="p-3 flex items-center gap-3">
          <img
            src={imagePreviewUrl}
            alt={file.name}
            className="w-16 h-16 object-cover rounded-lg border border-white/10 shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-ink font-medium truncate">{file.name}</p>
            <p className="text-xs text-ink-muted">{(file.size / 1024).toFixed(0)} KB · image</p>
          </div>
          <button
            onClick={e => { e.stopPropagation(); onFile(null as any); }}
            className="text-ink-muted hover:text-red-400 transition-colors shrink-0"
          >
            <X size={16} />
          </button>
        </div>
      ) : file ? (
        // Document preview
        <div className="p-4 flex items-center gap-3">
          <FileText size={20} className="text-accent shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-ink font-medium truncate">{file.name}</p>
            <p className="text-xs text-ink-muted">{(file.size / 1024).toFixed(0)} KB</p>
          </div>
          <button
            onClick={e => { e.stopPropagation(); onFile(null as any); }}
            className="text-ink-muted hover:text-red-400 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        // Empty drop zone
        <div className="p-8 flex flex-col items-center gap-3">
          <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center text-ink-muted">
            <Upload size={22} />
          </div>
          <div className="text-center">
            <p className="text-sm text-ink font-medium">Drop a file or click to browse</p>
            {imagesOnly ? (
              <p className="text-xs text-ink-muted mt-1">JPG · PNG · GIF · WebP</p>
            ) : (
              <p className="text-xs text-ink-muted mt-1">PDF · Word · PowerPoint · Excel · Images · and more</p>
            )}
          </div>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={e => e.target.files?.[0] && onFile(e.target.files[0])}
      />
    </div>
  );
}
