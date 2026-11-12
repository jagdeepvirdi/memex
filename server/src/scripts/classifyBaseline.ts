/**
 * Read-only classifier baseline. Never writes to the DB.
 *
 *   npx tsx src/scripts/classifyBaseline.ts run <out.json> [--limit N]
 *   npx tsx src/scripts/classifyBaseline.ts compare <before.json> <after.json>
 *
 * `run` classifies every active item filed under the Tech or Links trees with the
 * *current* classifier and records what it would assign. After mapping changes, run
 * again and `compare` to see which items would be silently re-bucketed.
 * Run BOTH the before and after passes with the same bounds so results are comparable:
 *   OLLAMA_NUM_PREDICT=768 OLLAMA_TIMEOUT_MS=60000 npx tsx src/scripts/classifyBaseline.ts run <out.json>
 *
 * Output contains private item titles — keep it out of git (sessions/ is ignored).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import pLimit from 'p-limit'
import { pool } from '../db/client.js'
import { classify } from '../services/classifier.js'

interface Row {
  id: string
  title: string
  type: string
  content: string
  current: string[]
}

interface Entry {
  id: string
  title: string
  currentType: string
  currentCategories: string[]
  type: string
  categories: string[]
  confidence: number
  fallback: boolean
  error?: string
}

const key = (c: string[]) => c.join(' > ')

async function loadItems(limit?: number): Promise<Row[]> {
  const { rows } = await pool.query<Row>(
    `SELECT i.id, i.title, i.type, i.content,
       COALESCE((SELECT array_agg(c.name ORDER BY ic.depth)
                 FROM item_categories ic JOIN categories c ON c.id = ic.category_id
                 WHERE ic.item_id = i.id), '{}') AS current
     FROM items i
     WHERE i.deleted_at IS NULL AND i.type <> 'password' AND NOT i.encrypted
       AND EXISTS (
         SELECT 1 FROM item_categories ic JOIN categories c ON c.id = ic.category_id
         LEFT JOIN categories p ON p.id = c.parent_id
         WHERE ic.item_id = i.id
           AND (c.name IN ('Tech','Links') OR p.name IN ('Tech','Links')))
     ORDER BY i.created_at
     ${limit ? `LIMIT ${Math.floor(limit)}` : ''}`,
  )
  return rows
}

async function run(out: string, limit?: number) {
  const items = await loadItems(limit)
  console.log(`classifying ${items.length} items (local model, read-only)…`)
  const gate = pLimit(2)
  let done = 0
  const entries = await Promise.all(
    items.map((it) =>
      gate(async (): Promise<Entry> => {
        const base = { id: it.id, title: it.title, currentType: it.type, currentCategories: it.current }
        try {
          const r = await classify(`${it.title}\n\n${it.content}`.slice(0, 4000))
          return { ...base, type: r.type, categories: r.categories, confidence: r.confidence, fallback: r.confidence === 0 }
        } catch (e) {
          return { ...base, type: 'note', categories: [], confidence: 0, fallback: true, error: String(e) }
        } finally {
          if (++done % 10 === 0) console.log(`  ${done}/${items.length}`)
        }
      }),
    ),
  )
  writeFileSync(out, JSON.stringify({ createdAt: new Date().toISOString(), entries }, null, 2))
  const buckets = new Map<string, number>()
  for (const e of entries) buckets.set(key(e.categories), (buckets.get(key(e.categories)) ?? 0) + 1)
  console.log(`saved ${entries.length} entries → ${out}  (fallbacks: ${entries.filter((e) => e.fallback).length})`)
  console.log([...buckets].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, n]) => `${String(n).padStart(4)}  ${k || '(none)'}`).join('\n'))
}

function compare(beforePath: string, afterPath: string) {
  const load = (p: string) => new Map((JSON.parse(readFileSync(p, 'utf8')).entries as Entry[]).map((e) => [e.id, e]))
  const before = load(beforePath)
  const after = load(afterPath)
  const moved: string[] = []
  let same = 0
  for (const [id, b] of before) {
    const a = after.get(id)
    if (!a) continue
    if (key(a.categories) === key(b.categories) && a.type === b.type) same++
    else moved.push(`${b.title.slice(0, 50).padEnd(50)}  [${b.type}] ${key(b.categories) || '-'}  →  [${a.type}] ${key(a.categories) || '-'}`)
  }
  console.log(`${same} unchanged, ${moved.length} re-bucketed`)
  moved.forEach((m) => console.log('  ' + m))
}

const [cmd, a, b, ...rest] = process.argv.slice(2)
if (cmd === 'run' && a) {
  const li = [b, ...rest].indexOf('--limit')
  const limit = li >= 0 ? Number([b, ...rest][li + 1]) : undefined
  run(a, limit).finally(() => pool.end())
} else if (cmd === 'compare' && a && b) {
  compare(a, b)
  void pool.end()
} else {
  console.error('usage: run <out.json> [--limit N] | compare <before.json> <after.json>')
  void pool.end()
  process.exit(1)
}
