// Privacy guard: decides whether an item's content may be sent to a cloud AI provider.
//
// Memex is local-first — cloud providers (Claude, Gemini) are opt-in and must never see
// secrets or personal data. This is a conservative deny-list: anything that looks sensitive
// stays on Ollama. It is checked by every code path that sends stored items to `aiChat()`
// (re-classify, reprocess-bulk, insights, digest, RAG ask) via the `cloudSafe` option.

export interface CloudSafeItem {
  type?: string | null
  encrypted?: boolean | null
  categories?: string[] | null
  tags?: string[] | null
}

// Top-level category names whose items are never sent to the cloud.
const BLOCKED_TOP_CATEGORIES = new Set(['passwords', 'personal'])
// Explicit per-item opt-out tags.
const BLOCKED_TAGS = new Set(['private', 'no-cloud', 'local-only'])

export function cloudSafe(item: CloudSafeItem): boolean {
  if (item.encrypted === true) return false
  if (item.type === 'password') return false

  const top = item.categories?.[0]
  if (typeof top === 'string' && BLOCKED_TOP_CATEGORIES.has(top.trim().toLowerCase())) return false

  for (const tag of item.tags ?? []) {
    if (typeof tag === 'string' && BLOCKED_TAGS.has(tag.trim().toLowerCase())) return false
  }
  return true
}

// Content check: the category guard above cannot see a bank note filed under Tech, or a home address in an ordinary
// note. This looks at the text itself. It is deliberately over-cautious: a false positive only keeps a note on the
// machine, a false negative sends it out. Not yet wired into cloudSafe() (that would change every AI flow); new
// features that read notes in bulk call it explicitly.
const CREDENTIAL_WORDS =
  /\b(iban|swift|ifsc|routing number|cvv|cvc|otp|pin|passcode|password|passwd|account no|account number|acct|ssn|aadhaar|pan card)\b/i
const LONG_DIGIT_RUN = /[0-9][0-9 -]{8,}[0-9]/
const HOME_ADDRESS = /\b(my (home|house|flat|apartment|residential)? ?address|home address|residential address|my home|my flat|my apartment)\b/i

export function looksSensitiveContent(text: string): boolean {
  return LONG_DIGIT_RUN.test(text) || CREDENTIAL_WORDS.test(text) || HOME_ADDRESS.test(text)
}

/** True only if every item is safe — use for calls that bundle several items into one prompt. */
export function allCloudSafe(items: CloudSafeItem[]): boolean {
  return items.every(cloudSafe)
}
