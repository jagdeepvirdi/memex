/**
 * DRY RUN: find places inside saved notes so they can later become items in the Places table.
 * Never writes to the database. Writes a review file; creating items is a separate, later step.
 *
 *   npx tsx src/scripts/minePlacesDryRun.ts [options]
 *
 *   --provider none            (default) rules only: no AI, no network, no cloud, no Ollama.
 *   --provider gemini,claude   cloud chain, tried in order per note (retry with backoff, then next provider).
 *   --provider ollama          local AI. Only used if Ollama is already running; this script never starts it.
 *   --scope shortlist          (default) notes with a place word in them.   --scope notes   every safe note.
 *   --limit N                  first N candidates only (smoke test).     --out <file>   review file location.
 *
 * What is read (hard rules, same as the count script): not encrypted/password items; nothing under the Personal,
 * Passwords, Finance or Links trees; nothing tagged private / no-cloud / local-only; and nothing whose text looks
 * like account data, credentials or a home address (`looksSensitiveContent`). Sensitive notes are never sent to any
 * provider; they are listed as "skipped-sensitive" with no text.
 *
 * Every proposed place is verified against the note (`verifyPlaces`): its name must appear in the note, and a city,
 * country or address is kept only if the note says it. The review file holds names, snippets and the note TITLE: it
 * is private, keep it out of git (sessions/ is ignored).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import pLimit from 'p-limit'
import { pool } from '../db/client.js'
import { aiChat, AiProviderError } from '../services/ai.js'
import { cloudSafe, looksSensitiveContent } from '../services/cloudSafe.js'
import { checkOllamaHealth } from '../services/ollama.js'
import type { ProviderId } from '../services/settings.js'
import {
  PLACE_SYSTEM_PROMPT, findDuplicate, parsePlacesJson, placeSignal, ruleExtractPlaces, stripHtml, verifyPlaces,
  type ExistingPlace, type MinedPlace, type RawPlace,
} from '../services/placeMining.js'

interface Row { id: string; title: string; content: string; type: string; reviewed: boolean; root: string | null; tags: string[] }

type Status = 'ok' | 'no-places' | 'skipped-sensitive' | 'failed'
interface Entry {
  itemId: string
  title: string
  type: string
  reviewed: boolean
  status: Status
  model?: string
  places: Array<MinedPlace & { duplicateOf?: string }>
  /** Places the model named that the note does not contain (dropped). */
  dropped: number
  error?: string
}

interface Options { providers: ProviderId[] | 'none'; scope: 'shortlist' | 'notes'; limit?: number; out: string }

const VALID: readonly ProviderId[] = ['ollama', 'claude', 'gemini', 'openai', 'groq']
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const BACKOFF_MS = [2000, 5000, 12000]

async function loadCandidates(): Promise<Row[]> {
  const { rows } = await pool.query<Row>(
    `SELECT i.id, i.title, i.content, i.type, i.reviewed,
       (SELECT c.name FROM item_categories ic JOIN categories c ON c.id = ic.category_id
         WHERE ic.item_id = i.id AND c.parent_id IS NULL LIMIT 1) AS root,
       COALESCE((SELECT array_agg(t.name) FROM item_tags it JOIN tags t ON t.id = it.tag_id WHERE it.item_id = i.id), '{}') AS tags
     FROM items i
     WHERE i.deleted_at IS NULL AND i.type <> 'password' AND NOT COALESCE(i.encrypted, false)
       AND NOT EXISTS (SELECT 1 FROM item_categories ic JOIN categories c ON c.id = ic.category_id
                        WHERE ic.item_id = i.id AND c.parent_id IS NULL
                          AND lower(c.name) IN ('personal','passwords','finance','links'))
       AND NOT EXISTS (SELECT 1 FROM item_tags it JOIN tags t ON t.id = it.tag_id
                        WHERE it.item_id = i.id AND lower(t.name) IN ('private','no-cloud','local-only'))
     ORDER BY i.created_at`,
  )
  return rows
}

async function loadExistingPlaces(): Promise<ExistingPlace[]> {
  const { rows } = await pool.query<{ id: string; name: string | null; title: string; city: string | null }>(
    `SELECT id, structured->>'name' AS name, title, structured->>'city' AS city
     FROM items WHERE deleted_at IS NULL AND type = 'place'`,
  )
  return rows.map((r) => ({ id: r.id, name: r.name || r.title, ...(r.city ? { city: r.city } : {}) }))
}

/** One note through the provider chain. Never throws. */
async function aiExtract(
  text: string, title: string, providers: ProviderId[], ollamaUp: boolean, dead: Set<ProviderId>,
): Promise<{ raw: RawPlace[]; model: string } | { error: string }> {
  const prompt = `Title: ${title}\n\n${text.slice(0, 3000)}`
  const errors: string[] = []
  for (const provider of providers) {
    if (provider === 'ollama' && !ollamaUp) { errors.push('ollama: not running'); continue }
    if (dead.has(provider)) { errors.push(`${provider}: skipped (auth failed earlier)`); continue }
    let used = ''
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const reply = await aiChat(prompt, PLACE_SYSTEM_PROMPT, 'json', { temperature: 0 }, undefined, {
          task: 'place_mining', provider, cloudSafe: true, userInitiated: true,
          onProvider: (i) => { used = `${i.provider}:${i.model}` },
        })
        return { raw: parsePlacesJson(reply), model: used }
      } catch (e) {
        const kind = e instanceof AiProviderError ? e.kind : 'unavailable'
        const msg = e instanceof Error ? e.message : String(e)
        if (kind === 'auth') { dead.add(provider); errors.push(`${provider}: auth`); break }
        if (kind === 'blocked' || kind === 'bad_response') { errors.push(`${provider}: ${kind} (${msg.slice(0, 80)})`); break }
        if (attempt === 2) { errors.push(`${provider}: ${kind} after 3 tries`); break }
        await sleep(BACKOFF_MS[attempt] ?? 12000)
      }
    }
  }
  return { error: errors.join('; ') || 'no provider available' }
}

async function run(o: Options) {
  const all = await loadCandidates()
  let candidates = all.filter((r) => o.scope === 'notes' ? r.type === 'note' : placeSignal(`${r.title} ${stripHtml(r.content)}`) !== 'none')
  if (o.limit) candidates = candidates.slice(0, o.limit)
  const existing = await loadExistingPlaces()

  const ollamaUp = o.providers !== 'none' && o.providers.includes('ollama') ? await checkOllamaHealth() : false
  if (o.providers !== 'none' && o.providers.includes('ollama') && !ollamaUp) console.log('Ollama is not running: it will NOT be used (this script never starts it).')
  console.log(
    `${all.length} notes pass the category/tag rules; ${candidates.length} selected (scope: ${o.scope}); ` +
      `${existing.length} places already in the table; mode: ${o.providers === 'none' ? 'rules only (no AI)' : o.providers.join(' → ')}`,
  )

  const dead = new Set<ProviderId>()
  const gate = pLimit(2)
  const entries: Entry[] = await Promise.all(
    candidates.map((it) => gate(async (): Promise<Entry> => {
      const text = stripHtml(it.content)
      const base = { itemId: it.id, title: it.title, type: it.type, reviewed: it.reviewed, places: [], dropped: 0 }
      if (looksSensitiveContent(`${it.title}\n${text}`) || !cloudSafe({ type: it.type, categories: it.root ? [it.root] : [], tags: it.tags })) {
        return { ...base, status: 'skipped-sensitive' }
      }

      let raw: RawPlace[]
      let model: string
      if (o.providers === 'none') {
        raw = ruleExtractPlaces(`${it.title}\n${text}`); model = 'rules'
      } else {
        const r = await aiExtract(text, it.title, o.providers, ollamaUp, dead)
        if ('error' in r) return { ...base, status: 'failed', error: r.error }
        raw = r.raw; model = r.model
      }

      const { places, dropped } = verifyPlaces(`${it.title}\n${text}`, raw)
      const marked = places.map((p) => { const d = findDuplicate(p, existing); return d ? { ...p, duplicateOf: d.id } : p })
      return { ...base, status: marked.length ? 'ok' : 'no-places', model, places: marked, dropped }
    })),
  )

  mkdirSync(dirname(o.out), { recursive: true })
  writeFileSync(o.out, JSON.stringify({ createdAt: new Date().toISOString(), options: { ...o }, entries }, null, 2))

  const count = (s: Status) => entries.filter((e) => e.status === s).length
  const placesAll = entries.flatMap((e) => e.places)
  console.log(`saved ${entries.length} notes → ${o.out}`)
  console.log(`notes with places: ${count('ok')}   no places: ${count('no-places')}   skipped (sensitive): ${count('skipped-sensitive')}   failed: ${count('failed')}`)
  console.log(`places found: ${placesAll.length}   new: ${placesAll.filter((p) => !p.duplicateOf).length}   already in Places: ${placesAll.filter((p) => p.duplicateOf).length}   dropped as not in the note: ${entries.reduce((n, e) => n + e.dropped, 0)}`)
  for (const e of entries.filter((x) => x.status === 'failed').slice(0, 3)) console.log(`  failed: ${e.error}`)
  console.log('\nProposed (first 30):')
  placesAll.slice(0, 30).forEach((p) => console.log(`  ${p.duplicateOf ? '[dup] ' : '      '}${p.name.slice(0, 40).padEnd(40)} ${p.type.padEnd(11)} ${(p.city ?? '').padEnd(14)} ${p.confidence}`))
  console.log('\nNothing was written to the database. Review the file, then ask for the create step.')
}

function parse(args: string[]): Options | string {
  const val = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }
  const p = val('--provider') ?? 'none'
  let providers: Options['providers'] = 'none'
  if (p !== 'none') {
    const list = p.split(',').map((s) => s.trim())
    const bad = list.filter((s) => !(VALID as readonly string[]).includes(s))
    if (bad.length) return `unknown provider: ${bad.join(', ')}`
    providers = list as ProviderId[]
  }
  const scope = val('--scope') ?? 'shortlist'
  if (scope !== 'shortlist' && scope !== 'notes') return '--scope must be shortlist or notes'
  const limit = val('--limit') !== undefined ? Number(val('--limit')) : undefined
  if (limit !== undefined && !(limit > 0)) return '--limit must be a positive number'
  const stamp = new Date().toISOString().slice(0, 10)
  return { providers, scope, limit, out: val('--out') ?? `../sessions/place-mining/places-dry-run-${stamp}.json` }
}

const opts = parse(process.argv.slice(2))
if (typeof opts === 'string') {
  console.error(opts)
  void pool.end()
  process.exit(1)
} else {
  run(opts).finally(() => pool.end())
}
