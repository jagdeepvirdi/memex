import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, AlertCircle, Loader2, Cpu, HardDrive } from 'lucide-react'
import { apiFetch } from '../../../lib/api'
import { AiProviderSettings } from '../AiProviderSettings'
import { SettingsSection, SettingRow } from '../SettingsSection'
import { settingsTabPath } from '../settingsTabs'
import type { SettingsTabProps } from '../settingsTabs'

type Props = Pick<SettingsTabProps, 'settings' | 'onUpdate'>

/** Which AI answers, which model, and whether cloud is allowed; plus the local Ollama check. */
export function AiTab({ settings, onUpdate }: Props) {
  const navigate = useNavigate()
  const [ollamaStatus, setOllamaStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')

  const handleTestOllama = async () => {
    setOllamaStatus('testing')
    try {
      const data = await apiFetch<{ status: string }>('/health/ollama')
      setOllamaStatus(data.status === 'ok' ? 'ok' : 'error')
    } catch {
      setOllamaStatus('error')
    }
    setTimeout(() => setOllamaStatus('idle'), 4000)
  }

  return (
    <div className="flex flex-col gap-10">
      <SettingsSection
        icon={<Cpu size={20} className="text-blue-400" />}
        title="Provider & model"
        description="Choose what answers. Local Ollama is the default; cloud providers need a key and your consent."
      >
        <AiProviderSettings
          settings={settings}
          onUpdate={onUpdate}
          onOpenKeys={() => navigate(settingsTabPath('privacy'))}
        />
      </SettingsSection>

      <SettingsSection
        icon={<HardDrive size={20} className="text-teal-400" />}
        title="Local AI (Ollama)"
        description="Semantic search and related items always use local embeddings."
      >
        <SettingRow title="Embedding model" description="Used for semantic search and related items.">
          <span className="text-xs text-ink-muted font-mono bg-white/5 px-2 py-1 rounded">nomic-embed-text</span>
        </SettingRow>

        <div className="flex items-center gap-4">
          <button
            onClick={handleTestOllama}
            disabled={ollamaStatus === 'testing'}
            className="flex items-center gap-2 text-xs bg-white/5 hover:bg-white/10 text-ink px-4 py-2 rounded-lg transition-all font-medium disabled:opacity-50"
          >
            {ollamaStatus === 'testing' && <Loader2 size={12} className="animate-spin" />}
            Test Ollama Connection
          </button>
          {ollamaStatus === 'ok' && (
            <span className="flex items-center gap-1.5 text-xs text-green-400"><Check size={13} /> Connected</span>
          )}
          {ollamaStatus === 'error' && (
            <span className="flex items-center gap-1.5 text-xs text-red-400"><AlertCircle size={13} /> Ollama unreachable</span>
          )}
        </div>
      </SettingsSection>
    </div>
  )
}
