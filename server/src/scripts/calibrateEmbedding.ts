/**
 * Calibrates the similarity thresholds (duplicate hints, graph links) of an embedding model on YOUR library.
 *
 *   npx tsx src/scripts/calibrateEmbedding.ts                      report on the active model, change nothing
 *   npx tsx src/scripts/calibrateEmbedding.ts --model <provider:model>
 *   npx tsx src/scripts/calibrateEmbedding.ts --save-reference     store what this model's thresholds flag (see below)
 *   npx tsx src/scripts/calibrateEmbedding.ts --apply              store the suggested thresholds for this model
 *   --sample N                                                     use at most N items (default 800)
 *
 * Method ("equivalent strictness"): there is no ground truth for "these two notes are duplicates", so a trusted model
 * (nomic-embed-text, tuned by hand) is measured first: what share of item pairs in your library do its thresholds flag?
 * Another model then gets the thresholds that flag the same share of the same library.
 *
 * An item keeps only ONE vector, so once the library is re-embedded the old model's vectors are gone. Save the
 * reference while they exist: `--model ollama:nomic-embed-text --save-reference` (switching models in Settings also does
 * this automatically). Later, with the library embedded by the new model: run with --apply.
 *
 * Only numbers are printed: no titles, no content. Nothing is written unless you pass --save-reference or --apply, and a
 * running server only picks up applied thresholds after it restarts (or the embedding model is switched).
 */
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') })

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(name)
const value = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }

async function main() {
  const { pool } = await import('../db/client.js')
  const { loadEmbeddingConfig } = await import('../services/embeddingConfig.js')
  const { profileFor, PROFILE_NOTES } = await import('../services/embeddingProfiles.js')
  const cal = await import('../services/embeddingCalibration.js')

  try {
    const active = await loadEmbeddingConfig()
    const model = value('--model') ?? active.id
    const sampleArg = value('--sample')
    const sample = sampleArg === undefined ? cal.DEFAULT_SAMPLE : Number(sampleArg)
    if (!Number.isInteger(sample) || sample < 2) { console.error('--sample needs a whole number of at least 2'); process.exitCode = 2; return }

    const profile = profileFor(model)
    console.log(`Model: ${model}   (active: ${active.id})`)
    console.log(`Current thresholds: duplicate ${profile.duplicate}, graph ${profile.graph ?? 'off'}, entity ${profile.entity ?? 'off'}   [basis: ${profile.basis}]`)
    if (PROFILE_NOTES[model]) console.log(`  built-in numbers rest on: ${PROFILE_NOTES[model]}`)

    const vectors = await cal.loadSampleVectors(model, sample)
    if (vectors.length < 2) {
      console.log(`\nNo vectors from ${model} in the library (items keep one vector, made by the model that last embedded them).`)
      console.log('Embed the library with this model first (Settings > AI > Search & embeddings), then run this again.')
      process.exitCode = 1
      return
    }
    const sims = cal.sortedPairSimilarities(vectors)
    const f = (v: number, d = 4) => v.toFixed(d)
    console.log(`\nLibrary: ${vectors.length} items, ${sims.length} pairs`)
    console.log('Pair similarity: ' + [0.5, 0.9, 0.99, 0.999, 1].map((p) => `p${p * 100}=${f(cal.percentile(sims, p), 3)}`).join('  '))
    console.log(`Share of pairs flagged by the current thresholds: duplicate ${(cal.fractionAbove(sims, profile.duplicate) * 100).toFixed(4)}%` +
      (profile.graph === null ? '' : `, graph ${(cal.fractionAbove(sims, profile.graph) * 100).toFixed(4)}%`))

    if (flag('--save-reference')) {
      if (profile.basis !== 'tuned' && profile.basis !== 'library') {
        console.error(`\nRefusing: ${model}'s thresholds are '${profile.basis}', not ones to copy. Save the reference from a model whose thresholds you trust (e.g. ollama:nomic-embed-text).`)
        process.exitCode = 1
        return
      }
      if (vectors.length < cal.MIN_ITEMS_FOR_REFERENCE) { console.error(`\nRefusing: ${vectors.length} items is too few for a reference (need ${cal.MIN_ITEMS_FOR_REFERENCE}).`); process.exitCode = 1; return }
      const ref = { model, items: vectors.length, pairs: sims.length, fractions: cal.referenceFractions(sims, profile), savedAt: new Date().toISOString() }
      await cal.saveReference(ref)
      console.log(`\nSaved reference: ${model} flags ${(ref.fractions.duplicate! * 100).toFixed(4)}% of pairs as duplicates` +
        (ref.fractions.graph === null ? '' : ` and ${(ref.fractions.graph * 100).toFixed(4)}% as graph links`) + '.')
      return
    }

    const ref = await cal.readReference()
    if (!ref) {
      console.log('\nNo saved reference, so no suggestion yet. While the library still has nomic-embed-text vectors, run:')
      console.log('  npx tsx src/scripts/calibrateEmbedding.ts --model ollama:nomic-embed-text --save-reference')
      return
    }
    if (ref.model === model) { console.log(`\nThe saved reference is this same model (${model}); a suggestion needs a different one. Nothing to do.`); return }
    console.log(`\nReference: ${ref.model}, ${ref.items} items / ${ref.pairs} pairs, saved ${ref.savedAt.slice(0, 10)}` +
      ` (flagged duplicate ${((ref.fractions.duplicate ?? 0) * 100).toFixed(4)}%, graph ${ref.fractions.graph === null ? 'off' : (ref.fractions.graph * 100).toFixed(4) + '%'})`)

    const s = cal.suggestThresholds(sims, ref.fractions)
    for (const n of s.notes) console.log(`  note: ${n}`)
    console.log(`Suggested for ${model}: duplicate ${s.duplicate ?? '(keep ' + profile.duplicate + ')'}, graph ${s.graph ?? '(keep ' + (profile.graph ?? 'off') + ')'}`)
    console.log('These flag the same share of YOUR pairs as the reference did ("equivalent strictness"). It is a calibration, not proof: skim a few flagged pairs in the app before trusting it.')

    if (!flag('--apply')) { console.log('\nNothing changed. Re-run with --apply to store these.'); return }
    if (s.duplicate === null && s.graph === null) { console.log('\nNothing to apply.'); return }
    const values = { ...(s.duplicate !== null ? { duplicate: s.duplicate } : {}), ...(s.graph !== null ? { graph: s.graph } : {}) }
    const { parseThresholdOverride } = await import('../services/embeddingProfiles.js')
    const valid = parseThresholdOverride(values)
    if (Object.keys(valid).length !== Object.keys(values).length) { console.error('\nRefusing: a suggested value is outside the allowed range.'); process.exitCode = 1; return }
    await cal.applyThresholds(model, valid)
    console.log(`\nStored for ${model}: ${JSON.stringify(valid)}. Restart the server (or switch the embedding model) to pick them up.`)
  } catch (err) {
    console.error('Calibration failed:', err instanceof Error ? err.message : err)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

void main()
