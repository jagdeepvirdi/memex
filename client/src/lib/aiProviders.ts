import type { AiProviderId } from './api'

/**
 * Everything the UI needs to know about each AI provider, in one place. Adding a provider means one entry here
 * (plus the server registry); nothing else in the UI branches on provider names.
 */
export interface AiProviderMeta {
  /** Full label, e.g. in a provider dropdown. */
  label: string
  /** Short name, e.g. on a "Test …" button. */
  shortName: string
  /** The settings key that stores this provider's model id. */
  modelKey: 'ai_model' | 'claude_model' | 'gemini_model' | 'openai_model' | 'groq_model'
}

export const AI_PROVIDER_META: Record<AiProviderId, AiProviderMeta> = {
  ollama: { label: 'Ollama (local)', shortName: 'Ollama', modelKey: 'ai_model' },
  claude: { label: 'Claude (cloud)', shortName: 'Claude', modelKey: 'claude_model' },
  gemini: { label: 'Gemini (cloud)', shortName: 'Gemini', modelKey: 'gemini_model' },
  openai: { label: 'OpenAI (cloud)', shortName: 'OpenAI', modelKey: 'openai_model' },
  groq: { label: 'Groq (cloud)', shortName: 'Groq', modelKey: 'groq_model' },
}

export const AI_PROVIDER_IDS = Object.keys(AI_PROVIDER_META) as AiProviderId[]
