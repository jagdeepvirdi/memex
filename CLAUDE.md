# CLAUDE.md — Memex (Personal Knowledge OS)

## Project Overview
Memex is a personal knowledge management web app that ingests, auto-classifies, and organizes information from multiple sources (Google Keep, URLs, manual entry). It handles recipes, media lists, notes, specs, stock tickers, passwords, and any freeform content — intelligently tagging and categorizing everything using **local AI (Ollama)**. No cloud AI API costs. Everything runs on your machine.

## Tech Stack
- **Frontend**: React + Vite + TypeScript
- **Styling**: Tailwind CSS + custom design tokens
- **State**: Zustand
- **Backend**: Node.js + Express (TypeScript)
- **Database**: PostgreSQL (local Docker) — structured categories, tags, items
- **Vector DB**: pgvector (local, inside same PostgreSQL) — semantic search
- **Auth**: Simple local auth — bcrypt + JWT (single user)
- **AI (Primary)**: **Ollama** — runs 100% locally, zero API cost
  - Classification + summarization: `llama3.2` (3B, fast) or `gemma3:4b` (better quality)
  - Embeddings: `nomic-embed-text`
- **AI (Optional / Manual only)**: Anthropic Claude API — only if user explicitly clicks "Enhance with Claude". Never called automatically.
- **Secret Storage**: AES-256-GCM client-side encryption (Web Crypto API) — no AI involved
- **URL Parsing**: `https://r.jina.ai/{url}` — free tier, no API key needed for basic use
- **YouTube**: `youtube-transcript` npm package — free, no API key
- **Instagram**: oEmbed endpoint + caption scraping

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
│       │   ├── vault/       # Password vault UI
│       │   ├── cards/       # Item cards per type
│       │   ├── sidebar/     # Category tree nav
│       │   ├── ingest/      # Add new item modal/panel
│       │   └── search/      # Global search
│       ├── pages/
│       │   ├── Dashboard.tsx
│       │   ├── Category.tsx
│       │   ├── Item.tsx
│       │   └── Vault.tsx
│       ├── hooks/
│       ├── store/           # Zustand stores
│       └── lib/
│           ├── api.ts
│           └── crypto.ts    # AES-256 vault encryption
├── server/
│   ├── routes/
│   │   ├── ingest.ts        # URL + text ingestion endpoint
│   │   ├── items.ts         # CRUD for knowledge items
│   │   ├── vault.ts         # Encrypted password CRUD
│   │   └── search.ts        # Semantic search
│   ├── services/
│   │   ├── ollama.ts        # Ollama client (chat + embed)
│   │   ├── classifier.ts    # Auto-classification via Ollama
│   │   ├── summarizer.ts    # URL/video summarization via Ollama
│   │   ├── embedder.ts      # nomic-embed-text embeddings
│   │   ├── recipeParser.ts  # Recipe extraction → structured schema
│   │   ├── keepImporter.ts  # Google Keep Takeout ZIP parser
│   │   └── scraper.ts       # Jina URL fetcher
│   └── db/
│       ├── schema.sql
│       └── migrations/
└── shared/
    └── types.ts
```

## Ollama Service (ollama.ts)
```ts
const OLLAMA_BASE = process.env.OLLAMA_URL || 'http://localhost:11434'

export async function ollamaChat(prompt: string, system?: string): Promise<string> {
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama3.2',
      stream: false,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: prompt }
      ]
    })
  })
  const data = await res.json()
  return data.message.content
}

export async function ollamaEmbed(text: string): Promise<number[]> {
  const res = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'nomic-embed-text', prompt: text })
  })
  const data = await res.json()
  return data.embedding
}
```

## AI Classification (100% local, zero cost)
```
System prompt:
You are a knowledge classifier. Given raw text or a note, return ONLY valid JSON with no preamble:
{
  "type": "note|recipe|media|spec|stock|link|book",
  "title": "<inferred title>",
  "categories": ["<top>", "<mid>", "<leaf>"],
  "tags": ["<tag1>", "<tag2>"],
  "summary": "<2-3 sentences>",
  "structured": {}
}
For recipes — structured: { ingredients[], steps[], servings, prepTime, cookTime, cuisine, mealType }
For movies/books — structured: { genre, year, director/author }
For stocks — structured: { ticker, exchange }
Return ONLY the JSON object.
```
On JSON parse failure: retry once with stricter prompt. Second failure: save as `type=note` with raw content — never block the user.

## Data Model

### Item
```ts
type Item = {
  id: string
  title: string
  type: 'note' | 'recipe' | 'media' | 'spec' | 'stock' | 'password' | 'link' | 'book'
  content: string
  structured: object
  categories: string[]      // ['Food', 'Bakery', 'Cakes']
  tags: string[]
  source: 'keep' | 'manual' | 'url' | 'youtube' | 'instagram'
  sourceUrl?: string
  embedding?: number[]      // nomic-embed-text, stored in pgvector column
  createdAt: Date
  updatedAt: Date
  encrypted?: boolean
}
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

## Password Vault Security
- Master password never leaves the browser
- Client-side encryption: AES-256-GCM, key derived via PBKDF2 (100k iterations, SHA-256)
- Salt stored in DB (not secret), ciphertext + IV stored in DB
- Key exists only in memory, cleared on lock / 15-min inactivity
- No AI involved in vault — pure crypto

## Google Keep Import
1. User uploads Google Takeout ZIP
2. Server extracts `Keep/*.json` files
3. Each note queued for Ollama classification (rate-limited to avoid overwhelming local Ollama — 3 concurrent)
4. Show progress bar during batch
5. Deduplicate by content hash
6. User reviews classified batch, can override categories
7. Confirm → bulk insert

## URL / YouTube / Instagram Ingestion
1. User pastes URL or shares link
2. Detect type: YouTube ID? Instagram URL? Generic?
3. Fetch content:
   - Generic: `https://r.jina.ai/{url}` → clean Markdown (free)
   - YouTube: `youtube-transcript` → transcript text + video title
   - Instagram: `https://www.instagram.com/p/{shortcode}/embed/` + oEmbed for caption
4. Pass to Ollama: summarize + classify
5. Show preview card to user → confirm or edit → save

## Performance Reality
| Model | Classification time (CPU) | Classification time (GPU) |
|---|---|---|
| llama3.2 (3B) | 3–8 seconds | ~1 second |
| gemma3:4b | 5–10 seconds | ~1.5 seconds |
| nomic-embed-text | ~200ms | ~50ms |

For bulk Keep imports: run in background queue, user doesn't wait. Show progress.

## Environment Variables
```env
DATABASE_URL=postgresql://memex:memex@localhost:5432/memex
OLLAMA_URL=http://localhost:11434
PORT=3001
JWT_SECRET=<generate a random 32-char string>
# Optional — only wired to a manual "Enhance" button, never auto-called
ANTHROPIC_API_KEY=
```

## Code Style
- TypeScript strict mode, no `any`
- Zod for all API request validation
- Optimistic UI updates
- Error boundaries on all major sections
- Background jobs for heavy processing (classification queues)

## Design System
See design exported from Claude Design. Key tokens:
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
| Semantic search embeddings | $0 — Ollama |
| URL summarization | $0 — Ollama |
| Recipe extraction | $0 — Ollama |
| URL content fetch | $0 — Jina free |
| YouTube transcripts | $0 — no API key |
| Database + server | $0 — local Docker |
| **Monthly total** | **$0** |

## Non-Goals (v1)
- No cloud hosting — runs on your laptop/desktop
- No mobile app (PWA later)
- No real-time collaboration
- Claude API never auto-called — manual opt-in only
