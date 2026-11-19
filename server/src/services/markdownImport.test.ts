import { describe, it, expect, vi } from 'vitest'
import AdmZip from 'adm-zip'

vi.mock('../db/client', () => ({ pool: { query: vi.fn() } }))

import {
  parseFrontmatter, inlineTags, parseMarkdownFile, readMarkdownUpload, planMarkdown,
  MAX_NOTE_CHARS, MAX_MARKDOWN_ENTRIES, type PlanDeps,
} from './markdownImport'

const zipOf = (files: Record<string, string>) => {
  const z = new AdmZip()
  for (const [name, text] of Object.entries(files)) z.addFile(name, Buffer.from(text, 'utf8'))
  return z.toBuffer()
}
const none: PlanDeps = { findExisting: async () => null }

describe('parseFrontmatter', () => {
  it('reads scalars, inline lists and dash lists', () => {
    const { data, body } = parseFrontmatter('---\ntitle: "Trip plan"\ntags: [travel, food]\naliases:\n  - a\n  - b\ndate: 2024-05-01\n---\nBody here')
    expect(data.title).toBe('Trip plan')
    expect(data.tags).toEqual(['travel', 'food'])
    expect(data.aliases).toEqual(['a', 'b'])
    expect(data.date).toBe('2024-05-01')
    expect(body).toBe('Body here')
  })

  it('treats text without a leading --- block as body only, and tolerates CRLF and a BOM', () => {
    expect(parseFrontmatter('Just text\n---\nnot front matter').data).toEqual({})
    expect(parseFrontmatter('﻿---\r\ntitle: X\r\n---\r\nhi').data.title).toBe('X')
  })

  it('never throws on malformed front matter', () => {
    expect(() => parseFrontmatter('---\n: : :\n- -\n---\nx')).not.toThrow()
  })
})

describe('inlineTags', () => {
  it('finds #tags but not headings, numbers or code', () => {
    const tags = inlineTags('# Heading\nSee #project/alpha and #Idea.\nIssue #123 and `#code` too\n```\n#fenced\n```')
    expect(tags.sort()).toEqual(['idea', 'project/alpha'])
  })
})

describe('parseMarkdownFile', () => {
  it('takes the title from front matter, then the first heading, then the file name', () => {
    expect(parseMarkdownFile('a/x.md', '---\ntitle: From FM\n---\n# Heading\ntext').title).toBe('From FM')
    expect(parseMarkdownFile('a/x.md', '# Heading text\nbody').title).toBe('Heading text')
    expect(parseMarkdownFile('notes/weekly_review-plan.md', 'body only').title).toBe('weekly review plan')
    expect(parseMarkdownFile('Daily/2024-05-01.md', 'walked').title).toBe('2024-05-01')
  })

  it('merges front matter and inline tags, lowercased, without #, capped', () => {
    const n = parseMarkdownFile('x.md', '---\ntags: [#Travel, Food]\n---\nBody #food #Extra')
    expect(n.tags).toEqual(['travel', 'food', 'extra'])
  })

  it('keeps wikilinks as plain text and ignores invalid or future dates', () => {
    const n = parseMarkdownFile('x.md', '---\ncreated: 2999-01-01\n---\nSee [[Other note]] and ![[img.png]]')
    expect(n.body).toContain('[[Other note]]')
    expect(n.createdAt).toBeUndefined()
    expect(parseMarkdownFile('x.md', '---\ncreated: 2023-03-04\n---\nhi').createdAt?.getFullYear()).toBe(2023)
  })
})

describe('readMarkdownUpload', () => {
  it('reads notes, skipping hidden folders and non-note files', () => {
    const buf = zipOf({
      'vault/Idea.md': '# Idea\nbody',
      'vault/sub/Plan.markdown': 'plan text',
      'vault/.obsidian/workspace.md': 'config',
      'vault/.trash/Old.md': 'deleted',
      'vault/photo.png': 'binary',
    })
    const r = readMarkdownUpload(buf, 'vault.zip')
    expect(r.notes.map(n => n.path).sort()).toEqual(['vault/Idea.md', 'vault/sub/Plan.markdown'])
    expect(r.skipped.map(s => s.reason).sort()).toEqual(['hidden-folder', 'hidden-folder', 'not-a-note'])
  })

  it('accepts a single Markdown file', () => {
    const r = readMarkdownUpload(Buffer.from('# One\nnote'), 'one.md')
    expect(r.notes).toHaveLength(1)
    expect(r.notes[0].title).toBe('One')
  })

  it('rejects a file that is not a zip with a readable message', () => {
    expect(() => readMarkdownUpload(Buffer.from('not a zip at all'), 'notes.zip')).toThrow(/ZIP/)
  })

  it('never touches the disk, and traversal-style entry names carry no ../ into the preview', () => {
    const r = readMarkdownUpload(zipOf({ '../../evil.md': 'text' }), 'x.zip')
    expect(r.notes).toHaveLength(1)
    expect(r.notes[0].path).not.toContain('..')
  })
})

describe('planMarkdown', () => {
  const note = (title: string, body: string) => ({ path: `${title}.md`, title, body, tags: [] as string[] })

  it('skips empty, too-long and duplicate notes with reasons', async () => {
    const planned = await planMarkdown([
      note('A', 'same text'), note('A', 'same text'), note('B', ''), note('C', 'x'.repeat(MAX_NOTE_CHARS + 1)), note('D', 'fine'),
    ], none)
    expect(planned.map(p => p.status === 'new' ? 'new' : p.reason)).toEqual(['new', 'duplicate-in-zip', 'empty', 'too-long', 'new'])
  })

  it('skips a note already saved, naming the existing item', async () => {
    const planned = await planMarkdown([note('Known', 'text')], { findExisting: async () => ({ id: 'item-9' }) })
    expect(planned[0]).toMatchObject({ status: 'skipped', reason: 'already-saved', existingId: 'item-9' })
  })

  it('stops accepting after the entry limit', async () => {
    const many = Array.from({ length: MAX_MARKDOWN_ENTRIES + 2 }, (_, i) => note(`N${i}`, `body ${i}`))
    const planned = await planMarkdown(many, none)
    expect(planned.filter(p => p.status === 'new')).toHaveLength(MAX_MARKDOWN_ENTRIES)
    expect(planned.at(-1)?.reason).toBe('limit-reached')
  })
})
