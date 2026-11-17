/**
 * Live check of a cloud embedding provider with a few SYNTHETIC strings. Sends nothing from the library and writes
 * nothing to the database (it only reads the saved API key and the cloud-consent settings).
 *
 *   npx tsx src/scripts/verifyEmbeddingProvider.ts gemini [model]
 *   npx tsx src/scripts/verifyEmbeddingProvider.ts openai [model]
 *
 * It goes through the real `aiEmbed()`, so it also honours Strict Local Mode and cloud consent: if either blocks the
 * call, it says so instead of changing your settings. Prints dimensions, vector norms (raw and as stored) and a
 * similarity sanity check; the key is never printed.
 */
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { pool } from '../db/client.js'
import { aiEmbed } from '../services/ai.js'
import { setActiveEmbedding, buildEmbedding, isEmbeddingProvider, EMBEDDING_DIMENSIONS } from '../services/embeddingConfig.js'
import { ensureApiKeysLoaded, peekApiKey, redactSecrets } from '../services/apiKeys.js'

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') })

const DOCS = [
  'A recipe for garlic pasta with olive oil and chilli',
  'Spaghetti aglio e olio: a quick weeknight dinner',
  'How to change a flat bicycle tyre on the road',
  'Quarterly tax filing deadlines for freelancers',
]
const QUERY = 'easy pasta dinner'

const norm = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0))
const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0)

async function rawGeminiNorm(model: string): Promise<number | null> {
  const key = peekApiKey('gemini')
  if (!key) return null
  const { GoogleGenAI } = await import('@google/genai')
  const res = await new GoogleGenAI({ apiKey: key }).models.embedContent({
    model, contents: DOCS[0], config: { outputDimensionality: EMBEDDING_DIMENSIONS, taskType: 'RETRIEVAL_DOCUMENT' },
  })
  const v = res.embeddings?.[0]?.values
  return v ? norm(v) : null
}

async function main() {
  const provider = process.argv[2]
  if (!isEmbeddingProvider(provider) || provider === 'ollama') {
    console.error('usage: verifyEmbeddingProvider.ts <gemini|openai> [model]')
    process.exitCode = 2
    return
  }
  const active = buildEmbedding(provider, process.argv[3])
  setActiveEmbedding(active)
  await ensureApiKeysLoaded()
  console.log(`Provider ${active.id}, key ${peekApiKey(provider) ? 'present' : 'MISSING'}`)

  try {
    const docs: number[][] = []
    for (const d of DOCS) docs.push(await aiEmbed(d, { kind: 'document' }))
    const q = await aiEmbed(QUERY, { kind: 'query' })

    console.log(`dimensions: ${q.length} (expected ${EMBEDDING_DIMENSIONS}), all finite: ${q.every(Number.isFinite)}`)
    console.log(`stored norm: doc ${norm(docs[0]).toFixed(6)}, query ${norm(q).toFixed(6)} (should be 1)`)
    if (provider === 'gemini') {
      const raw = await rawGeminiNorm(active.model)
      console.log(`raw norm straight from the API at ${EMBEDDING_DIMENSIONS} dims: ${raw?.toFixed(4) ?? 'n/a'} (normalised by us: ${raw !== null && Math.abs(raw - 1) > 1e-3 ? 'needed' : 'not needed'})`)
    }
    console.log('\nquery "' + QUERY + '" vs documents (cosine):')
    DOCS.forEach((d, i) => console.log(`  ${dot(q, docs[i]).toFixed(3)}  ${d}`))
    console.log(`pasta doc vs pasta doc: ${dot(docs[0], docs[1]).toFixed(3)}, pasta vs bicycle: ${dot(docs[0], docs[2]).toFixed(3)}`)
    const best = DOCS.map((_, i) => dot(q, docs[i])).reduce((bi, s, i, a) => (s > a[bi] ? i : bi), 0)
    console.log(`\nsanity: closest document to the query is #${best + 1} (${best <= 1 ? 'PASS, a pasta recipe' : 'FAIL'})`)
  } catch (err) {
    console.error('FAILED:', redactSecrets(err instanceof Error ? `${err.name}: ${err.message}` : String(err)))
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

main()
