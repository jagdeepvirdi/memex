import { create } from 'zustand'
import { clearDemoData, fetchDemoStatus, loadDemoData } from '../lib/api'

interface DemoState {
  /** Sample items loaded right now. `null` until the first answer (the banner stays hidden meanwhile). */
  items: number | null
  busy: boolean
  refresh: () => Promise<void>
  load: () => Promise<number>
  clear: () => Promise<{ items: number }>
}

/** One shared view of "is sample data loaded", so the header banner and the Settings panel never disagree. */
export const useDemoStore = create<DemoState>((set) => ({
  items: null,
  busy: false,
  refresh: async () => {
    try {
      set({ items: (await fetchDemoStatus()).items })
    } catch {
      // The banner is an extra: a failed check just leaves it hidden.
    }
  },
  load: async () => {
    set({ busy: true })
    try {
      const { items } = await loadDemoData()
      set({ items })
      return items
    } finally {
      set({ busy: false })
    }
  },
  clear: async () => {
    set({ busy: true })
    try {
      const result = await clearDemoData()
      set({ items: 0 })
      return result
    } finally {
      set({ busy: false })
    }
  },
}))
