import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./ai', () => ({ aiChat: vi.fn() }))
vi.mock('./itemSource', async orig => ({ ...(await orig<typeof import('./itemSource')>()), loadSourceText: vi.fn() }))

import { extractRecipe, parseRecipe, renderRecipeContent } from './recipeExtractor'
import { aiChat } from './ai'
import { loadSourceText } from './itemSource'

const RECIPE = {
  found: true, title: 'Aglio e Olio', ingredients: ['200g spaghetti', '4 cloves garlic', ' '],
  steps: ['Boil pasta', 'Fry garlic', 'Toss'], servings: '2', prepTime: 'null', cookTime: '10 min',
  cuisine: 'Italian', mealType: 'dinner', confidence: 82.6,
}

beforeEach(() => {
  vi.mocked(aiChat).mockReset()
  vi.mocked(loadSourceText).mockReset()
  vi.mocked(loadSourceText).mockResolvedValue({ text: 'cook it', basis: 'transcript', truncated: false })
})

describe('parseRecipe', () => {
  it('normalises a valid recipe: trims, drops blanks and the string "null", rounds confidence', () => {
    const out = parseRecipe(JSON.stringify(RECIPE), 'fallback')
    expect(out).toEqual({
      found: true, title: 'Aglio e Olio', confidence: 83,
      recipe: {
        ingredients: ['200g spaghetti', '4 cloves garlic'], steps: ['Boil pasta', 'Fry garlic', 'Toss'],
        servings: '2', prepTime: undefined, cookTime: '10 min', cuisine: 'Italian', mealType: 'dinner',
      },
    })
  })

  it('uses the fallback title when none is given and clamps confidence', () => {
    const out = parseRecipe(JSON.stringify({ ...RECIPE, title: '', confidence: 900 }), 'My Video')
    expect(out).toMatchObject({ found: true, title: 'My Video', confidence: 100 })
  })

  it('reports not-found when the model says so', () => {
    expect(parseRecipe('{"found":false}', 'x')).toMatchObject({ found: false })
  })

  it('refuses a "recipe" that is too thin — guards against hallucination', () => {
    expect(parseRecipe(JSON.stringify({ ...RECIPE, ingredients: ['salt'] }), 'x')).toMatchObject({ found: false })
    expect(parseRecipe(JSON.stringify({ ...RECIPE, steps: ['stir'] }), 'x')).toMatchObject({ found: false })
    expect(parseRecipe(JSON.stringify({ found: true }), 'x')).toMatchObject({ found: false })
  })

  it('reports not-found for unreadable output', () => {
    expect(parseRecipe('garbage', 'x')).toMatchObject({ found: false })
  })
})

describe('extractRecipe', () => {
  it('returns the recipe with provider:model provenance', async () => {
    vi.mocked(aiChat).mockImplementation(async (_p, _s, _f, _o, _sig, opts) => {
      opts?.onProvider?.({ provider: 'gemini', model: 'gemini-2.5-flash' })
      return JSON.stringify(RECIPE)
    })
    const out = await extractRecipe({ title: 'Vid', content: 'x' }, { provider: 'gemini', cloudSafe: true })
    expect(out).toMatchObject({ found: true, title: 'Aglio e Olio', model: 'gemini:gemini-2.5-flash' })
    expect(vi.mocked(aiChat).mock.calls[0][5]).toMatchObject({ task: 'extract', provider: 'gemini', userInitiated: true, cloudSafe: true })
    expect(vi.mocked(aiChat).mock.calls[0][2]).toBe('json')
  })

  it('returns found:false (not an invented recipe) for a non-recipe video', async () => {
    vi.mocked(aiChat).mockResolvedValue('{"found":false}')
    const out = await extractRecipe({ title: 'Vlog', content: 'x' }, { cloudSafe: true })
    expect(out.found).toBe(false)
  })

  it('for a long source, sends the chunk that mentions ingredients', async () => {
    const filler = 'chatting about my day. '.repeat(700)
    const recipePart = '2 cups flour and 3 tablespoon sugar. '.repeat(200)
    vi.mocked(loadSourceText).mockResolvedValue({ text: filler + recipePart, basis: 'transcript', truncated: false })
    vi.mocked(aiChat).mockResolvedValue('{"found":false}')
    await extractRecipe({ title: 'T', content: 'x' }, { cloudSafe: true })
    expect(vi.mocked(aiChat).mock.calls[0][0]).toContain('tablespoon')
  })

  it('propagates provider errors', async () => {
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
