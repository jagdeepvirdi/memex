import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'
import { findItemsByExactText, normalizeNoteText } from './duplicateService'
import { pool } from '../db/client'

vi.mock('../db/client', () => ({ pool: { query: vi.fn() } }))

beforeEach(() => vi.clearAllMocks())

const md5 = (s: string) => createHash('md5').update(s, 'utf8').digest('hex')

describe('normalizeNoteText', () => {
  it('collapses spaces and line breaks and trims the ends', () => {
    expect(normalizeNoteText('  Stay at   Lakeview\n\nHotel \t')).toBe('Stay at Lakeview Hotel')
  })
})

describe('findItemsByExactText', () => {
  it('asks for the digest of the whitespace-normalised text and reports matches as exact (similarity 1)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 'a', title: 'Trip note', type: 'note' }] } as never)
    const found = await findItemsByExactText('Stay at  Lakeview\nHotel on Friday')
    expect(found).toEqual([{ id: 'a', title: 'Trip note', type: 'note', similarity: 1 }])
    const [sql, params] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]]
    expect(params[0]).toBe(md5('Stay at Lakeview Hotel on Friday'))
    expect(sql).toMatch(/deleted_at IS NULL/)
    expect(sql).toMatch(/encrypted = false/)
    expect(sql).toMatch(/type <> 'password'/)
    // The SQL side must collapse whitespace the same way: a template literal turns "\s" into "s" unless it is doubled.
    expect(sql).toContain(String.raw`'\s+'`)
  })

  it('does not look at all for a very short note', async () => {
    expect(await findItemsByExactText('milk')).toEqual([])
    expect(await findItemsByExactText('   ')).toEqual([])
    expect(pool.query).not.toHaveBeenCalled()
  })

  it('returns nothing, and never throws, when the lookup fails', async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(new Error('db down'))
    expect(await findItemsByExactText('Stay at Lakeview Hotel on Friday')).toEqual([])
  })
})
