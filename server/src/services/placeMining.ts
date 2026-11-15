// Finds places (restaurants, hotels, attractions, ...) mentioned inside saved notes, so they can become items in the
// Places table instead of staying buried in a note. Pure helpers only (no database, no network): the caller decides
// which notes to read, which provider answers, and what to create. Works without any AI (`ruleExtractPlaces`) or
// with one (`PLACE_SYSTEM_PROMPT` + `parsePlacesJson`); in both cases `verifyPlaces` is the safety net.

export type MinedPlaceType = 'restaurant' | 'cafe' | 'hotel' | 'attraction' | 'destination' | 'other'
const PLACE_TYPES: readonly MinedPlaceType[] = ['restaurant', 'cafe', 'hotel', 'attraction', 'destination', 'other']

export interface RawPlace {
  name: string
  type?: string
  city?: string
  country?: string
  address?: string
  mapsUrl?: string
  confidence?: number
}

export interface MinedPlace {
  name: string
  type: MinedPlaceType
  city?: string
  country?: string
  address?: string
  mapsUrl?: string
  /** A short snippet from the note around the place name, for the reviewer. Built from the note, never from the model. */
  evidence: string
  confidence: number
}

// ── Text helpers ──────────────────────────────────────────────────────────────

/** Notes saved from the Manual tab are HTML; the miner reads plain text. */
export function stripHtml(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>|<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n')
}

export const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

// ── Which notes are worth reading ─────────────────────────────────────────────

export const STRONG_PLACE_SIGNAL =
  /\b(hotel|resort|hostel|villa|restaurant|cafe|café|brewery|bistro|itinerary|airbnb|homestay|guesthouse)\b|maps\.app\.goo\.gl|goo\.gl\/maps|google\.[a-z.]+\/maps|maps\.apple\.com/i
export const BROAD_PLACE_SIGNAL =
  /\b(bar|pub|beach|island|temple|museum|park|waterfall|market|mall|trip|visit|trek|hike|stay|booking|street|road|soi|address|located|near)\b/i

export function placeSignal(text: string): 'strong' | 'broad' | 'none' {
  if (STRONG_PLACE_SIGNAL.test(text)) return 'strong'
  if (BROAD_PLACE_SIGNAL.test(text)) return 'broad'
  return 'none'
}

// ── No-AI extraction (rules) ──────────────────────────────────────────────────

const RULE_TYPES: Array<[RegExp, MinedPlaceType]> = [
  [/\b(hotel|resort|hostel|villa|homestay|guesthouse|airbnb)\b/i, 'hotel'],
  [/\b(restaurant|bistro|brewery)\b/i, 'restaurant'],
  [/\b(cafe|café)\b/i, 'cafe'],
]
const MAPS_URL = /(https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.)?google\.[a-z.]+\/maps|maps\.apple\.com)\S*)/i

/**
 * Rough, honest fallback for when no AI is wanted: a short line that names a hotel / restaurant / cafe becomes a
 * place, and a Maps link takes the line above it as its name. Low confidence on purpose; no city or address guessing.
 */
export function ruleExtractPlaces(text: string): RawPlace[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const out: RawPlace[] = []
  lines.forEach((line, i) => {
    const url = MAPS_URL.exec(line)?.[1]
    if (url) {
      const prev = lines.slice(0, i).reverse().find((l) => !/^https?:\/\//i.test(l) && l.length <= 100)
      if (prev) out.push({ name: cleanName(prev), type: 'other', mapsUrl: url, confidence: 45 })
      return
    }
    // A name is short and is not a link or a sentence: skip URLs, long lines and anything ending like prose.
    if (line.length > 120 || /^https?:\/\//i.test(line) || line.split(/\s+/).length > 8 || /[.!?]$/.test(line)) return
    for (const [re, type] of RULE_TYPES) {
      if (re.test(line)) { out.push({ name: cleanName(line), type, confidence: 40 }); break }
    }
  })
  return out.filter((p) => p.name.length >= 3)
}

function cleanName(line: string): string {
  return line.replace(/^[\s\-*•\d.)]+/, '').replace(/[\s:;,.\-–]+$/, '').slice(0, 100)
}

// ── AI extraction: prompt + parsing ───────────────────────────────────────────

export const PLACE_SYSTEM_PROMPT = `You find real, named places in a saved note: restaurants, cafes, hotels, attractions (sights, parks, temples, beaches, museums) and destinations (cities, islands, regions the author wants to visit or has visited).
Return ONLY JSON: {"places":[{"name":"","type":"restaurant|cafe|hotel|attraction|destination|other","city":"","country":"","address":"","confidence":0-100}]}
Rules:
- Only places that are NAMED in the note. Never invent a place, city, country or address; leave a field empty if the note does not say it.
- Copy names exactly as written in the note.
- Skip personal contact details and anyone's home or private address. Skip shops, products, companies and websites that are not a place to visit.
- A note that is not about places returns {"places":[]}.`

export function parsePlacesJson(raw: string): RawPlace[] {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) return []
  let parsed: unknown
  try { parsed = JSON.parse(raw.slice(start, end + 1)) } catch { return [] }
  const list = (parsed as { places?: unknown })?.places
  if (!Array.isArray(list)) return []
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : undefined)
  return list.flatMap((p): RawPlace[] => {
    const o = p as Record<string, unknown>
    const name = str(o?.name)
    if (!name) return []
    const conf = typeof o.confidence === 'number' && o.confidence >= 0 && o.confidence <= 100 ? o.confidence : 60
    return [{ name, type: str(o.type), city: str(o.city), country: str(o.country), address: str(o.address), confidence: conf }]
  })
}

// ── Safety net: nothing the note does not say gets through ────────────────────

function snippetAround(text: string, name: string): string {
  const at = norm(text).indexOf(norm(name))
  if (at === -1) return ''
  // Work on whitespace-collapsed text so the offset from norm() lines up.
  const flat = text.replace(/\s+/g, ' ')
  const lower = flat.toLowerCase()
  const i = lower.indexOf(norm(name))
  if (i === -1) return ''
  const from = Math.max(0, i - 50)
  return (from > 0 ? '…' : '') + flat.slice(from, i + name.length + 70).trim() + (i + name.length + 70 < flat.length ? '…' : '')
}

/**
 * Keeps only places whose name appears in the note, and clears city / country / address unless the note says
 * them too. Returns the survivors and how many were dropped (a dropped place is a model inventing something).
 */
export function verifyPlaces(text: string, raw: RawPlace[]): { places: MinedPlace[]; dropped: number } {
  const hay = norm(text)
  const has = (v?: string) => !!v && hay.includes(norm(v))
  const seen = new Set<string>()
  const places: MinedPlace[] = []
  let dropped = 0
  for (const r of raw) {
    const name = r.name.trim().slice(0, 100)
    if (!has(name) || name.length < 3) { dropped++; continue }
    const dup = norm(name)
    if (seen.has(dup)) continue
    seen.add(dup)
    const type = (PLACE_TYPES as readonly string[]).includes(r.type ?? '') ? (r.type as MinedPlaceType) : 'other'
    const mapsUrl = r.mapsUrl && text.includes(r.mapsUrl) ? r.mapsUrl : undefined
    places.push({
      name, type,
      ...(has(r.city) ? { city: r.city } : {}),
      ...(has(r.country) ? { country: r.country } : {}),
      ...(has(r.address) ? { address: r.address } : {}),
      ...(mapsUrl ? { mapsUrl } : {}),
      evidence: snippetAround(text, name),
      confidence: Math.round(Math.min(100, Math.max(0, r.confidence ?? 60))),
    })
  }
  return { places, dropped }
}

// ── Deciding what to create ───────────────────────────────────────────────────

const COUNTRIES = new Set([
  'thailand', 'india', 'japan', 'china', 'vietnam', 'cambodia', 'laos', 'myanmar', 'malaysia', 'singapore', 'indonesia',
  'philippines', 'nepal', 'bhutan', 'sri lanka', 'bangladesh', 'pakistan', 'maldives', 'south korea', 'korea', 'taiwan',
  'hong kong', 'mongolia', 'uae', 'dubai', 'saudi arabia', 'turkey', 'egypt', 'israel', 'jordan', 'australia', 'new zealand',
  'usa', 'united states', 'canada', 'mexico', 'brazil', 'argentina', 'peru', 'chile', 'uk', 'united kingdom', 'england',
  'scotland', 'ireland', 'france', 'germany', 'italy', 'spain', 'portugal', 'switzerland', 'austria', 'netherlands',
  'belgium', 'greece', 'croatia', 'norway', 'sweden', 'finland', 'denmark', 'iceland', 'russia', 'morocco', 'kenya',
  'south africa', 'tanzania',
])

/** A country on its own is not a place to add to the Places table. */
export const isCountry = (name: string) => COUNTRIES.has(norm(name))

/** "Soi 11", "Sukhumvit Road": a street, not a destination. Flagged for review, not created by default. */
export const isStreetLevel = (name: string) => /\b(soi|road|rd|street|st|lane|alley|highway)\b\.?/i.test(name) && name.split(/\s+/).length <= 4

/** Spaces, case and punctuation removed: "Khao Yai National Park" and "KhaoYai national park" match. */
export const fuzzyKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Levenshtein distance, giving up (returns max+1) once it exceeds `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      rowMin = Math.min(rowMin, cur[j])
    }
    if (rowMin > max) return max + 1
    prev = cur
  }
  return prev[b.length]
}

/** Typos and swaps ("Kaeng krachan" / "Keang Krachan") but not different places ("Khao Yai" / "Khao Sok"). */
export const looksSimilar = (a: string, b: string) => {
  const ka = fuzzyKey(a), kb = fuzzyKey(b)
  return Math.min(ka.length, kb.length) >= 14 && ka !== kb && editDistance(ka, kb, 2) <= 2
}

export interface Proposal { noteId: string; noteTitle: string; place: MinedPlace & { duplicateOf?: string } }
export type SkipReason = 'already-in-places' | 'similar-to-existing' | 'country' | 'street-level' | 'low-confidence' | 'duplicate-in-batch' | 'similar-name'
export interface PlanOptions { minConfidence: number; keepStreets: boolean; keepSimilar: boolean }
export const DEFAULT_PLAN: PlanOptions = { minConfidence: 70, keepStreets: false, keepSimilar: false }

/**
 * Splits proposals into what to create and what to skip, with a reason for every skip. Exact repeats across notes
 * ("Khao Yai National Park" in three spellings of case/spacing) merge into the first; near-spellings are skipped
 * unless `keepSimilar`, and listed so nothing disappears silently.
 */
export function planPlaces(
  proposals: Proposal[], existing: ExistingPlace[], opts: PlanOptions = DEFAULT_PLAN,
): { create: Proposal[]; skipped: Array<{ proposal: Proposal; reason: SkipReason; of?: string }> } {
  const create: Proposal[] = []
  const skipped: Array<{ proposal: Proposal; reason: SkipReason; of?: string }> = []
  const skip = (proposal: Proposal, reason: SkipReason, of?: string) => skipped.push({ proposal, reason, ...(of ? { of } : {}) })
  const sameCity = (a?: string, b?: string) => !a || !b || norm(a) === norm(b)

  for (const pr of proposals) {
    const p = pr.place
    if (p.duplicateOf || findDuplicate(p, existing)) { skip(pr, 'already-in-places', p.duplicateOf); continue }
    if (isCountry(p.name)) { skip(pr, 'country'); continue }
    if (!opts.keepStreets && isStreetLevel(p.name)) { skip(pr, 'street-level'); continue }
    if (p.confidence < opts.minConfidence) { skip(pr, 'low-confidence'); continue }

    const key = fuzzyKey(p.name)
    const twin = create.find((c) => fuzzyKey(c.place.name) === key && sameCity(c.place.city, p.city))
    if (twin) { skip(pr, 'duplicate-in-batch', twin.place.name); continue }
    if (existing.some((e) => fuzzyKey(e.name) === key && sameCity(e.city, p.city))) { skip(pr, 'already-in-places'); continue }

    if (!opts.keepSimilar) {
      const near = create.find((c) => looksSimilar(c.place.name, p.name) && sameCity(c.place.city, p.city))
      if (near) { skip(pr, 'similar-name', near.place.name); continue }
      const nearExisting = existing.find((e) => looksSimilar(e.name, p.name) && sameCity(e.city, p.city))
      if (nearExisting) { skip(pr, 'similar-to-existing', nearExisting.name); continue }
    }
    create.push(pr)
  }
  return { create, skipped }
}

// ── Duplicates against the Places table ───────────────────────────────────────

export interface ExistingPlace { id: string; name: string; city?: string }

/** An existing place with the same name, and the same city unless either side has none. */
export function findDuplicate(place: Pick<MinedPlace, 'name' | 'city'>, existing: ExistingPlace[]): ExistingPlace | undefined {
  const n = norm(place.name)
  return existing.find((e) => {
    if (norm(e.name) !== n) return false
    return !place.city || !e.city || norm(place.city) === norm(e.city)
  })
}
