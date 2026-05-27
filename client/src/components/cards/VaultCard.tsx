import { useState } from 'react'
import { Edit2, Trash2, ExternalLink, Eye, EyeOff, Check, Copy } from 'lucide-react'
import type { VaultItem } from '@shared/types'
import { CardBase, TypeBadge, Muted } from './CardBase'
import { decryptVaultItem } from '../../lib/crypto'
import { useVaultStore } from '../../store/vaultStore'

interface Props {
  item: VaultItem
  onEdit: () => void
  onDelete: () => void
}

export default function VaultCard({ item, onEdit, onDelete }: Props) {
  const [showPass, setShowPass] = useState(false)
  const [decryptedPass, setDecryptedPass] = useState<string | null>(null)
  const [copied, setCopied] = useState<'user' | 'pass' | null>(null)
  const vaultKey = useVaultStore(state => state.vaultKey)

  const handleCopy = async (type: 'user' | 'pass', text: string | undefined) => {
    if (!text) return
    
    let toCopy = text
    if (type === 'pass') {
      if (decryptedPass) {
        toCopy = decryptedPass
      } else if (vaultKey) {
        try {
          const pass = await decryptVaultItem(item.ciphertext, item.iv, vaultKey)
          setDecryptedPass(pass)
          toCopy = pass
        } catch (e) {
          console.error('Decryption failed', e)
          return
        }
      } else {
        return
      }
    }

    await navigator.clipboard.writeText(toCopy)
    setCopied(type)
    setTimeout(() => setCopied(null), 2000)
  }

  const toggleShowPass = async () => {
    if (showPass) {
      setShowPass(false)
      return
    }

    if (!decryptedPass && vaultKey) {
      try {
        const pass = await decryptVaultItem(item.ciphertext, item.iv, vaultKey)
        setDecryptedPass(pass)
      } catch (e) {
        console.error('Decryption failed', e)
        return
      }
    }
    setShowPass(true)
  }

  const hostname = item.url
    ? (() => { try { return new URL(item.url).hostname.replace('www.', '') } catch { return null } })()
    : null

  return (
    <CardBase className="border-accent/10 hover:border-accent/30 group">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <TypeBadge type="password" label="Secure" />
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit} className="p-1.5 text-ink-muted hover:text-accent rounded-md hover:bg-white/5 transition-all">
            <Edit2 size={14} />
          </button>
          <button onClick={onDelete} className="p-1.5 text-ink-muted hover:text-red-400 rounded-md hover:bg-red-400/5 transition-all">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Title & URL */}
      <div className="mb-6">
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

      {/* Credentials */}
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
                onClick={() => handleCopy('user', item.username)}
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
              {showPass ? decryptedPass : '••••••••••••'}
            </span>
            <div className="flex items-center gap-2">
              <button 
                onClick={toggleShowPass}
                className="text-ink-muted hover:text-accent transition-colors"
              >
                {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button 
                onClick={() => handleCopy('pass', decryptedPass || undefined)}
                className="text-ink-muted hover:text-accent transition-colors"
              >
                {copied === 'pass' ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </CardBase>
  )
}
