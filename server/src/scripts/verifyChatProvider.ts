/**
 * Live check of a cloud chat provider with SYNTHETIC text, for one or more models. Sends nothing from the library and
 * writes nothing to the database (it only reads the saved API key and the cloud-consent settings).
 *
 *   npx tsx src/scripts/verifyChatProvider.ts openai [model ...]
 *   npx tsx src/scripts/verifyChatProvider.ts groq|gemini|claude [model ...]
 *
 * Without a model it uses the one saved in Settings. With several it runs each, so one run can cover a reasoning model
 * and a non-reasoning one. It calls the provider adapter directly with the model swapped in (nothing is saved), after
 * checking the same rules the router enforces: Strict Local off, cloud consent on, key present. It never uses Ollama.
 * The key is never printed.
 */
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { pool } from '../db/client.js'
import { getProvider, type ProviderId } from '../services/ai.js'
import { ensureApiKeysLoaded, redactSecrets } from '../services/apiKeys.js'
import { getAiConfig, type AiConfig } from '../services/settings.js'

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') })

const IDS = ['claude', 'gemini', 'openai', 'groq'] as const
const SYNTHETIC =
  'Recipe idea: lemon garlic roast chicken. Marinate thighs in lemon juice, garlic and thyme for an hour, roast at 200C for 35 minutes.'

const MODEL_KEY: Record<(typeof IDS)[number], keyof AiConfig> = {
  claude: 'claudeModel', gemini: 'geminiModel', openai: 'openaiModel', groq: 'groqModel',
}

async function step<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
  const t0 = Date.now()
  try {
    const out = await fn()
    console.log(`  PASS  ${name} (${Date.now() - t0} ms)`)
    return out
  } catch (err) {
    console.log(`  FAIL  ${name}: ${redactSecrets(err instanceof Error ? err.message : String(err))}`)
    return null
  }
}

async function main() {
  const id = process.argv[2] as (typeof IDS)[number] | undefined
  if (!id || !IDS.includes(id)) return console.log(`Usage: verifyChatProvider.ts ${IDS.join('|')} [model ...]`)
  await ensureApiKeysLoaded()
  const cfg = await getAiConfig()
  const provider = getProvider(id as ProviderId)
  console.log(`provider: ${id}; key configured: ${provider.available() ? 'yes' : 'no'}; allow_cloud: ${cfg.allowCloud}; strict_local: ${cfg.strictLocal}`)
  if (!provider.available()) return console.log(`No ${id} key saved. Add one in Settings > Keys & Privacy.`)
  if (cfg.strictLocal || !cfg.allowCloud) {
    return console.log('Blocked: turn on cloud consent (and Strict Local off) in Settings first. Settings were not changed.')
  }

  const models = process.argv.slice(3)
  if (models.length === 0) models.push(provider.model(cfg))

  for (const model of models) {
    console.log(`\nmodel: ${model}`)
    const c = { ...cfg, [MODEL_KEY[id]]: model } as AiConfig
    const call = (prompt: string, system?: string, format?: string, options?: Record<string, unknown>) =>
      provider.chat({ prompt, system, format, options, config: c })

    const plain = await step('plain reply', () => call('Reply with exactly the word OK.', undefined, undefined, { temperature: 0 }))
    if (plain) console.log(`        reply: ${JSON.stringify(plain.slice(0, 80))}`)

    const json = await step('JSON mode classification-style reply', async () => {
      const out = await call(
        `Classify this note. Return {"type": "note|recipe|link", "title": string, "tags": string[]}.\n\n${SYNTHETIC}`,
        'You classify notes.', 'json', { temperature: 0 })
      const parsed = JSON.parse(out) as { type?: string; title?: string; tags?: string[] }
      if (!parsed.type || !parsed.title || !Array.isArray(parsed.tags)) throw new Error(`unexpected shape: ${out.slice(0, 120)}`)
      return parsed
    })
    if (json) console.log(`        type=${json.type} title=${JSON.stringify(json.title)} tags=${JSON.stringify(json.tags)}`)

    const tiny = await step('tiny token cap (max_tokens: 16) still returns text', () =>
      call('In one short sentence, why is the sky blue?', undefined, undefined, { max_tokens: 16, temperature: 0 }))
    if (tiny) console.log(`        reply: ${JSON.stringify(tiny.slice(0, 100))}`)
  }
}

main()
  .catch(err => console.error('Error:', redactSecrets(err instanceof Error ? err.message : String(err))))
  .finally(() => pool.end())
