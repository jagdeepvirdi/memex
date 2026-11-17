/**
 * Merges near-duplicate entities (e.g. "Christopher Nolan" / "Chris Nolan") by the similarity of their name embeddings.
 *
 *   npx tsx src/scripts/resolveEntities.ts              DRY RUN: shows what would be merged, changes nothing
 *   npx tsx src/scripts/resolveEntities.ts --commit     performs the merges (one transaction each)
 *   npx tsx src/scripts/resolveEntities.ts --limit 10   only the 10 most similar pairs
 *
 * Merging deletes an entity, so nothing happens without --commit. Only entities embedded by the same model are
 * compared, each model uses its own entity threshold (src/services/embeddingProfiles.ts), and a model with no entity
 * threshold (for example every cloud model) is never merged. One entity takes part in at most one merge per run, so
 * run it again to continue a chain. Names are printed to this terminal only.
 */
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') })

const args = process.argv.slice(2)
const commit = args.includes('--commit')
const limitAt = args.indexOf('--limit')
const limit = limitAt >= 0 ? Number(args[limitAt + 1]) : Infinity

async function main() {
  if (limitAt >= 0 && !(Number.isInteger(limit) && limit > 0)) {
    console.error('--limit needs a positive whole number')
    process.exitCode = 2
    return
  }
  const { pool } = await import('../db/client.js')
  const { planEntityMerges, mergeEntities } = await import('../services/entityMerge.js')
  const { profileFor } = await import('../services/embeddingProfiles.js')

  const client = await pool.connect()
  try {
    console.log(commit ? '--- Entity resolution: COMMIT ---' : '--- Entity resolution: DRY RUN (nothing will change) ---')
    const plan = await planEntityMerges(client)
    const todo = plan.candidates.slice(0, limit)

    for (const s of plan.skippedModels) {
      console.log(`Skipped ${s.pairs} similar pair(s) embedded by ${s.model}: that model has no entity threshold, so its entities are never merged.`)
    }
    console.log(`${plan.candidates.length} merge(s) proposed${plan.deferred > 0 ? `, ${plan.deferred} more wait for the next run (an entity merges once per run)` : ''}.`)
    if (todo.length < plan.candidates.length) console.log(`Showing the ${todo.length} most similar (--limit).`)

    let done = 0
    let failed = 0
    for (const c of todo) {
      const label = `"${c.dropName}" -> "${c.keepName}"  [${c.type}, ${c.model}, score ${c.score.toFixed(3)} > ${profileFor(c.model).entity}, links ${c.dropLinks} -> ${c.keepLinks}]`
      if (!commit) {
        console.log(`would merge ${label}`)
        continue
      }
      try {
        const r = await mergeEntities(client, c.keepId, c.dropId)
        done++
        console.log(`merged ${label}  (${r.relinked} link(s) moved, ${r.alreadyLinked} already linked)`)
      } catch (err) {
        failed++
        console.error(`FAILED ${label}: ${err instanceof Error ? err.message : err}`)
      }
    }

    if (!commit) console.log(todo.length > 0 ? 'Dry run only. Re-run with --commit to merge.' : 'Nothing to merge.')
    else console.log(`Done: ${done} merged, ${failed} failed.`)
    if (failed > 0) process.exitCode = 1
  } catch (err) {
    console.error('Resolution failed:', err)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

void main()
