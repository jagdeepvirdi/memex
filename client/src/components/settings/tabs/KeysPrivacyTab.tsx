import { KeyRound, ShieldCheck } from 'lucide-react'
import { ApiKeysPanel } from '../ApiKeysPanel'
import { SettingsSection, SettingRow, Divider } from '../SettingsSection'
import { truthy } from '../../../lib/aiSettings'
import type { SettingsTabProps } from '../settingsTabs'

type Props = Pick<SettingsTabProps, 'settings' | 'onUpdate'>

const ALWAYS_LOCAL: Array<{ title: string; detail: string }> = [
  { title: 'Passwords and the vault', detail: 'Encrypted in your browser; no AI ever sees them.' },
  { title: 'Personal and Passwords categories', detail: 'Never sent to a cloud provider.' },
  { title: 'Items tagged private, no-cloud or local-only', detail: 'Tag anything you want kept on this machine.' },
  { title: 'Anything bundled with a private item', detail: 'Insights, the digest and Ask Memex stay local if any item they use is private.' },
]

/** API keys for cloud providers, plus the switches and rules that decide what may leave this machine. */
export function KeysPrivacyTab({ settings, onUpdate }: Props) {
  const strictLocal = truthy(settings.strict_local_mode)

  return (
    <div className="flex flex-col gap-10">
      <SettingsSection
        icon={<KeyRound size={20} className="text-amber-400" />}
        title="Cloud keys"
        description="Optional. Local Ollama keeps AI requests on your instance; cloud provider keys are only needed if you choose a cloud model. Your browser still needs a connection to the Memex instance."
      >
        <ApiKeysPanel />
      </SettingsSection>

      <SettingsSection
        icon={<ShieldCheck size={20} className="text-green-400" />}
        title="Privacy"
        description="Cloud AI is never used unless a provider is selected, a key is set and “Allow cloud AI” is on (AI tab)."
      >
        <SettingRow
          title="Strict Local Mode"
          description="Runs all AI on local Ollama — Claude, Gemini, OpenAI and Groq are never called, even if enabled — and blocks fetching external URLs."
        >
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              role="switch"
              aria-label="Strict Local Mode"
              className="sr-only peer"
              checked={strictLocal}
              onChange={(e) => onUpdate({ strict_local_mode: e.target.checked })}
            />
            <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent" />
          </label>
        </SettingRow>

        <Divider />

        <div>
          <p className="text-sm text-ink font-medium">Always stays on this machine</p>
          <p className="text-xs text-ink-muted mt-0.5">These rules apply even when cloud AI is on.</p>
          <ul className="mt-3 space-y-2">
            {ALWAYS_LOCAL.map(r => (
              <li key={r.title} className="flex items-start gap-2 text-xs">
                <ShieldCheck size={13} className="text-green-400 mt-0.5 shrink-0" aria-hidden="true" />
                <span><span className="text-ink">{r.title}.</span> <span className="text-ink-muted">{r.detail}</span></span>
              </li>
            ))}
          </ul>
        </div>
      </SettingsSection>
    </div>
  )
}
