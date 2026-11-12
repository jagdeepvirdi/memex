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

/** True only if every item is safe — use for calls that bundle several items into one prompt. */
export function allCloudSafe(items: CloudSafeItem[]): boolean {
  return items.every(cloudSafe)
}
