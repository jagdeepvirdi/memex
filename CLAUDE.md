# CLAUDE.md — Memex (Personal Knowledge OS)

## Project Overview
Memex is a personal knowledge management web app that ingests, auto-classifies, and organizes information from multiple sources (Google Keep, URLs, manual entry, files). It handles recipes, media lists, notes, specs, stock tickers, passwords, places, and any freeform content — intelligently tagging and categorizing everything using **local AI (Ollama)**. No cloud AI API costs. Everything runs on your machine.

## Tech Stack
- **Frontend**: React + Vite + TypeScript
- **Styling**: Tailwind CSS + custom design tokens
- **State**: Zustand
- **Animation**: framer-motion
- **PWA**: `vite-plugin-pwa` + Workbox (app shell only; `/api/*` is never cached)
- **Backend**: Node.js + Express (TypeScript)
- **Database**: PostgreSQL (local Docker) — structured categories, tags, items, entities, settings
- **Vector DB**: pgvector (local, inside same PostgreSQL) — semantic search + entity resolution
- **Auth**: Simple local auth — bcrypt + JWT (single user)
- **AI (Primary)**: **Ollama** — runs 100% locally, zero API cost
  - Classification + summarization: `llama3.2` (3B, fast) or `gemma3:4b` (better quality)
  - Embeddings: `nomic-embed-text`
  - JSON mode + Temperature 0.0 enforced for extraction reliability
- **AI (Optional)**: Anthropic Claude, Google Gemini, OpenAI (ChatGPT API) and Groq — cloud providers, off by default. Used only when a key is set (`ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / `OPENAI_API_KEY` / `GROQ_API_KEY`), the provider is selected in Settings, cloud consent (`allow_cloud`) is on, Strict Local Mode is off, and the content passes `cloudSafe()`.
- **AI Routing**: `server/src/services/ai.ts` — single `aiChat()` function with a provider registry (Ollama / Claude / Gemini / OpenAI / Groq); dispatches by DB settings, per-task overrides and the `cloudSafe` guard
- **Secret Storage**: AES-256-GCM client-side encryption (Web Crypto API) — no AI involved
- **URL Parsing**: `https://r.jina.ai/{url}` — free tier, no API key needed for basic use
- **YouTube**: `youtube-transcript` npm package — free, no API key
- **Instagram**: oEmbed endpoint only (login-walled, returns little) — the real source is a caption the user pastes; no scraping
- **File Ingestion**: MarkItDown (Python, optional) — converts PDF/Word/PPT/Excel/images to Markdown

## Docker Compose Setup
`docker-compose.yml` has three services. **postgres** (`pgvector/pgvector:pg16`, host port **5436**, database/user/password `memex`). **app** (built from the root `Dockerfile`): one Node process serving the API and the built web app on port 3002, with `NODE_ENV=production`, `MEMEX_AUTO_MIGRATE=true`, `MEMEX_CLIENT_DIR`; it waits for Postgres to be healthy; compose refuses to start without `JWT_SECRET`. **ollama** (`ollama/ollama`) behind the `ollama` profile only: Ollama normally runs natively on port 11434 (GPU works out of the box) and is **optional** (a cloud-only install does not need it; see README "Path B"). `docker compose up -d` starts postgres + app; development uses `docker compose up -d postgres` (a bare `up` would also start the app on the dev server's port). `npm run db:up` does the latter.

The image installs with `npm install`, not `npm ci`: the lock files were generated on Windows and omit Linux-only optional packages (esbuild platform binaries), so `npm ci` fails on Linux (CI has the same workaround). The compiled entry point is `server/dist/server/src/index.js` (tsc keeps the repo-relative layout because `../shared` is included); `npm start` points there. tsc does not copy `.sql`, so the Dockerfile copies the migrations next to the compiled code.

**Migrations** are never run by `npm run dev`. `memex.sh` / `memex.ps1` run them on every start; otherwise `npm run db:migrate`. The server runs them at startup ONLY when `MEMEX_AUTO_MIGRATE=true` (the Docker image sets it), via `db/migrator.ts` (shared with `npm run migrate`); otherwise it warns that N are pending. The `.env` file lives at the project root.

## Startup, health, first run (L4)
- `lib/startup.ts` `prepareStartup()` runs before `app.listen`: secrets, then a reachable database, then the migration state. A `StartupError` prints `Memex could not start.` plus a readable explanation and exits 1.
- `lib/startupChecks.ts`: `JWT_SECRET` is required; `KEY_ENCRYPTION_SECRET` is checked only when set. A secret is weak if missing, a known example value, shorter than 32 characters, or repetitive. **Production refuses** (`NODE_ENV=production`, unless `MEMEX_ALLOW_WEAK_SECRETS=1`); development only warns. Database errors are mapped to instructions (`describeDatabaseError`), the password is masked, and the public health endpoint uses `hideLocation` so it never reveals user/host/port.
- `GET /api/health` (liveness) and `GET /api/health/status` (public: database ok, migrations applied/pending, Ollama reachable, `autoMigrate`; `degraded` when the database is down or migrations are pending, Ollama being down is NOT a degradation). `GET /api/auth/status` -> `{needsSetup}` (public) lets the login page open setup on a fresh install.
- `lib/serveClient.ts`: in production (or `MEMEX_SERVE_CLIENT=1`) the server serves the built web app (hashed assets cached a year, `index.html` never) with a single-page fallback, mounted BEFORE the auth middleware and never answering `/api`. helmet's CSP keeps its defaults except `img-src` allows `https:` and `upgrade-insecure-requests` is removed (it breaks plain `http://localhost`).
- **First-run wizard** (`client/src/components/setup/AiSetupStep.tsx`, step 0 of `/welcome`): local (Ollama status, continue anyway) or cloud: key -> consent text -> `PUT /api/settings {ai_provider, allow_cloud}` -> `POST /api/ai/test` -> `PUT /api/ai/embedding` (only for a provider that can embed; Claude/Groq need a Gemini/OpenAI key too or local Ollama). It stops at the first failure with a readable message and can be retried. The login page no longer requires Ollama to create the account.
- **Markdown / Obsidian import** (R9-01): `POST /api/ingest/markdown` (multipart `file` = ZIP or one `.md`, optional `dryRun=true`; `services/markdownImport.ts`, client `MarkdownImportPanel` as the Markdown tab of the capture dialog). One note per file, front matter `title`/`tags`/`created` + inline `#tags`, hidden folders skipped, max 500 notes / 20k chars each / 100 MB unpacked, dedupe in the zip and against existing items (same title + text), saved as unreviewed `manual` notes and classified by the normal background job (kind `markdown-import`, `labels` = the imported tags). Nothing is written to disk and the import itself calls no AI.
- **Places inside a note** (`services/notePlaces.ts`, built on the pure helpers in `placeMining.ts`): a note that looks like a travel/place note (type `place`, root category `Travel`, or a strong place word) gets one extra AI call (`task: 'place_mining'`, same `cloudSafe` flag as its classification, failure-soft) that lists the named places; `verifyPlaces` drops any name not in the note, `planNotePlaces` drops countries, bare streets, low confidence, repeats, places already in the library and the note's own destination. `POST /api/ingest/text` returns them as `preview.places` (+ `placesModel`); the capture screen shows tick boxes and `POST /api/items` takes the kept ones as `places` (re-verified and re-deduped server-side, created in the same transaction). Bulk paste / Keep / Markdown imports do it in `enrichBatch` after classification (not for reviewed or split notes). Each place is an unreviewed `place`, `want-to-visit`, tagged `from-note`, `derived_from` its note, filed by type (Hotels / Restaurants / Attractions / Destinations). **Web links:** `POST /api/ingest/url` offers places too (`placesForCapture`, source `url` only, never videos): it reads the first 8000 characters of the scraped page with a "web article" addendum (not the place the article is about or its region), drops type `other` (bus stations, airports), and checks privacy from type/category/tags only (`scanContent: false`: a public guide's phone numbers and addresses would otherwise mark it private, and classifying a URL does not scan page text either). The place call asks for up to 6000 output tokens and `parsePlacesJson` keeps the complete entries from an answer cut off mid-list (a long page used to lose every place). At most 30 places per capture. Verified live with Gemini on a public 60k-character travel guide (30 places).
- **Capture routes survive a failed embedding**: `embedForDuplicateCheck` (in `embedder.ts`) returns `[]` instead of throwing, so the "you may already have this" hint is skipped rather than failing the save. Classification failures still fail the request.

## Ollama Model Setup (local AI only, one-time)
```bash
ollama pull llama3.2
ollama pull nomic-embed-text
```

## Cloud-only first run (verified order)
Account (`POST /api/auth/setup`) → add a key (Settings > Keys & Privacy) → choose the provider + consent (`ai_provider`, `allow_cloud`) → **switch the embedding model** (`PUT /api/ai/embedding {provider:'gemini'}`) → only then save notes. Embeddings default to Ollama and `POST /api/ingest/text` (and the other capture routes) embed synchronously, so with Ollama absent every save fails with `500 "Failed to classify text"` until the embedding model is switched, even when chat already uses a cloud provider. The first-run wizard (L4) must do the switch for the cloud path. Verified on a fresh DB: classification via Gemini, `embedded=1 skippedPrivate=1` for a normal and a `private`-tagged note, `semantic: true` search, a correct cited Ask answer.

## Privacy, provenance, demo data, backup (L5)
- **Content layer in `cloudSafe()`** (`services/cloudSafe.ts`): besides what an item is (encrypted/`password`) and where it is filed (Passwords/Personal, `private`/`no-cloud`/`local-only` tags), `cloudSafeReason(item)` now also looks at what the text says (`looksSensitiveContent`: first 20k chars, URLs and calendar dates stripped, a digit run needs >= 9 digits, strong words such as IBAN/CVV/Aadhaar/account number anywhere, weak words such as PIN/OTP/password only next to a value, a home-address line). First match wins: `encrypted | password | category | tag | content`; `describePrivacyReason` gives the sentence. **Widened 2026-11-25** after a login pasted into an ordinary note went to a cloud AI: `looksSensitiveContent` now also flags a password-shaped token (lower + upper + digit + symbol, 8-64 chars, no dot/slash, not a #hashtag), a known secret-key prefix (`sk-`, `AIza`, `ghp_`, `AKIA`, `xox`, `gsk_`), a `username/login/pwd: value` label, and a ledger-style note (five or more 3-6 digit amounts, not years, making up a third of a short note). Checked on the real library with counts only: 4 more of 811 items flagged, none of them ordinary notes. It applies automatically wherever the caller passes `title`/`content` (classify, re-classify, explain/extract, insights, digest, RAG), and the embedding gate (`embeddingService`) and the switch estimate (`embeddingSwitch`) judge the same `buildEmbedText` text, so the estimate matches what the writer does. Tuned on a real library (counts only): of 813 items, 156 private by category and only 3 more flagged by content.
- **Which AI answered:** `Item.extractionModel` (`items.extraction_model`, `<provider>:<model>`); `GET /api/items/:id` adds `localOnly: {reason, message}` when the item never goes to a cloud AI. `POST /api/items/:id/re-classify` takes an optional `{provider}` (ollama|claude|gemini|openai|groq): "Redo with..." pins that one run; an unusable choice (no key, no consent, private item) answers with the provider error (409/429/502 via `describeActionError`), never silently another model. Client: `components/item/AiProvenance.tsx` (`AiBadge`: "Classified by Gemini" / "Classified locally" / "AI: not recorded" + "Stays on this machine"; `ReClassifyControl`: picker next to the Re-classify button, cloud choices disabled with the reason).
- **Sample data** (`services/demoData.ts`, `routes/demo.ts`, `GET/POST/DELETE /api/demo`): about 40 invented items across every type; every one has `structured.demo = true` and "clear" deletes exactly those. Sample entities are marked `metadata.demo` only when the load created them (an entity the user already has is reused, left unmarked, never deleted); tags are cleared only when nothing else uses them. Loading is one transaction, refuses a second load (409), and calls no AI (the normal worker embeds later). Client: `store/demoStore.ts`, `DemoBanner` in the header (hidden until the server answers and when there is none), `SampleDataPanel` in Settings > Library. `demoData.realdb.test.ts` (opt-in) checks load/clear against the real schema in a rolled-back transaction.
- **Backup/restore** (`npm run backup` / `npm run restore -- <file> --yes`; `lib/backup.ts`, `scripts/backup.ts`, `scripts/restore.ts`): plain-SQL `pg_dump` (no owners/privileges) through the Docker postgres service, or `--local` with `DATABASE_URL`; files go to `./backups` (git-ignored); relative paths are relative to the project root. The dump holds the whole database (items, vault + verifier, api_keys, settings), but NOT the vault master password or `JWT_SECRET`. Restore refuses without `--yes`, refuses a file that is not a complete Memex dump before dropping anything, writes a safety copy first, resets only the `public` schema and runs psql with `ON_ERROR_STOP`. Verified on the real library: restored into a scratch database with every count equal (items, categories, vault config, keys, settings, links, embeddings, vector extension); junk and truncated files refused.

## Security defaults (L6)
- **Loopback by default:** `server/src/index.ts` listens on `HOST` (default `127.0.0.1`; the Docker image sets `0.0.0.0` inside the container) and `docker-compose.yml` publishes the app and Postgres on `127.0.0.1` (`MEMEX_BIND`, `MEMEX_PORT`, `MEMEX_DB_PORT`).
- **CORS** (`lib/corsPolicy.ts`): the bookmarklet route `POST /api/ingest/quicksave` (and its preflight) is open to any origin; everything else answers cross-origin only to localhost/127.0.0.1/[::1] and `MEMEX_CORS_ORIGINS`. The web app is same-origin (prod) or proxied (Vite), so it never needs CORS.
- **Accounts** (`routes/auth.ts`, `describeAccountProblem`): setup needs a valid email, a string password of 10..72 bytes; bcrypt cost 12. Login imposes nothing new.
- **Smoke test:** `bash scripts/smoke-test.sh` (also the `docker-smoke` CI job) builds the image in a separate compose project (`memex_smoke`, ports 3912/5937) and checks first run, auth, sample data, CORS and loopback binding. Dependency advisories are tracked in `SECURITY.md` (0 open on 2026-11-18; the server is on zod 4, so ids use `z.guid()` and records `z.record(z.string(), ...)`, and the client is on react-router-dom 7).

## MCP server (`mcp/`, `routes/mcp.ts`)
An AI assistant (Claude Desktop, Cursor, ...) launches `node mcp/dist/index.js` (stdio, `@modelcontextprotocol/sdk`) with `MEMEX_URL` and `MEMEX_MCP_KEY`; it calls the `/api/mcp` routes over HTTP. **Scope:** the MCP key is a third credential in the auth middleware (after the JWT and the bookmarklet key): `lib/mcpScope.ts` (`isMcpRoute`, `MCP_ROUTES`, `matchesMcpKey`) lets it reach ONLY `GET /api/mcp/search|recent|items/:id` and `POST /api/mcp/notes|links`; everything else is 403. Only `sha256(key)` is stored (`settings.mcp_key_hash`); the key (`mxk_` + 48 hex) is returned once by `POST /api/settings/mcp-key`, `DELETE` revokes. **Privacy:** every item returned goes through `cloudSafeReason()` (encrypted/password/category/tag/content); private ones are dropped from lists (only a `withheldPrivate` count is returned) and refused by id (403); there is deliberately no ask/RAG route; the whole router answers 403 while `strict_local_mode` is on. Saves go through `services/quickSave.ts` (`quickSaveUrl` is the old bookmarklet body, `quickSaveText` classifies a note), tagged `from-mcp`. Tools: `search_memex`, `recent_memex_items`, `get_memex_item`, `save_note_to_memex`, `save_link_to_memex` (read tools carry `readOnlyHint`). Adding a tool means adding its route to `MCP_ROUTES` and tests in `auth.mcp.test.ts` / `routes/mcp.test.ts`. UI: `McpPanel` in Settings > Capture. CI job `mcp` (typecheck, 32 tests, build, `npm audit --omit=dev`). Verified end to end on 2026-11-18 with the built binary over real stdio against a stub API (synthetic data); not yet run against a real assistant.

## Landing page (`site/`)
Static page (no build step) deployed to Vercel as project `memex-site`, served at https://memex.jagdeepsinghvirdi.com (GoDaddy DNS: CNAME `memex` to the target Vercel shows; the certificate had to be issued by hand with `vercel certs issue`). The Vercel project is Git-connected with Root Directory `site`, so every push to `main` redeploys it (do not clear that setting: with an empty root directory the push deploys the repo root and the site 404s); by hand: `vercel deploy --prod` from the repo root. Fonts are self-hosted and nothing loads from a third party. It shows two real app screenshots (`site/img/*.webp`, dark theme) captured on a scratch install with the built-in sample data and no cloud keys; retake them when the UI changes, never from the real library.

## Releases
`v1.2.0` is the current release (tag + GitHub release; body in `RELEASE_NOTES_v1.2.0.md`, history in `CHANGELOG.md`; the v1.1.0 notes stay in `RELEASE_NOTES_v1.1.0.md`). Only the root `package.json` carries the release version; `server/` and `client/` stay at 0.1.0.

## Project Structure
```
memex/
├── client/
│   └── src/
│       ├── components/
│       │   ├── vault/         # Password vault UI
│       │   ├── cards/         # Item cards per type
│       │   ├── sidebar/       # Category tree nav + enrichment ETA widget
│       │   ├── ingest/        # Add new item modal/panel (share-target aware)
│       │   └── search/        # Global search
│       ├── pages/
│       │   ├── Dashboard.tsx       # Insights widget, Rediscover widget, stats
│       │   ├── Category.tsx        # Paginated (Prev/Next)
│       │   ├── Item.tsx            # Edit + delete + Move to Vault button
│       │   ├── Vault.tsx
│       │   ├── Settings.tsx        # Shell for /settings/:tab? (ai | privacy | library | vault | capture): left nav, setup-status strip, shared settings state + toast; one component per tab in components/settings/tabs/
│       │   ├── TableView.tsx       # /items/table — dense table, filters, bulk actions, CSV export
│       │   ├── MediaView.tsx       # /media — movies + books library
│       │   ├── PlacesView.tsx      # /places — travel + restaurant table, Maps integration
│       │   ├── AskMemex.tsx        # /ask — RAG Q&A chat interface
│       │   ├── Welcome.tsx         # /welcome — onboarding persona flow
│       │   ├── SemanticGraph.tsx   # /graph — entity relationship graph
│       │   ├── PendingItems.tsx    # Multi-select + bulk delete
│       │   ├── EnrichedItems.tsx   # Multi-select + bulk delete
│       │   └── Trash.tsx
│       ├── hooks/
│       ├── store/             # Zustand stores
│       └── lib/
│           ├── api.ts         # All API calls including askKnowledge(), rediscover()
│           ├── crypto.ts      # AES-256 vault encryption
│           └── export.ts      # itemsToCsv() + downloadCsv() utilities
├── server/
│   ├── routes/
│   │   ├── ingest.ts          # URL + text + file ingestion; /keep bulk import
│   │   ├── items.ts           # CRUD, /review-all, /rediscover, /enrichment stats
│   │   ├── vault.ts           # Encrypted password CRUD + /migrate/:id + /status + /setup + /rekey + /reset
│   │   ├── search.ts          # Semantic search + /ask RAG endpoint
│   │   └── settings.ts        # GET/PUT /api/settings (key-value store)
│   ├── services/
│   │   ├── ai.ts              # AI routing: Ollama or Claude based on settings
│   │   ├── ollama.ts          # Ollama client — JSON mode, temp 0, model/format params
│   │   ├── classifier.ts      # Auto-classification — JSON mode, enum trick, confidence, multi-entity
│   │   ├── summarizer.ts      # URL/video summarization via Ollama
│   │   ├── embedder.ts        # nomic-embed-text embeddings
│   │   ├── embeddingService.ts  # single vector writer + active model + privacy gate
│   │   ├── retrievalService.ts  # hybrid search/Ask retrieval, keyword fallback
│   │   ├── embeddingConfig.ts   # active embedding model (cached), defaults per provider
│   │   ├── embeddingStatus.ts   # GET /api/ai/embedding: usable/blocked + counts + running job
│   │   ├── embeddingSwitch.ts   # estimate + validated switch of the embedding model
│   │   ├── reembedJob.ts        # resumable, cancellable background re-embed
│   │   ├── embeddingProfiles.ts # per-model similarity thresholds (duplicate / graph / entity) + their basis
│   │   ├── embeddingCalibration.ts # equivalent-strictness calibration + reference snapshot
│   │   ├── entityMerge.ts       # plan + transactional merge of near-duplicate entities
│   │   ├── recipeParser.ts    # Recipe extraction → structured schema
│   │   ├── keepImporter.ts    # Google Keep Takeout ZIP parser
│   │   ├── scraper.ts         # Jina URL fetcher
│   │   ├── entityService.ts   # Entity graph: getOrCreate, link, extractAndLink
│   │   ├── insightService.ts  # AI-generated actionable insights from recent items
│   │   ├── ragService.ts      # RAG Q&A: hybrid vector+FTS search + synthesis
│   │   ├── rediscoveryService.ts  # "On this day" + forgotten items resurfacing
│   │   └── settings.ts        # getSetting(), getAiConfig() DB helpers
│   ├── scripts/
│   │   ├── resolveEntities.ts # Entity merge: dry run by default, --commit to merge
│   │   ├── calibrateEmbedding.ts # Calibrate similarity thresholds for an embedding model on the user's library
│   │   └── seedEntityGraph.ts # One-time script to seed entity graph from existing items
│   └── db/
│       ├── schema.sql
│       └── migrations/
│           ├── 001_initial.sql
│           ├── 002_seed_categories.sql
│           ├── 003 ... 005           # soft delete, reviewed, ...
│           ├── 006_settings.sql      # settings key-value table
│           ├── 007_entity_graph.sql  # entities + item_entities tables
│           ├── 008 ... 023           # confidence, extractions, vault, jobs, priority, derived_from, api_keys ...
│           ├── 024_api_keys_openai.sql   # api_keys CHECK allows an OpenAI key
│           ├── 025_embedding_model.sql   # items.embedding_model / embedding_skip, entities.embedding_model
│           └── 026_api_keys_groq.sql     # api_keys CHECK allows a Groq key (user runs `npm run migrate`)
└── shared/
    └── types.ts
```

## Ollama Service (ollama.ts)
```ts
// Model names driven by env vars (overridable without code change)
const CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL ?? 'llama3.2'
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text'

export async function ollamaChat(
  prompt: string,
  system?: string,
  model?: string,
  format?: string | object,   // pass 'json' to enable JSON mode
  options?: Record<string, any>
): Promise<string>

export async function ollamaEmbed(text: string): Promise<number[]>

export async function checkOllamaHealth(): Promise<boolean>  // polls /api/tags, 3s timeout
```

Key behaviors:
- `temperature: 0` is the default for all extraction calls (deterministic output)
- Pass `format: 'json'` to enable native JSON mode (Ollama enforces valid JSON)
- Model falls back to `CHAT_MODEL` env var if `model` argument is omitted

## AI Routing Layer (ai.ts)
```ts
// Single function for all LLM calls — transparently dispatches to Ollama or Claude
export async function aiChat(
  prompt: string,
  system?: string,
  format?: string | object,
  options?: Record<string, any>
): Promise<string>

// Embeddings always go through Ollama (Anthropic has no embeddings API)
export async function aiEmbed(text: string): Promise<number[]>
```

Routing logic (`aiChat(prompt, system, format, options, signal, { task, provider, cloudSafe, userInitiated, onProvider })`):
- Requested provider = explicit `provider` → per-task override (`ai_task_providers[task]`) → default `ai_provider` (legacy `use_claude=true` migrates to `claude` + consent on read).
- A cloud provider is used only if ALL hold: `strict_local_mode` off, `allow_cloud` on, API key set, `cloudSafe !== false`. Otherwise the call stays on Ollama (`ai_model`, default `llama3.2`).
- An explicit `provider` that can't be honoured is refused with `AiProviderError` (`kind: 'blocked'`), never silently downgraded.
- Provider failures map to one `AiProviderError` (`rate_limit | timeout | auth | blocked | bad_response | unavailable`). Background calls fall back to Ollama (logged); user-initiated/explicit calls surface the error.
- Cloud model ids: `claude_model` / `gemini_model` / `openai_model` / `groq_model` settings → `CLAUDE_MODEL` / `GEMINI_MODEL` / `OPENAI_MODEL` / `GROQ_MODEL` env → defaults `claude-sonnet-5-5` / `gemini-3.8-flash` / `gpt-5.4-mini` / `openai/gpt-oss-120b` (OpenAI retires ids regularly — check the default is current).
- OpenAI (`openaiProvider` in `ai.ts`, `openai` npm package, Chat Completions): sends `max_completion_tokens`; for reasoning models (`o*`, `gpt-5*`) it omits `temperature` and raises a small token cap to at least 1024, because hidden reasoning tokens count against the cap and an empty reply would otherwise come back. JSON calls use `response_format: json_object`. Saving an OpenAI key needs migration 024 (widens the `api_keys.provider` CHECK); without it `PUT /api/ai/keys/openai` returns 503 telling the user to run `npm run migrate`. Embeddings still always go through Ollama.
- Groq (`groqProvider` in `ai.ts`): OpenAI-compatible, so it reuses the `openai` npm package with `baseURL` `https://api.groq.com/openai/v1` and its own key (`GROQ_API_KEY` / Settings). Sends `max_completion_tokens` (Groq deprecated `max_tokens`) and passes `temperature` through. Reasoning models (`gpt-oss`, `qwen3`, `deepseek-r1`) get a token cap of at least 4096 because hidden reasoning counts against it. JSON calls use `response_format: json_object`; a model that answers 400 about it is retried once without the flag (the prompt already asks for JSON). Default model `openai/gpt-oss-120b` (Groq lists `llama-3.3-70b-versatile` / `llama-3.1-8b-instant` as deprecated; the model is editable). Saving a Groq key needs migration 026 (widens the `api_keys.provider` CHECK); without it `PUT /api/ai/keys/groq` returns 503 telling the user to run `npm run migrate`. Groq has no embeddings API, so embeddings stay on Ollama / Gemini / OpenAI. Verified against mocks, the endpoint URL (an invalid key answers 401) and a **live round trip on 2026-11-18** (`npx tsx src/scripts/verifyGroq.ts [model]`, synthetic text only: `openai/gpt-oss-120b` is in Groq's `/models` list, plain and JSON-mode replies work, and a `max_tokens: 16` request still returns text thanks to the reasoning floor). Migration 026 is applied on the author's database.
- `items.extraction_model` records `<provider>:<model>` of the provider that actually answered.
- Privacy guard `services/cloudSafe.ts`: encrypted/`password` items, top-level `Passwords`/`Personal` categories and `private`/`no-cloud`/`local-only` tags never leave Ollama. Calls that bundle several items (insights, digest, RAG) are pinned local if any item is private.
- `GET /api/ai/providers` lists providers + `configured` flags + models (never keys); `POST /api/ai/test {provider}` does one tiny round-trip.

### Embedding bookkeeping (migration 025)
- Every stored vector records the model that made it: `items.embedding_model` / `entities.embedding_model` hold `'<provider>:<model>'` (existing rows were backfilled as `ollama:nomic-embed-text`). `items.embedding_skip = 'private'` marks an item deliberately not embedded (only used once a cloud embedding model is active).
- `services/embeddingService.ts` is the **only** writer of `items.embedding` (`embedAndStoreItem`, never throws; `clearEmbeddingSkip` re-opens a skipped item when its tags/categories change). `activeEmbedding()` is the one place that names the active model. A cloud embedding model may only see items that pass `cloudSafe()`; otherwise the item is marked `embedding_skip = 'private'` and never sent. A skipped item KEEPS any older vector (it belongs to another model, so searches ignore it), which is what makes switching back instant. `embedAndStoreItemDetailed` returns the error too, for batch jobs.
- Every similarity query (search, Ask, related items, graph, duplicate check, `resolveEntities`) filters to the active model, because two models' 768-dim vectors compare without any error and give meaningless scores.
- `services/retrievalService.ts` runs search + Ask retrieval: 70% vector + 30% full-text, unembedded or other-model items score 0 for the semantic part (a NULL rank used to sort FIRST in DESC order), and when the query cannot be embedded it falls back to keyword matching. `POST /api/search` and `/api/ask` return `semantic: false` for keyword-only results.
- **Active model:** settings `embedding_provider` (`ollama` default / `gemini` / `openai`) + `embedding_model` (default per provider: `nomic-embed-text` / `gemini-embedding-001` / `text-embedding-3-small`; ids are settings because providers rename models). `services/embeddingConfig.ts` caches it in memory (`activeEmbedding()` is synchronous; `loadEmbeddingConfig()` runs at startup and must be called again after the setting changes). The setting changes only through `PUT /api/ai/embedding` (below); `PUT /api/settings` refuses `embedding_provider` / `embedding_model` with a 400, so the consent checks cannot be bypassed.
- **`aiEmbed(text, {kind: 'document' | 'query'})`** (`ai.ts`) embeds with the active model. Cloud models are asked for 768 dimensions (fits `vector(768)`), the result is checked (length 768, finite, not all zero) and L2-normalised (Gemini's shortened vectors have norm ~0.59), Gemini gets `RETRIEVAL_DOCUMENT`/`RETRIEVAL_QUERY` (not for `gemini-embedding-2`), 30 s timeout, 3 attempts with backoff on 429/5xx, errors become `AiProviderError` with keys redacted. A cloud model needs the chat rules too (Strict Local off, `allow_cloud` on, key set); otherwise it throws `blocked` and NEVER falls back to another model (search then falls back to keywords). Per-item privacy is the writer's job (`cloudSafe` in `embedAndStoreItem`).
- `GET /api/ai/embedding` → `{provider, model, id, cloud, configured, usable, blockedReason, counts: {embedded, needsReembed, skippedPrivate, pending, total}, job}` (counts only; `job` is the running re-embed, so a page reload can follow it). Encrypted items are never counted or embedded.
- **Switching is three deliberate steps, and only the last sends library text anywhere** (`embeddingSwitch.ts`, `reembedJob.ts`):
  1. `GET /api/ai/embedding/estimate?provider=&model=` is read-only: items, characters, approximate tokens, private items that stay home, items already done, entity names. Without a provider it estimates the active model.
  2. `PUT /api/ai/embedding {provider, model?}` makes it active. A cloud model is refused (409, with the reason) without Strict Local off, `allow_cloud` on and a key; any switch is refused while a re-embed runs. It sends nothing and starts no job; until the library is re-embedded search uses the vectors it has for the new model and keywords for the rest. Switching to Ollama clears `embedding_skip` so private-skipped items become candidates again.
  3. `POST /api/ai/embedding/reembed {confirm: true, id}` → `202 {jobId}`. Needs the literal `confirm: true` and the `id` (`provider:model`) the user saw; a different active model returns 409. Runs as an `ingest_jobs` row of kind `reembed` (poll `GET /api/ingest/jobs/:id`; cancel with `POST /api/ingest/jobs/:id/cancel`; details `{target, stage: items|entities, embedded, skippedPrivate, failures}`).
- **The re-embed job** is resumable (it only takes items whose vector is missing or from another model, never skipped, never encrypted, keyset-paged by id), runs 3 calls at a time, stops at once on a `blocked`/`auth` error and after 5 failures in a row, and is cancellable. It is deliberately not in `AI_JOB_KINDS` (those have 15-20 minute limits; this one has its own 6 hour limit and "one at a time" rule). **Entity names are embedded only by a local model** (an entity cannot tell whether its item was private, and names are only used for same-model fuzzy merging), so under a cloud model `getOrCreateEntity` stores no vector.
- **The background worker** only fills gaps (new items, first attempts that failed); it never switches models. It waits quietly while the active cloud model is blocked, excludes encrypted items, and backs off per item (1, 2, 4 ... 60 minutes, in memory) so a failing item cannot starve the others.
- **Similarity thresholds are per model** (`services/embeddingProfiles.ts`): a cosine score means different things in different models (unrelated notes score ~0.5 in nomic-embed-text and ~0.68 in gemini-embedding-001), so each model has a profile `{duplicate, graph, entity, basis}`. `duplicate` drives the "looks like a note you already saved" hint (`duplicateService`), `graph` the semantic links in `/api/search/graph` (null: no links, `semanticLinks: false`), `entity` the auto-merge of entities (null: never merged). `basis` says how far to trust it: `tuned` (nomic: 0.92 / 0.85 / 0.92), `probe` (gemini-embedding-001: 0.94 / 0.80 / off, from a synthetic probe 2026-11-17: near-duplicates 0.971-0.994, same topic but a different note 0.796-0.870, unrelated 0.610-0.753), `library` (calibrated on the user's library), `default` (a model nobody measured: duplicate 0.97, no graph links, no merges). `GET /api/ai/embedding` reports `thresholds`; Settings shows a note for `probe` / `default`.
- **Calibration** (`scripts/calibrateEmbedding.ts`, `services/embeddingCalibration.ts`) uses "equivalent strictness": there is no ground truth for "duplicate", so it measures what share of item pairs in the library a trusted model's thresholds flag, then finds the thresholds that flag the same share for another model. An item keeps ONE vector, so once the library is re-embedded the old model's vectors are gone: the reference share (`embedding_calibration_reference` setting) must be saved before switching. `switchEmbeddingModel` does that automatically (best effort, only from a `tuned`/`library` model, never overwrites an existing reference); `--save-reference` does it by hand. `--apply` stores `embedding_thresholds[<model id>]` (validated, 0.5-0.9999; the server reads it at startup and on every model switch). The script prints only numbers (never titles or content) and writes nothing without `--save-reference` / `--apply`. It is a calibration, not proof: skim a few flagged pairs before trusting it.
- **Entity merging** (`scripts/resolveEntities.ts`, `services/entityMerge.ts`) is a DRY RUN unless `--commit` is passed. It only compares entities embedded by the same model, uses that model's `entity` threshold (null: skipped and reported), keeps the entity with more links (then the older), lets an entity take part in one merge per run (run again to continue a chain), and merges in one transaction that deletes colliding links first and rolls back on any error. (The old script recovered from a unique-key error inside the transaction, which Postgres cannot do: the transaction is already aborted.)
- **Client:** Settings > AI > "Search & embeddings" (`EmbeddingSettings.tsx`, `useReembedJob.ts`): status and counts, a "paused because ..." banner, Review change (estimate) -> Confirm -> progress with Cancel; a running job is picked up again after a reload. Search and Ask show a notice when a result is keyword-only (`semantic: false`).
- `npx tsx src/scripts/verifyEmbeddingProvider.ts gemini|openai [model]` is a live check with 5 synthetic strings (prints dimensions, norms, a similarity sanity check; writes nothing). Verified for Gemini 2026-11-17; OpenAI is mock-only until a key exists. `verifyChatProvider.ts <openai|groq|gemini|claude> [model ...]` runs the same synthetic checks for any chat provider and several models at once; `switchEmbedding.ts <provider> [model] [--go]` does the estimate (read-only) or, with `--go`, the switch + resumable re-embed without a browser login (numbers only; restart a running server afterwards because it caches the active model). The library was switched to `gemini:gemini-embedding-001` on 2026-11-18 (654 items; the 159 private ones keep an old Ollama vector that searches ignore). `verifyGroq.ts` is the same kind of check for Groq (honours consent and Strict Local, never falls back to Ollama, prints no key).
- `retrievalService.realdb.test.ts`, `reembed.realdb.test.ts`, `entityMerge.realdb.test.ts` and `embeddingCalibration.realdb.test.ts` are opt-in (`MEMEX_REALDB_TEST=1`): they check the ranking and re-embed SQL against the real Postgres inside a rolled-back transaction (with an independent connection confirming nothing leaked). The model call is mocked; nothing is sent to a provider.

## AI Classification (100% local, zero cost)
Classification uses JSON mode + temperature 0 + enum trick for reliability:

```
System prompt includes the full canonical category leaf list so Ollama picks from
known values rather than inventing free-form strings.

Returns JSON:
{
  "type": "note|recipe|media|spec|stock|link|book|place",
  "title": "<inferred title>",
  "categories": ["<canonical leaf from seeded tree>"],
  "tags": ["<tag1>", "<tag2>"],
  "summary": "<2-3 sentences>",
  "confidence": 85,  // 0-100, AI's self-assessed extraction quality
  "structured": {},  // type-specific (see Data Model below)
  "multiEntity": false,   // true if note contains multiple movies/books/places
  "entities": []    // populated when multiEntity=true — each element is a full item
}
```

- On JSON parse failure: retry once with stricter prompt. Second failure: save as `type=note`.
- Multi-entity detection: if `multiEntity=true`, ingest route splits into N separate items.
- Fuzzy category mapping in `classifier.ts` normalises AI output to canonical tree (e.g. "book" → "Media > Books").

## Data Model

### Item
```ts
interface Item {
  id: string
  title: string
  type: 'note' | 'recipe' | 'media' | 'spec' | 'stock' | 'password' | 'link' | 'book' | 'place'
  content: string
  structured: StructuredData
  categories: string[]      // ['Food', 'Bakery', 'Cakes']
  tags: string[]
  source: 'keep' | 'manual' | 'url' | 'youtube' | 'instagram'
  sourceUrl?: string
  embedding?: number[]      // nomic-embed-text, stored in pgvector column
  createdAt: Date
  updatedAt: Date
  encrypted?: boolean
  reviewed: boolean         // user has confirmed AI classification is correct
  confidence?: number       // AI self-assessed extraction quality (0–100)
}
```

### Structured Data per Type
```ts
// Media (movies)
interface MediaData {
  genre?: string; year?: number; director?: string; cast?: string[]
  watched?: boolean
  watchStatus?: 'watched' | 'want-to-watch' | 'watching'
  userRating?: number  // 1-5
  streamingPlatform?: string
  summary?: string
}

// Books
interface BookData {
  author?: string; genre?: string; year?: number
  status?: 'want-to-read' | 'reading' | 'read'
  userRating?: number  // 1-5
  highlights?: string[]
  summary?: string
}

// Places (restaurants, cafés, hotels, attractions, destinations)
interface PlaceData {
  name: string
  type: 'restaurant' | 'cafe' | 'hotel' | 'attraction' | 'destination' | 'other'
  cuisine?: string; city?: string; country?: string; address?: string
  visitStatus: 'visited' | 'want-to-visit' | 'want-to-revisit'
  userRating?: number  // 1-5
  priceRange?: '$' | '$$' | '$$$'
  notes?: string; mapsUrl?: string
}

// Recipes, Stocks, Specs — unchanged from v1
```

### Category Tree (pre-seeded, user can extend)
- Food → Bakery → Cakes / Cookies / Bread
- Food → Savory → Indian / Italian / Thai / Chinese
- Media → Movies → Action / Drama / Horror / Comedy
- Media → Books → Fiction / Non-Fiction / Technical
- Tech → Laptops / Cameras / Phones / Specs
- Finance → Stocks / Crypto / Notes
- Personal → Numbers / Contacts
- Links → YouTube / Instagram / Articles / Docs
- Travel → Destinations / Hotels / Restaurants / Attractions
- Passwords → (vault section, separate)
- Shopping / Real Estate / Courses → top-level leaves added 2026-11-25 (shops and products, property listings, non-tech courses and admissions pages). They are in the classifier prompt (`CANONICAL_LEAVES`), `shopping` no longer fuzzy-maps to Personal, and `refineCategories` moves a bare-Links link to Real Estate / Shopping only when the text plainly says so (`PROPERTY_SIGNAL` / `SHOP_SIGNAL`). A programming or tech course still goes to Tech. They are created on first use (`resolveCategoryPath`) and are not privacy-pinned like Personal.

### Entity Graph (migration 007)
```sql
-- entities: first-class relational entities extracted from items
entities(id, name, type: person|place|organization|other, embedding vector(768), metadata jsonb)
-- UNIQUE on (name, type) — no exact duplicates
-- embedding stored for semantic deduplication via resolveEntities script

-- item_entities: junction table
item_entities(item_id, entity_id, role)  -- role = 'director', 'author', 'cast', 'city', 'exchange', etc.
-- PRIMARY KEY (item_id, entity_id, role)
```

Entity extraction happens in `entityService.extractAndLinkEntities()` — called automatically during item create/update for `media`, `book`, `place`, `stock` types.

### Settings (migration 006)
Key-value table with JSONB values. Default rows:
| key | default |
|---|---|
| `ai_model` | `"llama3.2"` (Ollama chat model) |
| `ai_provider` | `"ollama"` (`ollama` / `claude` / `gemini` / `openai` / `groq`) |
| `ai_task_providers` | `{}` (per-task overrides, e.g. `{"explain":"gemini"}`) |
| `allow_cloud` | `false` (consent to send item content to a cloud provider) |
| `claude_model` / `gemini_model` / `openai_model` / `groq_model` | unset → env → built-in default |
| `use_claude` | `false` (legacy; migrated on read) |
| `auto_lock_timeout` | `15` (minutes) |
| `strict_local_mode` | `false` |
| `embedding_provider` / `embedding_model` | `ollama` / provider default (only via `PUT /api/ai/embedding`) |
| `embedding_thresholds` | `{}` (per-model calibrated `{duplicate, graph, entity}`; written by `calibrateEmbedding.ts --apply`) |
| `embedding_calibration_reference` | unset (share of pairs the trusted model flagged; saved before a model switch) |

## Password Vault Security
- Master password never leaves the browser
- Client-side encryption: AES-256-GCM, key derived via PBKDF2 (100k iterations, SHA-256)
- Salt stored in DB (not secret), ciphertext + IV stored in DB
- Key exists only in memory, cleared on lock / 15-min inactivity
- No AI involved in vault — pure crypto
- **Verifier**: AES-256-GCM encrypted sentinel (`memex-vault-v1`) stored in `vault_config` (migration 015); decrypted on unlock to verify password — wrong password rejected immediately instead of silently loading garbage
- **Password change**: `VaultChangePassword` modal re-derives key from new password + fresh random salt, decrypts every item with old key, re-encrypts with new key, submits atomically via `PUT /api/vault/rekey`
- New endpoints: `GET /vault/status`, `POST /vault/setup`, `PUT /vault/rekey`, `POST /vault/reset`
- `POST /api/vault/migrate/:id` — encrypts an existing plain-text item and hard-deletes the original (Move to Vault flow)

## Google Keep Import
1. User uploads Google Takeout ZIP
2. Server extracts `Keep/*.json` files (handles both `Keep/*.json` and `Takeout/Keep/*.json` paths)
3. Notes saved instantly to DB with `structured={}`, then queued for Ollama classification
4. Background enrichment queue processes at up to 3 concurrent; Sidebar shows live progress + ETA
5. Deduplicate within the uploaded ZIP by MD5 of title + text (in memory, per import only — `items.content_hash` is never written, so a re-import is not deduped against the DB). URL items are deduped separately: same `source_url` in any spelling (`findItemsBySourceUrl`) plus embedding near-duplicates (`duplicateService.ts`)
6. User reviews classified items; can override categories on Item page

## URL / YouTube / Instagram / File Ingestion
- **Generic URL**: `https://r.jina.ai/{url}` → clean Markdown → Ollama classify
- **YouTube**: `youtube-transcript` → transcript + title → Ollama classify
- **Instagram**: oEmbed (thin placeholder) or a pasted caption (`source='instagram'`) → Ollama classify; classified by topic, not by where it was posted
- **Files (MarkItDown)**: PDF, DOCX, PPTX, XLSX, CSV, images, EPUB → Markdown → Ollama classify
  - Requires `pip install 'markitdown[all]'` (one-time, Python 3.10+)
  - Server returns HTTP 503 with install instructions if not present
  - Health check: `GET /api/ingest/markitdown/health`

## RAG Q&A (`/ask`)
`ragService.askKnowledge(question)`:
1. Embed question with nomic-embed-text
2. Hybrid search: 70% vector similarity + 30% full-text rank, top 10 results
3. Build context block from top results (title + first 1000 chars each)
4. Synthesize answer via `aiChat()` with strict citation rules
5. Return `{ answer: string, sources: Item[] }` — sources shown as citations in UI

## Rediscovery / Serendipity (`/items/rediscover`)
`rediscoveryService.getRediscoveryItems()` returns up to 2 items:
- "On this day" — same month+day, different year
- "Random / Forgotten" — created > 30 days ago, random order

Displayed in Dashboard as a "Rediscover" widget.

## Actionable Insights (`/api/items/insights`)
`insightService.generateInsights()`:
- Fetches 20 recent + 10 random reviewed items
- Sends to `aiChat()` requesting 1–3 insights as JSON array
- Insight types: `event`, `habit`, `connection`, `suggestion`
- Returns max 3 `Insight` objects, displayed in Dashboard with animated stagger

## PWA
`vite.config.ts` uses `vite-plugin-pwa` with Workbox:
- App shell only is precached. **API responses are not cached**: the server sends `Cache-Control: private, no-store` on every `/api` response (`lib/apiCachePolicy.ts`), and the client deletes the old `api-cache` Cache Storage entry at startup and on logout (`lib/pwaCache.ts`), because cached library data outlived logout. Consequence: no offline reading of items.
- Share target: `/?share=true` with `title`, `text`, `url` params — Dashboard IngestPanel handles these
- Manifest: dark theme (`#0D0D0D`), standalone display, maskable icons

## New Client Pages / Routes
| Route | Component | Description |
|---|---|---|
| `/ask` | `AskMemex.tsx` | RAG chat — ask questions, get cited answers |
| `/welcome` | `Welcome.tsx` | 3-step onboarding persona flow |
| `/items/table` | `TableView.tsx` | Dense table with filters, bulk review, CSV export |
| `/media` | `MediaView.tsx` | Movies + books library, inline status/rating edit |
| `/places` | `PlacesView.tsx` | Places/travel table, visit status, Maps link, CSV export |
| `/graph` | `SemanticGraph.tsx` | Entity relationship graph |

## CSV Export (`client/src/lib/export.ts`)
`itemsToCsv(items)` — flattens `structured` fields with `s_` prefix, joins arrays.
`downloadCsv(csv, filename)` — triggers browser download.
Available in TableView, MediaView, PlacesView.

## Performance Reality
| Model | Classification time (CPU) | Classification time (GPU) |
|---|---|---|
| llama3.2 (3B) | 3–8 seconds | ~1 second |
| gemma3:4b | 5–10 seconds | ~1.5 seconds |
| nomic-embed-text | ~200ms | ~50ms |

For bulk Keep imports: save instantly, classify in background queue (3 concurrent). Sidebar shows progress + live ETA.

## Environment Variables
```env
DATABASE_URL=postgresql://memex:memex@localhost:5432/memex
OLLAMA_URL=http://localhost:11434
PORT=3001
JWT_SECRET=<generate a random 32-char string>

# Ollama model overrides (optional — defaults are in code)
OLLAMA_CHAT_MODEL=llama3.2
OLLAMA_EMBED_MODEL=nomic-embed-text

# Cloud providers (optional — a key only makes a provider available; see AI Routing)
ANTHROPIC_API_KEY=
CLAUDE_MODEL=claude-sonnet-5-5
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.8-flash
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4-mini
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-120b

# YouTube Data API (optional — video descriptions for Explain / Extract recipe / classification)
YOUTUBE_API_KEY=

# Encrypts keys saved from Settings (optional — defaults to JWT_SECRET)
KEY_ENCRYPTION_SECRET=
```

AI provider, per-task providers, cloud consent and model selection are runtime settings via `PUT /api/settings` — no restart needed.

**API keys (Claude, Gemini, OpenAI, Groq, YouTube)** come from the environment OR from Settings > API keys; the environment wins. Saved keys live in their own `api_keys` table (migration 023), encrypted with AES-256-GCM (key derived from `KEY_ENCRYPTION_SECRET`, else `JWT_SECRET`; the provider name is bound in as AAD), **never in `settings`** (which `GET /api/settings` returns wholesale). Keys are write-only: `GET /api/ai/keys` returns `{configured, source, last4}` only, `PUT/DELETE /api/ai/keys/:provider` save/remove, `POST /api/ai/keys/youtube/test` checks the YouTube key. These routes require a real login session — the bookmarklet key is refused (see below). `services/apiKeys.ts` owns storage, precedence and `redactSecrets()` (provider errors never carry a key). If `JWT_SECRET`/`KEY_ENCRYPTION_SECRET` changes, saved keys become unreadable and must be re-entered. `services/youtubeApi.ts` sends the key in the `X-Goog-Api-Key` header (never the URL) and returns null when there is no key, Strict Local Mode is on, or the API fails.

## Automatic recipe extraction on save (`services/autoRecipe.ts`)
Saving a YouTube video the classifier called a recipe (`structured.videoKind === 'recipe'`), or a web link filed under Food that is not already a recipe, queues the existing Extract recipe job in the background (`POST /api/items` calls `queueRecipeExtraction` after the commit; it never blocks or fails the save). A recipe web page is already typed `recipe` with ingredients/steps by `classify`, so it needs no job. The queue is in memory and runs one job at a time (the AI-job rule), waiting up to 30 min for a running job; a restart forgets waiting items and the Extract recipe button still works. The saved link only gets `structured.recipeExtraction` = `queued | found {recipeId} | none {reason} | failed {reason}`; the Item page shows a one-line note for `queued`/`none`/`failed` (a found recipe is listed as a derived item). "No recipe" is a normal answer, never an invented recipe (the extractor's yes/no gate and completeness checks still apply). A new recipe keeps the video's deeper Food path when it has no cuisine of its own (`recipeCategories`). **Gemini fix found on the way:** Gemini's thinking tokens count against `maxOutputTokens`, so the recipe gate's 60-token cap (and Settings' "Test Gemini", 16) came back as "Gemini returned no text"; the Gemini provider now floors the cap at 1024 (`GEMINI_MIN_OUTPUT_TOKENS`, like the OpenAI/Groq reasoning floors). Verified live on 2026-11-25 with Gemini on three public cooking videos (two recipes found with 9 and 13 ingredients, one thin video correctly "none found").

## On-demand AI jobs (Explain, Extract recipe)
Both run as background jobs on the `ingest_jobs` table (needs migration 021). `POST /api/items/:id/explain` and `/extract-recipe` validate, create a job (`services/actionJobs.ts`) and return `202 { jobId }`; the work runs in `explainJob.ts` / `extractRecipeJob.ts`. Poll `GET /api/ingest/jobs/:id` — `progress`, `details.stage` (explain: reading / summarising part n of N / writing; extract: reading / checking / extracting) — then read the result: Explain saves `item.structured.explanation`; Extract creates a NEW unreviewed recipe item (`derived_from`) and completes with `details.found` + `recipeId`, or `found:false` + `reason` ("no recipe" is a normal outcome, not a failure). Failures are stored as a readable `error` (`services/actionErrors.ts`). Only **one AI job runs at a time** across both kinds (409 otherwise; a job older than 20 min counts as dead), with a 15 min cap.
**Cancel:** `POST /api/ingest/jobs/:id/cancel` → `202 {status:'cancelling'}` when its runner is alive (it aborts the runner's AbortController, which cancels the Ollama/cloud call mid-flight; the runner then marks the job `cancelled` and saves/creates nothing — it also checks the signal just before saving, so a cancel that lands as the last call returns still wins), `200 {status:'cancelled'}` for an orphaned job (server restarted: just clears the stale row so it stops blocking), 409 if already finished, 400 for other job kinds, 404 if unknown. The registry of runners is in memory (`services/jobControl.ts`). `cancelled` jobs don't count as running. Client: `useActionJob` (poll, resume after leaving the page via sessionStorage, Cancel button).

## GitHub repo facts (stars, language, last push)
**Recognising a repo page:** `detectGithubRepoSubject` treats the saved source URL as the subject even when the README links to other repos (it used to give up when it saw several `github.com/...` mentions, so a normal scraped repo page such as Express came out as a generic `spec` with no stats). Text with no source URL of its own that lists several repos is still ambiguous (multi-entity split). When a repo is detected, `classify` appends `GITHUB_ADDENDUM`, which asks for `structured.whatItDoes` as 1-2 plain sentences for a non-programmer (what it is, then what you would use it for). **Category:** a repo with an AI signal (`AI_SIGNAL` over the model's text, the repo name and the top of the README) is `Tech > AI > Repos`; any other repo is `Tech > Repos` (created on first use by `resolveCategoryPath`). Verified live on 2026-11-25 with Gemini on two public repos (a web framework -> Tech > Repos, a coding agent -> Tech > AI > Repos, both with stars/language/last push and a plain `whatItDoes`).
Repo items (`structured.kind` + a real `owner/repo` from `repoName`/`repoUrl`, validated by `repoSlugFromStructured`) get `structured.github` (`GithubRepoMeta` in `shared/types.ts`: stars, forks, language, description, topics, SPDX licence, pushedAt, archived, isFork, homepage, fetchedAt). `services/githubApi.ts` does one unauthenticated `GET https://api.github.com/repos/{owner}/{repo}` (generic `User-Agent: memex-local`, 8 s timeout, no token — 60 requests/hour per IP) and sends only the public `owner/repo`. It is **never called in Strict Local Mode**, caches answers (6 h; a 404 for 10 min) and stops calling GitHub after a rate limit until its reset time. Automatic lookup happens once, at the end of `classify()` (`withGithubMeta`, so every capture and re-classify path gets it before any DB transaction) and is failure-soft (null on any problem). `POST /api/items/:id/github` (the Refresh button, `GithubMeta.tsx` on the Item page; ★/language on `LinkCard`) always asks afresh and maps failures to 404 not found / 429 rate limited (+`resetAt`) / 409 Strict Local / 422 not a repo / 502 unavailable. Tests mock `./githubApi` — nothing in the suite touches the network.
**README fallback:** when Jina fails (e.g. `Forbidden`) or returns empty content for a plain `github.com/owner/repo` URL, `scrapeGeneric` (`scraper.ts`) takes the README from `GET /repos/{owner}/{repo}/readme` instead (`fetchGithubReadme` in `githubApi.ts`, `Accept: application/vnd.github.raw+json`, capped at 20k chars; title `owner/repo`, content `# owner/repo` + README). It shares the metadata lookup's rules: Strict Local blocks it, one 403/429 pauses both through the same rate-limit gate, and any failure returns the old "Failed to extract content" placeholder. A repo can now cost two API calls of the 60/hour. Without it, a blocked Jina page left the classifier with only the bare URL, so the summary came from the model's memory (fine for famous repos, unreliable for obscure ones). Tests: `githubApi.test.ts` (`fetchGithubReadme`) and `scraper.githubReadme.test.ts`.

## Bookmarklet key scope
The "Save to Memex" bookmarklet authenticates with a persistent key (`settings.bookmarklet_key`, 48 hex chars) that sits inside a browser bookmark — the weakest credential in the app. The auth middleware (`index.ts`) therefore lets it make **one request only: `POST /api/ingest/quicksave`** (`lib/bookmarkletScope.ts`; exact method + path, query/trailing slash/case ignored). Any other route with that key returns 403; reading items, exports, vault, settings (including the key itself), API keys and every other write need a login session. The key is compared in constant time against the bare string `pg` returns for JSONB (an earlier version compared against a JSON-quoted string, so the bookmarklet never authenticated). Regenerating the key (Settings) invalidates the old one at once. If the bookmarklet ever needs a second endpoint, add it to `BOOKMARKLET_ROUTES` and its test.

## Code Style
- TypeScript strict mode, no `any`
- Zod for all API request validation
- Optimistic UI updates
- Error boundaries on all major sections
- Background jobs for heavy processing (classification queues)

## Design System
Two palettes, **Midnight** (dark, default) and **Daylight** (light), as CSS variables in `client/src/index.css` (RGB triplets, so Tailwind opacity modifiers work); `tailwind.config.ts` maps every colour to them. `<html data-theme="dark|light">` switches them: `client/public/theme-init.js` sets it before first paint (a file, not an inline script, because the server's CSP only allows `'self'` scripts) from `localStorage['memex-theme']` (`light` / `dark`, absent = follow the system), `lib/theme.ts` (`setThemePref`, `useResolvedTheme`, `useThemePref`) changes it, `ThemeToggle` in `AppHeader` cycles system / light / dark, and Settings > Appearance (`AppearanceTab`) has the same choice as three radio cards. The choice is per browser, not a server setting.
- Tailwind's `white` is remapped to the overlay tint (`--c-overlay`: white in dark, ink in light), so `bg-white/5` / `border-white/10` work in both; the standard `green/red/amber/orange/yellow/blue/teal/purple/emerald/gray` shades the app uses are variables too (deeper in light). Do NOT add new hardcoded hex colours or other palette shades: use the tokens (a new shade needs a `--x-NNN` pair in both blocks and an entry in `shades()`). Solid white text: `text-[#fff]`.
- Canvas drawing (the graph) cannot use CSS variables: `SemanticGraph.tsx` keeps one palette per theme (`GRAPH_PALETTE`).
- Midnight: bg `#0B0E14`, surface `#141922`, text `#E9EEF6`, muted `#8895A7`. Daylight: bg `#F5F7FB`, surface `#FFFFFF`, text `#121826`, muted `#5B687C`.
- Accent "Iris": `#7C83FF` (dark) / `#5558E8` (light); vault teal `#5EEAD4` / `#0F766E`; type badges rose / sage / lilac / sky. The landing page (`site/style.css`) uses the same values and follows `prefers-color-scheme`.
- Fonts are self-hosted (no request to Google): variable latin woff2 files in `client/src/assets/fonts` (SIL OFL, from @fontsource), `@font-face` at the top of `client/src/index.css`, precached by the PWA (`workbox.globPatterns` includes woff2). Other scripts use the fallback stacks.
- Font display: `Playfair Display`
- Font body: `DM Sans`
- Font mono: `JetBrains Mono`
- Radius: `12px` cards, `8px` inputs

## Cost Summary
| Feature | Cost |
|---|---|
| Classification of every item | $0 — Ollama |
| Semantic search + RAG embeddings | $0 — Ollama |
| URL summarization | $0 — Ollama |
| Actionable insights generation | $0 — Ollama |
| Entity extraction + resolution | $0 — Ollama |
| URL content fetch | $0 — Jina free |
| YouTube transcripts | $0 — no API key |
| Database + server | $0 — local Docker |
| **Monthly total** | **$0** |

## Non-Goals (v1)
- No cloud hosting — runs on your laptop/desktop
- No real-time collaboration
- Cloud AI (Claude/Gemini/OpenAI/Groq) is never the default — it requires a key, an explicit provider choice and cloud consent in Settings, and is blocked by Strict Local Mode and the `cloudSafe` guard
