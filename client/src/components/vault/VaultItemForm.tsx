import { useState } from 'react';
import { Loader2, ShieldCheck, X } from 'lucide-react';
import { encryptVaultItem } from '../../lib/crypto';
import { useVaultStore } from '../../store/vaultStore';
import { apiFetch } from '../../lib/api';
import type { VaultItem } from '../../../../shared/types';

interface Props {
  item?: VaultItem;
  onSuccess: (item: VaultItem) => void;
  onCancel: () => void;
}

export default function VaultItemForm({ item, onSuccess, onCancel }: Props) {
  const [service, setService] = useState(item?.service || '');
  const [url, setUrl] = useState(item?.url || '');
  const [username, setUsername] = useState(item?.username || '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const vaultKey = useVaultStore(state => state.vaultKey);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!service || (!item && !password)) return;
    if (!vaultKey) return;

    setLoading(true);
    setError(null);

    try {
      let ciphertext = item?.ciphertext;
      let iv = item?.iv;

      // Only re-encrypt if password changed or it's a new item
      if (password) {
        const encrypted = await encryptVaultItem(password, vaultKey);
        ciphertext = encrypted.ciphertext;
        iv = encrypted.iv;
      }

      const body = {
        service,
        url,
        username,
        ciphertext,
        iv
      };

      const res = await apiFetch<VaultItem>(item ? `/vault/${item.id}` : '/vault', {
        method: item ? 'PUT' : 'POST',
        body: JSON.stringify(body)
      });

      onSuccess(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save vault item');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-surface p-6 rounded-xl border border-white/5 shadow-2xl w-full max-w-md">
      <div className="flex justify-between items-center mb-6">
        <h2 className="font-display text-xl text-ink">
          {item ? 'Edit Secret' : 'Add New Secret'}
        </h2>
        <button onClick={onCancel} aria-label="Cancel" className="text-ink-muted hover:text-ink">
          <X size={20} aria-hidden="true" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs text-ink-muted uppercase tracking-widest mb-1.5 ml-1">Service Name</label>
          <input
            type="text"
            placeholder="e.g. GitHub, Netflix"
            className="w-full bg-bg border border-white/10 rounded-lg py-2.5 px-4 text-ink focus:border-accent outline-none transition-all placeholder:text-ink-muted/30"
            value={service}
            onChange={(e) => setService(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-xs text-ink-muted uppercase tracking-widest mb-1.5 ml-1">URL (Optional)</label>
          <input
            type="text"
            placeholder="https://..."
            className="w-full bg-bg border border-white/10 rounded-lg py-2.5 px-4 text-ink focus:border-accent outline-none transition-all placeholder:text-ink-muted/30"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-xs text-ink-muted uppercase tracking-widest mb-1.5 ml-1">Username / Email</label>
          <input
            type="text"
            placeholder="Username"
            className="w-full bg-bg border border-white/10 rounded-lg py-2.5 px-4 text-ink focus:border-accent outline-none transition-all placeholder:text-ink-muted/30"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-xs text-ink-muted uppercase tracking-widest mb-1.5 ml-1">
            {item ? 'New Password (leave blank to keep current)' : 'Password'}
          </label>
          <input
            type="password"
            placeholder="••••••••"
            className="w-full bg-bg border border-white/10 rounded-lg py-2.5 px-4 text-ink focus:border-accent outline-none transition-all placeholder:text-ink-muted/30"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required={!item}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-accent hover:bg-accent-dark text-bg font-bold py-3 rounded-lg flex items-center justify-center gap-2 mt-4 transition-all"
        >
          {loading ? <Loader2 className="animate-spin" /> : (
            <>
              <ShieldCheck size={20} />
              {item ? 'Update Secret' : 'Save Encrypted'}
            </>
          )}
        </button>

        {error && <p className="text-red-400 text-xs text-center">{error}</p>}
      </form>
    </div>
  );
}
