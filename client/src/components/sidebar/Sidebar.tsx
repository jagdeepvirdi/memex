import { useState, useEffect } from 'react';
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
  Check
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchCategories, fetchTags, apiFetch } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import type { Category, Tag } from '../../../../shared/types';

interface SidebarProps {
  activeSection: 'dashboard' | 'categories' | 'vault' | 'tags' | 'settings' | 'trash';
}

export default function Sidebar({ activeSection }: SidebarProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});
  const [aiStatus, setAiStatus] = useState<'ok' | 'error' | 'loading'>('loading');
  const [enrichment, setEnrichment] = useState<{ total: number; completed: number; progress: number; elapsed: string; done: boolean } | null>(null);
  const navigate = useNavigate();
  const { logout, user } = useAuthStore();

  useEffect(() => {
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

    // Poll active import job if one exists
    const stored = localStorage.getItem('memex-import-job');
    let jobInterval: ReturnType<typeof setInterval> | null = null;
    if (stored) {
      const { jobId, total } = JSON.parse(stored);
      jobInterval = setInterval(async () => {
        try {
          const job = await apiFetch<any>(`/ingest/jobs/${jobId}`);
          const done = job.status === 'completed' || job.status === 'failed';
          setEnrichment({ total, completed: job.completed ?? 0, progress: job.progress, elapsed: job.elapsed, done });
          if (done) {
            clearInterval(jobInterval!);
            localStorage.removeItem('memex-import-job');
            setTimeout(() => setEnrichment(null), 5000);
          }
        } catch {
          // Job gone (server restarted) — stop polling
          clearInterval(jobInterval!);
          localStorage.removeItem('memex-import-job');
          setEnrichment(null);
        }
      }, 3000);
    }

    return () => {
      clearInterval(interval);
      if (jobInterval) clearInterval(jobInterval);
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

         {enrichment && (
           <div className={`p-3 rounded-xl border transition-all ${enrichment.done ? 'bg-green-500/10 border-green-500/20' : 'bg-accent/5 border-accent/20'}`}>
             <div className="flex items-center justify-between mb-2">
               <p className="text-[9px] text-ink-muted uppercase tracking-widest font-bold">AI Enrichment</p>
               {enrichment.done
                 ? <Check size={10} className="text-green-400" />
                 : <Sparkles size={10} className="text-accent animate-pulse" />}
             </div>
             <div className="flex items-center justify-between mb-1.5">
               <span className="text-[10px] text-ink font-mono">
                 {enrichment.done ? 'Done' : `${enrichment.completed} / ${enrichment.total}`}
               </span>
               <span className="text-[10px] text-ink-muted">{enrichment.elapsed}s</span>
             </div>
             <div className="h-1 bg-white/10 rounded-full overflow-hidden">
               <div
                 className={`h-full rounded-full transition-all duration-500 ${enrichment.done ? 'bg-green-400' : 'bg-accent'}`}
                 style={{ width: `${enrichment.progress}%` }}
               />
             </div>
           </div>
         )}

         <div className="p-3 bg-white/5 rounded-xl border border-white/5 group hover:border-white/10 transition-all">
            <div className="flex items-center justify-between mb-2">
               <p className="text-[9px] text-ink-muted uppercase tracking-widest font-bold">Local Intelligence</p>
               <Brain size={10} className={aiStatus === 'ok' ? 'text-accent' : 'text-ink-muted'} />
            </div>
            <div className="flex items-center justify-between">
               <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${
                    aiStatus === 'ok' ? 'bg-green-500 animate-pulse' : 
                    aiStatus === 'error' ? 'bg-red-500' : 'bg-yellow-500'
                  }`} />
                  <span className="text-[10px] text-ink font-mono">Ollama: llama3.2</span>
               </div>
               <span className={`text-[10px] font-bold ${
                 aiStatus === 'ok' ? 'text-accent' : 'text-ink-muted'
               }`}>
                 {aiStatus === 'ok' ? 'ONLINE' : aiStatus === 'error' ? 'OFFLINE' : 'WAIT'}
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
