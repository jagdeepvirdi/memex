import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Home, Shield, Tag as TagIcon, ChevronRight, ChevronDown, Settings as SettingsIcon,
  Trash2, Table, MapPin, Clapperboard, MessageSquare, Newspaper, FolderSync,
  Network, Inbox, Sparkles, Plus, Search, X, MoreHorizontal,
} from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import { fetchCategories, fetchTags } from '../../lib/api'
import { BrandLockup } from '../Brand'
import type { Category, Tag } from '../../../../shared/types'

type Section = 'dashboard' | 'categories' | 'vault' | 'tags' | 'settings' | 'trash' | 'table' | 'places' | 'media' | 'ask' | 'category-review' | 'digest' | 'graph' | 'pending' | 'enriched'
type LinkItem = { label: string; to: string; icon: ReactNode; section: Section; end?: boolean }

const groups: Array<{ label: string; links: LinkItem[] }> = [
  { label: 'Home', links: [{ label: 'Dashboard', to: '/', icon: <Home size={17} />, section: 'dashboard', end: true }] },
  { label: 'Discover', links: [
    { label: 'Ask Knowledge', to: '/ask', icon: <MessageSquare size={17} />, section: 'ask' },
    { label: 'Knowledge Graph', to: '/graph', icon: <Network size={17} />, section: 'graph' },
    { label: 'Weekly Digest', to: '/digest', icon: <Newspaper size={17} />, section: 'digest' },
  ] },
  { label: 'Library', links: [
    { label: 'Table View', to: '/items/table', icon: <Table size={17} />, section: 'table' },
    { label: 'Places', to: '/places', icon: <MapPin size={17} />, section: 'places' },
    { label: 'Media & Books', to: '/media', icon: <Clapperboard size={17} />, section: 'media' },
    { label: 'Vault', to: '/vault', icon: <Shield size={17} />, section: 'vault' },
  ] },
  { label: 'Review', links: [
    { label: 'Pending Items', to: '/items/pending', icon: <Inbox size={17} />, section: 'pending' },
    { label: 'Enriched Items', to: '/items/enriched', icon: <Sparkles size={17} />, section: 'enriched' },
    { label: 'Category Review', to: '/categories/review', icon: <FolderSync size={17} />, section: 'category-review' },
    { label: 'Trash', to: '/trash', icon: <Trash2 size={17} />, section: 'trash' },
  ] },
]

interface SidebarProps { activeSection: Section }

export default function Sidebar({ activeSection }: SidebarProps) {
  const [categories, setCategories] = useState<Category[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({})
  const [mobileOpen, setMobileOpen] = useState(false)
  const [browseOpen, setBrowseOpen] = useState(false)
  const mobileDialog = useRef<HTMLDivElement>(null)
  const location = useLocation()

  const refreshCategoriesAndTags = () => {
    fetchCategories().then(setCategories).catch(() => setCategories([]))
    fetchTags().then(setTags).catch(() => setTags([]))
  }

  useEffect(() => {
    refreshCategoriesAndTags()
    window.addEventListener('memex:categories-changed', refreshCategoriesAndTags)
    return () => window.removeEventListener('memex:categories-changed', refreshCategoriesAndTags)
  }, [])

  useEffect(() => {
    if (!mobileOpen) return
    const previous = document.activeElement as HTMLElement | null
    mobileDialog.current?.querySelector<HTMLElement>('a, button')?.focus()
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setMobileOpen(false) }
      if (event.key !== 'Tab') return
      const items = mobileDialog.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)')
      if (!items?.length) return
      const first = items[0], last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown); previous?.focus() }
  }, [mobileOpen])

  useEffect(() => { setMobileOpen(false) }, [location.pathname])
  useEffect(() => { if (!mobileOpen) setBrowseOpen(false) }, [mobileOpen])

  const toggleCategory = (id: string) => setExpandedCats(previous => ({ ...previous, [id]: !previous[id] }))

  return (
    <>
      <aside aria-label="Primary navigation" className="hidden md:flex w-64 shrink-0 border-r border-white/5 bg-surface/50 sticky top-0 h-screen flex-col overflow-hidden">
        <div className="px-5 py-5 border-b border-white/5"><BrandLockup size={30} wordmarkClassName="text-xl" /></div>
        <div className="flex-1 overflow-y-auto px-3 py-3 custom-scrollbar">
          <button type="button" onClick={() => window.dispatchEvent(new Event('memex:open-capture'))} className="mb-4 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 text-sm font-semibold text-bg transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <Plus size={16} aria-hidden="true" /> Capture something
          </button>
          <NavigationGroups activeSection={activeSection} categories={categories} tags={tags} expandedCats={expandedCats} toggleCategory={toggleCategory} currentPath={location.pathname} />
        </div>
        <div className="border-t border-white/5 p-3">
          <AppLink item={{ label: 'Settings', to: '/settings', icon: <SettingsIcon size={17} />, section: 'settings' }} activeSection={activeSection} currentPath={location.pathname} />
        </div>
      </aside>

      <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-30 flex md:hidden border-t border-white/10 bg-surface/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
        <MobileLink label="Home" to="/" icon={<Home size={19} />} active={location.pathname === '/'} />
        <button type="button" onClick={() => window.dispatchEvent(new Event('memex:open-search'))} aria-label="Search" className="flex min-h-12 flex-1 flex-col items-center justify-center gap-1 rounded-lg text-ink-muted hover:bg-white/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><Search size={19} /><span className="text-[10px]">Search</span></button>
        <button type="button" onClick={() => window.dispatchEvent(new Event('memex:open-capture'))} aria-label="Capture something" className="-mt-5 mx-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-bg shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><Plus size={21} /></button>
        <MobileLink label="Ask" to="/ask" icon={<MessageSquare size={19} />} active={location.pathname === '/ask'} />
        <button type="button" onClick={() => setMobileOpen(true)} aria-label="Open navigation menu" aria-expanded={mobileOpen} className="flex min-h-12 flex-1 flex-col items-center justify-center gap-1 rounded-lg text-ink-muted hover:bg-white/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><MoreHorizontal size={19} /><span className="text-[10px]">More</span></button>
      </nav>

      {mobileOpen && <div className="fixed inset-0 z-50 md:hidden">
        <button type="button" aria-label="Close navigation menu" className="absolute inset-0 bg-bg/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
        <div ref={mobileDialog} role="dialog" aria-modal="true" aria-label="Navigation menu" className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl border border-white/10 bg-surface p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-raised">
          <div className="mb-4 flex items-center justify-between"><BrandLockup size={28} wordmarkClassName="text-lg" /><button type="button" onClick={() => setMobileOpen(false)} aria-label="Close navigation menu" className="rounded-lg p-2 text-ink-muted hover:bg-white/5 hover:text-ink"><X size={18} /></button></div>
          <NavigationGroups activeSection={activeSection} categories={categories} tags={tags} expandedCats={expandedCats} toggleCategory={toggleCategory} currentPath={location.pathname} onNavigate={() => setMobileOpen(false)} compact browseOpen={browseOpen} onToggleBrowse={() => setBrowseOpen(open => !open)} />
          <div className="mt-3 border-t border-white/5 pt-3"><AppLink item={{ label: 'Settings', to: '/settings', icon: <SettingsIcon size={17} />, section: 'settings' }} activeSection={activeSection} currentPath={location.pathname} onNavigate={() => setMobileOpen(false)} /></div>
        </div>
      </div>}
    </>
  )
}

function NavigationGroups({ activeSection, categories, tags, expandedCats, toggleCategory, currentPath, onNavigate, compact, browseOpen, onToggleBrowse }: {
  activeSection: Section; categories: Category[]; tags: Tag[]; expandedCats: Record<string, boolean>; toggleCategory: (id: string) => void; currentPath: string; onNavigate?: () => void
  /** Phone sheet: every destination as a tile in two columns, and categories + tags behind one button. */
  compact?: boolean; browseOpen?: boolean; onToggleBrowse?: () => void
}) {
  if (compact) {
    return <>
      <div className="grid grid-cols-2 gap-1.5">
        {groups.flatMap(group => group.links).map(item => <AppLink key={item.to} item={item} activeSection={activeSection} currentPath={currentPath} onNavigate={onNavigate} tile />)}
      </div>
      <button type="button" onClick={onToggleBrowse} aria-expanded={!!browseOpen} className="mt-3 flex min-h-11 w-full items-center justify-between rounded-xl border border-white/10 px-3 text-sm font-medium text-ink-muted hover:bg-white/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <span className="flex items-center gap-2"><FolderSync size={16} aria-hidden="true" />Browse categories &amp; tags</span>
        <ChevronDown size={16} aria-hidden="true" className={`transition-transform ${browseOpen ? 'rotate-180' : ''}`} />
      </button>
      {browseOpen && <div className="mt-3"><BrowseSections categories={categories} tags={tags} expandedCats={expandedCats} toggleCategory={toggleCategory} currentPath={currentPath} onNavigate={onNavigate} /></div>}
    </>
  }
  return <>
    {groups.map(group => <section key={group.label} aria-label={group.label} className="mb-4">
      <h2 className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">{group.label}</h2>
      <div className="grid gap-0.5">{group.links.map(item => <AppLink key={item.to} item={item} activeSection={activeSection} currentPath={currentPath} onNavigate={onNavigate} />)}</div>
    </section>)}
    <BrowseSections categories={categories} tags={tags} expandedCats={expandedCats} toggleCategory={toggleCategory} currentPath={currentPath} onNavigate={onNavigate} />
  </>
}

function BrowseSections({ categories, tags, expandedCats, toggleCategory, currentPath, onNavigate }: {
  categories: Category[]; tags: Tag[]; expandedCats: Record<string, boolean>; toggleCategory: (id: string) => void; currentPath: string; onNavigate?: () => void
}) {
  return <>
    <section aria-labelledby="sidebar-categories" className="mb-4">
      <h2 id="sidebar-categories" className="flex items-center gap-2 px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint"><span aria-hidden="true"><FolderSync size={12} /></span>Categories</h2>
      {categories.length ? <div className="grid gap-0.5">{categories.map(category => <CategoryRow key={category.id} category={category} expanded={expandedCats} toggle={toggleCategory} currentPath={currentPath} onNavigate={onNavigate} />)}</div> : <p className="px-3 py-1 text-xs text-ink-faint">No categories yet</p>}
    </section>
    <section aria-labelledby="sidebar-tags">
      <h2 id="sidebar-tags" className="flex items-center gap-2 px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint"><TagIcon size={12} aria-hidden="true" />Popular tags</h2>
      <div className="flex flex-wrap gap-1.5 px-2">{tags.slice(0, 15).map(tag => <button key={tag.name} type="button" onClick={() => { window.dispatchEvent(new CustomEvent('memex:open-search', { detail: { tag: tag.name } })); onNavigate?.() }} aria-label={`Search items tagged ${tag.name}, ${tag.itemCount} items`} className="max-w-full min-h-[24px] truncate rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-ink-muted hover:border-accent/30 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{tag.name}<span className="ml-1 opacity-60">{tag.itemCount}</span></button>)}</div>
    </section>
  </>
}

function AppLink({ item, activeSection, currentPath, onNavigate, tile }: { item: LinkItem; activeSection: Section; currentPath: string; onNavigate?: () => void; tile?: boolean }) {
  const matchesCurrentRoute = activeSection === item.section && (item.to === '/' ? currentPath === '/' : currentPath === item.to || currentPath.startsWith(`${item.to}/`))
  return <NavLink end={item.end} onClick={onNavigate} to={item.to} className={({ isActive }) => `flex ${tile ? 'min-h-12 gap-2.5 rounded-xl px-3 text-[13px]' : 'min-h-10 gap-3 rounded-lg px-3 text-sm'} items-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${isActive || matchesCurrentRoute ? 'bg-accent/10 text-accent' : tile ? 'bg-white/[0.04] text-ink-muted hover:bg-white/5 hover:text-ink' : 'text-ink-muted hover:bg-white/5 hover:text-ink'}`}>
    <span aria-hidden="true" className="shrink-0">{item.icon}</span><span className="truncate">{item.label}</span>
  </NavLink>
}

function MobileLink({ label, to, icon, active }: { label: string; to: string; icon: ReactNode; active: boolean }) {
  return <NavLink to={to} end={to === '/'} aria-current={active ? 'page' : undefined} className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${active ? 'text-accent' : 'text-ink-muted hover:bg-white/5 hover:text-ink'}`}><span aria-hidden="true">{icon}</span><span className="text-[10px]">{label}</span></NavLink>
}

function CategoryRow({ category, expanded, toggle, currentPath, onNavigate }: { category: Category; expanded: Record<string, boolean>; toggle: (id: string) => void; currentPath: string; onNavigate?: () => void }) {
  const children = category.children ?? []
  const isExpanded = !!expanded[category.id]
  const isCurrent = currentPath === `/category/${category.id}`
  return <div>
    <div className="flex items-center gap-1">
      <NavLink onClick={onNavigate} to={`/category/${category.id}`} aria-current={isCurrent ? 'page' : undefined} className={`flex min-h-9 min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-3 text-sm ${isCurrent ? 'bg-accent/10 text-accent' : 'text-ink-muted hover:bg-white/5 hover:text-ink'}`}><span className="truncate">{category.name}</span><span className="shrink-0 text-[10px] font-mono opacity-60">{category.itemCount}</span></NavLink>
      {children.length > 0 && <button type="button" onClick={() => toggle(category.id)} aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${category.name}`} aria-expanded={isExpanded} className="rounded-md p-2 text-ink-muted hover:bg-white/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>}
    </div>
    {children.length > 0 && isExpanded && <div className="ml-3 border-l border-white/10 pl-2">{children.map(child => <CategoryRow key={child.id} category={child} expanded={expanded} toggle={toggle} currentPath={currentPath} onNavigate={onNavigate} />)}</div>}
  </div>
}
