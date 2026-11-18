import { useState } from 'react'
import { Check, Copy, KeyRound, Loader2, ShieldCheck, Trash2 } from 'lucide-react'
import { apiFetch } from '../../lib/api'

/** The block to paste into an MCP host's config (Claude Desktop, Cursor, ...). The path to the built server is the one thing only the user knows. */
export function buildMcpConfig(key: string, baseUrl: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        memex: {
          command: 'node',
          args: ['<path to your memex folder>/mcp/dist/index.js'],
          env: { MEMEX_URL: baseUrl, MEMEX_MCP_KEY: key },
        },
      },
    },
    null,
    2,
  )
}

interface Props {
  /** True when a key already exists (the settings carry its hash, never the key). */
  initiallySet: boolean
}

/** Lets an AI assistant search, read and save notes through the Memex MCP server, with a key that can do nothing else. */
export function McpPanel({ initiallySet }: Props) {
  const [isSet, setIsSet] = useState(initiallySet)
  // The key is shown once, right after it is created; it cannot be read back (only its hash is stored).
  const [newKey, setNewKey] = useState<string | null>(null)
  const [busy, setBusy] = useState<'create' | 'revoke' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<'key' | 'config' | null>(null)

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3002'

  const create = async () => {
    setBusy('create')
    setError(null)
    try {
      const { key } = await apiFetch<{ key: string }>('/settings/mcp-key', { method: 'POST' })
      setNewKey(key)
      setIsSet(true)
    } catch {
      setError('Could not create a key. Is the Memex server running?')
    } finally {
      setBusy(null)
    }
  }

  const revoke = async () => {
    setBusy('revoke')
    setError(null)
    try {
      await apiFetch('/settings/mcp-key', { method: 'DELETE' })
      setNewKey(null)
      setIsSet(false)
    } catch {
      setError('Could not revoke the key. Is the Memex server running?')
    } finally {
      setBusy(null)
    }
  }

  const copy = (what: 'key' | 'config', value: string) => {
    void navigator.clipboard?.writeText(value)
    setCopied(what)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <>
      <div>
        <p className="text-sm text-ink font-medium mb-1">Let an AI assistant use your notes</p>
        <p className="text-xs text-ink-muted max-w-xl">
          Connect Claude Desktop, Cursor or any other app that supports MCP, so you can ask it what you saved, or tell it to save something.
          It runs on your computer and talks to this Memex with a key that can do nothing else.
        </p>
      </div>

      <ul className="text-xs text-ink-muted space-y-1.5 max-w-xl list-disc pl-4">
        <li>It can <strong className="text-ink font-medium">search, read and save</strong> notes and links. It cannot delete, edit, export, or touch settings, keys or the vault.</li>
        <li>
          <span className="inline-flex items-center gap-1 text-ink font-medium"><ShieldCheck size={12} aria-hidden="true" /> Private items stay private:</span>{' '}
          the vault, Passwords and Personal, anything tagged <code>private</code>, <code>no-cloud</code> or <code>local-only</code>, and text that looks like account details are never shown to it.
        </li>
        <li>Anything it reads goes to the assistant you connected, which may be a cloud service. Strict Local Mode switches this off completely.</li>
        <li>Notes it saves are tagged <code>from-mcp</code>, so you can find them.</li>
      </ul>

      {newKey && (
        <div className="rounded-xl border border-accent/40 bg-accent/5 p-4 space-y-3" role="status">
          <p className="text-sm text-ink font-medium">Your key (shown once: copy it now)</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 truncate rounded-lg bg-bg border border-white/10 px-3 py-2 text-xs font-mono text-ink" data-testid="mcp-key">{newKey}</code>
            <button
              onClick={() => copy('key', newKey)}
              className="flex items-center gap-1.5 text-xs bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2 rounded-lg transition-colors"
            >
              {copied === 'key' ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
              {copied === 'key' ? 'Copied' : 'Copy key'}
            </button>
          </div>

          <p className="text-xs text-ink-muted">
            Build the server once with <code>npm run mcp:build</code> in your Memex folder, then add this to your assistant's MCP settings
            (replace the path). For Claude Desktop that is <code>claude_desktop_config.json</code>.
          </p>
          <pre className="rounded-lg bg-bg border border-white/10 p-3 text-xs font-mono text-ink-soft overflow-x-auto" data-testid="mcp-config">{buildMcpConfig(newKey, baseUrl)}</pre>
          <button
            onClick={() => copy('config', buildMcpConfig(newKey, baseUrl))}
            className="flex items-center gap-1.5 text-xs bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2 rounded-lg transition-colors"
          >
            {copied === 'config' ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
            {copied === 'config' ? 'Copied' : 'Copy config'}
          </button>
        </div>
      )}

      {isSet && !newKey && (
        <p className="text-xs text-ink-muted flex items-center gap-1.5">
          <KeyRound size={13} className="text-accent" aria-hidden="true" />
          A key is active. It cannot be shown again; replace it to get a new one (the old one stops working at once).
        </p>
      )}

      {error && <p className="text-xs text-red-400" role="alert">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={create}
          disabled={busy !== null}
          className="flex items-center gap-2 text-xs bg-accent text-bg px-4 py-2 rounded-lg font-bold hover:bg-accent-deep transition-all disabled:opacity-50"
        >
          {busy === 'create' ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <KeyRound size={14} aria-hidden="true" />}
          {isSet ? 'Replace key' : 'Create key'}
        </button>
        {isSet && (
          <button
            onClick={revoke}
            disabled={busy !== null}
            className="flex items-center gap-2 text-xs text-red-400 border border-red-500/30 hover:bg-red-500/10 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {busy === 'revoke' ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Trash2 size={14} aria-hidden="true" />}
            Revoke key
          </button>
        )}
      </div>
    </>
  )
}
