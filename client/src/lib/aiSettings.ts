import type { AiProviderId } from './api'
import { AI_PROVIDER_IDS } from './aiProviders'

// Older versions of the UI saved booleans as the strings 'true' / 'false'.
export const truthy = (v: unknown): boolean => v === true || v === 'true'

export const isProvider = (v: unknown): v is AiProviderId => AI_PROVIDER_IDS.includes(v as AiProviderId)

export interface ResolvedAiSettings {
  strictLocal: boolean
  /** The provider actually in effect by default: Strict Local Mode forces Ollama. */
  provider: AiProviderId
  allowCloud: boolean
  /** Per-task provider overrides as stored (task name -> provider). */
  perTask: Record<string, AiProviderId>
}

/**
 * Reads the AI settings the way the server does, including the legacy `use_claude` flag that older installs
 * only ever set (it meant "use Claude" and also "cloud is allowed"). One place, so the Settings screens agree.
 */
export function resolveAiSettings(settings: Record<string, any>): ResolvedAiSettings {
  const strictLocal = truthy(settings.strict_local_mode)
  const stored: AiProviderId = isProvider(settings.ai_provider)
    ? settings.ai_provider
    : truthy(settings.use_claude) ? 'claude' : 'ollama'
  const allowCloud =
    !strictLocal && (settings.allow_cloud !== undefined ? truthy(settings.allow_cloud) : truthy(settings.use_claude))
  const perTask: Record<string, AiProviderId> =
    settings.ai_task_providers && typeof settings.ai_task_providers === 'object' && !Array.isArray(settings.ai_task_providers)
      ? settings.ai_task_providers
      : {}
  return { strictLocal, provider: strictLocal ? 'ollama' : stored, allowCloud, perTask }
}
