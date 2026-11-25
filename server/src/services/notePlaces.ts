// Turns the places named inside a freshly saved note (a trip list, "stay at X, eat at Y") into their own Places items.
//
// The pure parts (prompt, parsing, the "is the name really in the note" check, duplicate planning) live in
// `placeMining.ts` and were first used by one-off scripts over old notes. This module wires them into the normal save
// path, with the same safety rules:
//   - nothing the note does not say gets through (`verifyPlaces`),
//   - a place already in the Places table is not created twice, countries and bare street names are skipped,
//   - the AI call follows the usual privacy rules (`cloudSafe`), and a failure never blocks saving the note itself.
// Each created place is an unreviewed `place` tagged `from-note` and linked to its note with `derived_from`.

import type { PoolClient } from 'pg'
import { aiChat } from './ai.js'
import { pool } from '../db/client.js'
import { cloudSafe } from './cloudSafe.js'
import { createItem } from '../db/helpers.js'
import { mapToCategories } from './classifier.js'
import {
  PLACE_SYSTEM_PROMPT, fuzzyKey, parsePlacesJson, placeSignal, planPlaces, stripHtml, verifyPlaces,
  type ExistingPlace, type MinedPlace, type RawPlace,
} from './placeMining.js'
import logger from '../lib/logger.js'
import type { Item, PlaceData } from '../../../shared/types.js'

/** Most places taken from one note: a runaway answer must not flood the library. */
export const MAX_NOTE_PLACES = 30

/** Only notes that look like travel or place notes are read for places (one extra AI call each). */
export function shouldMinePlaces(result: { type: string; categories: string[] }, text: string): boolean {
  if (result.type === 'place' || result.categories[0] === 'Travel') return true
  return placeSignal(stripHtml(text)) === 'strong'
}

export interface FoundPlaces {
  places: MinedPlace[]
  /** `<provider>:<model>` that answered, for `extraction_model` on the created items. */
  model?: string
}

/**
 * Asks the AI for the named places in a note. Failure-soft: any problem (no provider reachable, bad JSON) returns
 * no places and the note is saved as before. Names that are not in the note are dropped by `verifyPlaces`.
 */
/** Appended for a scraped web article: it is about somewhere, so that somewhere and its region are not "places in it". */
const PAGE_ADDENDUM = `
This text is a web article or guide. List the specific places it recommends or describes (sights, parks, temples, hotels, restaurants, cafes, markets, towns to visit). Do NOT list the place the whole article is about, its province, region or country, or places named only to say where something is.`

/** Output cap for the place call: a long guide names dozens of places and the default cap cut the JSON off mid-list. */
const PLACE_REPLY_TOKENS = 6000

export async function extractNotePlaces(
  title: string, text: string, opts: { cloudSafe: boolean; maxChars?: number; page?: boolean },
): Promise<FoundPlaces> {
  const plain = stripHtml(text)
  if (!plain.trim()) return { places: [] }
  const limit = opts.maxChars ?? 3000
  let model: string | undefined
  try {
    const reply = await aiChat(
      `Title: ${title}\n\n${plain.slice(0, limit)}`, opts.page ? PLACE_SYSTEM_PROMPT + PAGE_ADDENDUM : PLACE_SYSTEM_PROMPT,
      'json', { temperature: 0, num_predict: PLACE_REPLY_TOKENS }, undefined,
      { task: 'place_mining', cloudSafe: opts.cloudSafe, onProvider: (p) => { model = `${p.provider}:${p.model}` } },
    )
    const { places } = verifyPlaces(`${title}\n${plain.slice(0, limit)}`, parsePlacesJson(reply))
    return { places: places.slice(0, MAX_NOTE_PLACES), ...(model ? { model } : {}) }
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, '[Places] could not read places from the note; saving it without')
    return { places: [] }
  }
}

type Queryable = Pick<PoolClient, 'query'>

/**
 * Keeps the places worth creating: not already in the Places table, not the note itself (a note titled "Chiang Rai"
 * is already a place), no countries, no bare streets, confident enough, no repeats.
 */
export async function planNotePlaces(
  db: Queryable, places: MinedPlace[], note: { title: string; name?: string; id?: string },
): Promise<MinedPlace[]> {
  if (places.length === 0) return []
  const { rows } = await db.query<{ id: string; name: string | null; title: string; city: string | null }>(
    `SELECT id, structured->>'name' AS name, title, structured->>'city' AS city
     FROM items WHERE deleted_at IS NULL AND type = 'place'`,
  )
  const existing: ExistingPlace[] = rows.map((r) => ({ id: r.id, name: r.name || r.title, ...(r.city ? { city: r.city } : {}) }))
  const self = new Set([fuzzyKey(note.title), ...(note.name ? [fuzzyKey(note.name)] : [])])
  const proposals = places
    .filter((p) => !self.has(fuzzyKey(p.name)))
    .map((place) => ({ noteId: note.id ?? '', noteTitle: note.title, place }))
  return planPlaces(proposals, existing).create.map((c) => c.place)
}

/** A place proposal as the client sends it back with the save request. */
export function toRawPlaces(places: Array<Omit<MinedPlace, 'evidence'> & { evidence?: string }>): RawPlace[] {
  return places.map((p) => ({
    name: p.name, type: p.type, city: p.city, country: p.country, address: p.address, mapsUrl: p.mapsUrl, confidence: p.confidence,
  }))
}

/**
 * Creates the places inside the caller's transaction. Returns the new items. They are unreviewed (they land in
 * Pending), `want-to-visit` until the user says otherwise, linked to their note and tagged `from-note`.
 */
export async function createNotePlaces(
  client: PoolClient, noteId: string, places: MinedPlace[], model?: string,
): Promise<Item[]> {
  const created: Item[] = []
  for (const p of places) {
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
      derivedFrom: noteId,
    })
    if (model) await client.query('UPDATE items SET extraction_model = $1 WHERE id = $2', [model, item.id])
    created.push(item)
  }
  return created
}

/** A classified capture, as far as the place step needs to know it. */
export interface CaptureNote {
  type: string
  title: string
  categories: string[]
  tags: string[]
  structured: Record<string, unknown>
}

/**
 * Everything the capture preview needs in one call: does it look like a place note, read the places with the right
 * privacy flag, keep the ones worth creating.
 *
 * - `maxChars` widens the window for a long web page.
 * - `page: true` tells the model it is reading a web article (the place it is about is not "a place in it").
 * - `scanContent: false` is for a scraped PUBLIC web page: the privacy check then looks at type, category and tags only.
 *   The page text of a travel guide is full of phone numbers and street addresses that would wrongly mark it private,
 *   and classifying a URL does not scan page text either. A note the user typed always has its text scanned.
 */
export async function placesForCapture(
  note: CaptureNote, text: string, opts: { maxChars?: number; scanContent?: boolean; page?: boolean } = {},
): Promise<FoundPlaces> {
  if (!shouldMinePlaces(note, text)) return { places: [] }
  const safe = cloudSafe({
    type: note.type, categories: note.categories, tags: note.tags,
    ...(opts.scanContent === false ? {} : { title: note.title, content: text }),
  })
  const found = await extractNotePlaces(note.title, text, {
    cloudSafe: safe, ...(opts.maxChars ? { maxChars: opts.maxChars } : {}), ...(opts.page ? { page: true } : {}),
  })
  const name = note.structured.name
  // On a web article, "other" is mostly bus stations and airports: not something to save as a place to visit.
  const candidates = opts.page ? found.places.filter((p) => p.type !== 'other') : found.places
  const places = await planNotePlaces(pool, candidates,{ title: note.title, ...(typeof name === 'string' ? { name } : {}) })
  return { places, ...(found.model ? { model: found.model } : {}) }
}
