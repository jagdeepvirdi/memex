import { useState, useEffect } from 'react';
import {
  Home,
  Folder,
  Shield,
  Tag as TagIcon,
  ChevronRight,
  ChevronDown,
  Settings as SettingsIcon,
  Trash2,
  Table,
  MapPin,
  Clapperboard,
  MessageSquare,
  Newspaper,
  FolderSync,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchCategories, fetchTags } from '../../lib/api';
import type { Category, Tag } from '../../../../shared/types';

interface SidebarProps {
  activeSection: 'dashboard' | 'categories' | 'vault' | 'tags' | 'settings' | 'trash' | 'table' | 'places' | 'media' | 'ask' | 'category-review' | 'digest';
}

export default function Sidebar({ activeSection }: SidebarProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});

  const navigate = useNavigate();

  const refreshCategoriesAndTags = () => {
    fetchCategories().then(setCategories).catch(console.error);
    fetchTags().then(setTags).catch(console.error);
  };

  useEffect(() => {
    refreshCategoriesAndTags();

    // Re-fetch when the AI enrichment hook signals new items were classified
    window.addEventListener('memex:categories-changed', refreshCategoriesAndTags);
    return () => {
      window.removeEventListener('memex:categories-changed', refreshCategoriesAndTags);
    };
  }, []);

  const toggleCat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedCats(prev => ({ ...prev, [id]: !prev[id] }));
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

