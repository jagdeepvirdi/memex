import { useState, useRef } from 'react';
import { Loader2, Upload, Check, AlertCircle, FileJson } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import type { ItemSource } from '../../../../shared/types';

interface KeepNote {
  title: string;
  content: string;
  labels: string[];
  updatedAt: string;
  source: ItemSource;
}


export default function KeepImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<KeepNote[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [importComplete, setImportComplete] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState(0);
  const [jobElapsed, setJobElapsed] = useState('0');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const token = useAuthStore.getState().token
      const res = await fetch('/api/ingest/keep', {
        method: 'POST',
        body: formData,
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });

      if (!res.ok) throw new Error('Failed to upload ZIP');

      const data = await res.json();
      if (data.notes.length === 0) {
        throw new Error('No Keep notes found in ZIP. Make sure you uploaded a Google Takeout ZIP containing your Keep data.');
      }
      setNotes(data.notes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload ZIP');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkImport = async () => {
    if (notes.length === 0) return;
    setIsSaving(true);
    setError(null);

    try {
      const token = useAuthStore.getState().token;
      const data = await apiFetch<{ saved: number; jobId: string }>('/ingest/keep/bulk', {
        method: 'POST',
        body: JSON.stringify({ notes }),
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setSavedCount(data.saved);
      setJobId(data.jobId);
      setImportComplete(true);
      localStorage.setItem('memex-import-job', JSON.stringify({ jobId: data.jobId, total: data.saved }));

      // Poll progress in background so user can watch enrichment happen
      const poll = setInterval(async () => {
        try {
          const job = await apiFetch<any>(`/ingest/jobs/${data.jobId}`);
          setJobProgress(job.progress);
          setJobElapsed(job.elapsed);
          if (job.status === 'completed' || job.status === 'failed') clearInterval(poll);
        } catch {
          clearInterval(poll);
        }
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import notes');
    } finally {
      setIsSaving(false);
    }
  };

  if (importComplete) {
    return (
      <div className="bg-surface p-12 rounded-xl border border-white/5 flex flex-col items-center gap-6 text-center">
        <div className="w-16 h-16 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center">
          <Check size={32} />
        </div>
        <div>
          <h2 className="font-display text-2xl text-ink mb-2">{savedCount} notes saved!</h2>
          <p className="text-ink-muted">
            Your notes are in Memex. AI is classifying them in the background.
          </p>
        </div>

        {/* Background progress */}
        <div className="w-full max-w-sm space-y-2">
          <div className="flex justify-between text-xs text-ink-muted">
            <span>AI enrichment</span>
            <span>{jobProgress}% · {jobElapsed}s</span>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-500"
              style={{ width: `${jobProgress}%` }}
            />
          </div>
          {jobProgress < 100 && (
            <p className="text-[10px] text-ink-muted text-center">
              You can go to the dashboard now — classification continues in the background.
            </p>
          )}
        </div>

        <button
          onClick={() => window.location.reload()}
          className="bg-accent text-bg px-8 py-3 rounded-lg font-bold"
        >
          Go to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-xl border border-white/5 shadow-2xl flex flex-col max-h-[80vh]">
      <div className="p-6 border-b border-white/5 flex justify-between items-center">
        <h2 className="font-display text-xl text-ink">Import from Google Keep</h2>
        <span className="text-xs font-mono text-ink-muted bg-white/5 px-2 py-1 rounded">ZIP Takeout</span>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {!file && (
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-white/10 rounded-xl p-12 flex flex-col items-center gap-4 cursor-pointer hover:border-accent/50 hover:bg-accent/5 transition-all group"
          >
            <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center text-ink-muted group-hover:text-accent transition-colors">
              <Upload size={24} />
            </div>
            <div className="text-center">
              <p className="text-ink font-medium">Click to upload Google Takeout ZIP</p>
              <p className="text-ink-muted text-sm mt-1">Files should be from Google Takeout (Keep folder)</p>
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept=".zip" 
              className="hidden" 
            />
          </div>
        )}

        {file && notes.length === 0 && (
          <div className="flex flex-col items-center gap-6 py-8">
            <div className="flex items-center gap-3 bg-white/5 p-4 rounded-lg border border-white/5 w-full">
              <FileJson className="text-accent" />
              <div className="flex-1 min-w-0">
                <p className="text-ink text-sm font-medium truncate">{file.name}</p>
                <p className="text-ink-muted text-xs">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <button 
                onClick={() => setFile(null)}
                className="text-ink-muted hover:text-ink"
              >
                <AlertCircle size={18} />
              </button>
            </div>
            
            <button
              onClick={handleUpload}
              disabled={loading}
              className="w-full bg-accent text-bg py-3 rounded-lg font-bold flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="animate-spin" /> : 'Parse Takeout ZIP'}
            </button>
          </div>
        )}

        {notes.length > 0 && (
          <div className="space-y-6">
            <div className="bg-white/5 p-4 rounded-lg border border-white/5">
              <p className="text-ink font-medium">{notes.length} notes found</p>
              <p className="text-ink-muted text-sm mt-1">
                They'll be saved instantly. AI classification runs in the background.
              </p>
            </div>

            <div className="max-h-52 overflow-y-auto space-y-1 border border-white/5 rounded-lg p-2">
              {notes.map((note, i) => (
                <div key={i} className="text-xs text-ink-muted p-2 hover:bg-white/5 rounded truncate">
                  {note.title || note.content.slice(0, 60) || 'Untitled'}
                </div>
              ))}
            </div>

            <button
              onClick={handleBulkImport}
              disabled={isSaving}
              className="w-full bg-accent text-bg py-4 rounded-lg font-bold flex flex-col items-center justify-center gap-1 shadow-lg disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  <span className="text-xs opacity-70 font-normal">Saving to database...</span>
                </>
              ) : (
                <>
                  <span>Import {notes.length} Notes Now</span>
                  <span className="text-[10px] opacity-70 font-normal">AI enrichment runs in the background</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 m-6 mt-0 bg-red-400/10 border border-red-400/20 rounded-lg text-red-400 text-sm flex items-start gap-3">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}
