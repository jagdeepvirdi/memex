import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./ai', () => ({ aiChat: vi.fn() }))
vi.mock('./itemSource', async orig => ({ ...(await orig<typeof import('./itemSource')>()), loadSourceText: vi.fn() }))

import { extractRecipe, parseRecipe, parseGate, scoreRecipe, renderRecipeContent } from './recipeExtractor'
import { aiChat } from './ai'
import { loadSourceText } from './itemSource'

const RECIPE = {
  found: true, title: 'Aglio e Olio', ingredients: ['200g spaghetti', '4 cloves garlic', '1/2 cup olive oil', ' '],
  steps: ['Boil pasta', 'Fry garlic', 'Toss'], servings: '2', prepTime: 'null', cookTime: '10 min',
  cuisine: 'Italian', mealType: 'dinner', confidence: 3, // the model's own number is ignored
}

/** Answers the yes/no gate and the extraction call separately (the gate runs first). */
function answers(gate: string, extraction: string, model = 'llama3.2') {
  vi.mocked(aiChat).mockImplementation(async (_p, system, _f, _o, _sig, opts) => {
    opts?.onProvider?.({ provider: 'ollama', model })
    return /mainly about cooking/.test(String(system)) ? gate : extraction
  })
}
const YES = '{"answer": "yes"}'
const NO = '{"answer": "no"}'

beforeEach(() => {
  vi.mocked(aiChat).mockReset()
  vi.mocked(loadSourceText).mockReset()
  vi.mocked(loadSourceText).mockResolvedValue({ text: 'cook it', basis: 'transcript', truncated: false })
})

describe('scoreRecipe', () => {
  const full = { ingredients: ['2 cups flour', '1 tsp salt', '3 eggs', '1/2 cup milk', 'a pinch of nutmeg'], steps: ['a', 'b', 'c', 'd'], servings: '4' }

  it('is high for a complete, quantified recipe', () => {
    expect(scoreRecipe(full)).toBe(100)
  })

  it('is low for vague ingredients without amounts, even with many steps', () => {
    const vague = { ingredients: ['bread flour', 'whole wheat flour', 'salt'], steps: Array.from({ length: 23 }, (_, i) => `step ${i}`) }
    expect(scoreRecipe(vague)).toBeLessThan(55)
  })

  it('rewards servings or a time', () => {
    const without = scoreRecipe({ ...full, servings: undefined })
    expect(scoreRecipe({ ...full, cookTime: '10 min', servings: undefined })).toBe(without + 15)
  })

  it('stays within 0–100 and is deterministic', () => {
    const r = { ingredients: ['x', 'y', 'z'], steps: ['a', 'b'] }
    expect(scoreRecipe(r)).toBe(scoreRecipe(r))
    expect(scoreRecipe(r)).toBeGreaterThanOrEqual(0)
    expect(scoreRecipe(full)).toBeLessThanOrEqual(100)
  })

  it('counts quantities in other writing: unicode fractions and number words', () => {
    const r = { ingredients: ['½ tsp salt', 'two eggs', 'a handful of herbs'], steps: ['a', 'b'] }
    expect(scoreRecipe(r)).toBe(scoreRecipe({ ingredients: ['1 tsp salt', '2 eggs', '3 herbs'], steps: ['a', 'b'] }))
  })
})

describe('parseRecipe', () => {
  it('normalises a valid recipe and computes confidence itself', () => {
    const out = parseRecipe(JSON.stringify(RECIPE), 'fallback')
    expect(out).toMatchObject({
      found: true, title: 'Aglio e Olio',
      recipe: {
        ingredients: ['200g spaghetti', '4 cloves garlic', '1/2 cup olive oil'], steps: ['Boil pasta', 'Fry garlic', 'Toss'],
        servings: '2', prepTime: undefined, cookTime: '10 min', cuisine: 'Italian', mealType: 'dinner',
      },
    })
    expect((out as { confidence: number }).confidence).toBe(scoreRecipe((out as unknown as { recipe: never }).recipe))
    expect((out as { confidence: number }).confidence).not.toBe(3)
  })

  it('uses the fallback title when none is given', () => {
    expect(parseRecipe(JSON.stringify({ ...RECIPE, title: '' }), 'My Video')).toMatchObject({ found: true, title: 'My Video' })
  })

  it('reports not-found when the model says so', () => {
    expect(parseRecipe('{"found":false}', 'x')).toMatchObject({ found: false })
  })

  it('refuses a recipe with fewer than 3 ingredients or 2 steps', () => {
    expect(parseRecipe(JSON.stringify({ ...RECIPE, ingredients: ['salt', 'pepper'] }), 'x')).toMatchObject({ found: false })
    expect(parseRecipe(JSON.stringify({ ...RECIPE, steps: ['stir'] }), 'x')).toMatchObject({ found: false })
    expect(parseRecipe(JSON.stringify({ found: true }), 'x')).toMatchObject({ found: false })
  })

  it('reports not-found for unreadable output', () => {
    expect(parseRecipe('garbage', 'x')).toMatchObject({ found: false })
  })
})

describe('parseGate', () => {
  it('is false only when the model answers no (any case)', () => {
    expect(parseGate(NO)).toBe(false)
    expect(parseGate('{"answer": " No "}')).toBe(false)
    expect(parseGate(YES)).toBe(true)
  })
  it('fails open on unreadable or odd output, leaving extraction to its own checks', () => {
    expect(parseGate('not json')).toBe(true)
    expect(parseGate('{}')).toBe(true)
    expect(parseGate('{"answer":"maybe"}')).toBe(true)
    expect(parseGate('{"isRecipe": false}')).toBe(true) // old shape is not understood — fail open
  })
})

describe('extractRecipe', () => {
  it('returns the recipe with provider:model provenance and a computed confidence', async () => {
    answers(YES, JSON.stringify(RECIPE), 'gemini-2.5-flash')
    vi.mocked(aiChat).mockImplementation(async (_p, system, _f, _o, _sig, opts) => {
      opts?.onProvider?.({ provider: 'gemini', model: 'gemini-2.5-flash' })
      return /mainly about cooking/.test(String(system)) ? YES : JSON.stringify(RECIPE)
    })
    const out = await extractRecipe({ title: 'Vid', content: 'x' }, { provider: 'gemini', cloudSafe: true })
    expect(out).toMatchObject({ found: true, title: 'Aglio e Olio', model: 'gemini:gemini-2.5-flash' })
    expect((out as { confidence: number }).confidence).toBeGreaterThan(60)
    for (const call of vi.mocked(aiChat).mock.calls) {
      expect(call[5]).toMatchObject({ task: 'extract', provider: 'gemini', userInitiated: true, cloudSafe: true })
      expect(call[2]).toBe('json')
    }
  })

  it('asks for English output', async () => {
    answers(YES, JSON.stringify(RECIPE))
    await extractRecipe({ title: 'Vid', content: 'x' }, { cloudSafe: true })
    const extractionSystem = String(vi.mocked(aiChat).mock.calls[1][1])
    expect(extractionSystem).toMatch(/in English/)
  })

  it('stops at the gate for a non-recipe (a tech tutorial, a talk) without running extraction', async () => {
    answers(NO, JSON.stringify({ found: true, title: 'WSL', ingredients: ['Windows 10', 'WSL', 'Ubuntu'], steps: ['Install WSL', 'Open it'] }))
    const out = await extractRecipe({ title: 'BEST Web Dev Setup? (WSL)', content: 'x' }, { cloudSafe: true })
    expect(out).toMatchObject({ found: false, reason: expect.stringMatching(/does not look like a recipe/) })
    expect(aiChat).toHaveBeenCalledTimes(1)
  })

  it('gives the gate only the title and the start of a long text', async () => {
    vi.mocked(loadSourceText).mockResolvedValue({ text: 'a'.repeat(20_000), basis: 'transcript', truncated: false })
    answers(NO, '{}')
    await extractRecipe({ title: 'T', content: 'x' }, { cloudSafe: true })
    const prompt = String(vi.mocked(aiChat).mock.calls[0][0])
    expect(prompt.length).toBeLessThan(3200)
    expect(vi.mocked(aiChat).mock.calls[0][3]).toMatchObject({ temperature: 0 })
  })

  it('still extracts when the gate answer is unreadable (fails open)', async () => {
    answers('???', JSON.stringify(RECIPE))
    const out = await extractRecipe({ title: 'Vid', content: 'x' }, { cloudSafe: true })
    expect(out.found).toBe(true)
  })

  it('returns found:false when the gate passes but extraction finds nothing complete', async () => {
    answers(YES, '{"found":false}')
    expect((await extractRecipe({ title: 'Vlog', content: 'x' }, { cloudSafe: true })).found).toBe(false)
  })

  it('rejects the thin fragment the real-video test produced (two vague ingredients, many steps)', async () => {
    answers(YES, JSON.stringify({
      found: true, title: 'Country Round Loaf', confidence: 90,
      ingredients: ['exact gram amount of bread flour', 'exact gram amount of whole wheat flour'],
      steps: Array.from({ length: 23 }, (_, i) => `step ${i}`),
    }))
    const out = await extractRecipe({ title: 'Bread', content: 'x' }, { cloudSafe: true })
    expect(out).toMatchObject({ found: false, reason: expect.stringMatching(/No complete recipe/) })
  })

  it('for a long source, sends the chunk that mentions ingredients to the extraction call', async () => {
    const filler = 'chatting about my day. '.repeat(700)
    const recipePart = '2 cups flour and 3 tablespoon sugar. '.repeat(200)
    vi.mocked(loadSourceText).mockResolvedValue({ text: filler + recipePart, basis: 'transcript', truncated: false })
    answers(YES, '{"found":false}')
    await extractRecipe({ title: 'T', content: 'x' }, { cloudSafe: true })
    expect(vi.mocked(aiChat).mock.calls[1][0]).toContain('tablespoon')
  })

  it('propagates provider errors, from the gate or the extraction', async () => {
    vi.mocked(aiChat).mockRejectedValue(new Error('rate limited'))
    await expect(extractRecipe({ title: 'T', content: 'x' }, { cloudSafe: true })).rejects.toThrow('rate limited')
  })
})

describe('renderRecipeContent', () => {
  it('renders title, meta, ingredients and numbered steps', () => {
    const text = renderRecipeContent('Pasta', { ingredients: ['a', 'b'], steps: ['x', 'y'], servings: '2', cookTime: '5m' })
    expect(text).toBe('Pasta\nServings: 2 · Cook: 5m\n\nIngredients:\n- a\n- b\n\nSteps:\n1. x\n2. y')
  })
})
