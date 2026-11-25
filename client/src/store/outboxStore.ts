import { create } from 'zustand'
import {
  OUTBOX_CHANGED_EVENT, OutboxError, addToOutbox, listOutbox, removeFromOutbox, updateOutboxItem,
  type OutboxItem, type OutboxKind,
} from '../lib/outbox'
import { describeFlush, flushOutbox, type FlushSummary } from '../lib/outboxSync'

interface OutboxState {
  items: OutboxItem[]
  /** True while a send run is going; a second run is not started. */
  flushing: boolean
  /** The result of the last run, in words, for the panel. */
  lastResult: string | null
  refresh: () => Promise<void>
  /** Keeps an item for later. Resolves with a sentence to show if it could not be kept. */
  add: (kind: OutboxKind, value: string) => Promise<{ ok: true; item: OutboxItem } | { ok: false; message: string }>
  remove: (id: string) => Promise<void>
  /** Puts a failed item back in the queue for another try. */
  retry: (id: string) => Promise<void>
  flush: () => Promise<FlushSummary | null>
}

export const useOutboxStore = create<OutboxState>((set, get) => ({
  items: [],
  flushing: false,
  lastResult: null,

  refresh: async () => {
    try {
      set({ items: await listOutbox() })
    } catch {
      set({ items: [] }) // no storage in this browser: the outbox is simply empty
    }
  },

  add: async (kind, value) => {
    try {
      const item = await addToOutbox(kind, value)
      await get().refresh()
      return { ok: true, item }
    } catch (err) {
      return { ok: false, message: err instanceof OutboxError ? err.message : 'Could not keep that for later.' }
    }
  },

  remove: async (id) => {
    await removeFromOutbox(id).catch(() => {})
    await get().refresh()
  },

  retry: async (id) => {
    await updateOutboxItem(id, { status: 'waiting', attempts: 0, lastError: undefined }).catch(() => {})
    await get().refresh()
  },

  flush: async () => {
    if (get().flushing) return null
    set({ flushing: true })
    try {
      const summary = await flushOutbox()
      set({ lastResult: describeFlush(summary) })
      await get().refresh()
      return summary
    } finally {
      set({ flushing: false })
    }
  },
}))

// Other tabs and the add/remove helpers announce changes; keep the store in step. Safe to import more than once.
if (typeof window !== 'undefined') {
  window.addEventListener(OUTBOX_CHANGED_EVENT, () => { void useOutboxStore.getState().refresh() })
}
