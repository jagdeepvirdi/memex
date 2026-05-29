import { useState, useEffect, useRef } from 'react';
import {
  Home,
  Folder,
  Shield,
  Tag as TagIcon,
  ChevronRight,
  ChevronDown,
  Settings as SettingsIcon,
  LogOut,
  Brain,
  Trash2,
  Sparkles,
  Check,
  Table,
  MapPin,
  Clapperboard,
  MessageSquare,
  Wifi,
  WifiOff,
  Newspaper,
  FolderSync,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchCategories, fetchTags, apiFetch } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import type { Category, Tag } from '../../../../shared/types';

interface SidebarProps {
  activeSection: 'dashboard' | 'categories' | 'vault' | 'tags' | 'settings' | 'trash' | 'table' | 'places' | 'media' | 'ask' | 'category-review' | 'digest';
}

export default function Sidebar({ activeSection }: SidebarProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});
  const [aiStatus, setAiStatus] = useState<'ok' | 'error' | 'loading'>('loading');
  const [enrichment, setEnrichment] = useState<{ pending: number; total: number } | null>(null);
  const [eta, setEta] = useState<string | null>(null);
  const [rate, setRate] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  const startTimeRef = useRef<number | null>(null);
  const startPendingRef = useRef<number | null>(null);

  const navigate = useNavigate();
  const { logout, user } = useAuthStore();

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    Promise.all([fetchCategories(), fetchTags()])
      .then(([cats, tgs]) => {
        setCategories(cats);
        setTags(tgs);
      })
      .catch(console.error);

    const checkStatus = () => {
      apiFetch<{ status: string }>('/health/ollama')
        .then(res => setAiStatus(res.status as 'ok' | 'error'))
        .catch(() => setAiStatus('error'));
    };

    checkStatus();
    const interval = setInterval(checkStatus, 30000);

    // Poll DB-backed enrichment count every 5s; refresh categories when items get classified
    let prevPending = -1;
    const checkEnrichment = async () => {
      try {
        const data = await apiFetch<{ pending: number; total: number }>('/items/enrichment');
        if (data.total > 0) {
          setEnrichment(data);

          // Track progress for ETA
          if (data.pending > 0) {
            if (startTimeRef.current === null) {
              startTimeRef.current = Date.now();
              startPendingRef.current = data.pending;
            } else {
              const elapsedSec = (Date.now() - startTimeRef.current) / 1000;
              const completedSinceStart = startPendingRef.current! - data.pending;
              
              if (completedSinceStart > 0 && elapsedSec > 0) {
                const itemsPerSec = completedSinceStart / elapsedSec;
                const itemsPerMin = itemsPerSec * 60;
                const remainingSec = data.pending / itemsPerSec;

                setRate(`${itemsPerMin.toFixed(1)} notes/min`);
                setEta(formatDuration(remainingSec));
              }
            }
          } else {
            // Completed
            startTimeRef.current = null;
            startPendingRef.current = null;
            setEta(null);
            setRate(null);
          }

          // Refresh categories whenever the pending count drops (new items got classified)
          if (prevPending > 0 && data.pending < prevPending) {
            fetchCategories().then(setCategories).catch(console.error);
            fetchTags().then(setTags).catch(console.error);
          }
          prevPending = data.pending;
        } else {
          setEnrichment(null);
        }
      } catch {
        // ignore — non-critical
      }
    };
    checkEnrichment();
    const enrichInterval = setInterval(checkEnrichment, 5000);

    return () => {
      clearInterval(interval);
      clearInterval(enrichInterval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const toggleCat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedCats(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className="w-64 border-r border-white/5 bg-surface/50 hidden md:flex flex-col sticky top-0 h-screen overflow-hidden">
      {/* Brand */}
      <div className="p-6 flex items-center gap-3">
         <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center text-bg font-bold shadow-lg shadow-accent/20">M</div>
         <h1 className="font-display text-2xl text-ink">Memex</h1>
      </div>
      
      {/* Main Nav */}
      <nav className="px-3 flex flex-col gap-1">
        <NavItem
          icon={<Home size={18} />}
          label="Dashboard"
          active={activeSection === 'dashboard'}
          onClick={() => navigate('/')}
        />
        <NavItem
          icon={<Newspaper size={18} />}
          label="Weekly Digest"
          active={activeSection === 'digest'}
          onClick={() => navigate('/digest')}
        />
        <NavItem 
          icon={<MessageSquare size={18} />} 
          label="Ask Knowledge" 
          active={activeSection === 'ask'} 
          onClick={() => navigate('/ask')}
        />
        <NavItem 
          icon={<Table size={18} />} 
          label="Table View" 
          active={activeSection === 'table'} 
          onClick={() => navigate('/items/table')}
        />
        <NavItem 
          icon={<MapPin size={18} />} 
          label="Places" 
          active={activeSection === 'places'} 
          onClick={() => navigate('/places')}
        />
        <NavItem 
          icon={<Clapperboard size={18} />} 
          label="Media & Books" 
          active={activeSection === 'media'} 
          onClick={() => navigate('/media')}
        />
        <NavItem 
          icon={<Shield size={18} />} 
          label="Vault" 
          active={activeSection === 'vault'} 
          onClick={() => navigate('/vault')}
        />
        <NavItem 
          icon={<Trash2 size={18} />} 
          label="Trash" 
          active={activeSection === 'trash'} 
          onClick={() => navigate('/trash')}
        />
        <NavItem
          icon={<FolderSync size={18} />}
          label="Category Review"
          active={activeSection === 'category-review'}
          onClick={() => navigate('/categories/review')}
        />
        <NavItem
          icon={<SettingsIcon size={18} />}
          label="Settings"
          active={activeSection === 'settings'}
          onClick={() => navigate('/settings')}
        />
      </nav>

      <div className="mt-8 flex-1 overflow-y-auto px-3 pb-8 custom-scrollbar">
        {/* Categories Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between px-3 mb-2">
            <h3 className="text-[10px] text-ink-muted uppercase tracking-widest font-bold flex items-center gap-2">
              <Folder size={12} />
              Categories
            </h3>
          </div>
          <div className="space-y-0.5">
            {categories.map(cat => (
              <CategoryItem 
                key={cat.id} 
                cat={cat} 
                level={0} 
                expanded={expandedCats} 
                onToggle={toggleCat}
                onSelect={(id) => navigate(`/category/${id}`)}
              />
            ))}
          </div>
        </div>

        {/* Tags Section */}
        <div>
          <div className="flex items-center justify-between px-3 mb-4">
            <h3 className="text-[10px] text-ink-muted uppercase tracking-widest font-bold flex items-center gap-2">
              <TagIcon size={12} />
              Popular Tags
            </h3>
          </div>
          <div className="flex flex-wrap gap-2 px-3">
            {tags.slice(0, 15).map(tag => (
              <button
                key={tag.name}
                className="text-[10px] bg-white/5 hover:bg-white/10 text-ink-muted hover:text-accent border border-white/5 rounded-full px-2.5 py-1 transition-all"
                onClick={() => navigate(`/search?tag=${tag.name}`)}
              >
                {tag.name}
                <span className="ml-1 opacity-40">({tag.itemCount})</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* User & AI Status Footer */}
      <div className="p-4 mt-auto border-t border-white/5 bg-surface/80 flex flex-col gap-4">
         {/* User Info */}
         <div className="flex items-center justify-between px-2">
            <div className="flex flex-col min-w-0">
               <span className="text-[10px] text-ink font-medium truncate">{user?.email}</span>
               <button onClick={handleLogout} className="text-[9px] text-ink-muted hover:text-red-400 flex items-center gap-1 mt-0.5 transition-colors uppercase tracking-tighter">
                  <LogOut size={10} /> Logout
               </button>
            </div>
         </div>

         {enrichment && enrichment.total > 0 && (
           <div className={`p-3 rounded-xl border transition-all ${
             enrichment.pending === 0 ? 'bg-green-500/10 border-green-500/20' : 'bg-accent/5 border-accent/20'
           }`}>
             <div className="flex items-center justify-between mb-2">
               <p className="text-[9px] text-ink-muted uppercase tracking-widest font-bold">AI Enrichment</p>
               {enrichment.pending === 0
                 ? <Check size={10} className="text-green-400" />
                 : <Sparkles size={10} className="text-accent animate-pulse" />}
             </div>
             <div className="flex items-center justify-between mb-1.5">
               <span className="text-[10px] text-ink font-mono">
                 {enrichment.pending === 0
                   ? `${enrichment.total} classified`
                   : `${enrichment.total - enrichment.pending} / ${enrichment.total}`}
               </span>
               {enrichment.pending > 0 && (
                 <span className="text-[10px] text-ink-muted">{enrichment.pending} left</span>
               )}
             </div>
             <div className="h-1 bg-white/10 rounded-full overflow-hidden mb-2">
               <div
                 className={`h-full rounded-full transition-all duration-500 ${enrichment.pending === 0 ? 'bg-green-400' : 'bg-accent'}`}
                 style={{ width: `${Math.round(((enrichment.total - enrichment.pending) / enrichment.total) * 100)}%` }}
               />
             </div>
             {enrichment.pending > 0 && (eta || rate) && (
               <div className="flex items-center justify-between mt-1">
                 <span className="text-[8px] text-ink-muted uppercase font-bold tracking-tighter">
                   {rate && `~${rate}`}
                 </span>
                 <span className="text-[8px] text-accent font-bold uppercase tracking-tighter">
                   {eta && `ETA: ${eta}`}
                 </span>
               </div>
             )}
           </div>
         )}

         <div className="p-3 bg-white/5 rounded-xl border border-white/5 group hover:border-white/10 transition-all">
            <div className="flex items-center justify-between mb-2">
               <p className="text-[9px] text-ink-muted uppercase tracking-widest font-bold">Local Intelligence</p>
               <Brain size={10} className={aiStatus === 'ok' ? 'text-accent' : 'text-ink-muted'} />
            </div>
            <div className="flex items-center justify-between mb-1.5">
               <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${
                    aiStatus === 'ok' ? 'bg-green-500 animate-pulse' :
                    aiStatus === 'error' ? 'bg-red-500' : 'bg-yellow-500'
                  }`} />
                  <span className="text-[10px] text-ink font-mono">Ollama</span>
               </div>
               <span className={`text-[10px] font-bold ${
                 aiStatus === 'ok' ? 'text-accent' : 'text-ink-muted'
               }`}>
                 {aiStatus === 'ok' ? 'READY' : aiStatus === 'error' ? 'OFFLINE' : 'WAIT'}
               </span>
            </div>
            <div className="flex items-center justify-between">
               <div className="flex items-center gap-2">
                  {isOnline
                    ? <Wifi size={10} className="text-green-400" />
                    : <WifiOff size={10} className="text-orange-400" />}
                  <span className="text-[10px] text-ink font-mono">Network</span>
               </div>
               <span className={`text-[10px] font-bold ${isOnline ? 'text-green-400' : 'text-orange-400'}`}>
                 {isOnline ? 'ONLINE' : 'OFFLINE'}
               </span>
            </div>
         </div>
      </div>
    </aside>
  );
}

function NavItem({ icon, label, active = false, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick: () => void }) {
  return (
    <div 
      onClick={onClick}
      className={`flex items-center justify-between px-4 py-2.5 rounded-xl font-medium cursor-pointer transition-all group ${
        active ? 'bg-accent/10 text-accent' : 'text-ink-muted hover:text-ink hover:bg-white/5'
      }`}
    >
      <div className="flex items-center gap-3">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      {active && <div className="w-1 h-1 bg-accent rounded-full" />}
    </div>
  );
}

function CategoryItem({ cat, level, expanded, onToggle, onSelect }: { 
  cat: Category, 
  level: number, 
  expanded: Record<string, boolean>,
  onToggle: (id: string, e: React.MouseEvent) => void,
  onSelect: (id: string) => void
}) {
  const isExpanded = expanded[cat.id];
  const hasChildren = cat.children && cat.children.length > 0;

  return (
    <div className="flex flex-col">
      <div 
        onClick={() => onSelect(cat.id)}
        className="flex items-center justify-between px-3 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer group transition-colors"
        style={{ paddingLeft: `${(level * 12) + 12}px` }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {hasChildren ? (
            <button 
              onClick={(e) => onToggle(cat.id, e)}
              className="p-0.5 hover:bg-white/10 rounded transition-colors text-ink-muted group-hover:text-ink"
            >
              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          ) : (
            <div className="w-4 h-4 flex items-center justify-center shrink-0">
               <div className="w-1 h-1 bg-ink-muted/30 rounded-full" />
            </div>
          )}
          <span className="text-sm text-ink-muted group-hover:text-ink truncate transition-colors">
            {cat.name}
          </span>
        </div>
        <span className="text-[10px] text-ink-muted/40 font-mono group-hover:text-ink-muted transition-colors">
          {cat.itemCount}
        </span>
      </div>
      
      {hasChildren && isExpanded && (
        <div className="flex flex-col">
          {cat.children!.map(child => (
            <CategoryItem 
              key={child.id} 
              cat={child} 
              level={level + 1} 
              expanded={expanded} 
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m`;
}
