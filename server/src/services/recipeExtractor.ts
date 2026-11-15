// On-demand recipe extraction from a saved video / page. Returns `found: false` rather than
// inventing a recipe when the source doesn't contain one — a small model will happily hallucinate
// steps otherwise (in a real-video test it "found" recipes in a WSL tutorial and a TEDx talk).
// The caller saves the result as a NEW linked item (never edits the source).
//
// Two defences, because the model's own "found" flag and "confidence" proved unreliable:
//   1. a short yes/no gate ("is this a cooking recipe?") before any extraction;
//   2. confidence is computed here from how complete the recipe is, not taken from the model.

import { aiChat, type AiCallOptions } from './ai.js'
import { loadSourceText, chunkText, type SourceItem } from './itemSource.js'
import type { RecipeData } from '../../../shared/types.js'

export type RecipeStage = 'reading' | 'checking' | 'extracting'

/** Where an extraction has got to: `done` of `total` steps (read, check it is a recipe, extract). */
export interface RecipeProgress {
  stage: RecipeStage
  done: number
  total: number
}

export interface ExtractOptions {
  /** Called as each step starts and when the last one finishes. Must never throw (errors in it are ignored). */
  onProgress?: (p: RecipeProgress) => void
  provider?: AiCallOptions['provider']
  cloudSafe: boolean
  signal?: AbortSignal
}

export type RecipeExtraction =
  | { found: false; reason: string; model: string }
  | { found: true; title: string; recipe: RecipeData; confidence: number; model: string }

/** A real recipe has at least this many of each; fewer means the model is guessing or the source omits them. */
const MIN_INGREDIENTS = 3
const MIN_STEPS = 2
/** How much of the source the yes/no gate reads (title + start is enough to tell a recipe from a talk). */
const GATE_CHARS = 3000
/** Ingredient lists and quantities usually live in the description, not the spoken transcript. */
const DESCRIPTION_CHARS = 4000

// Wording matters with a small local model. Measured on real videos: "is this mainly about cooking? yes/no"
// got 7 of 7 right; a "decide whether it teaches a recipe, these are NOT recipes: …" prompt and a
// multi-label category prompt each got 2 cooking videos wrong.
const GATE_SYSTEM =
  'Is this video mainly about cooking or baking a food or drink dish — the host shows or explains how to make it? ' +
  'Answer yes for cooking and baking videos. Answer no for anything else (technology, talks, science, crafts, ' +
  'health advice, reviews, vlogs). Return JSON: {"answer": "yes" | "no"}'

const SYSTEM =
  'You extract a cooking recipe from a transcript or article. Write every field in English ' +
  '(translate if the text is in another language, keeping quantities exactly). Use ONLY what the text ' +
  'says — never invent ingredients, quantities or steps. If the text does not actually contain a recipe, ' +
  'set "found" to false. Return JSON: ' +
  '{"found": boolean, "title": "dish name", "ingredients": ["quantity + ingredient, as stated"], ' +
  '"steps": ["ordered cooking steps"], "servings": "string or null", "prepTime": "string or null", ' +
  '"cookTime": "string or null", "cuisine": "string or null", "mealType": "string or null"}'

function list(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string').map(x => x.trim()).filter(Boolean)
}

function opt(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'null' ? v.trim() : undefined
}

/** A digit, a unicode fraction, or a common quantity word — "2 cups flour", "½ tsp salt", "a pinch of salt". */
const HAS_QUANTITY = /\d|[½¼¾⅓⅔⅛]|\b(?:one|two|three|four|five|six|half|quarter|dozen|pinch|dash|handful|couple)\b/i

/**
 * Confidence from completeness, 0–100: how many ingredients carry a quantity, how many ingredients and
 * steps there are, and whether servings or a time are given. The model's own number is ignored — it gave
 * 90 to a two-ingredient fragment and 0 to a complete recipe.
 */
export function scoreRecipe(r: RecipeData): number {
  const quantified = r.ingredients.filter(i => HAS_QUANTITY.test(i)).length / Math.max(1, r.ingredients.length)
  const score =
    20 +
    Math.round(35 * quantified) +
    (r.ingredients.length >= 5 ? 15 : r.ingredients.length >= 3 ? 8 : 0) +
    (r.steps.length >= 4 ? 15 : 7) +
    (r.servings || r.prepTime || r.cookTime ? 15 : 0)
  return Math.max(0, Math.min(100, score))
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

  const recipe: RecipeData = {
    ingredients,
    steps,
    servings: opt(o.servings),
    prepTime: opt(o.prepTime),
    cookTime: opt(o.cookTime),
    cuisine: opt(o.cuisine),
    mealType: opt(o.mealType),
  }
  return { found: true, title: opt(o.title) ?? fallbackTitle, recipe, confidence: scoreRecipe(recipe) }
}

/** Parses the gate answer. Anything unreadable fails open: extraction's own checks still apply. */
export function parseGate(raw: string): boolean {
  try {
    const o = JSON.parse(raw) as { answer?: unknown }
    return !(typeof o.answer === 'string' && o.answer.trim().toLowerCase() === 'no')
  } catch {
    return true
  }
}

const STEPS = 3

export async function extractRecipe(item: SourceItem, opts: ExtractOptions): Promise<RecipeExtraction> {
  const report = (stage: RecipeStage, done: number) => {
    try { opts.onProgress?.({ stage, done, total: STEPS }) } catch { /* progress must never break the work */ }
  }
  report('reading', 0)
  const source = await loadSourceText(item)
  let model = 'unknown'
  const call = (): AiCallOptions => ({
    task: 'extract',
    provider: opts.provider,
    cloudSafe: opts.cloudSafe,
    userInitiated: true,
    onProvider: i => { model = `${i.provider}:${i.model}` },
  })

  // Gate: a cheap yes/no on the title and start of the text before spending a full extraction.
  report('checking', 1)
  const gateRaw = await aiChat(
    `Title: ${item.title}\n\nText:\n${source.text.slice(0, GATE_CHARS)}`,
    GATE_SYSTEM,
    'json',
    { temperature: 0, num_predict: 60 },
    opts.signal,
    call(),
  )
  if (!parseGate(gateRaw)) {
    report('checking', STEPS)
    return { found: false, reason: 'This does not look like a recipe or cooking video.', model }
  }

  // Recipes are dense in one place; a small model needs the whole thing in view. Use the largest
  // chunk-sized window when the source is long, preferring the part that mentions ingredients.
  const chunks = chunkText(source.text, 12000)
  const text = chunks.length === 1
    ? chunks[0]
    : (chunks.find(c => /ingredient|tablespoon|teaspoon|\bcup\b|\bgrams?\b/i.test(c)) ?? chunks[0])

  report('extracting', 2)
  const description = source.description && source.basis !== 'description'
    ? `\n\nVideo description (ingredient lists and quantities are often here):\n${source.description.slice(0, DESCRIPTION_CHARS)}`
    : ''

  const raw = await aiChat(
    `Title: ${item.title}${description}\n\nText:\n${text}`,
    SYSTEM,
    'json',
    { temperature: 0, num_predict: 1500 },
    opts.signal,
    call(),
  )

  const parsed = parseRecipe(raw, item.title)
  report('extracting', STEPS)
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
