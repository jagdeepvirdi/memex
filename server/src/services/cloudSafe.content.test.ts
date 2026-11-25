import { describe, it, expect } from 'vitest'
import { cloudSafe, cloudSafeReason, describePrivacyReason, looksSensitiveContent, allCloudSafe, CONTENT_SCAN_CHARS, type CloudSafeItem, type PrivacyReason } from './cloudSafe'

// Layer 3 of the privacy guard: what the text says. Tuned on a real library of ~800 notes: URL ids were 63% of the false
// hits, so links are ignored; ambiguous words ("pin", "password", "swift") only count with a value after them.

describe('looksSensitiveContent — numbers', () => {
  it.each([
    'Account no 1234 5678 9012',
    'Card 4111 1111 1111 1111 expires next year',
    'Call 9876543210 after five',
    'Call +91 98765 43210',
    'SSN 123-45-6789',
    'order 123456789',
  ])('flags %s', (t) => expect(looksSensitiveContent(t)).toBe(true))

  it.each([
    'Trip 12-14 Dec, 3 nights, near the beach',
    'Bought 3 for 250 baht, 2 for 400',
    'Room 4B, floor 12',
    'Version 1.2.3 released 2026-11-17',
    'Meeting 2026-11-17 16:57 in room 4',   // a date next to a time is not a 10-digit number
    'Due 17/11/2026 17:30',
    'The year 2026 and the year 2025',
    'Version 12345678',                      // 8 digits: below the threshold
  ])('does not flag %s', (t) => expect(looksSensitiveContent(t)).toBe(false))

  it('ignores the numeric ids inside links', () => {
    expect(looksSensitiveContent('Saved https://www.amazon.com/dp/1234567890123456 for later')).toBe(false)
    expect(looksSensitiveContent('https://example.com/watch?id=98765432101234 and www.site.org/p/12345678901234')).toBe(false)
    expect(looksSensitiveContent('http://a.b/1234567890123 ')).toBe(false)
  })

  it('still flags a real number sitting next to a link', () => {
    expect(looksSensitiveContent('https://bank.example.com/login  account 1234 5678 9012')).toBe(true)
  })
})

describe('looksSensitiveContent — words', () => {
  it.each([
    'IBAN GB29NWBK60161331926819', 'IFSC code SBIN0001234', 'cvv on the back', 'passcode for the safe', 'my Aadhaar card',
    'ssn on file', 'PAN card scan', 'routing number for the transfer', 'Account Number: see statement', 'swift code ABCDGB2L',
  ])('flags %s even without a value', (t) => expect(looksSensitiveContent(t)).toBe(true))

  it.each([
    'wifi password: hunter2', 'wifi password is abc', 'pin: 4321', 'PIN = 8888', 'otp is 123456', 'passwd - letmein',
    'acct: 4455',
  ])('flags a credential with a value: %s', (t) => expect(looksSensitiveContent(t)).toBe(true))

  it.each([
    'Password manager comparison: Bitwarden vs 1Password',
    'Learning Swift for iOS apps',
    'Swift concurrency notes: actors and tasks',
    'Pin the tab you need most',
    'Pinterest board ideas',
    'Reset your password',
    'How OTP generators work',
    'Use a strong password for each site',
  ])('does not flag ordinary text: %s', (t) => expect(looksSensitiveContent(t)).toBe(false))

  it('flags a home address', () => {
    expect(looksSensitiveContent('my home address: 12 Rama 9 road')).toBe(true)
    expect(looksSensitiveContent('Home address - flat 4B')).toBe(true)
  })
})

describe('looksSensitiveContent — limits', () => {
  it('reads only the first part of a very long text, so one huge note cannot stall a request', () => {
    const late = `${'x '.repeat(CONTENT_SCAN_CHARS)} account number 1234 5678 9012`
    expect(looksSensitiveContent(late)).toBe(false)
    expect(looksSensitiveContent(`account number ${'x '.repeat(CONTENT_SCAN_CHARS)}`)).toBe(true)
  })
  it('is quick on a large input', () => {
    const t = Date.now()
    looksSensitiveContent('1 2 3 4 5 6 7 8 9 '.repeat(5000))
    expect(Date.now() - t).toBeLessThan(500)
  })
  it('handles empty input', () => expect(looksSensitiveContent('')).toBe(false))
})

describe('cloudSafe with text', () => {
  it('holds back an item whose category and tags are ordinary but whose text is sensitive', () => {
    const item = { type: 'note', categories: ['Tech'], tags: ['notes'], title: 'Rent', content: 'Account number 1234 5678 9012' }
    expect(cloudSafe(item)).toBe(false)
    expect(cloudSafeReason(item)).toBe('content')
  })

  it('scans the title as well as the content', () => {
    expect(cloudSafe({ title: 'wifi password: hunter2', content: 'nothing else' })).toBe(false)
  })

  it('allows an ordinary note', () => {
    expect(cloudSafe({ type: 'recipe', categories: ['Food'], tags: ['dinner'], title: 'Pasta', content: 'Boil, toss, serve.' })).toBe(true)
  })

  it('does not look at text that is not passed (older callers keep their behaviour)', () => {
    expect(cloudSafe({ type: 'note', categories: ['Tech'], tags: [] })).toBe(true)
    expect(cloudSafe({ title: null, content: null })).toBe(true)
    expect(cloudSafe({ title: '', content: '   ' })).toBe(true)
  })

  it('allCloudSafe fails when any bundled item has sensitive text', () => {
    expect(allCloudSafe([{ title: 'ok', content: 'fine' }, { title: 'bad', content: 'IBAN GB29NWBK60161331926819' }])).toBe(false)
    expect(allCloudSafe([{ title: 'ok', content: 'fine' }, { title: 'also', content: 'fine too' }])).toBe(true)
  })
})

describe('cloudSafeReason', () => {
  it.each([
    [{ encrypted: true }, 'encrypted'],
    [{ type: 'password' }, 'password'],
    [{ categories: ['Passwords'] }, 'category'],
    [{ categories: ['Personal', 'Contacts'] }, 'category'],
    [{ tags: ['Private'] }, 'tag'],
    [{ content: 'IBAN GB29NWBK60161331926819' }, 'content'],
    [{}, null],
  ] as Array<[CloudSafeItem, PrivacyReason | null]>)('%j -> %s', (item, reason) => expect(cloudSafeReason(item)).toBe(reason))

  it('reports the strongest reason first: what it is, then where it is filed, then what it says', () => {
    const all = { encrypted: true, type: 'password', categories: ['Personal'], tags: ['private'], content: 'IBAN GB29NWBK60161331926819' }
    expect(cloudSafeReason(all)).toBe('encrypted')
    expect(cloudSafeReason({ ...all, encrypted: false })).toBe('password')
    expect(cloudSafeReason({ ...all, encrypted: false, type: 'note' })).toBe('category')
    expect(cloudSafeReason({ ...all, encrypted: false, type: 'note', categories: ['Tech'] })).toBe('tag')
    expect(cloudSafeReason({ ...all, encrypted: false, type: 'note', categories: ['Tech'], tags: [] })).toBe('content')
  })

  it('has a plain sentence for every reason', () => {
    for (const r of ['encrypted', 'password', 'category', 'tag', 'content'] as const) {
      expect(describePrivacyReason(r)).toMatch(/\.$/)
    }
    expect(describePrivacyReason('content')).toMatch(/account details/)
  })
})

// Found 2026-11-25: a login pasted into an ordinary note ("<id> <password-like token>") has no banking word and no long
// digit run, so it went to a cloud AI. Invented values only.
describe('looksSensitiveContent — logins, keys and ledgers', () => {
  it.each([
    '2048117 Zq@mtor7731',                       // an id and a password-shaped token, nothing else
    'wifi at home Pa$$w0rdXy',                   // a password-shaped token inside a sentence
    'username: mango99',
    'login id is 55abc',
    'pwd = hunter22',
    'key sk-xxxxxxxxxxxxxxxxxxxxxxxx',
    'token gsk_xxxxxxxxxxxxxxxxxxxx',
    'Ann 1300 Bo 1100 Cy 1100 Di 1600 Ed 500 Fay 900 total 6500',   // a ledger of amounts
  ])('flags %s', (t) => expect(looksSensitiveContent(t)).toBe(true))

  it.each([
    '#VSCOcool2 #Travel9Gram #LandscapePhotography',
    'Mail jane.Doe9@example.com about the trip',
    'Released as v1.2.3-Beta4! last week',
    'Hello World! Welcome to Pine Valley',
    'Bought 3 for 250 baht, 2 for 400',
    'Mix 2 cups flour, 1 tsp salt, bake 350 degrees for 25 minutes',
    'Best years were 2019, 2021 and 2024',           // years are not amounts
    'Phone case 120 baht, charger 350 baht, cable 180 baht',   // a shopping list is not a ledger of 5+ amounts
    'Wi-Fi6E router with 8 antennas',
    'A long ordinary note about a trip to Pine Valley where we ate noodles and walked by the river all afternoon.',
  ])('does not flag %s', (t) => expect(looksSensitiveContent(t)).toBe(false))

  it('ignores a long token that sits inside a link', () => {
    expect(looksSensitiveContent('Saved https://example.com/p/Zq@mtor7731Abc for later')).toBe(false)
  })

  it('keeps a flagged note on this machine through cloudSafe', () => {
    expect(cloudSafe({ type: 'note', title: 'Untitled', content: '2048117 Zq@mtor7731' })).toBe(false)
    expect(cloudSafeReason({ type: 'note', content: 'username: mango99' })).toBe('content')
  })
})
