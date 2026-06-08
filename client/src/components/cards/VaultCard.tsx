import { useState } from 'react'
import { Edit2, Trash2, ExternalLink, Eye, EyeOff, Check, Copy, FileText } from 'lucide-react'
import type { VaultItem } from '@shared/types'
import { CardBase, TypeBadge } from './CardBase'
import { decryptVaultItem } from '../../lib/crypto'
import { useVaultStore } from '../../store/vaultStore'

interface Props {
  item: VaultItem
  onEdit: () => void
  onDelete: () => void
}

export default function VaultCard({ item, onEdit, onDelete }: Props) {
  const [showPass, setShowPass] = useState(false)
  const [decryptedContent, setDecryptedContent] = useState<string | null>(null)
  const [copied, setCopied] = useState<'user' | 'pass' | null>(null)
  const vaultKey = useVaultStore(state => state.vaultKey)

  const decrypt = async (): Promise<string | null> => {
    if (decryptedContent) return decryptedContent
    if (!vaultKey) return null
    try {
      const text = await decryptVaultItem(item.ciphertext, item.iv, vaultKey)
      setDecryptedContent(text)
      return text
    } catch (e) {
      console.error('Decryption failed', e)
      return null
    }
  }

  const handleCopy = async (type: 'user' | 'pass') => {
    let toCopy: string | undefined
    if (type === 'user') {
      toCopy = item.username
    } else {
      toCopy = (await decrypt()) ?? undefined
    }
    if (!toCopy) return
    await navigator.clipboard.writeText(toCopy)
    setCopied(type)
    setTimeout(() => setCopied(null), 2000)
  }

  const toggleReveal = async () => {
    if (showPass) {
      setShowPass(false)
      return
    }
    await decrypt()
    setShowPass(true)
  }

  const hostname = item.url
    ? (() => { try { return new URL(item.url).hostname.replace('www.', '') } catch { return null } })()
    : null

  const isNote = item.type === 'note'

  return (
    <CardBase className="border-accent/10 hover:border-accent/30 group">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TypeBadge type="password" label="Secure" />
          {isNote && (
            <span className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-blue-400 font-bold">
              <FileText size={10} /> Note
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isNote && (
            <button onClick={onEdit} className="p-1.5 text-ink-muted hover:text-accent rounded-md hover:bg-white/5 transition-all">
              <Edit2 size={14} />
            </button>
          )}
          <button onClick={onDelete} className="p-1.5 text-ink-muted hover:text-red-400 rounded-md hover:bg-red-400/5 transition-all">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Title & URL */}
      <div className="mb-4">
        <h3 className="font-display text-lg text-ink leading-tight">{item.service}</h3>
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-accent/60 hover:text-accent flex items-center gap-1 mt-1 transition-colors"
          >
            {hostname || item.url}
            <ExternalLink size={10} />
          </a>
        )}
      </div>

      {isNote ? (
        /* ── Note content view ─────────────────────────────────────────────── */
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-[9px] uppercase tracking-widest text-ink-muted font-bold">Encrypted Content</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleCopy('pass')}
                className="text-ink-muted hover:text-accent transition-colors"
                title="Copy content"
              >
                {copied === 'pass' ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
              </button>
              <button
                onClick={toggleReveal}
                className="text-ink-muted hover:text-accent transition-colors"
                title={showPass ? 'Hide content' : 'Reveal content'}
              >
                {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <div className="bg-bg/50 rounded-lg border border-white/5 p-3 min-h-[80px] max-h-[200px] overflow-y-auto">
            {showPass && decryptedContent ? (
              <pre className="font-mono text-xs text-ink whitespace-pre-wrap break-words leading-relaxed">
                {decryptedContent}
              </pre>
            ) : (
              <div className="flex items-center justify-center h-full py-4">
                <button
                  onClick={toggleReveal}
                  className="text-xs text-ink-muted hover:text-accent transition-colors flex items-center gap-1.5"
                >
                  <Eye size={13} /> Click to reveal
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ── Credential view ───────────────────────────────────────────────── */
        <div className="space-y-3">
          {/* Username Row */}
          <div className="flex flex-col gap-1">
            <label className="text-[9px] uppercase tracking-widest text-ink-muted font-bold">Username</label>
            <div className="flex items-center justify-between bg-bg/50 rounded-lg p-2 border border-white/5">
              <span className="font-mono text-xs text-ink truncate mr-2">
                {item.username || <span className="italic opacity-30">none</span>}
              </span>
              {item.username && (
                <button
                  onClick={() => handleCopy('user')}
                  className="text-ink-muted hover:text-accent transition-colors"
                >
                  {copied === 'user' ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                </button>
              )}
            </div>
          </div>

          {/* Password Row */}
          <div className="flex flex-col gap-1">
            <label className="text-[9px] uppercase tracking-widest text-ink-muted font-bold">Password</label>
            <div className="flex items-center justify-between bg-bg/50 rounded-lg p-2 border border-white/5">
              <span className="font-mono text-xs text-ink truncate mr-2">
                {showPass ? decryptedContent : '••••••••••••'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleReveal}
                  className="text-ink-muted hover:text-accent transition-colors"
                >
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button
                  onClick={() => handleCopy('pass')}
                  className="text-ink-muted hover:text-accent transition-colors"
                >
                  {copied === 'pass' ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </CardBase>
  )
}
