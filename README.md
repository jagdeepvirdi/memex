# Memex — Personal Knowledge OS

A self-hosted knowledge management app that ingests, auto-classifies, and organizes everything you save — notes, recipes, movies, books, places, links, files, voice memos, and more. Powered entirely by local AI (Ollama). Zero cloud costs. Runs on your machine.

## What it does

- **Import from Google Keep** — upload a Takeout ZIP; every note saves instantly and is classified in the background with a live sidebar ETA
- **Ingest anything** — URLs, YouTube videos, Instagram posts, PDFs, Word docs, PowerPoint, images (vision AI), voice memos (Whisper), plain text
- **Auto-classify with local AI** — Ollama tags, categorizes, and extracts structured data from each item (confidence-scored, multi-entity detection)
- **Ask your knowledge** — RAG-powered chat: ask questions, get cited answers from your own notes
- **Natural language filters** — type "Thai restaurants I haven't visited" in Table View; Ollama converts it to a structured query
- **Weekly digest** — every Monday, a newspaper-style summary of what you saved, an "on this day" memory, and an AI-generated cross-domain connection
- **Browse by type** — dedicated views for movies/books (ratings, watch status), places/restaurants (Maps links), and a dense table view for bulk review
- **Entity graph** — directors, authors, and cities are extracted as relational entities; query connections across all your notes
- **Rediscovery** — "On this day" and forgotten-item widgets surface things you've saved and forgotten
- **Actionable insights** — AI scans recent notes and surfaces events, habits, and suggestions on the dashboard
- **Reminders** — attach a date to any item; PWA pushes a browser notification when it's due
- **Sharing** — generate a public link for any item (expires in 7 days by default); revokable at any time
- **Obsidian export** — download your entire library as a ZIP of Markdown files with YAML frontmatter
- **Bookmarklet** — one-click "Save to Memex" from any browser page; warns if a duplicate already exists
- **Category Review** — two-tab staging area: review low-confidence items before accepting them, and remap rogue AI-generated categories to the canonical tree
- **Password vault** — AES-256-GCM client-side encryption; master password never leaves the browser
- **Move to Vault** — one-click encryption of sensitive plain-text notes
- **Data provenance** — every AI extraction is logged; roll back or apply any past extraction to an item
- **PWA** — installable, works offline with cached API responses; share-target support

**Monthly cost: $0.** Everything runs on your own hardware.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React + Vite + TypeScript |
| Styling | Tailwind CSS |
| Animation | framer-motion |
| PWA | vite-plugin-pwa + Workbox |
| State | Zustand |
| Backend | Node.js + Express (TypeScript) |
| Database | PostgreSQL + pgvector (Docker) |
| Logging | pino (structured, silent in tests) |
| AI — chat | Ollama (`llama3.2` or `gemma3:4b`) |
| AI — embeddings | Ollama (`nomic-embed-text`) |
| AI — vision | Ollama vision model (auto-detected: `llama3.2-vision` → `llava`) |
| AI — optional | Anthropic Claude API (opt-in via Settings, never automatic) |
| File ingestion | MarkItDown (Python, optional) |
| Voice transcription | OpenAI Whisper CLI (Python, optional) |
| Auth | bcrypt + JWT + express-rate-limit |

---

## Quick Start

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Node.js 22+
- npm 10+

### 1. Start services

```bash
docker compose up -d
```

Starts PostgreSQL (with pgvector) and Ollama.

### 2. Pull AI models (one-time)

```bash
docker exec -it memex-ollama-1 ollama pull llama3.2
docker exec -it memex-ollama-1 ollama pull nomic-embed-text
```

### 3. Install dependencies and run

```bash
npm install      # installs root + client + server
npm run dev      # starts client (port 5175) and server (port 3002)
```

Open [http://localhost:5175](http://localhost:5175) and create your account.

### 4. Run migrations

Migrations run automatically when the server starts. To run them manually:

```bash
cd server && npm run migrate
```

### 5. (Optional) File ingestion via MarkItDown

Supports PDF, Word, PowerPoint, Excel, CSV, and image uploads:

```bash
pip install 'markitdown[all]'
```

Restart the server. **Settings → Intelligence Engine** shows a green "Installed" badge.

### 6. (Optional) Voice transcription via Whisper

Supports in-browser recording and audio file upload (MP3/WAV/M4A/OGG/WebM/FLAC):

```bash
pip install openai-whisper
```

Restart the server. **Settings → Intelligence Engine** shows the Whisper status. The `WHISPER_MODEL` env var selects model size (default: `base`).

### 7. (Optional) Vision AI for images

Auto-detected from installed Ollama models. Pull one:

```bash
docker exec -it memex-ollama-1 ollama pull llama3.2-vision:11b
# or lighter alternative:
docker exec -it memex-ollama-1 ollama pull llava:7b
```

---

## Using the lifecycle scripts

For a cleaner start/stop experience, use the provided scripts:

**macOS / Linux:**
```bash
./memex.sh dev start          # hot-reload dev (server + client)
./memex.sh dev start --follow # …then tail server log
./memex.sh dev stop           # stop everything
./memex.sh prod start         # build + start production
./memex.sh prod stop
```

**Windows (PowerShell 7+):**
```powershell
.\memex.ps1 dev  start         # hot-reload dev
.\memex.ps1 dev  start -Follow # …then tail server log
.\memex.ps1 dev  stop
.\memex.ps1 prod start         # build + start production
.\memex.ps1 prod stop
```

Both scripts: start Postgres, run migrations, then launch server (and client in dev mode).

---

## Environment Variables

Create `server/.env`:

```env
DATABASE_URL=postgresql://memex:memex@localhost:5432/memex
OLLAMA_URL=http://localhost:11434
PORT=3002
JWT_SECRET=<random 32-char string>

# Ollama model overrides (optional)
OLLAMA_CHAT_MODEL=llama3.2
OLLAMA_EMBED_MODEL=nomic-embed-text

# Claude API (only used when enabled in Settings)
ANTHROPIC_API_KEY=
CLAUDE_MODEL=claude-3-5-sonnet-20240620

# Whisper model size (optional, default: base)
WHISPER_MODEL=base

# Auth rate limiting (optional, default: 10 per 15 min)
AUTH_RATE_LIMIT_MAX=10

# Log level (optional, default: info; use silent to suppress)
LOG_LEVEL=info
```

AI provider and model switch at runtime via **Settings** — no restart needed.

---

## Importing Google Keep

1. Go to [Google Takeout](https://takeout.google.com) → select **Keep** → export as ZIP
2. In Memex: **Quick Add → Keep Import** → upload the ZIP
3. Notes save immediately; AI enrichment runs in the background (3 concurrent)
4. Watch the sidebar progress bar — it shows live count, rate (notes/min), and ETA
5. Job state is persisted in the DB — progress survives server restarts

---

## Views

| Route | Description |
|---|---|
| `/` | Dashboard — stats, insights widget, rediscover widget, upcoming reminders |
| `/digest` | Weekly digest — this week's saves, on-this-day memory, AI cross-domain connection |
| `/ask` | RAG chat — ask questions, get cited answers from your notes |
| `/items/table` | Dense table with filters, NL filter ("Ask AI"), bulk review, CSV export |
| `/media` | Movies + books library with ratings and watch/read status |
| `/places` | Restaurants, cafés, hotels, attractions — with Maps links and CSV export |
| `/graph` | Entity relationship graph — semantic connections between items |
| `/categories/review` | Review and remap rogue AI-generated categories to the canonical tree |
| `/items/pending` | Notes awaiting AI enrichment |
| `/items/enriched` | AI-classified notes ready for review |
| `/vault` | Encrypted password vault |
| `/settings` | Model selector, Claude API toggle, bookmarklet, Obsidian export, strict local mode |
| `/share/:token` | Public read-only view of a shared item (no login required) |
| `/welcome` | First-run onboarding flow |

---

## AI Classification

Every item is classified by Ollama with:

- **Type** — note, recipe, media, book, place, spec, stock, link
- **Categories** — fuzzy-mapped to the canonical tree (no rogue AI-invented categories)
- **Tags** — auto-extracted
- **Summary** — 2–3 sentence overview
- **Intent** — `actionable` (todo/want-to-do), `reference` (factual/how-to), or `idea` (brainstorm/concept); shown as a badge on every item
- **Confidence score** — 0–100, visible in Table View and the Category Review staging queue
- **Structured data** — type-specific fields: recipe steps/ingredients, movie director/cast/rating, place city/cuisine/visitStatus, etc.
- **Extraction history** — every AI run is logged; any past extraction can be applied or rolled back from the Item page; re-classify a single item or bulk re-process with the current model from Settings

Multi-entity notes (e.g. "Watched: Inception, Interstellar, Dune") are automatically split into individual items.

Classification uses Ollama JSON mode + temperature 0 + a canonical category list in the prompt for deterministic, reliable output. Failed JSON parses retry once with a stricter prompt; second failure saves as `type=note`.

---

## Ask Your Knowledge (`/ask`)

Local RAG pipeline:

1. Question is embedded with `nomic-embed-text`
2. Top 10 relevant notes retrieved via hybrid search (70% semantic + 30% full-text)
3. Ollama synthesizes a cited answer from your notes only
4. Sources shown alongside the answer

---

## Natural Language Filters (`/items/table`)

Click the **Ask AI** sparkle button in Table View and type in plain English:

- "Thai restaurants I haven't visited"
- "movies I want to watch from 2023"
- "recipes with chicken"

Ollama converts the query to a structured filter. Parsed components appear as dismissible badges below the search bar. Click **Reset** to return to normal filter mode.

---

## Weekly Digest (`/digest`)

Auto-shown every Monday (once per day, tracked in localStorage). Contains:

- **This week** — all items saved in the last 7 days with week-over-week comparison
- **On this day** — a random item saved on this date in a prior year
- **AI connection** — one surprising cross-domain link between two random items from your library (click **Regenerate** for a new one)

---

## Bookmarklet

Generate a persistent API key in **Settings → Bookmarklet**. Drag the "Save to Memex" button to your bookmarks bar. Click it on any page to scrape + classify + save in one shot. A floating toast confirms the save and warns if a similar item already exists.

---

## Sharing

From any Item page, click **Share** to generate a public link. Links expire after 7 days by default. Revoke at any time from the same page. Encrypted (vault) items cannot be shared.

---

## Entity Graph (`/graph`)

Directors, authors, cast members, cities, and stock exchanges are automatically extracted as relational entities and linked to items. The graph view renders semantic connections. Enables cross-note queries like "everything connected to Bangkok" or "all movies by Christopher Nolan".

---

## Password Vault

- AES-256-GCM encryption, key derived client-side via PBKDF2 (100k iterations, SHA-256)
- Master password never sent to the server — key exists only in memory
- Key cleared on lock or after 15-minute inactivity
- **Verifier-based unlock** — an encrypted sentinel is stored on first setup; wrong password is rejected immediately instead of silently loading garbage
- **Change vault password** — re-encrypts every secret client-side with a new key + salt in one atomic operation; vault stays unlocked afterwards
- **Move to Vault**: encrypt any plain-text note directly from the Item page or Table View

---

## Performance

| Model | CPU | GPU |
|---|---|---|
| llama3.2 (3B) | 3–8 s/item | ~1 s/item |
| gemma3:4b | 5–10 s/item | ~1.5 s/item |
| nomic-embed-text | ~200 ms | ~50 ms |

Bulk Keep imports: notes save instantly; background queue classifies at 3 concurrent items. Sidebar shows live progress and time estimate. Job state persists in the database.

---

## Running Tests

```bash
# Server (236 tests)
cd server && npm test

# Client (428 tests)
cd client && npm test

# Or both from the root
npm test
```

### Coverage reports (with threshold gates)

```bash
cd server && npm run coverage   # threshold: ≥50% lines/functions
cd client && npm run coverage   # threshold: ≥30% lines/functions
```

Coverage is also enforced in CI on every push/PR.

---

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and PR:

1. `tsc --noEmit` — type-check both packages
2. `npm test` — full test suite
3. `npm run coverage` — coverage with threshold gate

---

## Keyboard Shortcuts

- `Ctrl+K` / `Cmd+K` — Global search
- `Ctrl+N` / `Cmd+N` — Quick add
- `Esc` — Close any modal

---

*Runs 100% on your machine. No subscriptions. No telemetry.*
