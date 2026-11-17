// Privacy guard: decides whether an item's content may be sent to a cloud AI provider.
//
// Memex is local-first — cloud providers (Claude, Gemini, OpenAI, Groq) are opt-in and must never see secrets or personal
// data. This is a conservative deny-list: anything that looks sensitive stays on this machine (Ollama for answers; for
// embeddings the item is skipped and found by keyword). It is checked by every code path that sends stored items to a
// cloud model (re-classify, reprocess-bulk, insights, digest, RAG ask, explain, extract, link summaries, embeddings).
//
// Three layers, strongest first:
//   1. what the item IS: encrypted / password items;
//   2. where the user filed it: top-level Passwords / Personal categories, and private / no-cloud / local-only tags;
//   3. what the text SAYS: account numbers, card-sized digit runs, credentials with a value, a home address.
// Layer 3 only runs when the caller passes `title` / `content`. Every caller that has the text does.

export interface CloudSafeItem {
  type?: string | null
  encrypted?: boolean | null
  categories?: string[] | null
  tags?: string[] | null
  /** Optional: when present, the text is scanned too (layer 3). */
  title?: string | null
  content?: string | null
}

/** Why an item stays on this machine. */
export type PrivacyReason = 'encrypted' | 'password' | 'category' | 'tag' | 'content'

// Top-level category names whose items are never sent to the cloud.
const BLOCKED_TOP_CATEGORIES = new Set(['passwords', 'personal'])
// Explicit per-item opt-out tags.
const BLOCKED_TAGS = new Set(['private', 'no-cloud', 'local-only'])

/** How much of the text layer 3 reads. Larger than anything an embedding sends; bounded so one huge note cannot stall a request. */
export const CONTENT_SCAN_CHARS = 20_000

/** Why this item must not leave the machine, or null when it may. First match wins, strongest reason first. */
export function cloudSafeReason(item: CloudSafeItem): PrivacyReason | null {
  if (item.encrypted === true) return 'encrypted'
  if (item.type === 'password') return 'password'

  const top = item.categories?.[0]
  if (typeof top === 'string' && BLOCKED_TOP_CATEGORIES.has(top.trim().toLowerCase())) return 'category'

  for (const tag of item.tags ?? []) {
    if (typeof tag === 'string' && BLOCKED_TAGS.has(tag.trim().toLowerCase())) return 'tag'
  }

  const text = `${item.title ?? ''}\n${item.content ?? ''}`
  if (text.trim() && looksSensitiveContent(text)) return 'content'
  return null
}

export function cloudSafe(item: CloudSafeItem): boolean {
  return cloudSafeReason(item) === null
}

/** One sentence for the UI: why this item stays on this machine. */
export function describePrivacyReason(reason: PrivacyReason): string {
  switch (reason) {
    case 'encrypted': return 'It is encrypted.'
    case 'password': return 'It is a password item.'
    case 'category': return 'It is filed under Passwords or Personal.'
    case 'tag': return 'It is tagged private, no-cloud or local-only.'
    case 'content': return 'Its text looks like it contains account details, a long number, a credential or a home address.'
  }
}

// ── Layer 3: the text itself ─────────────────────────────────────────────────
//
// Deliberately over-cautious: a false positive only keeps a note on the machine (and, with cloud embeddings, leaves it to
// keyword search); a false negative sends it out. Tuned on a real library of ~800 notes (counts only were looked at):
// URLs are removed first (the numeric ids in a link are not secrets: that was 63% of the false hits), and a digit run must
// hold at least 9 digits (phone, card and account sized). Words that are ambiguous on their own ("pin", "password", "swift"
// the language) only count when a value follows ("password: hunter2").

const URLS = /\b(?:https?:\/\/|www\.)\S+/gi
const DIGIT_RUN = /[0-9][0-9 -]{7,}[0-9]/g
// Calendar dates (2026-11-17, 17/11/2026): a date next to a time ("2026-11-17 16:57") would otherwise look like a 10-digit number.
const DATES = /\b(?:(?:19|20)\d{2}[-/. ](?:0?[1-9]|1[0-2])[-/. ](?:0?[1-9]|[12]\d|3[01])|(?:0?[1-9]|[12]\d|3[01])[-/.](?:0?[1-9]|1[0-2])[-/.](?:19|20)\d{2})\b/g
const MIN_SENSITIVE_DIGITS = 9
// Never ordinary text: banking and identity words, with or without a value.
const STRONG_WORDS =
  /\b(iban|ifsc|cvv|cvc|passcode|aadhaar|ssn|pan card|account no\.?|account number|routing number|swift code|bic code|swift\/bic)\b/i
// Ambiguous on their own; sensitive only with a value after them ("pin: 4321", "otp is 123456", "wifi password: x").
const WEAK_WORD_WITH_VALUE = /\b(pin|otp|password|passwd|acct)\b\s*(?:is|:|=|-|–|—)\s*\S{3,}/i
const HOME_ADDRESS =
  /\b(my (home|house|flat|apartment|residential)? ?address|home address|residential address|my home|my flat|my apartment)\b/i

export function looksSensitiveContent(text: string): boolean {
  const scanned = text.slice(0, CONTENT_SCAN_CHARS).replace(URLS, ' ')
  const runs = scanned.replace(DATES, ' ').match(DIGIT_RUN)
  if (runs?.some((r) => r.replace(/\D/g, '').length >= MIN_SENSITIVE_DIGITS)) return true
  return STRONG_WORDS.test(scanned) || WEAK_WORD_WITH_VALUE.test(scanned) || HOME_ADDRESS.test(scanned)
}

/** True only if every item is safe — use for calls that bundle several items into one prompt. */
export function allCloudSafe(items: CloudSafeItem[]): boolean {
  return items.every(cloudSafe)
}
