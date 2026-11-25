import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  OUTBOX_CHANGED_EVENT, OUTBOX_LIMIT, OUTBOX_MAX_TEXT_CHARS, OutboxError,
  addToOutbox, listOutbox, removeFromOutbox, updateOutboxItem,
} from './outbox'

beforeEach(() => {
  // A fresh, empty database for every test.
  globalThis.indexedDB = new IDBFactory()
})

describe('outbox storage', () => {
  it('keeps an item and lists it back, oldest first', async () => {
    // Only Date.now is faked: the fake IndexedDB needs the real timers to run.
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(1000)
    await addToOutbox('url', 'https://example.com/a')
    now.mockReturnValue(2000)
    await addToOutbox('text', 'Remember the Pine Valley trip')
    now.mockRestore()

    const items = await listOutbox()
    expect(items.map((i) => [i.kind, i.value])).toEqual([['url', 'https://example.com/a'], ['text', 'Remember the Pine Valley trip']])
    expect(items[0]).toMatchObject({ status: 'waiting', attempts: 0 })
    expect(items[0].id).toBeTruthy()
  })

  it('does not queue the same link twice (spaces and a trailing slash are ignored)', async () => {
    const first = await addToOutbox('url', 'https://example.com/a')
    const second = await addToOutbox('url', '  https://example.com/a/  ')
    expect(second.id).toBe(first.id)
    expect(await listOutbox()).toHaveLength(1)
  })

  it('treats the same text as a different thing from the same link', async () => {
    await addToOutbox('url', 'https://example.com/a')
    await addToOutbox('text', 'https://example.com/a')
    expect(await listOutbox()).toHaveLength(2)
  })

  it('refuses an empty item, a bad link, an over-long note and a full queue, each with a sentence', async () => {
    await expect(addToOutbox('url', '   ')).rejects.toThrow(/Enter a link/)
    await expect(addToOutbox('text', '')).rejects.toThrow(/Write something/)
    await expect(addToOutbox('url', 'not a link')).rejects.toThrow(/web link/)
    await expect(addToOutbox('url', 'javascript:alert(1)')).rejects.toThrow(/web link/)
    await expect(addToOutbox('text', 'x'.repeat(OUTBOX_MAX_TEXT_CHARS + 1))).rejects.toBeInstanceOf(OutboxError)

    for (let i = 0; i < OUTBOX_LIMIT; i++) await addToOutbox('text', `note ${i}`)
    await expect(addToOutbox('text', 'one more')).rejects.toThrow(/already waiting/)
    expect(await listOutbox()).toHaveLength(OUTBOX_LIMIT)
  })

  it('updates and removes an item, and ignores an id that is gone', async () => {
    const item = await addToOutbox('url', 'https://example.com/a')
    await updateOutboxItem(item.id, { status: 'failed', attempts: 3, lastError: 'Could not read that page' })
    expect((await listOutbox())[0]).toMatchObject({ status: 'failed', attempts: 3, lastError: 'Could not read that page' })

    await updateOutboxItem(item.id, { status: 'waiting', attempts: 0, lastError: undefined })
    const back = (await listOutbox())[0]
    expect(back.status).toBe('waiting')
    expect(back).not.toHaveProperty('lastError')

    await updateOutboxItem('nope', { status: 'failed' })
    await removeFromOutbox(item.id)
    expect(await listOutbox()).toEqual([])
    await expect(removeFromOutbox('nope')).resolves.toBeUndefined()
  })

  it('announces every change so the screen can refresh', async () => {
    const seen = vi.fn()
    window.addEventListener(OUTBOX_CHANGED_EVENT, seen)
    const item = await addToOutbox('url', 'https://example.com/a')
    await updateOutboxItem(item.id, { attempts: 1 })
    await removeFromOutbox(item.id)
    window.removeEventListener(OUTBOX_CHANGED_EVENT, seen)
    expect(seen).toHaveBeenCalledTimes(3)
  })

  it('survives closing and reopening the database (a page reload)', async () => {
    await addToOutbox('text', 'kept across a reload')
    // Every call opens its own connection, so a second read is a fresh open of the same stored data.
    expect((await listOutbox())[0].value).toBe('kept across a reload')
  })
})
