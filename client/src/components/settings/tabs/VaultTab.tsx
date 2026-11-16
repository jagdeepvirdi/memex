import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Lock, ShieldAlert } from 'lucide-react'
import { apiFetch } from '../../../lib/api'
import { deriveKey, decryptVaultItem, base64ToUint8Array } from '../../../lib/crypto'
import { SettingsSection, SettingRow, Divider } from '../SettingsSection'
import type { SettingsTabProps } from '../settingsTabs'

/** Vault auto-lock, password change and the reset (delete-everything) flow. The vault itself never involves AI. */
export function VaultTab({ settings, onUpdate, notify }: SettingsTabProps) {
  const [showReset, setShowReset] = useState(false)
  const [resetPassword, setResetPassword] = useState('')
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)

  const closeReset = () => {
    setShowReset(false)
    setResetPassword('')
    setResetError(null)
  }

  const handleVaultReset = async () => {
    if (!resetPassword) return
    setResetting(true)
    setResetError(null)
    try {
      // Fetch vault status to get salt + verifier
      const status = await apiFetch<{
        hasSetup: boolean
        salt?: string
        verifier?: string | null
        verifierIv?: string | null
      }>('/vault/status')

      let verifiedSentinel: string | undefined
      if (status.hasSetup && status.verifier && status.verifierIv && status.salt) {
        // Derive the key from the entered password and check it decrypts the sentinel.
        const key = await deriveKey(resetPassword, base64ToUint8Array(status.salt))
        try {
          const plaintext = await decryptVaultItem(status.verifier, status.verifierIv, key)
          if (plaintext !== 'memex-vault-v1') throw new Error('wrong password')
          verifiedSentinel = plaintext
        } catch {
          setResetError('Incorrect vault password')
          setResetting(false)
          return
        }
      }

      await apiFetch('/vault/reset', { method: 'POST', body: JSON.stringify({ verifiedSentinel }) })
      closeReset()
      notify.success('Vault reset — all secrets deleted and password cleared.', 4000)
    } catch {
      notify.error('Failed to reset vault')
    } finally {
      setResetting(false)
    }
  }

  return (
    <>
      <SettingsSection
        icon={<Lock size={20} className="text-red-400" />}
        title="Vault"
        description="Passwords and secrets are encrypted in your browser with your master password. No AI is involved and the master password never leaves this device."
      >
        <SettingRow
          title="Change vault password"
          description="Re-encrypts all secrets with a new password. Open the Vault to use this."
        >
          <Link to="/vault" className="text-xs text-accent hover:underline font-medium">Go to Vault →</Link>
        </SettingRow>

        <Divider />

        <SettingRow title="Auto-lock timeout" description="Duration of inactivity before the vault locks.">
          <select
            aria-label="Auto-lock timeout"
            className="bg-bg border border-white/10 rounded-lg px-3 py-1.5 text-xs text-ink outline-none cursor-pointer focus:border-accent/50 transition-colors"
            value={settings.auto_lock_timeout}
            onChange={(e) => onUpdate({ auto_lock_timeout: e.target.value })}
          >
            <option value="5">5 Minutes</option>
            <option value="15">15 Minutes</option>
            <option value="30">30 Minutes</option>
            <option value="60">1 Hour</option>
          </select>
        </SettingRow>

        <Divider />

        <SettingRow
          tone="danger"
          title="Reset vault"
          description="Permanently deletes all secrets and clears the vault password. Cannot be undone."
        >
          <button
            onClick={() => setShowReset(true)}
            className="text-xs text-red-400 border border-red-400/30 hover:bg-red-400/10 px-3 py-1.5 rounded-lg font-medium transition-all"
          >
            Reset Vault
          </button>
        </SettingRow>
      </SettingsSection>

      {showReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg/80 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="vault-reset-title" className="w-full max-w-md bg-surface border border-white/10 rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-500/10 rounded-full flex items-center justify-center shrink-0">
                <ShieldAlert size={20} className="text-red-400" />
              </div>
              <div>
                <h3 id="vault-reset-title" className="font-display text-lg text-ink">Reset Vault?</h3>
                <p className="text-xs text-ink-muted">This cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-ink-muted leading-relaxed">
              All encrypted secrets will be permanently deleted and the vault password will be cleared.
              You will need to set a new vault password next time you open the vault.
            </p>
            <div>
              <label className="text-xs text-ink-muted mb-1.5 block">Enter your vault password to confirm</label>
              <input
                type="password"
                placeholder="Vault password"
                className="w-full bg-bg border border-white/10 focus:border-red-400/50 rounded-lg py-2.5 px-4 text-ink outline-none transition-all"
                value={resetPassword}
                onChange={e => { setResetPassword(e.target.value); setResetError(null) }}
                onKeyDown={e => e.key === 'Enter' && resetPassword && handleVaultReset()}
                autoFocus
              />
              {resetError && <p className="text-xs text-red-400 mt-1.5">{resetError}</p>}
            </div>
            <div className="flex gap-3">
              <button
                onClick={closeReset}
                disabled={resetting}
                className="flex-1 py-2.5 rounded-lg border border-white/10 text-sm text-ink-muted hover:text-ink hover:bg-white/5 transition-all disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleVaultReset}
                disabled={resetting || !resetPassword}
                className="flex-1 py-2.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 font-bold text-sm hover:bg-red-500/30 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {resetting ? <Loader2 size={15} className="animate-spin" /> : null}
                Delete Everything
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
