/**
 * Read-only classifier baseline. Never writes to the DB.
 *
 *   npx tsx src/scripts/classifyBaseline.ts run <out.json> [options]
 *   npx tsx src/scripts/classifyBaseline.ts compare <before.json> <after.json>
 *
 * `run` classifies every active item filed under the Tech or Links trees with the *current* classifier and
 * records what it would assign. After mapping changes, run again and `compare` to see which items would be
 * silently re-bucketed.
 *
 * Options for `run`:
 *   --provider gemini,claude   Provider chain, tried in order per item. A failing provider is retried (rate
 *                              limit / timeout / unavailable) with backoff, then the next one is tried. Without
 *                              this flag the normal routing is used (default provider, silent Ollama fallback).
 *   --ollama-fallback          Last resort after the chain, but ONLY if Ollama is already running (health check).
 *                              This script never starts Ollama. Without it, unanswered items stay "failed".
 *   --resume                   Continue an existing <out.json>: keep items already answered, retry the rest.
 *   --force                    Overwrite an existing <out.json> (refused otherwise, so a baseline is never lost).
 *   --limit N                  Only the first N items (for a smoke test).
 *   --concurrency N            Parallel items (default 2).
 *
 * Every entry records the model that answered (`<provider>:<model>`). `compare` only compares items that the
 * SAME model answered in both files, so mixed-model runs cannot show up as "re-bucketed" items.
 * Items that must not leave the machine (cloudSafe) are never sent to a cloud provider: they are answered by
 * Ollama if --ollama-fallback is on and it is running, otherwise recorded as "skipped-private".
 *
 * Output contains private item titles — keep it out of git (sessions/ is ignored).
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import pLimit from 'p-limit'
import { pool } from '../db/client.js'
import { classify } from '../services/classifier.js'
import { AiProviderError } from '../services/ai.js'
import { cloudSafe } from '../services/cloudSafe.js'
import { checkOllamaHealth } from '../services/ollama.js'
import type { ProviderId } from '../services/settings.js'

interface Row {
  id: string
  title: string
  type: string
  content: string
  current: string[]
  tags: string[]
  encrypted: boolean
}

type Status = 'ok' | 'failed' | 'skipped-private'

interface Entry {
  id: string
  title: string
  currentType: string
  currentCategories: string[]
  type: string
  categories: string[]
  confidence: number
  fallback: boolean
  status: Status
  /** `<provider>:<model>` that produced this answer (absent for failed / skipped / legacy entries). */
  model?: string
  /** Set when an earlier provider in the chain failed and a later one answered (why the first one failed). */
  viaFallback?: string
  error?: string
}

interface RunOptions {
  providers: ProviderId[] | null
  ollamaFallback: boolean
  resume: boolean
  force: boolean
  limit?: number
  concurrency: number
}

const VALID_PROVIDERS: readonly ProviderId[] = ['ollama', 'claude', 'gemini', 'openai', 'groq']
const key = (c: string[]) => c.join(' > ')
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const MAX_ATTEMPTS = 3
const BACKOFF_MS = [2000, 5000, 12000]

/** Entries from before this version have no status/model: derive them. */
function normalise(e: Entry): Entry {
  if (e.status) return e
  return { ...e, status: e.fallback ? 'failed' : 'ok' }
}

async function loadItems(limit?: number): Promise<Row[]> {
  const { rows } = await pool.query<Row>(
    `SELECT i.id, i.title, i.type, i.content, i.encrypted,
       COALESCE((SELECT array_agg(c.name ORDER BY ic.depth)
                 FROM item_categories ic JOIN categories c ON c.id = ic.category_id
                 WHERE ic.item_id = i.id), '{}') AS current,
       COALESCE((SELECT array_agg(t.name) FROM item_tags it JOIN tags t ON t.id = it.tag_id
                 WHERE it.item_id = i.id), '{}') AS tags
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

function save(out: string, entries: Entry[]) {
  const tmp = `${out}.tmp`
  writeFileSync(tmp, JSON.stringify({ createdAt: new Date().toISOString(), entries }, null, 2))
  renameSync(tmp, out)
}

/** One item through the provider chain. Never throws. */
async function classifyItem(
  it: Row,
  opts: RunOptions,
  ollamaUp: boolean,
  dead: Set<ProviderId>,
): Promise<Entry> {
  const base = { id: it.id, title: it.title, currentType: it.type, currentCategories: it.current }
  const text = `${it.title}\n\n${it.content}`.slice(0, 4000)
  const safe = cloudSafe({ type: it.type, encrypted: it.encrypted, categories: it.current, tags: it.tags })
  const failed = (error: string): Entry => ({ ...base, type: 'note', categories: [], confidence: 0, fallback: true, status: 'failed', error })

  // Legacy mode: normal routing, exactly the old behaviour.
  if (!opts.providers) {
    try {
      const r = await classify(text)
      return { ...base, type: r.type, categories: r.categories, confidence: r.confidence, fallback: r.confidence === 0, status: r.confidence === 0 ? 'failed' : 'ok', model: r.model }
    } catch (e) {
      return failed(String(e))
    }
  }

  const chain: ProviderId[] = [...opts.providers]
  if (opts.ollamaFallback && ollamaUp) chain.push('ollama')
  const errors: string[] = []
  let skippedPrivate = false

  for (const provider of chain) {
    if (provider !== 'ollama' && !safe) { skippedPrivate = true; continue }
    if (dead.has(provider)) { errors.push(`${provider}: skipped (auth failed earlier)`); continue }

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const r = await classify(text, { provider, cloudSafe: safe })
        if (r.confidence === 0) { errors.push(`${provider}: unparseable answer`); break }
        return {
          ...base, type: r.type, categories: r.categories, confidence: r.confidence, fallback: false, status: 'ok', model: r.model,
          ...(errors.length ? { viaFallback: errors.join('; ') } : {}),
        }
      } catch (e) {
        const kind = e instanceof AiProviderError ? e.kind : 'unavailable'
        const msg = e instanceof Error ? e.message : String(e)
        if (kind === 'auth') { dead.add(provider); errors.push(`${provider}: auth (${msg})`); break }
        if (kind === 'blocked') { errors.push(`${provider}: blocked (${msg})`); break }
        if (kind === 'bad_response') { errors.push(`${provider}: bad response`); break }
        if (attempt === MAX_ATTEMPTS - 1) { errors.push(`${provider}: ${kind} after ${MAX_ATTEMPTS} tries`); break }
        await sleep(BACKOFF_MS[attempt] ?? 12000)
      }
    }
  }

  if (skippedPrivate && errors.length === 0) {
    return { ...base, type: 'note', categories: [], confidence: 0, fallback: false, status: 'skipped-private' }
  }
  return failed(errors.join('; ') || 'no provider available')
}

async function run(out: string, opts: RunOptions) {
  if (existsSync(out) && !opts.resume && !opts.force) {
    console.error(`${out} already exists. Use --resume to continue it or --force to overwrite.`)
    return
  }

  const items = await loadItems(opts.limit)
  const done = new Map<string, Entry>()
  if (opts.resume && existsSync(out)) {
    for (const e of (JSON.parse(readFileSync(out, 'utf8')).entries as Entry[]).map(normalise)) {
      if (e.status === 'ok' || e.status === 'skipped-private') done.set(e.id, e)
    }
  }
  const todo = items.filter((it) => !done.has(it.id))

  const ollamaUp = opts.providers && opts.ollamaFallback ? await checkOllamaHealth() : false
  if (opts.providers && opts.ollamaFallback && !ollamaUp) console.log('Ollama is not running: it will NOT be used (this script never starts it).')
  console.log(
    `${items.length} items; ${done.size} already answered, ${todo.length} to classify (read-only, ` +
      `${opts.providers ? `chain: ${opts.providers.join(' → ')}${ollamaUp ? ' → ollama' : ''}` : 'default routing'})…`,
  )

  const results = new Map<string, Entry>(done)
  const dead = new Set<ProviderId>()
  const gate = pLimit(opts.concurrency)
  const snapshot = () => items.map((it) => results.get(it.id)).filter((e): e is Entry => e !== undefined)
  let count = 0

  await Promise.all(
    todo.map((it) =>
      gate(async () => {
        const entry = await classifyItem(it, opts, ollamaUp, dead)
        results.set(it.id, entry)
        if (++count % 10 === 0) {
          save(out, snapshot()) // keep progress if the connection drops mid-run
          console.log(`  ${count}/${todo.length}`)
        }
      }),
    ),
  )

  const entries = snapshot()
  save(out, entries)

  const by = <T extends string>(f: (e: Entry) => T) => {
    const m = new Map<T, number>()
    for (const e of entries) m.set(f(e), (m.get(f(e)) ?? 0) + 1)
    return [...m].sort((a, b) => b[1] - a[1])
  }
  console.log(`saved ${entries.length} entries → ${out}`)
  console.log('status:', by((e) => e.status).map(([k, n]) => `${k}=${n}`).join('  '))
  console.log('model: ', by((e) => e.model ?? '(none)').map(([k, n]) => `${k}=${n}`).join('  '))
  const viaFallback = entries.filter((e) => e.viaFallback)
  if (viaFallback.length) {
    console.log(`WARNING: ${viaFallback.length} item(s) were answered by a later provider because an earlier one failed. First reason:`)
    console.log(`  ${(viaFallback[0]?.viaFallback ?? '').slice(0, 300)}`)
  }
  const errs = by((e) => (e.error ?? '').slice(0, 90) as string).filter(([k]) => k)
  if (errs.length) console.log('errors:\n' + errs.slice(0, 5).map(([k, n]) => `${String(n).padStart(4)}  ${k}`).join('\n'))
  console.log('top buckets:\n' + by((e) => key(e.categories) || '(none)').slice(0, 15).map(([k, n]) => `${String(n).padStart(4)}  ${k}`).join('\n'))
  if (entries.some((e) => e.status === 'failed')) console.log('Some items failed: re-run the same command with --resume to retry only those.')
}

function compare(beforePath: string, afterPath: string) {
  const load = (p: string) => new Map((JSON.parse(readFileSync(p, 'utf8')).entries as Entry[]).map((e) => [e.id, normalise(e)]))
  const before = load(beforePath)
  const after = load(afterPath)
  const moved: string[] = []
  let same = 0
  let notAnswered = 0
  let modelMismatch = 0
  for (const [id, b] of before) {
    const a = after.get(id)
    if (!a) continue
    if (a.status !== 'ok' || b.status !== 'ok') { notAnswered++; continue }
    if (a.model !== b.model) { modelMismatch++; continue }
    if (key(a.categories) === key(b.categories) && a.type === b.type) same++
    else moved.push(`${b.title.slice(0, 50).padEnd(50)}  [${b.type}] ${key(b.categories) || '-'}  →  [${a.type}] ${key(a.categories) || '-'}`)
  }
  console.log(`${same} unchanged, ${moved.length} re-bucketed`)
  if (notAnswered) console.log(`${notAnswered} not compared: failed or skipped in one of the runs`)
  if (modelMismatch) console.log(`${modelMismatch} not compared: answered by a different model in each run`)
  moved.forEach((m) => console.log('  ' + m))
}

function parseRun(args: string[]): RunOptions | string {
  const flag = (n: string) => args.includes(n)
  const val = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }
  let providers: ProviderId[] | null = null
  const p = val('--provider')
  if (p !== undefined) {
    const list = p.split(',').map((s) => s.trim())
    const bad = list.filter((s) => !(VALID_PROVIDERS as readonly string[]).includes(s))
    if (bad.length || list.length === 0) return `unknown provider: ${bad.join(', ') || '(empty)'}`
    providers = list as ProviderId[]
  }
  const limit = val('--limit') !== undefined ? Number(val('--limit')) : undefined
  const concurrency = val('--concurrency') !== undefined ? Number(val('--concurrency')) : 2
  if (limit !== undefined && !(limit > 0)) return '--limit must be a positive number'
  if (!(concurrency >= 1)) return '--concurrency must be at least 1'
  return { providers, ollamaFallback: flag('--ollama-fallback'), resume: flag('--resume'), force: flag('--force'), limit, concurrency: Math.floor(concurrency) }
}

const [cmd, a, b, ...rest] = process.argv.slice(2)
if (cmd === 'run' && a) {
  const opts = parseRun([b, ...rest].filter((x): x is string => x !== undefined))
  if (typeof opts === 'string') {
    console.error(opts)
    void pool.end()
    process.exit(1)
  }
  run(a, opts).finally(() => pool.end())
} else if (cmd === 'compare' && a && b) {
  compare(a, b)
  void pool.end()
} else {
  console.error('usage: run <out.json> [--provider gemini,claude] [--ollama-fallback] [--resume] [--force] [--limit N] [--concurrency N]\n       compare <before.json> <after.json>')
  void pool.end()
  process.exit(1)
}
