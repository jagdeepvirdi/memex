import { useState, useEffect } from 'react';
import { Plus, Search, Shield, Lock, LogOut, Loader2, ArrowLeft, KeyRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useVaultStore } from '../store/vaultStore';
import { AppHeader } from '../components/AppHeader';
import VaultLocked from '../components/vault/VaultLocked';
import VaultItemForm from '../components/vault/VaultItemForm';
import VaultCard from '../components/cards/VaultCard';
import { VaultChangePassword } from '../components/vault/VaultChangePassword';
import { apiFetch } from '../lib/api';
import type { VaultItem } from '../../../shared/types';
import type { VaultKey } from '../lib/crypto';

export default function Vault() {
  const { isLocked, lock, unlock, vaultKey, updateActivity, checkAutoLock } = useVaultStore();
  const [items, setItems] = useState<VaultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<VaultItem | null>(null);
  const [showChangePassword, setShowChangePassword] = useState(false);

  // Lock immediately when navigating away from the vault
  useEffect(() => {
    return () => lock();
  }, []);

  // Auto-lock and activity tracking
  useEffect(() => {
    if (isLocked) return;

    const interval = setInterval(checkAutoLock, 30000); // Check every 30s
    const handleActivity = () => updateActivity();

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);

    return () => {
      clearInterval(interval);
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
    };
  }, [isLocked, checkAutoLock, updateActivity]);

  useEffect(() => {
    if (!isLocked) {
      fetchVault();
    }
  }, [isLocked]);

  const fetchVault = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<VaultItem[]>('/vault');
      setItems(data);
    } catch (error) {
      console.error('Fetch vault error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this secret?')) return;
    try {
      await apiFetch(`/vault/${id}`, { method: 'DELETE' });
      setItems(items.filter(i => i.id !== id));
    } catch (error) {
      console.error('Delete vault item error:', error);
    }
  };

  const filteredItems = items.filter(i => 
    i.service.toLowerCase().includes(search.toLowerCase()) ||
    (i.username && i.username.toLowerCase().includes(search.toLowerCase()))
  );

  if (isLocked) return <VaultLocked />;

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <AppHeader
        left={<div className="flex items-center gap-6"><Link to="/" className="text-ink-muted hover:text-ink transition-colors"><ArrowLeft size={20} /></Link><div className="flex items-center gap-3"><div className="w-8 h-8 bg-accent text-bg rounded-lg flex items-center justify-center shadow-lg shadow-accent/20"><Shield size={18} /></div><div><h1 className="font-display text-lg text-ink">Encrypted Vault</h1><p className="text-[10px] text-accent uppercase tracking-widest font-bold">End-to-End Encrypted</p></div></div></div>}
        actions={<div className="flex items-center gap-3"><div className="relative group"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted group-focus-within:text-accent transition-colors" size={15} /><input type="text" placeholder="Search vault..." className="w-48 bg-bg border border-white/10 rounded-full py-1.5 pl-9 pr-3 text-sm text-ink outline-none focus:border-accent/50 transition-all placeholder:text-ink-muted/30" value={search} onChange={(e) => setSearch(e.target.value)} /></div><button onClick={() => setShowForm(true)} className="bg-accent hover:bg-accent/90 text-bg px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-all shadow-lg active:scale-95"><Plus size={16} />Add Secret</button><button onClick={() => setShowChangePassword(true)} className="p-2 text-ink-muted hover:text-accent hover:bg-accent/10 rounded-lg transition-all" title="Change Vault Password"><KeyRound size={18} /></button><button onClick={lock} className="p-2 text-ink-muted hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all" title="Lock Vault"><LogOut size={18} /></button></div>}
      />
      <AppHeader.Spacer />

      {/* Vault Content */}
      <main className="p-12 max-w-7xl mx-auto w-full flex-1">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-ink-muted">
            <Loader2 className="animate-spin" size={40} />
            <p className="font-mono text-sm">Decrypting vault data...</p>
          </div>
        ) : filteredItems.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-500">
            {filteredItems.map(item => (
              <VaultCard 
                key={item.id} 
                item={item} 
                onEdit={() => setEditingItem(item)}
                onDelete={() => handleDelete(item.id)}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-32 border-2 border-dashed border-white/5 rounded-3xl gap-6 grayscale opacity-50">
            <Lock size={64} className="text-ink-muted" />
            <div className="text-center">
              <h3 className="font-display text-xl text-ink">Your vault is empty</h3>
              <p className="text-ink-muted text-sm max-w-xs mt-2">
                Store your passwords and sensitive information securely with local encryption.
              </p>
            </div>
            <button 
              onClick={() => setShowForm(true)}
              className="bg-white/5 hover:bg-white/10 text-ink px-6 py-2 rounded-lg font-medium transition-all"
            >
              Add your first secret
            </button>
          </div>
        )}
      </main>

      {/* Change Password Modal */}
      {showChangePassword && vaultKey && (
        <VaultChangePassword
          items={items}
          vaultKey={vaultKey}
          onSuccess={(newKey: VaultKey) => {
            unlock(newKey);
            setShowChangePassword(false);
          }}
          onCancel={() => setShowChangePassword(false)}
        />
      )}

      {/* Add / Edit Form Overlay */}
      {(showForm || editingItem) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
            <VaultItemForm 
              item={editingItem || undefined}
              onSuccess={(saved) => {
                if (editingItem) {
                  setItems(items.map(i => i.id === saved.id ? saved : i));
                } else {
                  setItems([saved, ...items]);
                }
                setShowForm(false);
                setEditingItem(null);
              }}
              onCancel={() => {
                setShowForm(false);
                setEditingItem(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
