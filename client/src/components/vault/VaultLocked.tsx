import { useState } from 'react';
import { Lock, Unlock, Loader2, AlertCircle } from 'lucide-react';
import { deriveKey, base64ToUint8Array } from '../../lib/crypto';
import { useVaultStore } from '../../store/vaultStore';
import { apiFetch } from '../../lib/api';
import type { VaultMeta } from '../../../../shared/types';

export default function VaultLocked() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unlock = useVaultStore(state => state.unlock);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setLoading(true);
    setError(null);

    try {
      // 1. Fetch salt from server
      const { salt } = await apiFetch<VaultMeta>('/vault/salt');
      const saltUint8 = base64ToUint8Array(salt);

      // 2. Derive key from password
      const key = await deriveKey(password, saltUint8);

      // 3. Unlock store
      unlock(key);
    } catch (err) {
      console.error('Unlock error:', err);
      setError('Invalid master password or failed to fetch salt');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-surface p-8 rounded-2xl border border-white/5 shadow-2xl flex flex-col items-center gap-8">
        <div className="w-20 h-20 bg-accent/10 rounded-full flex items-center justify-center text-accent">
          <Lock size={40} />
        </div>

        <div className="text-center space-y-2">
          <h2 className="font-display text-2xl text-ink">Vault Locked</h2>
          <p className="text-ink-muted text-sm">
            Enter your master password to decrypt your secrets.
            <br />
            <span className="text-[10px] uppercase tracking-widest opacity-50">Local Encryption (AES-256-GCM)</span>
          </p>
        </div>

        <form onSubmit={handleUnlock} className="w-full space-y-4">
          <input
            type="password"
            placeholder="Master Password"
            className="w-full bg-bg border border-white/10 rounded-lg py-3 px-4 text-ink focus:border-accent outline-none transition-all placeholder:text-ink-muted/50"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            autoFocus
          />

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-accent hover:bg-accent-dark text-bg font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95"
          >
            {loading ? <Loader2 className="animate-spin" /> : (
              <>
                <Unlock size={20} />
                Unlock Vault
              </>
            )}
          </button>

          {error && (
            <div className="p-3 bg-red-400/10 border border-red-400/20 rounded-lg text-red-400 text-sm flex items-center gap-2">
              <AlertCircle size={16} />
              <p>{error}</p>
            </div>
          )}
        </form>

        <p className="text-[10px] text-ink-muted text-center max-w-[240px]">
          If you forget your master password, your data cannot be recovered. Keep it safe.
        </p>
      </div>
    </div>
  );
}
