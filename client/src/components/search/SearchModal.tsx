import { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Command, 
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
import { fetchSearch } from '../../lib/api';
import type { Item } from '../../../../shared/types';

interface SearchModalProps {
  onClose: () => void;
}

export default function SearchModal({ onClose }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % (results.length || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + (results.length || 1)) % (results.length || 1));
      } else if (e.key === 'Enter' && results[selectedIndex]) {
        handleSelect(results[selectedIndex].id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [results, selectedIndex]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const items = await fetchSearch(query);
        setResults(items);
        setSelectedIndex(0);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [query]);

  const handleSelect = (id: string) => {
    navigate(`/item/${id}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] px-4 bg-bg/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-surface border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-top-4 duration-300">
        
        {/* Input Area */}
        <div className="flex items-center gap-4 px-6 py-4 border-b border-white/5">
          <Search size={22} className={loading ? 'text-accent animate-pulse' : 'text-ink-muted'} />
          <input
            ref={inputRef}
            autoFocus
            type="text"
            placeholder="Search items, notes, recipes..."
            className="flex-1 bg-transparent border-none outline-none text-ink text-lg placeholder:text-ink-muted/30"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="flex items-center gap-2">
            {loading ? (
              <Loader2 size={18} className="animate-spin text-ink-muted" />
            ) : (
              <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 rounded border border-white/5 text-[10px] text-ink-muted font-mono uppercase">
                <Command size={10} /> K
              </div>
            )}
            <button onClick={onClose} className="p-1 hover:bg-white/5 rounded-md text-ink-muted transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Results Area */}
        <div className="flex-1 overflow-y-auto max-h-[60vh]">
          {!query.trim() ? (
            <div className="p-12 text-center space-y-2">
              <p className="text-ink font-display text-lg">Start typing to search...</p>
              <p className="text-ink-muted text-sm">Semantic search finds meanings, not just keywords.</p>
            </div>
          ) : results.length > 0 ? (
            <div className="p-2">
              {results.map((item, i) => (
                <div
                  key={item.id}
                  onClick={() => handleSelect(item.id)}
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
