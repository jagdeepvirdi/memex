import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Search, 
  X, 
  Loader2, 
  ArrowRight,
  FileText,
  Utensils,
  Film,
  Cpu,
  TrendingUp,
  Link2,
  BookOpen,
  Key
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchItems, fetchSearchResult } from '../../lib/api';
import type { Item, ItemType } from '../../../../shared/types';

const ITEM_TYPES: ItemType[] = ['note', 'link', 'recipe', 'media', 'book', 'place', 'spec', 'stock', 'password'];

interface SearchModalProps {
  onClose: () => void;
  initialQuery?: string;
  initialTag?: string;
}

export default function SearchModal({ onClose, initialQuery = '', initialTag = '' }: SearchModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [typeFilter, setTypeFilter] = useState<ItemType | ''>('');
  const [tagFilter, setTagFilter] = useState(initialTag);
  const [retryKey, setRetryKey] = useState(0);
  const requestSeq = useRef(0);
  // false when the server could only match keywords (the embedding model is unavailable or nothing is embedded yet)
  const [semantic, setSemantic] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(initialQuery) }, [initialQuery]);
  useEffect(() => { setTagFilter(initialTag) }, [initialTag]);

  // Focus trap — keep Tab/Shift+Tab inside the dialog
  const handleDialogKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button, input, [href], [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }, [onClose]);

  // Always-current view of state for the window listener. Registering the
  // listener once (instead of re-attaching it in an effect on every results /
  // selectedIndex change) avoids a window where a keypress hits a stale closure.
  const latestRef = useRef<{ results: Item[]; selectedIndex: number; select: (id: string) => void }>({
    results,
    selectedIndex,
    select: () => {},
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const { results: current, selectedIndex: index, select } = latestRef.current;
      const count = current.length || 1;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((index + 1) % count);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((index - 1 + count) % count);
      } else if (e.key === 'Enter' && current[index]) {
        select(current[index].id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const seq = ++requestSeq.current;
    if (!query.trim() && !tagFilter.trim()) {
      setResults([]);
      setSearchError(false);
      setLoading(false);
      return;
    }

    const timeout = setTimeout(async () => {
      setLoading(true);
      setSearchError(false);
      setResults([]);
      try {
        const found = tagFilter && !query.trim()
          ? { ...(await fetchItems({ tag: tagFilter, type: typeFilter || undefined, limit: 20 })), semantic: true }
          : await fetchSearchResult(query, { ...(typeFilter ? { type: typeFilter } : {}), ...(tagFilter ? { tag: tagFilter } : {}) });
        if (seq !== requestSeq.current) return;
        setResults(found.items);
        setSemantic(found.semantic);
        setSelectedIndex(0);
      } catch {
        if (seq === requestSeq.current) { setSearchError(true); setResults([]); }
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    }, 300);

    return () => { clearTimeout(timeout); requestSeq.current += 1; };
  }, [query, typeFilter, tagFilter, retryKey]);

  const handleSelect = (id: string) => {
    navigate(`/item/${id}`);
    onClose();
  };

  latestRef.current = { results, selectedIndex, select: handleSelect };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] px-4 bg-bg/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onKeyDown={handleDialogKeyDown}
        className="w-full max-w-2xl bg-surface border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-top-4 duration-300"
      >
        {/* Input Area */}
        <div className="flex items-center gap-4 px-6 py-4 border-b border-white/5">
          <Search size={22} className={loading ? 'text-accent animate-pulse' : 'text-ink-muted'} aria-hidden="true" />
          <input
            ref={inputRef}
            autoFocus
            type="text"
            aria-label="Search your knowledge base"
            placeholder="Search items, notes, recipes..."
            className="flex-1 bg-transparent border-none outline-none text-ink text-lg placeholder:text-ink-muted/30"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="flex items-center gap-2">
            {loading ? (
              <Loader2 size={18} className="animate-spin text-ink-muted" aria-hidden="true" />
            ) : (
              <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 rounded border border-white/5 text-[10px] text-ink-muted font-mono uppercase" aria-hidden="true">
                /
              </div>
            )}
            <button onClick={onClose} aria-label="Close search" className="p-1 hover:bg-white/5 rounded-md text-ink-muted transition-colors">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-5 py-2">
          {tagFilter && <span className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-xs text-accent">Tag: {tagFilter}<button type="button" aria-label="Remove tag filter" onClick={() => setTagFilter('')} className="rounded p-1 hover:bg-accent/10"><X size={12} aria-hidden="true" /></button></span>}
          <label htmlFor="search-type-filter" className="text-xs text-ink-muted">Filter by type</label>
          <select id="search-type-filter" value={typeFilter} onChange={e => setTypeFilter(e.target.value as ItemType | '')} className="rounded-lg border border-white/10 bg-surface px-3 py-2 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <option value="">All types</option>
            {ITEM_TYPES.map(type => <option key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</option>)}
          </select>
        </div>

        {/* Results Area */}
        <div
          role="listbox"
          aria-label="Search results"
          className="flex-1 overflow-y-auto max-h-[60vh]"
        >
          {query.trim() && !loading && !searchError && results.length > 0 && !semantic && (
            <p role="status" className="mx-4 mt-3 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              Showing keyword matches only: semantic search is unavailable right now. Check Settings &rsaquo; AI &rsaquo; Search &amp; embeddings.
            </p>
          )}
          {!query.trim() && !tagFilter.trim() ? (
            <div className="p-12 text-center space-y-2">
              <p className="text-ink font-display text-lg">Start typing to search...</p>
              <p className="text-ink-muted text-sm">Semantic search finds meanings, not just keywords.</p>
            </div>
          ) : searchError ? (
            <div role="alert" className="p-12 text-center space-y-2"><p className="text-ink font-display text-lg">Search couldn’t be completed</p><p className="text-ink-muted text-sm">Check your connection and try again.</p><button type="button" onClick={() => setRetryKey(key => key + 1)} className="mt-2 rounded-lg px-3 py-2 text-sm font-medium text-accent hover:bg-accent/10">Retry search</button></div>
          ) : results.length > 0 ? (
            <div className="p-2">
              {results.map((item, i) => (
                <div
                  key={item.id}
                  role="option"
                  aria-selected={selectedIndex === i}
                  tabIndex={0}
                  onClick={() => handleSelect(item.id)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSelect(item.id)}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className={`flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-all ${
                    selectedIndex === i ? 'bg-accent/10 border-accent/20' : 'hover:bg-white/5 border-transparent'
                  } border`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    selectedIndex === i ? 'bg-accent text-bg shadow-lg shadow-accent/20' : 'bg-white/5 text-ink-muted'
                  } transition-colors`}>
                    <ItemTypeIcon type={item.type} />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-ink font-medium truncate">{item.title}</h4>
                      {item.categories.length > 0 && (
                        <span className="text-[10px] text-ink-muted bg-white/5 px-1.5 py-0.5 rounded flex items-center gap-1">
                          {item.categories.join(' › ')}
                        </span>
                      )}
                    </div>
                    <p className="text-ink-muted text-xs truncate mt-0.5">
                      {(item.structured as any)?.summary || item.content.slice(0, 100)}
                    </p>
                    <p className="mt-1 text-[10px] text-ink-muted/70">{item.type} · {new Date(item.updatedAt || item.createdAt).toLocaleDateString()}</p>
                  </div>

                  <ArrowRight size={16} className={`text-accent transition-all ${selectedIndex === i ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'}`} />
                </div>
              ))}
            </div>
          ) : !loading && (
            <div className="p-12 text-center space-y-2">
              <p className="text-ink font-display text-lg">No results found</p>
              <p className="text-ink-muted text-sm">Try broadening your search or using different keywords.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/5 bg-surface/50 flex items-center justify-between text-[10px] text-ink-muted uppercase tracking-widest font-mono">
          <div className="flex gap-4">
            <span className="flex items-center gap-1.5"><kbd className="px-1 py-0.5 bg-white/5 rounded border border-white/10 text-ink">↑↓</kbd> Navigate</span>
            <span className="flex items-center gap-1.5"><kbd className="px-1 py-0.5 bg-white/5 rounded border border-white/10 text-ink">Enter</kbd> Open</span>
          </div>
          <div className="flex gap-4">
             <span className="flex items-center gap-1.5"><kbd className="px-1 py-0.5 bg-white/5 rounded border border-white/10 text-ink">Esc</kbd> Close</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ItemTypeIcon({ type }: { type: string }) {
  switch (type) {
    case 'recipe': return <Utensils size={18} />;
    case 'media': return <Film size={18} />;
    case 'book': return <BookOpen size={18} />;
    case 'stock': return <TrendingUp size={18} />;
    case 'spec': return <Cpu size={18} />;
    case 'link': return <Link2 size={18} />;
    case 'password': return <Key size={18} />;
    default: return <FileText size={18} />;
  }
}
