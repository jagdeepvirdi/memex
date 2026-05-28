import { z } from 'zod'
import { aiChat } from './ai.js'
import type { ItemType, RecipeData, MediaData, BookData, StockData } from '../../../shared/types.js'

// ── Zod schema — validates & coerces the AI's JSON response ──────────────────

const classificationSchema = z.object({
  type: z
    .enum(['note', 'recipe', 'media', 'spec', 'stock', 'link', 'book'])
    .catch('note'),
  title: z.string().min(1).catch('Untitled'),
  categories: z.array(z.string()).catch([]),
  tags: z.array(z.string()).catch([]),
  summary: z.string().catch(''),
  structured: z.record(z.unknown()).catch({}),
})

export type ClassificationResult = {
  type: ItemType
  title: string
  categories: string[]
  tags: string[]
  summary: string
  structured: Record<string, unknown>
}

// ── System prompts ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a knowledge classifier. Given raw text or a note, return ONLY valid JSON with no preamble:
{
  "type": "note|recipe|media|spec|stock|link|book",
  "title": "<inferred title, max 80 chars>",
  "categories": ["<top-level>", "<mid>", "<leaf>"],
  "tags": ["<tag1>", "<tag2>", "<tag3>"],
  "summary": "<2-3 sentences describing the content>",
  "structured": {}
}

Type rules:
- recipe: any food recipe with ingredients or steps
- media: movie, TV show, film — structured: { "genre": "", "year": 0, "director": "", "watched": false }
- book: any book — structured: { "author": "", "genre": "", "year": 0, "status": "want-to-read" }
- stock: stock ticker or investment — structured: { "ticker": "", "exchange": "" }
- spec: technical specifications, product details — structured key-value pairs
- link: saved URL, article, video, social post
- note: everything else

Recipe structured schema: { "ingredients": [], "steps": [], "servings": "", "prepTime": "", "cookTime": "", "cuisine": "", "mealType": "" }

Return ONLY the JSON object. No explanation. No markdown fences.`

const STRICT_SYSTEM_PROMPT = `Return ONLY a valid JSON object. Nothing else. No explanation. No markdown. No code fences. No newlines outside strings.
Start your response with { and end with }.
Use this exact shape: {"type":"note","title":"","categories":[],"tags":[],"summary":"","structured":{}}
Valid types: note, recipe, media, spec, stock, link, book`

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
  }
}

// ── Category mapping — maps type + structured data to the known tree ──────────

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
      return ['Links']
    default:
      return []
  }
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
  }
}

export async function classify(text: string): Promise<ClassificationResult> {
  // ── Attempt 1: normal prompt ──────────────────────────────────────────────
  try {
    const raw = await aiChat(text, SYSTEM_PROMPT)
    const result = parseClassification(raw)

    // Override categories with canonical tree mapping if AI's guess is empty
    if (result.categories.length === 0) {
      result.categories = mapToCategories(result.type, result.structured)
    }

    return result
  } catch {
    // fall through to retry
  }

  // ── Attempt 2: stricter prompt ────────────────────────────────────────────
  try {
    const raw = await aiChat(
      `Classify this text and return ONLY JSON:\n\n${text.slice(0, 2000)}`,
      STRICT_SYSTEM_PROMPT,
    )
    const result = parseClassification(raw)

    if (result.categories.length === 0) {
      result.categories = mapToCategories(result.type, result.structured)
    }

    return result
  } catch {
    // fall through to fallback
  }

  // ── Fallback: never block the user ────────────────────────────────────────
  return fallback(text)
}

// ── Batch classify — one Ollama call for multiple notes ──────────────────────

const BATCH_SYSTEM = `You are a knowledge classifier. Classify each note and return ONLY a JSON array, one object per note, same order.
Each object: {"type":"note|recipe|media|spec|stock|link|book","title":"<title max 80 chars>","categories":["<top>","<mid>"],"tags":["<t1>","<t2>","<t3>"],"summary":"<one sentence>"}
Return ONLY the JSON array. No explanation. No markdown.`

export async function classifyBatch(
  items: Array<{ id: string; title: string; content: string }>,
): Promise<Array<ClassificationResult & { id: string }>> {
  const numbered = items
    .map((item, i) => `[${i + 1}] ${(item.title || 'Untitled').slice(0, 80)}: ${item.content.slice(0, 300)}`)
    .join('\n')

  const prompt = `Classify these ${items.length} notes:\n\n${numbered}\n\nReturn ONLY the JSON array of ${items.length} objects:`

  const raw = await aiChat(prompt, BATCH_SYSTEM)

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
    const result = validated.success ? validated.data : { type: 'note' as const, title: items[i].title || 'Untitled', categories: [], tags: [], summary: '', structured: {} }
    const categories = result.categories.length > 0 ? result.categories : mapToCategories(result.type as ItemType, result.structured)
    return {
      id: items[i].id,
      type: result.type as ItemType,
      title: result.title,
      categories,
      tags: result.tags,
      summary: result.summary,
      structured: result.structured,
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
