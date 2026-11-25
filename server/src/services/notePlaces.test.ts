import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./ai', () => ({ aiChat: vi.fn() }))
vi.mock('../db/helpers', () => ({ createItem: vi.fn() }))
vi.mock('../lib/logger', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))

import { aiChat } from './ai'
import { createItem } from '../db/helpers'
import { shouldMinePlaces, extractNotePlaces, planNotePlaces, createNotePlaces, toRawPlaces } from './notePlaces'
import type { MinedPlace } from './placeMining'

// Generic, invented fixtures only (the repo is public).
const TRIP = 'Pine Valley trip ideas: Old Mill Cafe, Lakeview Hotel, Eagle Rock Viewpoint. Eat at Maple Diner.'

const place = (over: Partial<MinedPlace> & { name: string }): MinedPlace => ({
  type: 'attraction', evidence: '', confidence: 90, ...over,
})

beforeEach(() => vi.clearAllMocks())

describe('shouldMinePlaces', () => {
  it('reads place notes and anything filed under Travel', () => {
    expect(shouldMinePlaces({ type: 'place', categories: [] }, 'x')).toBe(true)
    expect(shouldMinePlaces({ type: 'note', categories: ['Travel', 'Destinations'] }, 'x')).toBe(true)
  })
  it('reads a note that names a hotel or restaurant even if it was filed elsewhere', () => {
    expect(shouldMinePlaces({ type: 'note', categories: [] }, 'Dinner at the Corner Bistro on Friday')).toBe(true)
  })
  it('skips notes that have no place signal (no extra AI call)', () => {
    expect(shouldMinePlaces({ type: 'note', categories: ['Food'] }, 'Buy milk and eggs')).toBe(false)
    expect(shouldMinePlaces({ type: 'recipe', categories: ['Food'] }, 'Garlic pasta: boil, toss with oil')).toBe(false)
  })
  it('reads the text of an HTML note, not its tags', () => {
    expect(shouldMinePlaces({ type: 'note', categories: [] }, '<p>Buy milk</p>')).toBe(false)
  })
})

describe('extractNotePlaces', () => {
  it('returns the places the note names, with the model that answered', async () => {
    vi.mocked(aiChat).mockImplementation(async (_p, _s, _f, _o, _sig, opts) => {
      opts?.onProvider?.({ provider: 'gemini', model: 'gemini-x' })
      return JSON.stringify({ places: [
        { name: 'Old Mill Cafe', type: 'cafe', confidence: 90 },
        { name: 'Lakeview Hotel', type: 'hotel', confidence: 88 },
      ] })
    })
    const found = await extractNotePlaces('Pine Valley', TRIP, { cloudSafe: true })
    expect(found.places.map((p) => [p.name, p.type])).toEqual([['Old Mill Cafe', 'cafe'], ['Lakeview Hotel', 'hotel']])
    expect(found.model).toBe('gemini:gemini-x')
  })

  it('drops a place the note does not contain (the model made it up)', async () => {
    vi.mocked(aiChat).mockResolvedValue(JSON.stringify({ places: [
      { name: 'Maple Diner', type: 'restaurant', confidence: 90 },
      { name: 'Grand Imaginary Palace', type: 'hotel', confidence: 99 },
    ] }))
    const found = await extractNotePlaces('Pine Valley', TRIP, { cloudSafe: true })
    expect(found.places.map((p) => p.name)).toEqual(['Maple Diner'])
  })

  it('keeps a city only when the note says it', async () => {
    vi.mocked(aiChat).mockResolvedValue(JSON.stringify({ places: [{ name: 'Maple Diner', type: 'restaurant', city: 'Atlantis', confidence: 90 }] }))
    const found = await extractNotePlaces('Pine Valley', TRIP, { cloudSafe: true })
    expect(found.places[0].city).toBeUndefined()
  })

  it('passes the privacy flag to the AI call, so a private note stays local', async () => {
    vi.mocked(aiChat).mockResolvedValue('{"places":[]}')
    await extractNotePlaces('Pine Valley', TRIP, { cloudSafe: false })
    expect(vi.mocked(aiChat).mock.calls[0][5]).toMatchObject({ task: 'place_mining', cloudSafe: false })
  })

  it('returns no places, without throwing, when the AI call fails or answers nonsense', async () => {
    vi.mocked(aiChat).mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:11434'))
    expect(await extractNotePlaces('t', TRIP, { cloudSafe: true })).toEqual({ places: [] })
    vi.mocked(aiChat).mockResolvedValueOnce('not json at all')
    expect((await extractNotePlaces('t', TRIP, { cloudSafe: true })).places).toEqual([])
  })

  it('does not call the AI for an empty note', async () => {
    expect(await extractNotePlaces('t', '<p> </p>', { cloudSafe: true })).toEqual({ places: [] })
    expect(aiChat).not.toHaveBeenCalled()
  })

  it('takes at most 30 places from one note', async () => {
    const names = Array.from({ length: 40 }, (_, i) => `Place Number ${i + 100}`)
    vi.mocked(aiChat).mockResolvedValue(JSON.stringify({ places: names.map((name) => ({ name, type: 'attraction', confidence: 90 })) }))
    const found = await extractNotePlaces('t', names.join(', '), { cloudSafe: true })
    expect(found.places).toHaveLength(30)
  })
})

describe('planNotePlaces', () => {
  const db = (rows: Array<{ id: string; name: string | null; title: string; city: string | null }>) =>
    ({ query: vi.fn().mockResolvedValue({ rows }) }) as never

  it('skips a place that is already in the Places table', async () => {
    const out = await planNotePlaces(
      db([{ id: 'p1', name: 'Old Mill Cafe', title: 'Old Mill Cafe', city: null }]),
      [place({ name: 'Old Mill Cafe', type: 'cafe' }), place({ name: 'Eagle Rock Viewpoint' })],
      { title: 'Pine Valley trip' },
    )
    expect(out.map((p) => p.name)).toEqual(['Eagle Rock Viewpoint'])
  })

  it('does not create the note itself a second time (a note titled like a destination is already a place)', async () => {
    const out = await planNotePlaces(
      db([]), [place({ name: 'Pine Valley', type: 'destination' }), place({ name: 'Maple Diner', type: 'restaurant' })],
      { title: 'Trip', name: 'Pine Valley' },
    )
    expect(out.map((p) => p.name)).toEqual(['Maple Diner'])
  })

  it('skips countries, bare streets and low-confidence guesses', async () => {
    const out = await planNotePlaces(
      db([]),
      [place({ name: 'Thailand', type: 'destination' }), place({ name: 'Soi 11' }), place({ name: 'Maybe Place', confidence: 40 }), place({ name: 'Good Place' })],
      { title: 'Trip' },
    )
    expect(out.map((p) => p.name)).toEqual(['Good Place'])
  })

  it('asks the database nothing when there is nothing to plan', async () => {
    const client = db([])
    expect(await planNotePlaces(client, [], { title: 'x' })).toEqual([])
    expect((client as unknown as { query: ReturnType<typeof vi.fn> }).query).not.toHaveBeenCalled()
  })
})

describe('createNotePlaces', () => {
  it('creates unreviewed want-to-visit places linked to the note, filed by their type', async () => {
    vi.mocked(createItem).mockImplementation(async (_c, i) => ({ id: `new-${i.title}`, type: 'place', structured: i.structured ?? {} }) as never)
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    const created = await createNotePlaces(
      client as never, 'note-1',
      [place({ name: 'Lakeview Hotel', type: 'hotel', city: 'Pine Valley', evidence: '…Lakeview Hotel…' }), place({ name: 'Maple Diner', type: 'restaurant' })],
      'gemini:gemini-x',
    )
    expect(created).toHaveLength(2)
    const [first, second] = vi.mocked(createItem).mock.calls.map((c) => c[1])
    expect(first).toMatchObject({
      title: 'Lakeview Hotel', type: 'place', derivedFrom: 'note-1', reviewed: false, tags: ['from-note'],
      categories: ['Travel', 'Hotels'],
      structured: { name: 'Lakeview Hotel', type: 'hotel', visitStatus: 'want-to-visit', city: 'Pine Valley', notes: '…Lakeview Hotel…' },
    })
    expect(second.categories).toEqual(['Travel', 'Restaurants'])
    expect(client.query).toHaveBeenCalledWith('UPDATE items SET extraction_model = $1 WHERE id = $2', ['gemini:gemini-x', 'new-Lakeview Hotel'])
  })

  it('does not touch extraction_model when no model is known', async () => {
    vi.mocked(createItem).mockResolvedValue({ id: 'n', type: 'place', structured: {} } as never)
    const client = { query: vi.fn() }
    await createNotePlaces(client as never, 'note-1', [place({ name: 'Maple Diner' })])
    expect(client.query).not.toHaveBeenCalled()
  })
})

describe('toRawPlaces', () => {
  it('drops the evidence, which the server rebuilds from the note', () => {
    const raw = toRawPlaces([{ name: 'A', type: 'hotel', confidence: 80, evidence: 'snippet' }])
    expect(raw[0]).not.toHaveProperty('evidence')
    expect(raw[0]).toMatchObject({ name: 'A', type: 'hotel', confidence: 80 })
  })
})
