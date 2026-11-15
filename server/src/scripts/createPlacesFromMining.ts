/**
 * Creates Places-table items from a place-mining review file (see minePlacesDryRun.ts).
 * PREVIEW BY DEFAULT: it plans, prints, and rolls the transaction back. Pass --commit to keep the new items.
 *
 *   npx tsx src/scripts/createPlacesFromMining.ts <review.json> [--commit] [--keep-similar] [--keep-streets] [--min-confidence N]
 *
 * Each new item is a `place`, UNREVIEWED (it lands in the Pending review queue), linked to its note with
 * `derived_from`, tagged `from-note`, with `visitStatus: 'want-to-visit'` as a placeholder you can change. The notes
 * themselves are never touched. Nothing is skipped silently: every skipped proposal is listed with its reason
 * (already in Places, same place seen twice, near-spelling, country, street, low confidence).
 *
 * Idempotent: a second run finds the places it created and skips them as "already in Places".
 * No AI and no Ollama. Embeddings are NOT computed here (that needs Ollama): the new items have no embedding
 * until the normal enrichment/embedding backfill runs, so they will not show up in semantic search before then.
 */
import { readFileSync } from 'node:fs'
import { pool } from '../db/client.js'
import { createItem } from '../db/helpers.js'
import { mapToCategories } from '../services/classifier.js'
import {
  DEFAULT_PLAN, planPlaces, type ExistingPlace, type MinedPlace, type PlanOptions, type Proposal, type SkipReason,
} from '../services/placeMining.js'
import type { PlaceData } from '../../../shared/types.js'

interface ReviewEntry {
  itemId: string
  title: string
  status: string
  model?: string
  places: Array<MinedPlace & { duplicateOf?: string }>
}

function parse(args: string[]): { file: string; commit: boolean; plan: PlanOptions } | string {
  const file = args.find((a) => !a.startsWith('--'))
  if (!file) return 'usage: <review.json> [--commit] [--keep-similar] [--keep-streets] [--min-confidence N]'
  const mi = args.indexOf('--min-confidence')
  const minConfidence = mi >= 0 ? Number(args[mi + 1]) : DEFAULT_PLAN.minConfidence
  if (!(minConfidence >= 0 && minConfidence <= 100)) return '--min-confidence must be 0-100'
  return {
    file,
    commit: args.includes('--commit'),
    plan: { minConfidence, keepStreets: args.includes('--keep-streets'), keepSimilar: args.includes('--keep-similar') },
  }
}

async function main(file: string, commit: boolean, planOpts: PlanOptions) {
  const entries = (JSON.parse(readFileSync(file, 'utf8')).entries as ReviewEntry[]).filter((e) => e.status === 'ok')
  const modelOf = new Map(entries.map((e) => [e.itemId, e.model ?? 'unknown']))

  // Only notes that still exist (not deleted since the dry-run).
  const { rows: live } = await pool.query<{ id: string }>(
    `SELECT id FROM items WHERE deleted_at IS NULL AND id = ANY($1::uuid[])`, [entries.map((e) => e.itemId)])
  const liveIds = new Set(live.map((r) => r.id))
  const gone = entries.filter((e) => !liveIds.has(e.itemId))
  const proposals: Proposal[] = entries
    .filter((e) => liveIds.has(e.itemId))
    .flatMap((e) => e.places.map((place) => ({ noteId: e.itemId, noteTitle: e.title, place })))

  const { rows: ex } = await pool.query<{ id: string; name: string | null; title: string; city: string | null }>(
    `SELECT id, structured->>'name' AS name, title, structured->>'city' AS city FROM items WHERE deleted_at IS NULL AND type = 'place'`)
  const existing: ExistingPlace[] = ex.map((r) => ({ id: r.id, name: r.name || r.title, ...(r.city ? { city: r.city } : {}) }))

  const { create, skipped } = planPlaces(proposals, existing, planOpts)

  console.log(`${proposals.length} proposed places from ${entries.length - gone.length} notes` + (gone.length ? ` (${gone.length} notes no longer exist, ignored)` : ''))
  console.log(`will create: ${create.length}   skipped: ${skipped.length}   (min confidence ${planOpts.minConfidence}${planOpts.keepSimilar ? ', keeping similar names' : ''}${planOpts.keepStreets ? ', keeping streets' : ''})`)

  const byReason = new Map<SkipReason, typeof skipped>()
  for (const s of skipped) byReason.set(s.reason, [...(byReason.get(s.reason) ?? []), s])
  for (const [reason, list] of byReason) {
    console.log(`\nskipped: ${reason} (${list.length})`)
    list.slice(0, 12).forEach((s) => console.log(`   ${s.proposal.place.name.slice(0, 44)}${s.of ? `   ~ ${s.of.slice(0, 30)}` : ''}`))
    if (list.length > 12) console.log(`   … and ${list.length - 12} more`)
  }

  console.log(`\nto create (${create.length}):`)
  create.forEach((c) => console.log(`   ${c.place.name.slice(0, 44).padEnd(44)} ${c.place.type.padEnd(11)} ${(c.place.city ?? '').padEnd(14)} ${c.place.confidence}`))

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const c of create) {
      const p = c.place
      const structured: PlaceData = {
        name: p.name, type: p.type, visitStatus: 'want-to-visit',
        ...(p.city ? { city: p.city } : {}), ...(p.country ? { country: p.country } : {}),
        ...(p.address ? { address: p.address } : {}), ...(p.mapsUrl ? { mapsUrl: p.mapsUrl } : {}),
        ...(p.evidence ? { notes: p.evidence } : {}),
      }
      const item = await createItem(client, {
        title: p.name,
        type: 'place',
        content: [[p.name, p.city, p.country].filter(Boolean).join(', '), p.evidence].filter(Boolean).join('\n'),
        structured: structured as unknown as Record<string, unknown>,
        source: 'manual',
        categories: mapToCategories('place', structured as unknown as Record<string, unknown>),
        tags: ['from-note'],
        reviewed: false,
        confidence: p.confidence,
        derivedFrom: c.noteId,
      })
      await client.query('UPDATE items SET extraction_model = $1 WHERE id = $2', [modelOf.get(c.noteId) ?? 'unknown', item.id])
    }
    if (commit) {
      await client.query('COMMIT')
      console.log(`\nCOMMITTED: created ${create.length} unreviewed places (tagged from-note, in the Pending queue). No embeddings yet.`)
    } else {
      await client.query('ROLLBACK')
      console.log(`\nPreview only: rolled back, nothing was created. Re-run with --commit to keep ${create.length} places.`)
    }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

const parsed = parse(process.argv.slice(2))
if (typeof parsed === 'string') {
  console.error(parsed)
  void pool.end()
  process.exit(1)
} else {
  main(parsed.file, parsed.commit, parsed.plan).finally(() => pool.end())
}
