# CLAUDE.md — Memex (Personal Knowledge OS)

## Project Overview
Memex is a personal knowledge management web app that ingests, auto-classifies, and organizes information from multiple sources (Google Keep, URLs, manual entry, files). It handles recipes, media lists, notes, specs, stock tickers, passwords, places, and any freeform content — intelligently tagging and categorizing everything using **local AI (Ollama)**. No cloud AI API costs. Everything runs on your machine.

## Tech Stack
- **Frontend**: React + Vite + TypeScript
- **Styling**: Tailwind CSS + custom design tokens
- **State**: Zustand
- **Animation**: framer-motion
- **PWA**: `vite-plugin-pwa` + Workbox (NetworkFirst caching for `/api/*`)
- **Backend**: Node.js + Express (TypeScript)
- **Database**: PostgreSQL (local Docker) — structured categories, tags, items, entities, settings
- **Vector DB**: pgvector (local, inside same PostgreSQL) — semantic search + entity resolution
- **Auth**: Simple local auth — bcrypt + JWT (single user)
- **AI (Primary)**: **Ollama** — runs 100% locally, zero API cost
  - Classification + summarization: `llama3.2` (3B, fast) or `gemma3:4b` (better quality)
  - Embeddings: `nomic-embed-text`
  - JSON mode + Temperature 0.0 enforced for extraction reliability
- **AI (Optional)**: Anthropic Claude API — routed through `ai.ts` only when `use_claude=true` in settings AND `ANTHROPIC_API_KEY` is set. Never called automatically for ingestion.
- **AI Routing**: `server/src/services/ai.ts` — single `aiChat()` function that transparently dispatches to Ollama or Claude based on DB settings
- **Secret Storage**: AES-256-GCM client-side encryption (Web Crypto API) — no AI involved
- **URL Parsing**: `https://r.jina.ai/{url}` — free tier, no API key needed for basic use
- **YouTube**: `youtube-transcript` npm package — free, no API key
- **Instagram**: oEmbed endpoint + caption scraping
- **File Ingestion**: MarkItDown (Python, optional) — converts PDF/Word/PPT/Excel/images to Markdown

## Docker Compose Setup
Everything runs locally:
```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: memex
      POSTGRES_PASSWORD: memex
    volumes:
      - pg_data:/var/lib/postgresql/data

  ollama:
    image: ollama/ollama
    ports: ["11434:11434"]
    volumes:
      - ollama_data:/root/.ollama
    # Add GPU passthrough here if you have NVIDIA GPU — much faster

  app:
    build: ./server
    ports: ["3001:3001"]
    depends_on: [postgres, ollama]
    environment:
      DATABASE_URL: postgresql://memex:memex@postgres:5432/memex
      OLLAMA_URL: http://ollama:11434

volumes:
  pg_data:
  ollama_data:
```

## Ollama Model Setup (one-time after first docker compose up)
```bash
# Pull models once — cached forever in docker volume
docker exec -it memex-ollama-1 ollama pull llama3.2
docker exec -it memex-ollama-1 ollama pull nomic-embed-text
```

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
│       │   ├── Settings.tsx        # Model selector, cloud toggle, strict local mode
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
│   │   ├── recipeParser.ts    # Recipe extraction → structured schema
│   │   ├── keepImporter.ts    # Google Keep Takeout ZIP parser
│   │   ├── scraper.ts         # Jina URL fetcher
│   │   ├── entityService.ts   # Entity graph: getOrCreate, link, extractAndLink
│   │   ├── insightService.ts  # AI-generated actionable insights from recent items
│   │   ├── ragService.ts      # RAG Q&A: hybrid vector+FTS search + synthesis
│   │   ├── rediscoveryService.ts  # "On this day" + forgotten items resurfacing
│   │   └── settings.ts        # getSetting(), getAiConfig() DB helpers
│   ├── scripts/
│   │   ├── resolveEntities.ts # Background entity deduplication/merging script
│   │   └── seedEntityGraph.ts # One-time script to seed entity graph from existing items
│   └── db/
│       ├── schema.sql
│       └── migrations/
│           ├── 001_initial.sql
│           ├── 002_seed_categories.sql
│           ├── 003_...
│           ├── 004_...
│           ├── 005_...
│           ├── 006_settings.sql      # settings key-value table
│           ├── 007_entity_graph.sql  # entities + item_entities tables
│           └── 008_confidence.sql    # confidence FLOAT column on items
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

Routing logic:
- If DB setting `use_claude = true` AND `ANTHROPIC_API_KEY` is set → use Claude (`CLAUDE_MODEL` env var, default `claude-3-5-sonnet-20240620`)
- Otherwise → use Ollama with the model from DB setting `ai_model` (default `llama3.2`)

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
| `ai_model` | `"llama3.2"` |
| `use_claude` | `false` |
| `auto_lock_timeout` | `15` (minutes) |
| `strict_local_mode` | `false` |

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
5. Deduplicate by content hash
6. User reviews classified items; can override categories on Item page

## URL / YouTube / Instagram / File Ingestion
- **Generic URL**: `https://r.jina.ai/{url}` → clean Markdown → Ollama classify
- **YouTube**: `youtube-transcript` → transcript + title → Ollama classify
- **Instagram**: oEmbed + caption scraping → Ollama classify
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
- `NetworkFirst` caching for all `/api/*` routes (30-day expiry, max 500 entries)
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

# Claude API (optional — only used when use_claude=true in settings)
ANTHROPIC_API_KEY=
CLAUDE_MODEL=claude-3-5-sonnet-20240620
```

AI provider (Ollama vs Claude) and model selection are runtime settings via `PUT /api/settings` — no restart needed.

## Code Style
- TypeScript strict mode, no `any`
- Zod for all API request validation
- Optimistic UI updates
- Error boundaries on all major sections
- Background jobs for heavy processing (classification queues)

## Design System
Key tokens:
- Dark base: `#0D0D0D`
- Surface: `#161616`, `#1E1E1E`
- Accent: warm amber `#F59E0B`
- Text primary: `#F5F5F5`, muted: `#9CA3AF`
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
- Claude API never called for automatic ingestion — manual opt-in only via Settings
