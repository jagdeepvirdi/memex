/**
 * Switch the embedding model and re-embed the library, from the command line (the same steps as Settings > AI >
 * Search & embeddings, without needing a browser login).
 *
 *   npx tsx src/scripts/switchEmbedding.ts gemini            # read-only: prints the estimate (counts only), changes nothing
 *   npx tsx src/scripts/switchEmbedding.ts gemini --go       # SENDS the text of non-private items to that provider
 *   npx tsx src/scripts/switchEmbedding.ts openai text-embedding-3-small --go
 *
 * `--go` = switch + re-embed, in order: it refuses a blocked target (no key, no consent, Strict Local), switches (which
 * also saves the calibration reference when it can), then runs the resumable re-embed job in this process and prints
 * progress. Private items never leave the machine (the writer's rule). Output is numbers only, never titles or text.
 * Re-run it to resume: only items still missing a vector from the active model are embedded.
 *
 * A running server keeps the active model in memory: restart it afterwards so its background worker uses the new one.
 */
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'
import { pool } from '../db/client.js'
import { ensureApiKeysLoaded } from '../services/apiKeys.js'
import { loadEmbeddingConfig, buildEmbedding, activeEmbedding, isEmbeddingProvider } from '../services/embeddingConfig.js'
import { estimateReembed, switchEmbeddingModel, reembedRunning, EmbeddingSwitchError } from '../services/embeddingSwitch.js'
import { embeddingBlockedReason } from '../services/embeddingStatus.js'
import { runReembedJob, REEMBED_JOB_KIND } from '../services/reembedJob.js'
import { createJob } from '../services/ingestJobs.js'

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') })

async function main() {
  const args = process.argv.slice(2)
  const go = args.includes('--go')
  const [provider, model] = args.filter(a => !a.startsWith('--'))
  if (!provider || !isEmbeddingProvider(provider)) return console.log('Usage: switchEmbedding.ts ollama|gemini|openai [model] [--go]')

  await ensureApiKeysLoaded()
  await loadEmbeddingConfig()
  const target = buildEmbedding(provider, model)
  console.log(`active now: ${activeEmbedding().id}; target: ${target.id}`)

  const est = await estimateReembed(target)
  console.log(JSON.stringify({ ...est, target: undefined }, null, 2))
  if (est.blockedReason) return console.log(`Blocked: ${est.blockedReason}`)
  if (!go) return console.log('\nRead-only run. Add --go to switch and re-embed (this sends the non-private items\' text to the provider).')

  try {
    await switchEmbeddingModel(provider, model)
  } catch (err) {
    if (err instanceof EmbeddingSwitchError) return console.log(`Switch refused: ${err.message}`)
    throw err
  }
  await loadEmbeddingConfig()
  const active = activeEmbedding()
  console.log(`\nswitched: active model is now ${active.id}`)
  const blocked = await embeddingBlockedReason(active)
  if (blocked) return console.log(`Cannot re-embed: ${blocked}`)
  if (await reembedRunning()) return console.log('A re-embed is already running; not starting another.')

  const jobId = uuidv4()
  await createJob(jobId, 1, REEMBED_JOB_KIND)
  console.log(`re-embed job ${jobId} started`)
  const timer = setInterval(async () => {
    const { rows } = await pool.query('SELECT status, progress, details FROM ingest_jobs WHERE id = $1', [jobId])
    const r = rows[0]
    if (r) console.log(`  ${r.status} ${JSON.stringify(r.details ?? {})}`)
  }, 15_000)
  await runReembedJob({ jobId, target: active })
  clearInterval(timer)
  const { rows } = await pool.query('SELECT status, error, details FROM ingest_jobs WHERE id = $1', [jobId])
  console.log(`\nfinished: ${rows[0]?.status}${rows[0]?.error ? ` (${rows[0].error})` : ''}`)
  console.log(JSON.stringify(rows[0]?.details ?? {}))
}

main()
  .catch(err => console.error('Error:', err instanceof Error ? err.message : String(err)))
  .finally(() => pool.end())
