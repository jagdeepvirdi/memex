/**
 * Live check of the Groq provider with SYNTHETIC text. Sends nothing from the library and writes nothing to the
 * database (it only reads the saved API key and the cloud-consent settings).
 *
 *   npx tsx src/scripts/verifyGroq.ts [model]
 *
 * Goes through the real `aiChat({provider: 'groq'})`, so Strict Local Mode and cloud consent are honoured: if either
 * blocks the call it says so instead of changing your settings. It never falls back to Ollama (explicit provider).
 * Checks: the default model id is listed by Groq, a plain reply, a JSON-mode reply, and that a reasoning model still
 * answers when the caller asks for a tiny token cap (the provider raises it). The key is never printed.
 */
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { pool } from '../db/client.js'
import { aiChat, GROQ_BASE_URL } from '../services/ai.js'
import { ensureApiKeysLoaded, peekApiKey, redactSecrets } from '../services/apiKeys.js'
import { getAiConfig } from '../services/settings.js'

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') })

const SYNTHETIC =
  'Recipe idea: lemon garlic roast chicken. Marinate thighs in lemon juice, garlic and thyme for an hour, roast at 200C for 35 minutes.'

async function step<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
  const t0 = Date.now()
  try {
    const out = await fn()
    console.log(`PASS  ${name} (${Date.now() - t0} ms)`)
    return out
  } catch (err) {
    console.log(`FAIL  ${name}: ${redactSecrets(err instanceof Error ? err.message : String(err))}`)
    return null
  }
}

async function main() {
  await ensureApiKeysLoaded()
  const cfg = await getAiConfig()
  const model = process.argv[2] ?? cfg.groqModel
  const key = peekApiKey('groq')
  console.log(`model: ${model}`)
  console.log(`key configured: ${key ? 'yes' : 'no'}; allow_cloud: ${cfg.allowCloud}; strict_local: ${cfg.strictLocal}`)
  if (!key) return console.log('No Groq key saved. Add one in Settings > Keys & Privacy.')
  if (cfg.strictLocal || !cfg.allowCloud) {
    return console.log('Blocked: turn on cloud consent (and Strict Local off) in Settings first. Settings were not changed.')
  }

  const ids = await step('GET /models lists the configured model', async () => {
    const res = await fetch(`${GROQ_BASE_URL}/models`, { headers: { Authorization: `Bearer ${key}` } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = (await res.json()) as { data?: Array<{ id: string }> }
    const list = (body.data ?? []).map(m => m.id)
    if (!list.includes(model)) throw new Error(`"${model}" is not in Groq's list`)
    return list
  })
  if (ids) console.log(`      ${ids.length} models listed; chat-capable examples: ${ids.filter(i => /gpt-oss|llama|qwen/i.test(i)).slice(0, 8).join(', ')}`)

  const opts = { provider: 'groq' as const, userInitiated: true }

  const plain = await step('plain reply', () => aiChat('Reply with exactly the word OK.', undefined, undefined, { temperature: 0 }, undefined, opts))
  if (plain) console.log(`      reply: ${JSON.stringify(plain.slice(0, 80))}`)

  const json = await step('JSON mode classification-style reply', async () => {
    const out = await aiChat(
      `Classify this note. Return {"type": "note|recipe|link", "title": string, "tags": string[]}.\n\n${SYNTHETIC}`,
      'You classify notes.', 'json', { temperature: 0 }, undefined, opts)
    const parsed = JSON.parse(out) as { type?: string; title?: string; tags?: string[] }
    if (!parsed.type || !parsed.title || !Array.isArray(parsed.tags)) throw new Error(`unexpected shape: ${out.slice(0, 120)}`)
    return parsed
  })
  if (json) console.log(`      type=${json.type} title=${JSON.stringify(json.title)} tags=${JSON.stringify(json.tags)}`)

  const tiny = await step('tiny token cap (max_tokens: 16) still returns text', () =>
    aiChat('In one short sentence, why is the sky blue?', undefined, undefined, { max_tokens: 16, temperature: 0 }, undefined, opts))
  if (tiny) console.log(`      reply: ${JSON.stringify(tiny.slice(0, 100))}`)
}

main()
  .catch(err => console.error('Error:', redactSecrets(err instanceof Error ? err.message : String(err))))
  .finally(() => pool.end())
