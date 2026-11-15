import { describe, it, expect } from 'vitest'
import { looksSensitiveContent } from './cloudSafe'
import {
  stripHtml, placeSignal, ruleExtractPlaces, parsePlacesJson, verifyPlaces, findDuplicate, planPlaces, DEFAULT_PLAN,
  type MinedPlace, type Proposal,
} from './placeMining'

describe('stripHtml', () => {
  it('turns editor HTML into plain lines', () => {
    expect(stripHtml('<p>Trip to Krabi</p><p>Stay at <b>Sea Pearl</b> &amp; Resort</p>')).toBe('Trip to Krabi\nStay at Sea Pearl & Resort')
  })
})

describe('placeSignal', () => {
  it('ranks strong, broad and none', () => {
    expect(placeSignal('Booked a hotel in Hua Hin')).toBe('strong')
    expect(placeSignal('see https://maps.app.goo.gl/abc')).toBe('strong')
    expect(placeSignal('a quiet beach to visit')).toBe('broad')
    expect(placeSignal('buy milk and eggs')).toBe('none')
  })
})

describe('ruleExtractPlaces (no AI)', () => {
  it('picks short lines that name a hotel, restaurant or cafe', () => {
    const r = ruleExtractPlaces('Bangkok trip\n- Sofitel Sukhumvit hotel\n2. Gulp BKK cafe\nremember to pack sunscreen')
    expect(r.map((p) => [p.name, p.type])).toEqual([['Sofitel Sukhumvit hotel', 'hotel'], ['Gulp BKK cafe', 'cafe']])
  })

  it('names a Maps link after the line above it, and ignores long prose', () => {
    const r = ruleExtractPlaces('Wat Arun\nhttps://maps.app.goo.gl/xyz123\n' + 'a hotel '.repeat(30))
    expect(r).toEqual([{ name: 'Wat Arun', type: 'other', mapsUrl: 'https://maps.app.goo.gl/xyz123', confidence: 45 }])
  })

  it('skips links, sentences and long lines as names', () => {
    expect(ruleExtractPlaces('https://www.example.com/best-hotel-in-town')).toEqual([])
    expect(ruleExtractPlaces('We finally got to the hotel after a very long and tiring day.')).toEqual([])
    expect(ruleExtractPlaces('The hotel was great and we would stay again soon ok')).toEqual([])
  })

  it('returns nothing for an ordinary note', () => {
    expect(ruleExtractPlaces('call dentist tomorrow\nbuy milk')).toEqual([])
  })
})

describe('parsePlacesJson', () => {
  it('reads the model reply, tolerating fences and bad fields', () => {
    const r = parsePlacesJson('```json\n{"places":[{"name":"Royal Cliff","type":"hotel","city":"Pattaya","confidence":88},{"type":"hotel"},{"name":"X","confidence":"high"}]}\n```')
    expect(r.map((p) => [p.name, p.type, p.city, p.confidence])).toEqual([['Royal Cliff', 'hotel', 'Pattaya', 88], ['X', undefined, undefined, 60]])
  })

  it('returns [] for garbage', () => {
    expect(parsePlacesJson('sorry, no')).toEqual([])
    expect(parsePlacesJson('{"places": "none"}')).toEqual([])
    expect(parsePlacesJson('{bad json}')).toEqual([])
  })
})

describe('verifyPlaces: the note is the source of truth', () => {
  const note = 'Pattaya weekend\nStay at Royal Cliff Beach Resort, Pattaya.\nDinner: Gulp BKK in Bangkok'

  it('keeps places named in the note and builds the evidence snippet from the note', () => {
    const { places, dropped } = verifyPlaces(note, [{ name: 'Royal Cliff Beach Resort', type: 'hotel', city: 'Pattaya', confidence: 90 }])
    expect(dropped).toBe(0)
    expect(places).toHaveLength(1)
    expect(places[0]).toMatchObject({ name: 'Royal Cliff Beach Resort', type: 'hotel', city: 'Pattaya', confidence: 90 })
    expect(places[0].evidence).toContain('Royal Cliff Beach Resort')
  })

  it('drops a place the note never mentions (a model invention)', () => {
    const { places, dropped } = verifyPlaces(note, [{ name: 'Hilton Phuket' }, { name: 'Gulp BKK' }])
    expect(places.map((p) => p.name)).toEqual(['Gulp BKK'])
    expect(dropped).toBe(1)
  })

  it('clears a city, country or address the note does not say', () => {
    const { places } = verifyPlaces(note, [{ name: 'Gulp BKK', city: 'Chiang Mai', country: 'Thailand', address: '12 Soi 5' }])
    expect(places[0].city).toBeUndefined()
    expect(places[0].country).toBeUndefined()
    expect(places[0].address).toBeUndefined()
  })

  it('only keeps a Maps URL that is in the note, and an unknown type becomes other', () => {
    const t = 'Wat Arun\nhttps://maps.app.goo.gl/xyz'
    const ok = verifyPlaces(t, [{ name: 'Wat Arun', type: 'temple', mapsUrl: 'https://maps.app.goo.gl/xyz' }]).places[0]
    expect(ok.mapsUrl).toBe('https://maps.app.goo.gl/xyz')
    expect(ok.type).toBe('other')
    expect(verifyPlaces(t, [{ name: 'Wat Arun', mapsUrl: 'https://maps.app.goo.gl/invented' }]).places[0].mapsUrl).toBeUndefined()
  })

  it('collapses repeats and clamps confidence', () => {
    const { places } = verifyPlaces(note, [{ name: 'Gulp BKK', confidence: 250 }, { name: 'gulp bkk' }])
    expect(places).toHaveLength(1)
    expect(places[0].confidence).toBe(100)
  })
})

describe('findDuplicate', () => {
  const existing = [{ id: '1', name: 'Royal Cliff', city: 'Pattaya' }, { id: '2', name: 'Gulp BKK' }]
  it('matches on name, and on city when both have one', () => {
    expect(findDuplicate({ name: 'royal cliff', city: 'Pattaya' }, existing)?.id).toBe('1')
    expect(findDuplicate({ name: 'Royal Cliff', city: 'Phuket' }, existing)).toBeUndefined()
    expect(findDuplicate({ name: 'Royal Cliff' }, existing)?.id).toBe('1')
    expect(findDuplicate({ name: 'Gulp BKK', city: 'Bangkok' }, existing)?.id).toBe('2')
    expect(findDuplicate({ name: 'New Place' }, existing)).toBeUndefined()
  })
})

describe('planPlaces', () => {
  const mk = (name: string, over: Partial<MinedPlace & { duplicateOf?: string }> = {}, noteId = 'n1'): Proposal => ({
    noteId, noteTitle: 't', place: { name, type: 'attraction', evidence: '', confidence: 90, ...over },
  })
  const names = (r: ReturnType<typeof planPlaces>) => r.create.map((c) => c.place.name)
  const reasons = (r: ReturnType<typeof planPlaces>) => r.skipped.map((s) => `${s.proposal.place.name}:${s.reason}`)

  it('merges exact repeats across notes regardless of case and spacing', () => {
    const r = planPlaces([mk('Khao Yai National Park'), mk('KhaoYai national park', {}, 'n2'), mk('Khao yai National Park', {}, 'n3')], [])
    expect(names(r)).toEqual(['Khao Yai National Park'])
    expect(reasons(r)).toEqual(['KhaoYai national park:duplicate-in-batch', 'Khao yai National Park:duplicate-in-batch'])
  })

  it('skips near-spellings (typo or swap) but not genuinely different places', () => {
    const r = planPlaces([mk('Kaeng Krachan National Park'), mk('Keang Krachan National Park'), mk('Khao Yai National Park'), mk('Khao Sok National Park')], [])
    expect(names(r)).toEqual(['Kaeng Krachan National Park', 'Khao Yai National Park', 'Khao Sok National Park'])
    expect(reasons(r)).toEqual(['Keang Krachan National Park:similar-name'])
  })

  it('keeps near-spellings when asked', () => {
    const r = planPlaces([mk('Kaeng Krachan National Park'), mk('Keang Krachan National Park')], [], { ...DEFAULT_PLAN, keepSimilar: true })
    expect(names(r)).toHaveLength(2)
  })

  it('skips places already in the table, including near-spellings of them', () => {
    const existing = [{ id: 'e1', name: 'Bangkok' }, { id: 'e2', name: 'Doi Pha Hom Pok National Park' }]
    const r = planPlaces([mk('bangkok'), mk('Doi Pah Hom Pok National Park'), mk('Doi Pha Hompok National Park'), mk('Pattaya')], existing)
    expect(names(r)).toEqual(['Pattaya'])
    expect(reasons(r)).toEqual([
      'bangkok:already-in-places',
      'Doi Pah Hom Pok National Park:similar-to-existing',
      'Doi Pha Hompok National Park:already-in-places', // only a space differs: same place
    ])
  })

  it('skips already-flagged duplicates, countries, streets and low confidence', () => {
    const r = planPlaces([
      mk('Hua Hin', { duplicateOf: 'x' }), mk('Thailand'), mk('Soi 11'), mk('Maybe Place', { confidence: 60 }), mk('Chiang Mai'),
    ], [])
    expect(names(r)).toEqual(['Chiang Mai'])
    expect(reasons(r)).toEqual(['Hua Hin:already-in-places', 'Thailand:country', 'Soi 11:street-level', 'Maybe Place:low-confidence'])
  })

  it('treats the same name in different cities as different places', () => {
    const r = planPlaces([mk('Central Market', { city: 'Bangkok' }), mk('Central Market', { city: 'Chiang Mai' })], [])
    expect(names(r)).toHaveLength(2)
  })
})

describe('looksSensitiveContent', () => {
  it('flags account numbers, credential words and home addresses', () => {
    expect(looksSensitiveContent('Account no 1234 5678 9012')).toBe(true)
    expect(looksSensitiveContent('IBAN GB29NWBK60161331926819')).toBe(true)
    expect(looksSensitiveContent('wifi password is abc')).toBe(true)
    expect(looksSensitiveContent('my home address: 12 Rama 9 road')).toBe(true)
    expect(looksSensitiveContent('Home address - flat 4B')).toBe(true)
  })

  it('leaves ordinary travel notes alone', () => {
    expect(looksSensitiveContent('Stay at Royal Cliff Beach Resort, Pattaya. Dinner at Gulp BKK.')).toBe(false)
    expect(looksSensitiveContent('Trip 12-14 Dec, 3 nights, near the beach')).toBe(false)
  })
})
