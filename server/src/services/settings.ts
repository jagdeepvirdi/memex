import { pool } from '../db/client.js';
import logger from '../lib/logger.js'

export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const { rows } = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
    if (rows.length === 0) return defaultValue;
    return rows[0].value as T;
  } catch (error) {
    logger.error(error, `Failed to fetch setting ${key}`)
    return defaultValue;
  }
}

/**
 * Boolean settings written by older UI versions are the strings 'true' / 'false'
 * (a bare `if ('false')` is truthy). Accept both forms; anything else is false.
 */
export function asBool(v: unknown): boolean {
  return v === true || v === 'true'
}

export type ProviderId = 'ollama' | 'claude' | 'gemini' | 'openai'
export const PROVIDER_IDS: readonly ProviderId[] = ['ollama', 'claude', 'gemini', 'openai']

export function isProviderId(v: unknown): v is ProviderId {
  return typeof v === 'string' && (PROVIDER_IDS as readonly string[]).includes(v)
}

export interface AiConfig {
  /** Ollama chat model (`ai_model`) — kept under this name for existing callers. */
  model: string
  /** Legacy toggle; still returned so older callers/tests keep working. */
  useClaude: boolean
  strictLocal: boolean
  /** Default provider, already resolved: strict-local forces 'ollama'. */
  provider: ProviderId
  claudeModel: string
  geminiModel: string
  openaiModel: string
  /** Per-task provider overrides, e.g. { classify: 'ollama', explain: 'gemini' }. */
  perTask: Record<string, ProviderId>
  /** Consent to send item content to a cloud provider. Always false in strict-local mode. */
  allowCloud: boolean
}

const AI_SETTING_KEYS = [
  'ai_model', 'use_claude', 'strict_local_mode',
  'ai_provider', 'claude_model', 'gemini_model', 'openai_model', 'ai_task_providers', 'allow_cloud',
]

export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-5-5'
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash'
// OpenAI retires model ids regularly (gpt-5-mini shuts down 2026-12-11); the model is editable in Settings.
export const DEFAULT_OPENAI_MODEL = 'gpt-5.4-mini'

export async function getAiConfig(): Promise<AiConfig> {
  const values: Record<string, unknown> = {}
  try {
    const { rows } = await pool.query(
      'SELECT key, value FROM settings WHERE key = ANY($1)', [AI_SETTING_KEYS]
    )
    for (const row of rows) values[row.key] = row.value
  } catch (error) {
    logger.error(error, 'Failed to fetch AI settings')
  }

  const str = (k: string, d: string) => (typeof values[k] === 'string' && values[k] ? values[k] as string : d)
  const useClaude = asBool(values.use_claude)
  const strictLocal = asBool(values.strict_local_mode)

  // Backward compat: installs that only ever set `use_claude` map to provider=claude + consent.
  const storedProvider = isProviderId(values.ai_provider) ? values.ai_provider : (useClaude ? 'claude' : 'ollama')
  const consent = values.allow_cloud !== undefined ? asBool(values.allow_cloud) : useClaude

  const perTask: Record<string, ProviderId> = {}
  const rawPerTask = values.ai_task_providers
  if (rawPerTask && typeof rawPerTask === 'object' && !Array.isArray(rawPerTask)) {
    for (const [task, p] of Object.entries(rawPerTask)) {
      if (isProviderId(p)) perTask[task] = p
    }
  }

  return {
    model: str('ai_model', 'llama3.2'),
    useClaude,
    strictLocal,
    provider: strictLocal ? 'ollama' : storedProvider,
    claudeModel: str('claude_model', process.env.CLAUDE_MODEL ?? DEFAULT_CLAUDE_MODEL),
    geminiModel: str('gemini_model', process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL),
    openaiModel: str('openai_model', process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL),
    perTask: strictLocal ? {} : perTask,
    allowCloud: strictLocal ? false : consent,
  }
}
