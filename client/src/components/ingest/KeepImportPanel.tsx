import { useState, useRef } from 'react';
import { Loader2, Upload, Check, AlertCircle, FileJson } from 'lucide-react';
import { createItem, apiFetch } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import ItemCard from '../cards/ItemCard';
import type { CreateItemRequest, ItemSource } from '../../../../shared/types';

interface KeepNote {
  title: string;
  content: string;
  labels: string[];
  updatedAt: string;
  source: ItemSource;
}

interface ClassifiedNote extends KeepNote {
  type: any;
  structured: any;
  categories: string[];
  tags: string[];
}

export default function KeepImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<KeepNote[]>([]);
  const [classifiedResults, setClassifiedResults] = useState<ClassifiedNote[]>([]);
  const [isClassifying, setIsClassifying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [importComplete, setImportComplete] = useState(false);
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

  const handleClassify = async () => {
    if (notes.length === 0) return;

    setIsClassifying(true);
    setError(null);
    setProgress(0);

    try {
      const { jobId } = await apiFetch<any>('/ingest/keep/classify', {
        method: 'POST',
        body: JSON.stringify({ notes }),
      });

      // Polling
      const poll = setInterval(async () => {
        try {
          const job = await apiFetch<any>(`/ingest/jobs/${jobId}`);
          setProgress(job.progress);

          if (job.status === 'completed') {
            clearInterval(poll);
            setClassifiedResults(job.results);
            setIsClassifying(false);
          } else if (job.status === 'failed') {
            clearInterval(poll);
            setError(job.error || 'Batch classification failed');
            setIsClassifying(false);
          }
        } catch (err) {
          clearInterval(poll);
          setError('Lost connection to server');
          setIsClassifying(false);
        }
      }, 2000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Batch classification failed');
      setIsClassifying(false);
    }
  };

  const handleSaveAll = async () => {
    if (classifiedResults.length === 0) return;

    setIsSaving(true);
    setError(null);

    try {
      for (const result of classifiedResults) {
        const createReq: CreateItemRequest = {
          title: result.title,
          type: result.type,
          content: result.content,
          categories: result.categories,
          tags: result.tags,
          source: result.source,
        };
        await createItem(createReq);
      }
      setImportComplete(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save items');
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
          <h2 className="font-display text-2xl text-ink mb-2">Import Successful!</h2>
          <p className="text-ink-muted">
            {classifiedResults.length} items have been added to your Memex.
          </p>
        </div>
        <button 
          onClick={() => window.location.reload()}
          className="bg-accent text-bg px-8 py-3 rounded-lg font-bold"
        >
          View Dashboard
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

        {notes.length > 0 && classifiedResults.length === 0 && (
          <div className="space-y-6">
            <div className="bg-white/5 p-4 rounded-lg border border-white/5">
              <p className="text-ink font-medium">{notes.length} notes found</p>
              <p className="text-ink-muted text-sm mt-1">Ready to classify with local AI (Ollama)</p>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-2 border border-white/5 rounded-lg p-2">
              {notes.map((note, i) => (
                <div key={i} className="text-xs text-ink-muted p-2 hover:bg-white/5 rounded truncate">
                  {note.title || note.content.slice(0, 50)}
                </div>
              ))}
            </div>

            <button
              onClick={handleClassify}
              disabled={isClassifying}
              className="w-full bg-accent text-bg py-4 rounded-lg font-bold flex flex-col items-center justify-center gap-1 shadow-lg"
            >
              {isClassifying ? (
                <>
                  <Loader2 className="animate-spin" />
                  <span className="text-xs opacity-70">Classifying via Ollama... {progress}%</span>
                  <div className="w-full max-w-[200px] h-1 bg-white/10 rounded-full mt-2 overflow-hidden">
                     <div className="h-full bg-accent transition-all duration-500" style={{ width: `${progress}%` }} />
                  </div>
                </>
              ) : (
                <>
                  <span>Start AI Classification</span>
                  <span className="text-[10px] opacity-70 font-normal">This happens in the background</span>
                </>
              )}
            </button>
          </div>
        )}

        {classifiedResults.length > 0 && (
          <div className="space-y-6 pb-20">
             <div className="bg-green-500/10 p-4 rounded-lg border border-green-500/20 flex items-center justify-between">
                <div>
                  <p className="text-green-500 font-medium">Classification Complete</p>
                  <p className="text-ink-muted text-sm">{classifiedResults.length} items ready to save</p>
                </div>
                <Check className="text-green-500" />
             </div>

             <div className="grid grid-cols-1 gap-4">
                {classifiedResults.slice(0, 5).map((result, i) => (
                  <div key={i} className="opacity-60 scale-[0.98]">
                    <ItemCard 
                      item={{ 
                        ...result, 
                        id: `p-${i}`, 
                        createdAt: new Date(), 
                        updatedAt: new Date(),
                        structured: result.structured || {}
                      }} 
                    />
                  </div>
                ))}
                {classifiedResults.length > 5 && (
                  <p className="text-center text-ink-muted text-xs italic">
                    + {classifiedResults.length - 5} more items
                  </p>
                )}
             </div>
          </div>
        )}
      </div>

      {classifiedResults.length > 0 && !importComplete && (
        <div className="p-6 border-t border-white/5 bg-surface sticky bottom-0">
          <button
            onClick={handleSaveAll}
            disabled={isSaving}
            className="w-full bg-accent text-bg py-4 rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            {isSaving ? (
              <>
                <Loader2 className="animate-spin" />
                Saving to DB...
              </>
            ) : (
              `Confirm and Save ${classifiedResults.length} Items`
            )}
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 m-6 mt-0 bg-red-400/10 border border-red-400/20 rounded-lg text-red-400 text-sm flex items-start gap-3">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}
