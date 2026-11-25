// The phone-side outbox: things saved "for later" that are sent to Memex when the laptop can be reached.
//
// Kept in IndexedDB (not localStorage): a note can be long and the queue can hold hundreds of entries, which does not fit
// the ~5 MB localStorage budget. Nothing here talks to the server; `outboxSync.ts` does the sending.

export type OutboxKind = 'url' | 'text'
export type OutboxStatus = 'waiting' | 'failed'

export interface OutboxItem {
  id: string
  kind: OutboxKind
  /** The link (kind `url`) or the note text / HTML (kind `text`). */
  value: string
  createdAt: number
  status: OutboxStatus
  /** Failed send attempts so far. */
  attempts: number
  /** Why the last attempt failed, in words for the person. */
  lastError?: string
}

/** Most entries kept; adding beyond this is refused with a clear message instead of silently dropping the oldest. */
export const OUTBOX_LIMIT = 200
/** Longest note kept (characters). */
export const OUTBOX_MAX_TEXT_CHARS = 50_000

export const OUTBOX_CHANGED_EVENT = 'memex:outbox-changed'

const DB_NAME = 'memex-outbox'
const STORE = 'items'

export class OutboxError extends Error {}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new OutboxError('This browser cannot keep items for later.'))
      return
    }
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(new OutboxError('Could not open the saved-for-later storage.'))
  })
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const req = work(tx.objectStore(STORE))
    tx.oncomplete = () => { db.close(); resolve(req.result) }
    tx.onerror = tx.onabort = () => { db.close(); reject(new OutboxError('Could not save to the saved-for-later storage.')) }
  }))
}

function announce(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(OUTBOX_CHANGED_EVENT))
}

/** Oldest first, so items are sent in the order they were saved. */
export async function listOutbox(): Promise<OutboxItem[]> {
  const all = await run<OutboxItem[]>('readonly', (s) => s.getAll())
  return all.sort((a, b) => a.createdAt - b.createdAt)
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/** What a saved link looks like once spaces and a trailing slash are ignored, to avoid queueing the same link twice. */
const normalizeValue = (kind: OutboxKind, value: string) => (kind === 'url' ? value.trim().replace(/\/+$/, '') : value.trim())

/**
 * Keeps an item for later. A waiting entry with the same link / text is returned instead of a second copy.
 * Throws `OutboxError` (with a sentence to show) when the queue is full, the item is empty or a note is too long.
 */
export async function addToOutbox(kind: OutboxKind, rawValue: string): Promise<OutboxItem> {
  const value = normalizeValue(kind, rawValue)
  if (!value) throw new OutboxError(kind === 'url' ? 'Enter a link first.' : 'Write something first.')
  if (kind === 'url' && !/^https?:\/\/\S+$/i.test(value)) throw new OutboxError('That does not look like a web link (it should start with http:// or https://).')
  if (kind === 'text' && value.length > OUTBOX_MAX_TEXT_CHARS) throw new OutboxError(`That note is too long to keep for later (over ${OUTBOX_MAX_TEXT_CHARS.toLocaleString()} characters).`)

  const existing = await listOutbox()
  const same = existing.find((i) => i.kind === kind && normalizeValue(i.kind, i.value) === value)
  if (same) return same
  if (existing.length >= OUTBOX_LIMIT) throw new OutboxError(`${OUTBOX_LIMIT} items are already waiting. Send them before adding more.`)

  // Strictly later than everything already kept, so two items saved in the same millisecond still send in the order added.
  const latest = existing.reduce((max, i) => Math.max(max, i.createdAt), 0)
  const item: OutboxItem = { id: newId(), kind, value, createdAt: Math.max(Date.now(), latest + 1), status: 'waiting', attempts: 0 }
  await run('readwrite', (s) => s.add(item))
  announce()
  return item
}

export async function updateOutboxItem(id: string, patch: Partial<Pick<OutboxItem, 'status' | 'attempts' | 'lastError'>>): Promise<void> {
  const all = await run<OutboxItem[]>('readonly', (s) => s.getAll())
  const current = all.find((i) => i.id === id)
  if (!current) return
  const next: OutboxItem = { ...current, ...patch }
  if (patch.lastError === undefined && 'lastError' in patch) delete next.lastError
  await run('readwrite', (s) => s.put(next))
  announce()
}

export async function removeFromOutbox(id: string): Promise<void> {
  await run('readwrite', (s) => s.delete(id))
  announce()
}
