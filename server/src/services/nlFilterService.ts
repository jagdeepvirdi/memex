import { aiChat } from './ai.js'
import type { ItemType } from '../../../shared/types.js'

export interface ParsedFilter {
  type: ItemType | null
  searchQuery: string
  structuredFilters: Record<string, string>
}

// Only allow known structured field names to prevent JSONB key injection
const SAFE_FIELDS = new Set([
  'cuisine', 'visitStatus', 'city', 'country', 'priceRange',
  'watchStatus', 'genre', 'director', 'streamingPlatform',
  'status', 'author', 'mealType', 'ticker', 'exchange',
])

const VALID_TYPES = new Set([
  'note', 'recipe', 'media', 'spec', 'stock', 'link', 'book', 'place',
])

const SYSTEM_PROMPT = `You are a search query parser for a personal knowledge management app.
Parse the user's natural language query into a structured filter object.

Item types: note, recipe, media, book, place, link, stock, spec

Structured fields by type (use only these exact field names):
- place:  visitStatus (visited | want-to-visit | want-to-revisit), cuisine, city, country, priceRange ($|$$|$$$)
- media:  watchStatus (watched | want-to-watch | watching), genre, director, streamingPlatform
- book:   status (read | reading | want-to-read), author, genre
- recipe: cuisine, mealType

Return ONLY valid JSON — no preamble, no explanation:
{
  "type": "<item type or null>",
  "searchQuery": "<key terms for full-text search, empty string if none>",
  "structuredFilters": { "<field>": "<value>" }
}

Examples:
"Thai restaurants I haven't visited" → {"type":"place","searchQuery":"","structuredFilters":{"cuisine":"Thai","visitStatus":"want-to-visit"}}
"movies I want to watch" → {"type":"media","searchQuery":"","structuredFilters":{"watchStatus":"want-to-watch"}}
"sourdough recipes" → {"type":"recipe","searchQuery":"sourdough","structuredFilters":{}}
"books I'm currently reading" → {"type":"book","searchQuery":"","structuredFilters":{"status":"reading"}}
"Nolan films" → {"type":"media","searchQuery":"Nolan","structuredFilters":{"director":"Nolan"}}
"hotels in Bangkok" → {"type":"place","searchQuery":"Bangkok","structuredFilters":{"city":"Bangkok"}}
"notes about machine learning" → {"type":"note","searchQuery":"machine learning","structuredFilters":{}}`

export async function parseNLFilter(query: string): Promise<ParsedFilter> {
  const raw = await aiChat(query, SYSTEM_PROMPT, 'json', { temperature: 0 })

  try {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start === -1) throw new Error('No JSON in response')

    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      type?: string | null
      searchQuery?: string
      structuredFilters?: Record<string, string>
    }

    // Validate and sanitise
    const type = parsed.type && VALID_TYPES.has(parsed.type)
      ? (parsed.type as ItemType)
      : null

    const structuredFilters = Object.fromEntries(
      Object.entries(parsed.structuredFilters ?? {})
        .filter(([k]) => SAFE_FIELDS.has(k))
        .filter(([, v]) => typeof v === 'string' && v.length > 0)
    )

    return {
      type,
      searchQuery: typeof parsed.searchQuery === 'string' ? parsed.searchQuery.trim() : '',
      structuredFilters,
    }
  } catch {
    // Fallback: treat the whole query as a plain text search
    return { type: null, searchQuery: query, structuredFilters: {} }
  }
}
