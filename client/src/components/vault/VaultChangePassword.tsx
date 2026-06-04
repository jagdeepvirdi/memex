import { useState } from 'react';
import { X, KeyRound, Loader2, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react';
import {
  deriveKey,
  encryptVaultItem,
  decryptVaultItem,
  uint8ArrayToBase64,
} from '../../lib/crypto';
import { apiFetch } from '../../lib/api';
import type { VaultItem } from '../../../../shared/types';
import type { VaultKey } from '../../lib/crypto';

const VAULT_SENTINEL = 'memex-vault-v1';

interface Props {
  items: VaultItem[];
  vaultKey: VaultKey;
  onSuccess: (newKey: VaultKey) => void;
  onCancel: () => void;
}

export function VaultChangePassword({ items, vaultKey, onSuccess, onCancel }: Props) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }

    setSubmitting(true);
    setError(null);

    try {
      // 1. Get existing salt (we keep the same salt to avoid a full round-trip for generation)
      //    Actually we generate a NEW salt for better security on key rotation
      const newSaltBytes = window.crypto.getRandomValues(new Uint8Array(32));
      const newSaltB64 = uint8ArrayToBase64(newSaltBytes);

      // 2. Derive new key
      const newKey = await deriveKey(newPassword, newSaltBytes);

      // 3. Re-encrypt every vault item
      const reencrypted: Array<{ id: string; ciphertext: string; iv: string }> = [];
      setProgress({ done: 0, total: items.length });

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        // Decrypt with current key
        const plaintext = await decryptVaultItem(item.ciphertext, item.iv, vaultKey);
        // Re-encrypt with new key
        const { ciphertext, iv } = await encryptVaultItem(plaintext, newKey);
        reencrypted.push({ id: item.id, ciphertext, iv });
        setProgress({ done: i + 1, total: items.length });
      }

      // 4. Encrypt sentinel with new key
      const { ciphertext: verifier, iv: verifierIv } = await encryptVaultItem(VAULT_SENTINEL, newKey);

      // 5. Submit everything in one transaction
      await apiFetch('/vault/rekey', {
        method: 'PUT',
        body: JSON.stringify({
          salt: newSaltB64,
          verifier,
          verifierIv,
          items: reencrypted,
        }),
      });

      onSuccess(newKey);
    } catch (err) {
      console.error(err);
      setError('Failed to change vault password. Please try again.');
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-surface border border-white/10 rounded-2xl shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <KeyRound size={18} className="text-accent" />
            <h2 className="font-display text-lg text-ink">Change Vault Password</h2>
          </div>
          <button
            onClick={onCancel}
            disabled={submitting}
            className="p-1.5 text-ink-muted hover:text-ink hover:bg-white/5 rounded-lg transition-colors disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-sm text-ink-muted">
            All {items.length} secret{items.length !== 1 ? 's' : ''} will be re-encrypted with the new password.
            The vault stays unlocked after the change.
          </p>

          {/* New password */}
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="New vault password"
              className="w-full bg-bg border border-white/10 rounded-lg py-3 px-4 pr-11 text-ink focus:border-accent outline-none transition-all placeholder:text-ink-muted/40"
              value={newPassword}
              onChange={e => { setNewPassword(e.target.value); setError(null); }}
              disabled={submitting}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword(p => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {/* Confirm */}
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Confirm new vault password"
            className="w-full bg-bg border border-white/10 rounded-lg py-3 px-4 text-ink focus:border-accent outline-none transition-all placeholder:text-ink-muted/40"
            value={confirmPassword}
            onChange={e => { setConfirmPassword(e.target.value); setError(null); }}
            disabled={submitting}
          />

          {/* Progress bar (shown while re-encrypting) */}
          {progress && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px] text-ink-muted font-mono">
                <span>Re-encrypting secrets…</span>
                <span>{progress.done}/{progress.total}</span>
              </div>
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-300"
                  style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-400/10 border border-red-400/20 rounded-lg text-red-400 text-sm">
              <AlertCircle size={15} className="shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="flex-1 py-2.5 rounded-lg border border-white/10 text-sm text-ink-muted hover:text-ink hover:bg-white/5 transition-all disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !newPassword || !confirmPassword}
              className="flex-1 py-2.5 rounded-lg bg-accent text-bg font-bold text-sm hover:bg-accent/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting
                ? <Loader2 size={16} className="animate-spin" />
                : <><CheckCircle size={16} /> Change Password</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
