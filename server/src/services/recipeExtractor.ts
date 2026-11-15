// On-demand recipe extraction from a saved video / page. Returns `found: false` rather than
// inventing a recipe when the source doesn't contain one — a small model will happily hallucinate
// steps otherwise. The caller saves the result as a NEW linked item (never edits the source).

import { aiChat, type AiCallOptions } from './ai.js'
import { loadSourceText, chunkText, type SourceItem } from './itemSource.js'
import type { RecipeData } from '../../../shared/types.js'

export interface ExtractOptions {
  provider?: AiCallOptions['provider']
  cloudSafe: boolean
  signal?: AbortSignal
}

export type RecipeExtraction =
  | { found: false; reason: string; model: string }
  | { found: true; title: string; recipe: RecipeData; confidence: number; model: string }

/** A real recipe has at least this many of each; fewer means the model is guessing. */
const MIN_INGREDIENTS = 2
const MIN_STEPS = 2

const SYSTEM =
  'You extract a cooking recipe from a transcript or article. Use ONLY what the text says — never ' +
  'invent ingredients, quantities or steps. If the text does not actually contain a recipe ' +
  '(for example a review, vlog or restaurant tour), set "found" to false. Return JSON: ' +
  '{"found": boolean, "title": "dish name", "ingredients": ["quantity + ingredient, as stated"], ' +
  '"steps": ["ordered cooking steps"], "servings": "string or null", "prepTime": "string or null", ' +
  '"cookTime": "string or null", "cuisine": "string or null", "mealType": "string or null", ' +
  '"confidence": 0-100 (how completely the text specifies the recipe)}'

function list(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string').map(x => x.trim()).filter(Boolean)
}

function opt(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'null' ? v.trim() : undefined
}

/** Validates the model output. Exported for tests. */
export function parseRecipe(raw: string, fallbackTitle: string): Omit<Extract<RecipeExtraction, { found: true }>, 'model'> | { found: false; reason: string } {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { found: false, reason: 'The AI returned an unreadable answer.' }
  }
  const o = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
  if (o.found === false) return { found: false, reason: 'No recipe was found in this content.' }

  const ingredients = list(o.ingredients)
  const steps = list(o.steps)
  if (ingredients.length < MIN_INGREDIENTS || steps.length < MIN_STEPS) {
    return { found: false, reason: 'No complete recipe (ingredients and steps) was found in this content.' }
  }

  const rawConfidence = typeof o.confidence === 'number' && Number.isFinite(o.confidence) ? o.confidence : 50
  return {
    found: true,
    title: opt(o.title) ?? fallbackTitle,
    recipe: {
      ingredients,
      steps,
      servings: opt(o.servings),
      prepTime: opt(o.prepTime),
      cookTime: opt(o.cookTime),
      cuisine: opt(o.cuisine),
      mealType: opt(o.mealType),
    },
    confidence: Math.max(0, Math.min(100, Math.round(rawConfidence))),
  }
}

export async function extractRecipe(item: SourceItem, opts: ExtractOptions): Promise<RecipeExtraction> {
  const source = await loadSourceText(item)
  let model = 'unknown'

  // Recipes are dense in one place; a small model needs the whole thing in view. Use the largest
  // chunk-sized window when the source is long, preferring the part that mentions ingredients.
  const chunks = chunkText(source.text, 12000)
  const text = chunks.length === 1
    ? chunks[0]
    : (chunks.find(c => /ingredient|tablespoon|teaspoon|\bcup\b|\bgrams?\b/i.test(c)) ?? chunks[0])

  const raw = await aiChat(
    `Title: ${item.title}\n\nText:\n${text}`,
    SYSTEM,
    'json',
    { temperature: 0, num_predict: 1500 },
    opts.signal,
    {
      task: 'extract',
      provider: opts.provider,
      cloudSafe: opts.cloudSafe,
      userInitiated: true,
      onProvider: i => { model = `${i.provider}:${i.model}` },
    },
  )

  const parsed = parseRecipe(raw, item.title)
  return { ...parsed, model }
}

/** Plain-text rendering stored in `content` so search, embeddings and the Obsidian export see the recipe. */
export function renderRecipeContent(title: string, r: RecipeData): string {
  const meta = [
    r.servings && `Servings: ${r.servings}`,
    r.prepTime && `Prep: ${r.prepTime}`,
    r.cookTime && `Cook: ${r.cookTime}`,
  ].filter(Boolean).join(' · ')
  return [
    [title, meta].filter(Boolean).join('\n'),
    ['Ingredients:', ...r.ingredients.map(i => `- ${i}`)].join('\n'),
    ['Steps:', ...r.steps.map((s, n) => `${n + 1}. ${s}`)].join('\n'),
  ].join('\n\n')
}
