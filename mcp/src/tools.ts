import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { MemexClient, MemexError, type FullItem, type ListEntry } from './client.js'

const ITEM_TYPES = ['note', 'recipe', 'media', 'spec', 'stock', 'link', 'book', 'place'] as const

const text = (t: string): CallToolResult => ({ content: [{ type: 'text', text: t }] })
const failure = (t: string): CallToolResult => ({ isError: true, content: [{ type: 'text', text: t }] })

/** Turns a thrown error into a tool result. Only a MemexError carries a message meant for the person. */
async function run(fn: () => Promise<string>): Promise<CallToolResult> {
  try {
    return text(await fn())
  } catch (err) {
    return failure(err instanceof MemexError ? err.message : 'Something went wrong talking to Memex.')
  }
}

function formatEntry(e: ListEntry, n: number): string {
  const meta = [e.type, e.categories.length ? e.categories.join(' > ') : '', e.tags.length ? `tags: ${e.tags.join(', ')}` : '', e.createdAt.slice(0, 10)]
    .filter(Boolean)
    .join(' | ')
  const body = e.summary ?? e.snippet
  return [`${n}. ${e.title}  (id: ${e.id})`, `   ${meta}`, body ? `   ${body.replace(/\s+/g, ' ').trim()}` : '', e.sourceUrl ? `   ${e.sourceUrl}` : '']
    .filter(Boolean)
    .join('\n')
}

function withheldNote(count: number): string {
  if (count <= 0) return ''
  return `\n\n(${count} more ${count === 1 ? 'match is' : 'matches are'} private in Memex and not shown. Do not ask the user to share them here.)`
}

export function formatList(heading: string, results: ListEntry[], withheld: number, extra = ''): string {
  if (results.length === 0) return `${heading}: nothing found.${extra}${withheldNote(withheld)}`
  return `${heading}:\n\n${results.map((e, i) => formatEntry(e, i + 1)).join('\n\n')}${extra}${withheldNote(withheld)}`
}

export function formatItem(item: FullItem): string {
  const lines = [
    `# ${item.title}`,
    `type: ${item.type} | saved: ${item.createdAt.slice(0, 10)} | updated: ${item.updatedAt.slice(0, 10)} | id: ${item.id}`,
    item.categories.length ? `categories: ${item.categories.join(' > ')}` : '',
    item.tags.length ? `tags: ${item.tags.join(', ')}` : '',
    item.sourceUrl ? `source: ${item.sourceUrl}` : '',
    item.summary ? `\nSummary: ${item.summary}` : '',
    `\n${item.content}`,
    item.contentTruncated ? '\n(The note is longer than this; the end was cut off.)' : '',
  ]
  return lines.filter(l => l !== '').join('\n')
}

/** Registers the five Memex tools on an MCP server. */
export function registerTools(server: McpServer, client: MemexClient): void {
  server.registerTool(
    'search_memex',
    {
      title: 'Search Memex',
      description:
        "Search the user's personal notes, recipes, links, books, places and other saved items in Memex by meaning and keywords. " +
        'Use it whenever the user asks what they saved, noted or planned. Returns titles, short summaries and ids; call get_memex_item for the full text. ' +
        'Private items (vault, passwords, anything tagged private) are never returned.',
      inputSchema: {
        query: z.string().min(1).max(500).describe('What to look for, in plain words, e.g. "thai restaurant near the harbour"'),
        limit: z.number().int().min(1).max(20).optional().describe('How many results (default 8)'),
        type: z.enum(ITEM_TYPES).optional().describe('Only items of this type'),
        tag: z.string().min(1).max(100).optional().describe('Only items with this tag'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    ({ query, limit, type, tag }) =>
      run(async () => {
        const r = await client.search(query, { limit, type, tag })
        const extra = r.semantic ? '' : '\n\n(Keyword matches only: Memex could not use meaning-based search just now.)'
        return formatList(`Memex results for "${query}"`, r.results, r.withheldPrivate, extra)
      }),
  )

  server.registerTool(
    'recent_memex_items',
    {
      title: 'Recent Memex items',
      description: 'List the items the user saved most recently in Memex, newest first. Private items are never returned.',
      inputSchema: {
        limit: z.number().int().min(1).max(30).optional().describe('How many items (default 10)'),
        type: z.enum(ITEM_TYPES).optional().describe('Only items of this type'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    ({ limit, type }) =>
      run(async () => {
        const r = await client.recent({ limit, type })
        return formatList('Recently saved in Memex', r.results, r.withheldPrivate)
      }),
  )

  server.registerTool(
    'get_memex_item',
    {
      title: 'Read a Memex item',
      description:
        'Read the full text and details of one Memex item by its id (from search_memex or recent_memex_items). ' +
        'Refuses items that are private in Memex.',
      inputSchema: { id: z.string().min(1).max(100).describe('The item id') },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    ({ id }) => run(async () => formatItem(await client.getItem(id))),
  )

  server.registerTool(
    'save_note_to_memex',
    {
      title: 'Save a note to Memex',
      description:
        "Save a new note in the user's Memex. Memex gives it a type, categories and tags itself. " +
        'Only save what the user asked you to save, and say what you saved. The note is tagged "from-mcp" so the user can find what an assistant added.',
      inputSchema: {
        content: z.string().min(1).max(20000).describe('The text of the note'),
        title: z.string().min(1).max(300).optional().describe('A title; Memex picks one if you leave it out'),
        tags: z.array(z.string().min(1).max(60)).max(10).optional().describe('Extra tags to add'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    ({ content, title, tags }) =>
      run(async () => {
        const r = await client.saveNote({ content, title, tags })
        return `Saved to Memex as "${r.item.title}" (${r.item.type}, id: ${r.item.id}).`
      }),
  )

  server.registerTool(
    'save_link_to_memex',
    {
      title: 'Save a web page to Memex',
      description:
        "Save a web page in the user's Memex: Memex fetches the page, summarises and files it. Saving the same page twice does nothing the second time. " +
        'Only save links the user asked you to save.',
      inputSchema: { url: z.string().url().max(2000).describe('The http(s) address of the page') },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    ({ url }) =>
      run(async () => {
        const r = await client.saveLink(url)
        return r.duplicate
          ? `That page was already in Memex as "${r.item.title}" (id: ${r.item.id}); nothing new was saved.`
          : `Saved to Memex as "${r.item.title}" (${r.item.type}, id: ${r.item.id}).`
      }),
  )
}
