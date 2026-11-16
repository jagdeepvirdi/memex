import { useEffect, useState } from 'react'
import { Bookmark, Check, Copy, Loader2, RefreshCw } from 'lucide-react'
import { apiFetch } from '../../lib/api'

export function buildBookmarklet(key: string): string {
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

interface Props {
  /** The saved bookmarklet key from `/settings`, if one exists yet. */
  initialKey?: string | null
}

/** One-click "Save to Memex" bookmark. Its key can only save pages (see the auth middleware), nothing else. */
export function BookmarkletPanel({ initialKey }: Props) {
  const [key, setKey] = useState<string | null>(initialKey ?? null)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)

  // The settings load after first render; pick the key up when it arrives (but never overwrite a fresh one).
  useEffect(() => {
    if (initialKey) setKey(k => k ?? initialKey)
  }, [initialKey])

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
    <>
      <div>
        <p className="text-sm text-ink font-medium mb-1">One-click save from any webpage</p>
        <p className="text-xs text-ink-muted max-w-xl">
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
            <p className="text-[10px] text-ink-muted uppercase tracking-widest font-bold">Step 1 — drag this to your bookmarks bar</p>
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
            <p className="text-[10px] text-ink-muted uppercase tracking-widest font-bold">Step 2 — or copy the link manually</p>
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
            <p className="flex items-start gap-1.5"><span className="text-green-400 shrink-0 mt-0.5">✓</span>Works on any website — click the bookmark while browsing</p>
            <p className="flex items-start gap-1.5"><span className="text-green-400 shrink-0 mt-0.5">✓</span>Shows a confirmation toast on the page with the saved title</p>
            <p className="flex items-start gap-1.5"><span className="text-green-400 shrink-0 mt-0.5">✓</span>Warns if a similar item already exists</p>
            <p className="flex items-start gap-1.5">
              <span className="text-green-400 shrink-0 mt-0.5">✓</span>
              The key inside the bookmark can only save pages — it cannot read or change anything else. If you ever share
              or sync the bookmark somewhere you don't trust, regenerate the key.
            </p>
            <p className="flex items-start gap-1.5">
              <span className="text-amber-400 shrink-0 mt-0.5">⚠</span>
              Requires Memex to be running on <code className="bg-white/10 px-1 rounded">localhost:3002</code>
            </p>
          </div>
        </div>
      )}
    </>
  )
}
