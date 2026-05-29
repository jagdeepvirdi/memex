import { useState, useRef, useEffect } from 'react';
import { Loader2, Mic, Square, Upload, AlertCircle, X, ExternalLink, AlertTriangle, Play } from 'lucide-react';
import { createItem, fetchWhisperHealth } from '../../lib/api';
import type { SimilarItem } from '../../lib/api';
import ItemCard from '../cards/ItemCard';
import type { Item, CreateItemRequest } from '../../../../shared/types';

interface Props {
  onSuccess?: (item: Item) => void;
}

export default function VoiceIngestPanel({ onSuccess }: Props) {
  const [whisperOk, setWhisperOk] = useState<boolean | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'embedding'> | null>(null);
  const [similarItems, setSimilarItems] = useState<SimilarItem[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchWhisperHealth().then(r => setWhisperOk(r.installed)).catch(() => setWhisperOk(false));
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, []);

  const setBlob = (blob: Blob) => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(blob);
    setAudioUrl(URL.createObjectURL(blob));
    setPreview(null);
    setError(null);
  };

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setBlob(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } catch {
      setError('Microphone access denied or unavailable.');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const handleTranscribe = async () => {
    if (!audioBlob) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      const ext = audioBlob.type.includes('webm') ? 'webm' : audioBlob.type.includes('ogg') ? 'ogg' : 'wav';
      form.append('file', audioBlob, `recording.${ext}`);

      const res = await fetch('/api/ingest/voice', {
        method: 'POST',
        body: form,
        headers: {
          Authorization: `Bearer ${JSON.parse(localStorage.getItem('memex-auth') || '{}')?.state?.token ?? ''}`,
        },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.code === 'NO_WHISPER') setWhisperOk(false);
        throw new Error(data.error || `Server error ${res.status}`);
      }

      const { preview: p, similarItems: sim } = await res.json();
      setPreview({ ...p, reviewed: false, encrypted: false });
      setSimilarItems(sim ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transcription failed');
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
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      onSuccess?.(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setPreview(null);
    setSimilarItems([]);
    setError(null);
    setElapsed(0);
  };

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // ── Whisper not installed ───────────────────────────────────────────────────
  if (whisperOk === false && !preview) {
    return (
      <div className="p-6">
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle size={18} className="text-yellow-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-ink font-medium">Whisper is not installed</p>
            <p className="text-xs text-ink-muted mt-1">
              Voice transcription runs locally via OpenAI Whisper.
            </p>
            <code className="block mt-2 text-xs bg-bg text-accent px-3 py-2 rounded-lg border border-white/10 font-mono">
              pip install openai-whisper
            </code>
            <p className="text-xs text-ink-muted mt-2">
              Requires Python 3.8+ and ffmpeg. After installing, restart the Memex server.
            </p>
            <a href="https://github.com/openai/whisper" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-accent hover:underline mt-2">
              <ExternalLink size={11} /> OpenAI Whisper (MIT License)
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── Preview ─────────────────────────────────────────────────────────────────
  if (preview) {
    return (
      <div className="p-6 space-y-4 animate-in fade-in duration-200">
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
                  </div>
                  <a href={`/item/${s.id}`} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 text-accent hover:text-accent/80"><ExternalLink size={12} /></a>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="opacity-80 pointer-events-none">
          <ItemCard item={{ ...preview, id: 'preview', createdAt: new Date(), updatedAt: new Date() }} />
        </div>
        <div className="flex gap-3">
          <button onClick={reset} className="flex-1 bg-white/5 hover:bg-white/10 text-ink py-3 rounded-lg font-medium transition-all">
            Discard
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-[2] bg-accent text-bg py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all shadow-lg">
            {saving ? <Loader2 size={16} className="animate-spin" /> : 'Save to Memex'}
          </button>
        </div>
        {error && <p className="text-xs text-red-400 bg-red-400/10 p-3 rounded-lg">{error}</p>}
      </div>
    );
  }

  // ── Record / Upload ─────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-4">
      {/* Recorder */}
      <div className="border-2 border-dashed border-white/10 rounded-xl p-8 flex flex-col items-center gap-4">
        {recording ? (
          <>
            <button onClick={stopRecording}
              className="w-16 h-16 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center text-white transition-all animate-pulse">
              <Square size={24} fill="white" />
            </button>
            <p className="text-sm text-ink font-mono">{fmtTime(elapsed)} · recording…</p>
          </>
        ) : audioBlob ? (
          <>
            <div className="flex items-center gap-2 w-full">
              <Play size={18} className="text-accent shrink-0" />
              {audioUrl && <audio src={audioUrl} controls className="flex-1 h-9" />}
              <button onClick={reset} className="text-ink-muted hover:text-red-400 transition-colors shrink-0">
                <X size={16} />
              </button>
            </div>
          </>
        ) : (
          <>
            <button onClick={startRecording}
              className="w-16 h-16 bg-accent/20 hover:bg-accent/30 text-accent rounded-full flex items-center justify-center transition-all">
              <Mic size={24} />
            </button>
            <div className="text-center">
              <p className="text-sm text-ink font-medium">Tap to record a voice memo</p>
              <p className="text-xs text-ink-muted mt-1">or upload an audio file below</p>
            </div>
            <button onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 text-xs text-ink-muted hover:text-ink bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-all">
              <Upload size={13} /> Upload audio
            </button>
            <input ref={fileInputRef} type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm,.flac"
              className="hidden" onChange={e => e.target.files?.[0] && setBlob(e.target.files[0])} />
          </>
        )}
      </div>

      {audioBlob && !recording && (
        <button onClick={handleTranscribe} disabled={loading}
          className="w-full bg-accent text-bg py-3 rounded-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-all shadow-lg shadow-accent/10">
          {loading ? (
            <><Loader2 size={16} className="animate-spin" /> Transcribing locally…</>
          ) : (
            <><Mic size={16} /> Transcribe & Classify</>
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
        Transcribed locally by OpenAI Whisper · audio never leaves your machine
      </p>
    </div>
  );
}
