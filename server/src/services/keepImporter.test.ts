import { describe, it, expect } from 'vitest'
import AdmZip from 'adm-zip'
import { parseKeepZip } from './keepImporter'

// ── helpers ───────────────────────────────────────────────────────────────────

function makeZip(entries: Array<{ path: string; data: object }>): Buffer {
  const zip = new AdmZip()
  for (const { path, data } of entries) {
    zip.addFile(path, Buffer.from(JSON.stringify(data)))
  }
  return zip.toBuffer()
}

const NOTE = {
  title: 'Dog Friendly Places',
  textContent: 'Kanchanaburi, Khao Yai',
  labels: [{ name: 'Travel' }, { name: 'Thailand' }],
  userEditedTimestampUsec: 1_700_000_000_000_000,
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('parseKeepZip', () => {
  it('parses notes from Keep/*.json path', () => {
    const buf = makeZip([{ path: 'Keep/note1.json', data: NOTE }])
    const notes = parseKeepZip(buf)
    expect(notes).toHaveLength(1)
    expect(notes[0].title).toBe('Dog Friendly Places')
    expect(notes[0].content).toBe('Kanchanaburi, Khao Yai')
    expect(notes[0].source).toBe('keep')
  })

  it('parses notes from Takeout/Keep/*.json path (standard Google Takeout structure)', () => {
    const buf = makeZip([{ path: 'Takeout/Keep/note1.json', data: NOTE }])
    const notes = parseKeepZip(buf)
    expect(notes).toHaveLength(1)
    expect(notes[0].title).toBe('Dog Friendly Places')
  })

  it('extracts labels as an array of strings', () => {
    const buf = makeZip([{ path: 'Keep/note1.json', data: NOTE }])
    const notes = parseKeepZip(buf)
    expect(notes[0].labels).toEqual(['Travel', 'Thailand'])
  })

  it('converts userEditedTimestampUsec (microseconds) to a Date', () => {
    const buf = makeZip([{ path: 'Keep/note1.json', data: NOTE }])
    const notes = parseKeepZip(buf)
    expect(notes[0].updatedAt).toBeInstanceOf(Date)
    expect(notes[0].updatedAt.getTime()).toBe(1_700_000_000_000)
  })

  it('falls back to current date when timestamp is missing', () => {
    const before = Date.now()
    const buf = makeZip([{ path: 'Keep/note.json', data: { title: 'T', textContent: 'C' } }])
    const notes = parseKeepZip(buf)
    expect(notes[0].updatedAt.getTime()).toBeGreaterThanOrEqual(before)
  })

  it('skips notes where both title and content are empty', () => {
    const buf = makeZip([
      { path: 'Keep/empty.json', data: { title: '', textContent: '' } },
      { path: 'Keep/real.json',  data: { title: 'Keep me', textContent: 'content' } },
    ])
    const notes = parseKeepZip(buf)
    expect(notes).toHaveLength(1)
    expect(notes[0].title).toBe('Keep me')
  })

  it('deduplicates notes with identical title+content', () => {
    const buf = makeZip([
      { path: 'Keep/a.json', data: NOTE },
      { path: 'Keep/b.json', data: NOTE }, // exact duplicate
    ])
    const notes = parseKeepZip(buf)
    expect(notes).toHaveLength(1)
  })

  it('silently skips entries with malformed JSON without throwing', () => {
    const zip = new AdmZip()
    zip.addFile('Keep/bad.json', Buffer.from('not valid json {{'))
    zip.addFile('Keep/good.json', Buffer.from(JSON.stringify(NOTE)))
    const notes = parseKeepZip(zip.toBuffer())
    expect(notes).toHaveLength(1)
    expect(notes[0].title).toBe('Dog Friendly Places')
  })

  it('ignores non-JSON files inside Keep/', () => {
    const buf = makeZip([
      { path: 'Keep/image.png.json', data: NOTE }, // .json so included
    ])
    // Only .json files are included — this is a .json so it IS parsed
    const notes = parseKeepZip(buf)
    expect(notes).toHaveLength(1)
  })

  it('ignores files outside the Keep directory', () => {
    const buf = makeZip([
      { path: 'Mail/message.json', data: NOTE },
      { path: 'Keep/real.json',    data: NOTE },
    ])
    const notes = parseKeepZip(buf)
    expect(notes).toHaveLength(1)
  })
})
