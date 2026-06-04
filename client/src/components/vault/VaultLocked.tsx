import { useState, useEffect, useRef } from 'react';
import { Lock, Unlock, Loader2, AlertCircle, ArrowLeft, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { deriveKey, base64ToUint8Array, encryptVaultItem, decryptVaultItem } from '../../lib/crypto';
import { useVaultStore } from '../../store/vaultStore';
import { apiFetch } from '../../lib/api';
import type { VaultMeta, VaultStatus } from '../../../../shared/types';

// Sentinel encrypted on setup and decrypted to verify password on unlock
const VAULT_SENTINEL = 'memex-vault-v1';

type Screen = 'loading' | 'setup' | 'unlock';

export default function VaultLocked() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [salt, setSalt] = useState<string | null>(null);
  const [verifier, setVerifier] = useState<string | null>(null);
  const [verifierIv, setVerifierIv] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const unlock = useVaultStore(state => state.unlock);
  const navigate = useNavigate();

  useEffect(() => {
    apiFetch<VaultStatus>('/vault/status')
      .then(status => {
        // Show setup if: no vault exists yet, OR salt exists but no verifier
        // (verifier is the proof that a password has actually been set)
        if (!status.hasSetup || !status.verifier || !status.verifierIv) {
          setScreen('setup');
        } else {
          setSalt(status.salt!);
          setVerifier(status.verifier);
          setVerifierIv(status.verifierIv);
          setScreen('unlock');
        }
      })
      // On any server error (e.g. migration not yet applied) default to setup,
      // not unlock — never allow passwordless access
      .catch(() => setScreen('setup'));
  }, []);

  useEffect(() => {
    if (screen !== 'loading') {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [screen]);

  // ── First-time setup ──────────────────────────────────────────────────────
  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }

    setSubmitting(true);
    setError(null);
    try {
      // 1. Get/generate salt
      const { salt: saltB64 } = await apiFetch<VaultMeta>('/vault/salt');
      const saltUint8 = base64ToUint8Array(saltB64);

      // 2. Derive key
      const key = await deriveKey(password, saltUint8);

      // 3. Encrypt sentinel
      const { ciphertext, iv } = await encryptVaultItem(VAULT_SENTINEL, key);

      // 4. Store verifier on server
      await apiFetch('/vault/setup', {
        method: 'POST',
        body: JSON.stringify({ verifier: ciphertext, verifierIv: iv }),
      });

      // 5. Unlock
      unlock(key);
    } catch (err) {
      console.error(err);
      setError('Failed to set up vault. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Unlock ────────────────────────────────────────────────────────────────
  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setSubmitting(true);
    setError(null);
    try {
      const saltUint8 = base64ToUint8Array(salt!);
      const key = await deriveKey(password, saltUint8);

      // Verify password if we have a stored sentinel
      if (verifier && verifierIv) {
        try {
          const decrypted = await decryptVaultItem(verifier, verifierIv, key);
          if (decrypted !== VAULT_SENTINEL) {
            setError('Wrong vault password');
            return;
          }
        } catch {
          setError('Wrong vault password');
          return;
        }
      }

      unlock(key);
    } catch (err) {
      console.error(err);
      setError('Failed to unlock vault. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (screen === 'loading') {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <Loader2 className="animate-spin text-ink-muted" size={32} />
      </div>
    );
  }

  const isSetup = screen === 'setup';

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-surface rounded-2xl border border-white/5 shadow-2xl flex flex-col overflow-hidden">

        {/* Card header with back button */}
        <div className="flex items-center justify-between px-6 pt-6 pb-2">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-ink-muted hover:text-ink transition-colors text-sm"
          >
            <ArrowLeft size={16} />
            Back
          </button>
          <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest ${isSetup ? 'text-blue-400' : 'text-accent'}`}>
            <ShieldCheck size={12} />
            {isSetup ? 'New Vault' : 'Vault Locked'}
          </div>
        </div>

        {/* Body */}
        <div className="px-8 pb-8 pt-4 flex flex-col items-center gap-6">
          {/* Icon */}
          <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center text-accent">
            <Lock size={32} />
          </div>

          {/* Title */}
          <div className="text-center space-y-1.5">
            <h2 className="font-display text-2xl text-ink">
              {isSetup ? 'Set Vault Password' : 'Unlock Vault'}
            </h2>
            <p className="text-ink-muted text-sm leading-relaxed">
              {isSetup
                ? 'This password protects your encrypted secrets. It is separate from your login password and cannot be recovered if lost.'
                : 'Enter your vault password to access your encrypted secrets.'}
            </p>
            <p className="text-[10px] uppercase tracking-widest text-ink-muted/40 pt-1">
              AES-256-GCM · Local Encryption
            </p>
          </div>

          {/* Form */}
          <form onSubmit={isSetup ? handleSetup : handleUnlock} className="w-full space-y-3">
            {/* Password field */}
            <div className="relative">
              <input
                ref={inputRef}
                type={showPassword ? 'text' : 'password'}
                placeholder={isSetup ? 'New vault password' : 'Vault password'}
                className="w-full bg-bg border border-white/10 rounded-lg py-3 px-4 pr-11 text-ink focus:border-accent outline-none transition-all placeholder:text-ink-muted/40"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(null); }}
                disabled={submitting}
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

            {/* Confirm field (setup only) */}
            {isSetup && (
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Confirm vault password"
                className="w-full bg-bg border border-white/10 rounded-lg py-3 px-4 text-ink focus:border-accent outline-none transition-all placeholder:text-ink-muted/40"
                value={confirmPassword}
                onChange={e => { setConfirmPassword(e.target.value); setError(null); }}
                disabled={submitting}
              />
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-400/10 border border-red-400/20 rounded-lg text-red-400 text-sm">
                <AlertCircle size={15} className="shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting || !password || (isSetup && !confirmPassword)}
              className="w-full bg-accent hover:bg-accent/90 disabled:opacity-50 text-bg font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95"
            >
              {submitting
                ? <Loader2 className="animate-spin" size={18} />
                : isSetup
                  ? <><ShieldCheck size={18} /> Set Vault Password</>
                  : <><Unlock size={18} /> Unlock Vault</>}
            </button>
          </form>

          {/* Footer note */}
          <p className="text-[10px] text-ink-muted/50 text-center max-w-[260px] leading-relaxed">
            {isSetup
              ? 'Your vault password cannot be recovered. Store it somewhere safe.'
              : 'This password is different from your login password.'}
          </p>
        </div>
      </div>
    </div>
  );
}
