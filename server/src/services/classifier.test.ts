import { describe, it, expect, vi, beforeEach } from 'vitest'
import { classify, mapToCategories } from './classifier'

vi.mock('./ai', () => ({ aiChat: vi.fn() }))

import { aiChat } from './ai'

// ── helpers ───────────────────────────────────────────────────────────────────

const mockAI = (response: string) => vi.mocked(aiChat).mockResolvedValueOnce(response)

const RECIPE_JSON = JSON.stringify({
  type: 'recipe', title: 'Chocolate Cake',
  categories: ['Food', 'Bakery', 'Cakes'],
  tags: ['chocolate', 'dessert', 'baking'],
  summary: 'A rich chocolate cake recipe.',
  structured: { ingredients: ['flour', 'cocoa'], steps: ['mix', 'bake'], cuisine: 'bakery', mealType: 'cake' },
})

const MEDIA_JSON = JSON.stringify({
  type: 'media', title: 'The Dark Knight',
  categories: ['Media', 'Movies'],
  tags: ['batman', 'action', 'nolan'],
  summary: 'A superhero film by Christopher Nolan.',
  structured: { genre: 'Action', year: 2008, director: 'Christopher Nolan', watched: false },
})

const BOOK_JSON = JSON.stringify({
  type: 'book', title: 'The Hobbit',
  categories: ['Media', 'Books', 'Fiction'],
  tags: ['tolkien', 'fantasy'],
  summary: 'A fantasy novel by J.R.R. Tolkien.',
  structured: { author: 'J.R.R. Tolkien', genre: 'fiction', year: 1937, status: 'want-to-read' },
})

const NOTE_JSON = JSON.stringify({
  type: 'note', title: 'Random thought',
  categories: [],
  tags: ['personal'],
  summary: 'Just a note.',
  structured: {},
})

beforeEach(() => vi.clearAllMocks())

// ── classify() ────────────────────────────────────────────────────────────────

describe('classify', () => {
  it('parses a recipe response correctly', async () => {
    mockAI(RECIPE_JSON)
    const result = await classify('Chocolate cake: mix flour and cocoa, bake at 180°C')
    expect(result.type).toBe('recipe')
    expect(result.title).toBe('Chocolate Cake')
    expect(result.tags).toContain('chocolate')
    expect(result.structured).toHaveProperty('ingredients')
  })

  it('parses a media response correctly', async () => {
    mockAI(MEDIA_JSON)
    const result = await classify('The Dark Knight (2008) — Christopher Nolan')
    expect(result.type).toBe('media')
    expect(result.title).toBe('The Dark Knight')
  })

  it('parses a book response correctly', async () => {
    mockAI(BOOK_JSON)
    const result = await classify('The Hobbit by J.R.R. Tolkien')
    expect(result.type).toBe('book')
    expect(result.structured).toHaveProperty('author', 'J.R.R. Tolkien')
  })

  it('parses a note response correctly', async () => {
    mockAI(NOTE_JSON)
    const result = await classify('Just a random thought I had today')
    expect(result.type).toBe('note')
  })

  it('strips markdown fences before parsing', async () => {
    mockAI('```json\n' + RECIPE_JSON + '\n```')
    const result = await classify('some cake recipe')
    expect(result.type).toBe('recipe')
  })

  it('fills in missing categories from mapToCategories when AI returns empty array', async () => {
    const noCategories = JSON.stringify({ type: 'media', title: 'Film', categories: [], tags: [], summary: '', structured: {} })
    mockAI(noCategories)
    const result = await classify('some movie')
    expect(result.categories).toEqual(['Media', 'Movies'])
  })

  it('retries with strict prompt when first response is invalid JSON', async () => {
    mockAI('Sorry, I cannot classify this.')  // first attempt fails
    mockAI(NOTE_JSON)                          // strict retry succeeds
    const result = await classify('some text')
    expect(result.type).toBe('note')
    expect(vi.mocked(aiChat)).toHaveBeenCalledTimes(2)
  })

  it('falls back gracefully when both AI attempts fail — never throws', async () => {
    mockAI('not json at all')
    mockAI('still not json')
    const result = await classify('mystery text')
    expect(result).toBeDefined()
    expect(result.type).toBe('note')
    expect(result.title).toBeDefined()
  })

  it('falls back gracefully when aiChat rejects', async () => {
    vi.mocked(aiChat).mockRejectedValueOnce(new Error('Ollama offline'))
    vi.mocked(aiChat).mockRejectedValueOnce(new Error('Ollama offline'))
    const result = await classify('some content')
    expect(result.type).toBe('note')
  })

  it('uses first non-empty line as fallback title', async () => {
    mockAI('garbage'); mockAI('garbage')
    const result = await classify('\n\nMy Important Note\nSome content here')
    expect(result.title).toBe('My Important Note')
  })

  it('normalises rogue AI categories to the canonical tree', async () => {
    const rogueJson = JSON.stringify({
      type: 'note',
      title: 'Travel plans',
      categories: ['travel', 'Thailand'], // 'travel' matches CANONICAL_MAPPING
      tags: [],
      summary: '',
      structured: {}
    })
    mockAI(rogueJson)
    const result = await classify('I want to go to Thailand')
    expect(result.categories).toEqual(['Travel'])
  })

  it('prefers specific sub-categories from AI if they match canonical tree', async () => {
    const rogueJson = JSON.stringify({
      type: 'note',
      title: 'Cake recipe',
      categories: ['Food', 'bakery', 'cake'], // 'cake' matches CANONICAL_MAPPING (most specific)
      tags: [],
      summary: '',
      structured: {}
    })
    mockAI(rogueJson)
    const result = await classify('How to bake a cake')
    expect(result.categories).toEqual(['Food', 'Bakery', 'Cakes'])
  })

  it('falls back to mapToCategories if AI categories are rogue and unknown', async () => {
    const rogueJson = JSON.stringify({
      type: 'media',
      title: 'Unknown Film',
      categories: ['something-random'], // Not in CANONICAL_MAPPING
      tags: [],
      summary: '',
      structured: {}
    })
    mockAI(rogueJson)
    const result = await classify('A movie about nothing')
    expect(result.categories).toEqual(['Media', 'Movies']) // Falls back to Media > Movies because type=media
  })
})

// ── mapToCategories() ─────────────────────────────────────────────────────────

describe('mapToCategories', () => {
  it('maps Indian cuisine recipe → Food > Savory > Indian', () => {
    expect(mapToCategories('recipe', { cuisine: 'indian' })).toEqual(['Food', 'Savory', 'Indian'])
  })

  it('maps Italian cuisine recipe → Food > Savory > Italian', () => {
    expect(mapToCategories('recipe', { cuisine: 'italian' })).toEqual(['Food', 'Savory', 'Italian'])
  })

  it('maps cake mealType → Food > Bakery > Cakes', () => {
    expect(mapToCategories('recipe', { mealType: 'cake' })).toEqual(['Food', 'Bakery', 'Cakes'])
  })

  it('maps cookie mealType → Food > Bakery > Cookies', () => {
    expect(mapToCategories('recipe', { mealType: 'cookie' })).toEqual(['Food', 'Bakery', 'Cookies'])
  })

  it('maps bread mealType → Food > Bakery > Bread', () => {
    expect(mapToCategories('recipe', { mealType: 'bread' })).toEqual(['Food', 'Bakery', 'Bread'])
  })

  it('maps unknown recipe → Food only', () => {
    expect(mapToCategories('recipe', {})).toEqual(['Food'])
  })

  it('maps media → Media > Movies', () => {
    expect(mapToCategories('media', {})).toEqual(['Media', 'Movies'])
  })

  it('maps fiction book → Media > Books > Fiction', () => {
    expect(mapToCategories('book', { genre: 'fiction' })).toEqual(['Media', 'Books', 'Fiction'])
  })

  it('maps technical book → Media > Books > Technical', () => {
    expect(mapToCategories('book', { genre: 'technical' })).toEqual(['Media', 'Books', 'Technical'])
  })

  it('maps non-fiction book → Media > Books > Non-Fiction', () => {
    expect(mapToCategories('book', { genre: 'non-fiction' })).toEqual(['Media', 'Books', 'Non-Fiction'])
  })

  it('maps stock → Finance > Stocks', () => {
    expect(mapToCategories('stock', {})).toEqual(['Finance', 'Stocks'])
  })

  it('maps spec → Tech > Specs', () => {
    expect(mapToCategories('spec', {})).toEqual(['Tech', 'Specs'])
  })

  it('maps link → Links', () => {
    expect(mapToCategories('link', {})).toEqual(['Links'])
  })

  it('maps note → [] (no default category)', () => {
    expect(mapToCategories('note', {})).toEqual([])
  })
})

// ── classifyBatch() ──────────────────────────────────────────────────────────

import { classifyBatch } from './classifier'

describe('classifyBatch', () => {
  it('normalises categories for multiple items', async () => {
    const batchJson = JSON.stringify([
      { type: 'note', title: 'Note 1', categories: ['travel'], tags: [], summary: '' },
      { type: 'media', title: 'Movie 1', categories: ['movie'], tags: [], summary: '' }
    ])
    mockAI(batchJson)

    const items = [
      { id: '1', title: 'Title 1', content: 'Content 1' },
      { id: '2', title: 'Title 2', content: 'Content 2' }
    ]
    const results = await classifyBatch(items)

    expect(results[0].categories).toEqual(['Travel'])
    expect(results[1].categories).toEqual(['Media', 'Movies'])
  })

  it('falls back to mapToCategories in batch when AI returns unknown categories', async () => {
    const batchJson = JSON.stringify([
      { type: 'recipe', title: 'Recipe 1', categories: ['unknown'], tags: [], summary: '', structured: { cuisine: 'thai' } }
    ])
    mockAI(batchJson)

    const items = [{ id: '1', title: 'Thai Curry', content: 'Make green curry' }]
    const results = await classifyBatch(items)

    expect(results[0].categories).toEqual(['Food', 'Savory', 'Thai'])
  })
})
