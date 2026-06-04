# GEMINI.md — Memex (Personal Knowledge OS)

## Project Context

Memex is a local-first personal knowledge management system. It uses local AI (Ollama) to classify, organize, and connect notes, recipes, media, places, and more. Everything runs on the user's own machine — no cloud costs, no telemetry.

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + TypeScript (strict) |
| Styling | Tailwind CSS + custom design tokens |
| Animation | framer-motion |
| PWA | vite-plugin-pwa + Workbox (NetworkFirst for `/api/*`) |
| State | Zustand |
| Backend | Node.js + Express (TypeScript) |
| Database | PostgreSQL 16 + pgvector (Docker) |
| Logging | pino (structured; level: silent in tests) |
| Auth | bcrypt + JWT; express-rate-limit (10 req/15 min on login + setup) |
| AI — chat | Ollama (`llama3.2` or `gemma3:4b`) |
| AI — embeddings | Ollama (`nomic-embed-text`, 768 dims) |
| AI — vision | Ollama vision model (auto-detected: `llama3.2-vision` → `llava:7b` → `llava`) |
| AI — optional | Anthropic Claude API (opt-in via Settings, never automatic for ingestion) |
| File ingestion | MarkItDown (Python CLI, optional) |
| Voice transcription | OpenAI Whisper CLI (Python, optional) |
| Security | Web Crypto API (AES-256-GCM) for client-side vault encryption |

## Ports (local dev)

| Service | Port |
|---|---|
| Frontend (Vite dev) | 5175 |
| Backend (Express) | 3002 |
| PostgreSQL (Docker) | 5436 (host) → 5432 (container) |
| Ollama | 11435 (host) → 11434 (container) |

## Strategic Guidelines

1. **Local AI first** — always use Ollama for classification, embeddings, and summarization. Claude API is only called when `use_claude = true` in DB settings AND `ANTHROPIC_API_KEY` is set.
2. **Security** — vault encryption (`client/src/lib/crypto.ts`) must not be weakened. Master passwords never leave the browser.
3. **Surgical edits** — preserve existing logic and style when modifying files.
4. **No `console.*`** — use `import logger from '../lib/logger.js'` in all server code. Logger is silenced in tests automatically.
5. **Zod at boundaries** — validate all incoming API request bodies with Zod; trust internal code.
6. **Migrations over schema edits** — add numbered SQL files in `server/src/db/migrations/`; update `schema.sql` header comment to reflect the new count.

## AI Routing (`server/src/services/ai.ts`)

Single `aiChat()` function — dispatches to Ollama or Claude based on DB settings. Embeddings always go through Ollama (Anthropic has no embeddings API). All AI calls in classification/summarization go through this layer.

## Classification Pipeline

`classify(text)` in `server/src/services/classifier.ts`:
- Ollama JSON mode + temperature 0 + enum trick (canonical category leaf list in prompt)
- Returns: `type`, `title`, `categories`, `tags`, `summary`, `confidence` (0–100), `structured`, `multiEntity`, `entities`
- On JSON parse failure: retry once with stricter prompt → fallback to `type=note`
- Multi-entity detection: if `multiEntity=true`, ingest route splits into N separate items
- Fuzzy category mapping: AI output is normalised to the canonical tree before DB write

## Database Migrations (15 total)

| # | File | Summary |
|---|---|---|
| 001 | `001_initial_schema.sql` | Core tables: items, categories, tags, vault, users |
| 002 | `002_seed_categories.sql` | Canonical category tree |
| 003 | `003_items_depth_softdelete.sql` | `deleted_at`, `depth` on `item_categories` |
| 004 | `004_item_versions.sql` | `item_versions` table + trigger |
| 005 | `005_ai_review.sql` | `reviewed` column |
| 006 | `006_settings.sql` | `settings` key-value table |
| 007 | `007_entity_graph.sql` | `entities` + `item_entities` tables |
| 008 | `008_confidence.sql` | `confidence FLOAT` on items |
| 009 | `009_data_provenance.sql` | `raw_content`, `extraction_model`, `item_extractions` table |
| 010 | `010_place_type.sql` | `place` value in `item_type` enum |
| 011 | `011_reminders.sql` | `remind_at TIMESTAMPTZ` on items |
| 012 | `012_sharing.sql` | `public_token TEXT UNIQUE` on items |
| 013 | `013_share_expiry.sql` | `share_expires_at TIMESTAMPTZ` on items |
| 014 | `014_ingest_jobs.sql` | `ingest_jobs` table (DB-backed job store) |
| 015 | `015_vault_verifier.sql` | `verifier`, `verifier_iv` columns on `vault_config` |

## Server Routes

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/login` | Login (rate-limited: 10/15 min/IP) |
| POST | `/api/auth/setup` | First-user setup (rate-limited) |
| GET | `/api/auth/me` | Verify token |
| GET | `/api/items` | List with filters |
| POST | `/api/items` | Create item |
| GET | `/api/items/:id` | Get item |
| PUT | `/api/items/:id` | Update item |
| DELETE | `/api/items/:id` | Soft-delete item |
| DELETE | `/api/items/bulk` | Bulk soft-delete |
| PUT | `/api/items/review-all` | Mark all enriched Keep notes reviewed |
| POST | `/api/items/enrich` | Re-run AI enrichment on all unreviewed items |
| GET | `/api/items/stats` | Item counts by type |
| GET | `/api/items/enrichment` | Pending vs total enrichment counts |
| GET | `/api/items/insights` | AI-generated actionable insights (3 max, 15s timeout) |
| GET | `/api/items/rediscover` | "On this day" + forgotten item |
| GET | `/api/items/digest` | Weekly digest (this week + on this day + AI connection, 15s timeout) |
| GET | `/api/items/reminders/due` | Items with `remind_at <= NOW()` |
| POST | `/api/items/nl-filter` | NL → structured filter via Ollama |
| GET | `/api/items/export/obsidian` | ZIP of Markdown files with YAML frontmatter |
| GET | `/api/items/:id/extractions` | AI extraction history for an item |
| POST | `/api/items/:id/apply-extraction/:eid` | Apply a past extraction to an item |
| POST | `/api/items/:id/share` | Mint public token (7-day expiry) |
| DELETE | `/api/items/:id/share` | Revoke public token |
| GET | `/api/share/:token` | Public read-only item (no auth; rejects expired tokens) |
| POST | `/api/ingest/url` | Scrape URL → classify preview |
| POST | `/api/ingest/text` | Classify plain text |
| POST | `/api/ingest/file` | Image → vision AI; document → MarkItDown (50 MB limit) |
| POST | `/api/ingest/voice` | Audio → Whisper → classify (100 MB limit) |
| POST | `/api/ingest/keep` | Parse Keep ZIP (500 MB limit) |
| POST | `/api/ingest/keep/bulk` | Save notes + start background enrichment job |
| GET | `/api/ingest/jobs/:id` | Background job progress (DB-backed) |
| GET | `/api/ingest/markitdown/health` | MarkItDown install status |
| GET | `/api/ingest/vision/health` | Vision model availability |
| GET | `/api/ingest/whisper/health` | Whisper CLI install status |
| POST | `/api/ingest/quicksave` | One-shot scrape + classify + save (bookmarklet) |
| GET | `/api/categories` | Category tree with item counts |
| POST | `/api/categories` | Create category |
| PUT | `/api/categories/:id` | Update category |
| DELETE | `/api/categories/:id` | Delete category |
| GET | `/api/categories/anomalies` | Rogue root categories with preview items |
| POST | `/api/categories/remap` | Bulk reassign rogue category to canonical path |
| GET | `/api/search` | Hybrid semantic + full-text search |
| POST | `/api/search/ask` | RAG Q&A |
| GET | `/api/search/graph` | Entity relationship graph data |
| GET/PUT | `/api/settings` | Key-value settings store |
| POST | `/api/settings/bookmarklet-key` | Generate/regenerate persistent API key |
| GET | `/api/vault` | List vault items |
| POST | `/api/vault` | Create vault item |
| PUT | `/api/vault/:id` | Update vault item |
| DELETE | `/api/vault/:id` | Delete vault item |
| GET | `/api/vault/status` | Vault setup status + salt + verifier |
| GET | `/api/vault/salt` | PBKDF2 salt for key derivation |
| POST | `/api/vault/setup` | Store verifier after first-time password setup |
| PUT | `/api/vault/rekey` | Atomic password change — new salt + verifier + re-encrypted items |
| POST | `/api/vault/reset` | Destructive wipe of all vault data |
| POST | `/api/vault/migrate/:itemId` | Encrypt plain-text item → vault (hard-deletes original) |
| GET | `/api/tags` | All tags with item counts |
| GET | `/api/health` | Server health |
| GET | `/api/health/ollama` | Ollama connectivity |

## Client Pages

| Route | Component | Notes |
|---|---|---|
| `/` | `Dashboard.tsx` | Stats, insights, rediscover widget, upcoming reminders |
| `/digest` | `Digest.tsx` | Weekly newspaper-style digest; auto-redirect on Mondays |
| `/ask` | `AskMemex.tsx` | RAG chat with citations |
| `/items/table` | `TableView.tsx` | Dense table, NL filter, CSV export |
| `/media` | `MediaView.tsx` | Movies + books, ratings, watch status |
| `/places` | `PlacesView.tsx` | Places, Maps links, CSV export |
| `/graph` | `SemanticGraph.tsx` | Entity relationship graph (force-directed) |
| `/categories/review` | `CategoryReview.tsx` | Rogue category remapping UI |
| `/category/:id` | `Category.tsx` | Paginated item grid |
| `/item/:id` | `Item.tsx` | Edit, delete, move to vault, extraction history |
| `/vault` | `Vault.tsx` | AES-256 encrypted vault; change-password modal |
| `/settings` | `Settings.tsx` | Model, Claude toggle, bookmarklet, Obsidian export |
| `/share/:token` | `PublicItem.tsx` | Public read-only page (no auth) |
| `/welcome` | `Welcome.tsx` | Onboarding persona flow |
| `/items/pending` | `PendingItems.tsx` | Multi-select bulk delete |
| `/items/enriched` | `EnrichedItems.tsx` | Multi-select bulk delete |
| `/trash` | `Trash.tsx` | Soft-deleted items |
| `/login` | `Login.tsx` | Auth |

## Key Services

| File | Purpose |
|---|---|
| `server/src/services/ai.ts` | AI routing — Ollama or Claude based on DB settings |
| `server/src/services/ollama.ts` | Ollama client (JSON mode, temp 0) |
| `server/src/services/classifier.ts` | Classification + fuzzy category mapping |
| `server/src/services/embedder.ts` | nomic-embed-text embeddings |
| `server/src/services/ragService.ts` | RAG Q&A — hybrid search + synthesis |
| `server/src/services/insightService.ts` | AI insights with 15s timeout |
| `server/src/services/digestService.ts` | Weekly digest with 15s timeout on AI connection |
| `server/src/services/entityService.ts` | Entity graph extraction + linking |
| `server/src/services/rediscoveryService.ts` | "On this day" + forgotten items |
| `server/src/services/visionService.ts` | Image → Ollama vision model |
| `server/src/services/whisperService.ts` | Audio → Whisper CLI → transcript |
| `server/src/services/duplicateService.ts` | pgvector cosine similarity at 0.92 threshold |
| `server/src/services/nlFilterService.ts` | NL → structured filter (SAFE_FIELDS whitelist) |
| `server/src/services/keepImporter.ts` | Google Keep ZIP parser + deduplication |
| `server/src/services/scraper.ts` | Jina URL fetch, YouTube transcript, Instagram oEmbed |
| `server/src/services/recipeParser.ts` | Structured recipe extraction |
| `server/src/lib/logger.ts` | pino logger — silent in test, pretty in dev, JSON in prod |

## Key Client Components

| File | Purpose |
|---|---|
| `client/src/components/AppHeader.tsx` | Shared fixed top bar — AI status, enrichment progress, settings, profile dropdown |
| `client/src/hooks/useAiStatus.ts` | Polls Ollama health (30s) + enrichment progress (5s); dispatches `memex:categories-changed` |
| `client/src/components/vault/VaultChangePassword.tsx` | Re-encryption modal — decrypts all items, re-encrypts with new key, calls `/vault/rekey` |
| `client/src/components/vault/VaultLocked.tsx` | Setup + unlock screen; verifies password against stored sentinel before unlocking |

## Testing

- **278 tests** — 221 server + 57 client, all passing.
- Server: `cd server && npm test`
- Client: `cd client && npm test`
- Coverage: `npm run coverage` in either package (threshold gates enforced).
- CI: `.github/workflows/ci.yml` — runs tsc + test + coverage on push/PR.

---

*Mission: your second brain runs on your own hardware.*
