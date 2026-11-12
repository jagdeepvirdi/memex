import { z } from 'zod'
import { aiChat } from './ai.js'
import { getAiConfig } from './settings.js'
import { detectGithubRepoSubject, type GithubRepoRef } from './githubRepo.js'

export { parseGithubRepoUrl, detectGithubRepoSubject, type GithubRepoRef } from './githubRepo.js'
import type { ItemType, RecipeData, MediaData, BookData, StockData, PlaceData, RepoData, DevKnowledgeKind } from '../../../shared/types.js'

// ── Zod schema — validates & coerces the AI's JSON response ──────────────────

const classificationSchema = z.object({
  type: z
    .enum(['note', 'recipe', 'media', 'spec', 'stock', 'link', 'book', 'place'])
    .catch('note'),
  title: z.string().min(1).catch('Untitled'),
  categories: z.array(z.string()).catch([]),
  tags: z.array(z.string()).catch([]),
  summary: z.string().catch(''),
  structured: z.record(z.unknown()).catch({}),
  multiEntity: z.boolean().optional(),
  entities: z.array(z.record(z.unknown())).optional(),
  confidence: z.number().min(0).max(100).catch(80),
  intent: z.enum(['actionable', 'reference', 'idea']).default('reference').catch('reference'),
})

export type ClassificationResult = {
  type: ItemType
  title: string
  categories: string[]
  tags: string[]
  summary: string
  structured: Record<string, unknown>
  multiEntity?: boolean
  entities?: Record<string, unknown>[]
  confidence: number
  intent?: 'actionable' | 'reference' | 'idea'
  model?: string  // which AI model produced this result
}

// ── System prompts ────────────────────────────────────────────────────────────

const CANONICAL_LEAVES = [
  'Cakes', 'Cookies', 'Bread', 'Indian', 'Italian', 'Thai', 'Chinese',
  'Action', 'Drama', 'Horror', 'Comedy', 'Fiction', 'Non-Fiction', 'Technical',
  'Laptops', 'Cameras', 'Phones', 'Specs', 'Stocks', 'Crypto', 'Notes',
  'Destinations', 'Hotels', 'Restaurants', 'Attractions',
  'YouTube', 'Instagram', 'Articles', 'Docs', 'Numbers', 'Contacts',
  'Repos', 'Prompts & Skills', 'Explainers', 'Tools',
]

const SYSTEM_PROMPT = `You are a knowledge classifier. Given raw text or a note, return ONLY valid JSON with no preamble.

Detection:
If the note lists MULTIPLE distinct entities (e.g. 5 movies, 3 restaurants, or a list of books), set "multiEntity": true and provide an "entities" array.

{
  "type": "note|recipe|media|spec|stock|link|book|place",
  "title": "<inferred title, max 80 chars>",
  "categories": ["<top-level>", "<mid>", "<leaf>"],
  "tags": ["<tag1>", "<tag2>", "<tag3>"],
  "summary": "<2-3 sentences TL;DR>",
  "structured": {},
  "multiEntity": false,
  "entities": [],
  "confidence": 0-100,
  "intent": "actionable|reference|idea"
}

Category Rule:
You MUST pick the most specific <leaf> from this list for the last element of "categories":
${CANONICAL_LEAVES.join(', ')}

Type rules:
- recipe: food recipe with ingredients/steps
- media: movie, TV show, film — structured: { "genre": "", "year": 0, "director": "", "cast": [], "watchStatus": "watched|want-to-watch", "userRating": 1-5 }
- book: any book — structured: { "author": "", "genre": "", "year": 0, "status": "want-to-read|read", "userRating": 1-5 }
- place: restaurant, cafe, hotel, city — structured: { "name": "", "type": "restaurant|hotel|destination", "city": "", "visitStatus": "visited|want-to-visit", "userRating": 1-5 }
- stock: stock ticker — structured: { "ticker": "", "exchange": "" }
- spec: technical specs — structured key-value pairs
- link: saved URL, video, social post
  Developer knowledge is also type link: a GitHub repo, an AI prompt or skill, an explainer about a dev/AI tool, or a tool.
  Use categories ["Tech", "AI", "<Repos|Prompts & Skills|Explainers|Tools>"] and structured:
  { "kind": "repo|prompt|skill|explainer|tool", "repoName": "owner/repo", "repoUrl": "", "creatorHandle": "", "whatItDoes": "<plain-English: what it is and what it is for>", "promptText": "" }
  Choose the category by TOPIC, never by where it was posted: an Instagram or YouTube caption about a repo is Repos, not Instagram or YouTube.
- note: everything else

Intent rules:
- actionable: todo, task, want-to-do/buy/visit/watch, plan, recommendation requiring follow-up
- reference: factual info, how-to guide, specs, article saved for later lookup
- idea: brainstorm, fleeting thought, creative concept, hypothesis, shower thought

Provide a "confidence" score (0-100) indicating how certain you are of this extraction.
Return ONLY JSON. No explanation.`

const STRICT_SYSTEM_PROMPT = `Return ONLY a valid JSON object. Nothing else. No explanation. No markdown.
Shape: {"type":"note","title":"","categories":[],"tags":[],"summary":"","structured":{},"multiEntity":false,"entities":[],"confidence":90,"intent":"reference"}
Valid types: note, recipe, media, spec, stock, link, book, place
Valid intents: actionable, reference, idea`

// ── JSON extraction helpers ───────────────────────────────────────────────────

function extractJson(raw: string): string {
  // Strip markdown code fences if the model wrapped the response
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) return fenceMatch[1].trim()

  // Find the outermost { ... } block
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start !== -1 && end > start) return raw.slice(start, end + 1)

  return raw.trim()
}

function parseClassification(raw: string): ClassificationResult {
  const json = extractJson(raw)
  const parsed = JSON.parse(json) as unknown
  const validated = classificationSchema.parse(parsed)
  return {
    type: validated.type as ItemType,
    title: validated.title,
    categories: validated.categories,
    tags: validated.tags,
    summary: validated.summary,
    structured: validated.structured,
    multiEntity: validated.multiEntity,
    entities: validated.entities,
    confidence: validated.confidence,
    intent: validated.intent,
  }
}

// ── Category mapping — maps type + structured data to the known tree ──────────

export const CANONICAL_MAPPING: Record<string, string[]> = {
  // Food
  food: ['Food'],
  recipe: ['Food'],
  bakery: ['Food', 'Bakery'],
  cake: ['Food', 'Bakery', 'Cakes'],
  cakes: ['Food', 'Bakery', 'Cakes'],
  cookie: ['Food', 'Bakery', 'Cookies'],
  cookies: ['Food', 'Bakery', 'Cookies'],
  bread: ['Food', 'Bakery', 'Bread'],
  savory: ['Food', 'Savory'],
  indian: ['Food', 'Savory', 'Indian'],
  italian: ['Food', 'Savory', 'Italian'],
  thai: ['Food', 'Savory', 'Thai'],
  chinese: ['Food', 'Savory', 'Chinese'],

  // Media
  media: ['Media'],
  movie: ['Media', 'Movies'],
  movies: ['Media', 'Movies'],
  film: ['Media', 'Movies'],
  cinema: ['Media', 'Movies'],
  book: ['Media', 'Books'],
  books: ['Media', 'Books'],
  action: ['Media', 'Movies', 'Action'],
  drama: ['Media', 'Movies', 'Drama'],
  horror: ['Media', 'Movies', 'Horror'],
  comedy: ['Media', 'Movies', 'Comedy'],
  fiction: ['Media', 'Books', 'Fiction'],
  'non-fiction': ['Media', 'Books', 'Non-Fiction'],
  nonfiction: ['Media', 'Books', 'Non-Fiction'],
  technical: ['Media', 'Books', 'Technical'],

  // Tech
  tech: ['Tech'],
  technology: ['Tech'],
  laptop: ['Tech', 'Laptops'],
  laptops: ['Tech', 'Laptops'],
  camera: ['Tech', 'Cameras'],
  cameras: ['Tech', 'Cameras'],
  phone: ['Tech', 'Phones'],
  phones: ['Tech', 'Phones'],
  spec: ['Tech', 'Specs'],
  specs: ['Tech', 'Specs'],
  tutorial: ['Tech'],
  course: ['Tech'],
  learning: ['Tech'],
  education: ['Tech'],
  design: ['Tech'],
  development: ['Tech'],
  programming: ['Tech'],

  // Finance
  finance: ['Finance'],
  money: ['Finance'],
  stock: ['Finance', 'Stocks'],
  stocks: ['Finance', 'Stocks'],
  crypto: ['Finance', 'Crypto'],
  cryptocurrency: ['Finance', 'Crypto'],
  note: ['Finance', 'Notes'],
  notes: ['Finance', 'Notes'],
  bank: ['Finance', 'Notes'],
  account: ['Finance', 'Notes'],
  financial: ['Finance'],

  // Personal
  personal: ['Personal'],
  number: ['Personal', 'Numbers'],
  numbers: ['Personal', 'Numbers'],
  contact: ['Personal', 'Contacts'],
  contacts: ['Personal', 'Contacts'],
  shopping: ['Personal'],
  todo: ['Personal'],
  work: ['Personal'],
  health: ['Personal'],
  family: ['Personal'],
  children: ['Personal'],

  // Links
  link: ['Links'],
  links: ['Links'],
  url: ['Links'],
  youtube: ['Links', 'YouTube'],
  instagram: ['Links', 'Instagram'],
  article: ['Links', 'Articles'],
  articles: ['Links', 'Articles'],
  doc: ['Links', 'Docs'],
  docs: ['Links', 'Docs'],
  video: ['Links'],
  social: ['Links'],

  // Travel
  travel: ['Travel'],
  destination: ['Travel', 'Destinations'],
  destinations: ['Travel', 'Destinations'],
  hotel: ['Travel', 'Hotels'],
  hotels: ['Travel', 'Hotels'],
  restaurant: ['Travel', 'Restaurants'],
  restaurants: ['Travel', 'Restaurants'],
  attraction: ['Travel', 'Attractions'],
  attractions: ['Travel', 'Attractions'],
  cafe: ['Travel', 'Restaurants'],
  cafes: ['Travel', 'Restaurants'],

  // Developer knowledge (append-only: never reorder or change keys above)
  ai: ['Tech', 'AI'],
  repo: ['Tech', 'AI', 'Repos'],
  repos: ['Tech', 'AI', 'Repos'],
  github: ['Tech', 'AI', 'Repos'],
  prompt: ['Tech', 'AI', 'Prompts & Skills'],
  prompts: ['Tech', 'AI', 'Prompts & Skills'],
  skill: ['Tech', 'AI', 'Prompts & Skills'],
  skills: ['Tech', 'AI', 'Prompts & Skills'],
  'prompts & skills': ['Tech', 'AI', 'Prompts & Skills'],
  explainer: ['Tech', 'AI', 'Explainers'],
  explainers: ['Tech', 'AI', 'Explainers'],
  tools: ['Tech', 'AI', 'Tools'],
}

/**
 * Normalises AI-suggested categories against the canonical tree.
 * Returns the first match found, or an empty array if no match.
 */
export function normalizeCategories(aiCategories: string[]): string[] {
  // Reverse search — AI often puts specific sub-categories at the end
  for (let i = aiCategories.length - 1; i >= 0; i--) {
    const lower = aiCategories[i].toLowerCase().trim()
    if (CANONICAL_MAPPING[lower]) {
      return CANONICAL_MAPPING[lower]
    }
  }
  return []
}

const CUISINE_MAP: Record<string, string> = {
  indian: 'Indian',
  curry: 'Indian',
  italian: 'Italian',
  pasta: 'Italian',
  pizza: 'Italian',
  thai: 'Thai',
  chinese: 'Chinese',
}

const BAKERY_KEYWORDS: Array<[string[], string]> = [
  [['cake', 'cupcake', 'torte', 'gateau'], 'Cakes'],
  [['cookie', 'biscuit', 'shortbread', 'brownie'], 'Cookies'],
  [['bread', 'loaf', 'bun', 'roll', 'sourdough', 'focaccia', 'baguette'], 'Bread'],
]

function mapRecipeCategories(structured: RecipeData): string[] {
  const cuisine = (structured.cuisine ?? '').toLowerCase()
  const mealType = (structured.mealType ?? '').toLowerCase()
  const combined = `${cuisine} ${mealType}`

  // Bakery check first (meal type driven)
  for (const [keywords, leaf] of BAKERY_KEYWORDS) {
    if (keywords.some((k) => combined.includes(k))) {
      return ['Food', 'Bakery', leaf]
    }
  }

  // Cuisine → Savory
  for (const [key, leaf] of Object.entries(CUISINE_MAP)) {
    if (cuisine.includes(key)) return ['Food', 'Savory', leaf]
  }

  return ['Food']
}

const BOOK_GENRE_MAP: Record<string, string> = {
  // Non-fiction keys must come before 'fiction' — 'non-fiction'.includes('fiction') is true
  'non-fiction': 'Non-Fiction',
  nonfiction: 'Non-Fiction',
  biography: 'Non-Fiction',
  memoir: 'Non-Fiction',
  history: 'Non-Fiction',
  philosophy: 'Non-Fiction',
  fiction: 'Fiction',
  novel: 'Fiction',
  fantasy: 'Fiction',
  scifi: 'Fiction',
  'sci-fi': 'Fiction',
  thriller: 'Fiction',
  mystery: 'Fiction',
  romance: 'Fiction',
  technical: 'Technical',
  programming: 'Technical',
  engineering: 'Technical',
  science: 'Technical',
}

function mapBookCategories(structured: BookData): string[] {
  const genre = (structured.genre ?? '').toLowerCase()
  for (const [key, leaf] of Object.entries(BOOK_GENRE_MAP)) {
    if (genre.includes(key)) return ['Media', 'Books', leaf]
  }
  return ['Media', 'Books']
}

export function mapToCategories(
  type: ItemType,
  structured: Record<string, unknown>,
): string[] {
  switch (type) {
    case 'recipe':
      return mapRecipeCategories(structured as unknown as RecipeData)
    case 'media':
      return ['Media', 'Movies']
    case 'book':
      return mapBookCategories(structured as unknown as BookData)
    case 'stock':
      return ['Finance', 'Stocks']
    case 'spec':
      return ['Tech', 'Specs']
    case 'link':
      return mapDevKnowledgeCategories(structured) ?? ['Links']
    case 'place':
      return mapPlaceCategories(structured as unknown as PlaceData)
    default:
      return []
  }
}

function mapPlaceCategories(s: PlaceData): string[] {
  if (s.type === 'restaurant' || s.type === 'cafe') return ['Travel', 'Restaurants']
  if (s.type === 'hotel') return ['Travel', 'Hotels']
  if (s.type === 'attraction') return ['Travel', 'Attractions']
  if (s.type === 'destination') return ['Travel', 'Destinations']
  return ['Travel']
}

// ── Developer knowledge: GitHub repos, prompts, skills, explainers, tools ─────

const DEV_ROOT = ['Tech', 'AI']
const DEV_KIND_LEAF: Record<DevKnowledgeKind, string> = {
  repo: 'Repos',
  prompt: 'Prompts & Skills',
  skill: 'Prompts & Skills',
  explainer: 'Explainers',
  tool: 'Tools',
}

function devKindOf(structured: Record<string, unknown>): DevKnowledgeKind | null {
  const kind = structured?.kind
  return typeof kind === 'string' && kind in DEV_KIND_LEAF ? (kind as DevKnowledgeKind) : null
}

function mapDevKnowledgeCategories(structured: Record<string, unknown>): string[] | null {
  const kind = devKindOf(structured)
  return kind ? [...DEV_ROOT, DEV_KIND_LEAF[kind]] : null
}

function applyGithubRepo(result: ClassificationResult, ref: GithubRepoRef): ClassificationResult {
  const prior = result.structured as Partial<RepoData>
  const structured: RepoData = {
    ...prior,
    kind: 'repo',
    repoName: `${ref.owner}/${ref.repo}`,
    repoUrl: ref.url,
    owner: ref.owner,
    platform: 'github',
    whatItDoes: prior.whatItDoes || result.summary || undefined,
  }
  return {
    ...result,
    type: 'link',
    categories: [...DEV_ROOT, DEV_KIND_LEAF.repo],
    structured: structured as unknown as Record<string, unknown>,
  }
}

export interface ClassifyHints {
  /** Original URL of the saved item, when known (e.g. the pasted GitHub link). */
  sourceUrl?: string
  /** `cloudSafe(item)` for an already-stored item. `false` keeps classification on local Ollama. */
  cloudSafe?: boolean
}

/** Topic beats source: dev-knowledge items file under Tech > AI, never under Links > Instagram/YouTube. */
function applyDevKnowledge(result: ClassificationResult, text: string, hints?: ClassifyHints): ClassificationResult {
  const repo = detectGithubRepoSubject(text, hints?.sourceUrl)
  if (repo) return applyGithubRepo(result, repo)
  if (result.type === 'link') {
    const categories = mapDevKnowledgeCategories(result.structured)
    if (categories) return { ...result, categories }
  }
  return result
}

// ── Main classify function ────────────────────────────────────────────────────

function fallback(text: string): ClassificationResult {
  const firstLine = text.split('\n').find((l) => l.trim()) ?? 'Untitled'
  return {
    type: 'note',
    title: firstLine.slice(0, 80),
    categories: [],
    tags: [],
    summary: '',
    structured: {},
    confidence: 0,
  }
}

export async function classify(text: string, hints?: ClassifyHints): Promise<ClassificationResult> {
  const { model: activeModel } = await getAiConfig()

  // Records which provider/model really answered (`<provider>:<model>`), including after a fallback.
  let usedModel = activeModel
  const aiOpts = {
    task: 'classify',
    cloudSafe: hints?.cloudSafe,
    onProvider: (p: { provider: string; model: string }) => { usedModel = `${p.provider}:${p.model}` },
  }

  // ── Attempt 1: normal prompt ──────────────────────────────────────────────
  try {
    const raw = await aiChat(text, SYSTEM_PROMPT, 'json', { temperature: 0 }, undefined, aiOpts)
    const result = parseClassification(raw)
    result.model = usedModel

    const normalized = normalizeCategories(result.categories)
    result.categories = normalized.length > 0 ? normalized : mapToCategories(result.type, result.structured)

    return applyDevKnowledge(result, text, hints)
  } catch {
    // fall through to retry
  }

  // ── Attempt 2: stricter prompt ────────────────────────────────────────────
  try {
    const raw = await aiChat(
      `Classify this text and return ONLY JSON:\n\n${text.slice(0, 2000)}`,
      STRICT_SYSTEM_PROMPT,
      'json',
      { temperature: 0 },
      undefined,
      aiOpts
    )
    const result = parseClassification(raw)
    result.model = usedModel

    const normalized = normalizeCategories(result.categories)
    result.categories = normalized.length > 0 ? normalized : mapToCategories(result.type, result.structured)

    return applyDevKnowledge(result, text, hints)
  } catch {
    // fall through to fallback
  }

  // ── Fallback: never block the user ────────────────────────────────────────
  return applyDevKnowledge({ ...fallback(text), model: usedModel }, text, hints)
}

// ── Batch classify — one Ollama call for multiple notes ──────────────────────

const BATCH_SYSTEM = `You are a knowledge classifier. Classify each note and return ONLY a JSON array.
Each object: {"type":"note|recipe|media|spec|stock|link|book|place","title":"","categories":[],"tags":[],"summary":"","confidence":90}
Category Rule: You MUST pick the most specific <leaf> from this list for the last element of "categories":
${CANONICAL_LEAVES.join(', ')}
Return ONLY JSON array.`

export async function classifyBatch(
  items: Array<{ id: string; title: string; content: string }>,
  opts: { cloudSafe?: boolean } = {},
): Promise<Array<ClassificationResult & { id: string }>> {
  const numbered = items
    .map((item, i) => `[${i + 1}] ${(item.title || 'Untitled').slice(0, 80)}: ${item.content.slice(0, 300)}`)
    .join('\n')

  const prompt = `Classify these ${items.length} notes:\n\n${numbered}\n\nReturn ONLY the JSON array of ${items.length} objects:`

  const raw = await aiChat(prompt, BATCH_SYSTEM, 'json', { temperature: 0 }, undefined, {
    task: 'classify',
    cloudSafe: opts.cloudSafe,
  })

  // Extract JSON array
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start === -1 || end === -1) throw new Error('No JSON array in batch response')

  const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>[]
  if (!Array.isArray(parsed) || parsed.length !== items.length) {
    throw new Error(`Expected ${items.length} results, got ${parsed.length}`)
  }

  return parsed.map((obj, i) => {
    const validated = classificationSchema.safeParse(obj)
    const result = validated.success ? validated.data : { type: 'note' as const, title: items[i].title || 'Untitled', categories: [], tags: [], summary: '', structured: {}, confidence: 0 }
    const normalized = normalizeCategories(result.categories)
    const categories = normalized.length > 0 ? normalized : mapToCategories(result.type as ItemType, result.structured)
    return {
      id: items[i].id,
      type: result.type as ItemType,
      title: result.title,
      categories,
      tags: result.tags,
      summary: result.summary,
      structured: result.structured,
      confidence: result.confidence ?? 0,
    }
  })
}

// ── Stock ticker extraction (convenience helper for Phase 4 ingest) ───────────

export function extractTicker(structured: StockData | Record<string, unknown>): string | null {
  const s = structured as Partial<StockData>
  if (typeof s.ticker === 'string' && s.ticker.length > 0) {
    return s.ticker.toUpperCase()
  }
  return null
}
