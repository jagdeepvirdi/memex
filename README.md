# Memex — Personal Knowledge OS

A self-hosted knowledge management app that ingests, auto-classifies, and organizes everything you save — notes, recipes, movies, books, places, links, files, voice memos, and more. Runs on your machine with local AI (Ollama) by default. Gemini, OpenAI, Claude or Groq are optional and used only with your key, your choice and your consent.

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

**Monthly cost: $0 with local AI.** Cloud providers are optional and billed by them, not by Memex.

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
| AI — embeddings | Ollama (`nomic-embed-text`, default) or Gemini / OpenAI (cloud, opt-in) |
| AI — vision | Ollama vision model (auto-detected: `llama3.2-vision` → `llava`) |
| AI — optional cloud | Gemini, OpenAI, Claude, Groq (opt-in: a key, a provider choice and cloud consent; blocked by Strict Local Mode) |
| File ingestion | MarkItDown (Python, optional) |
| Voice transcription | OpenAI Whisper CLI (Python, optional) |
| Auth | bcrypt + JWT + express-rate-limit |

---

## Quick Start

Memex stores everything in Postgres (Docker) on your machine. The AI can be **local** (Ollama: nothing leaves your computer) or **cloud** (Gemini, OpenAI, Claude or Groq: only with your key and consent), or a mix. The first three steps are the same either way; then pick path A or B.

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Postgres runs in a container)
- Node.js 22+ and npm 10+
- Path A only: [Ollama](https://ollama.com/download), installed natively (it is **not** part of `docker-compose.yml`)

### 1. Configure and start the database

From the project root:

```bash
cp .env.example .env        # the file lives at the PROJECT ROOT; set JWT_SECRET (the command is in the file)
docker compose up -d postgres   # Postgres + pgvector, host port 5436
```

### 2. Install and migrate

```bash
npm run install:all
npm run db:migrate          # creates the tables (safe to run again)
```

`npm run dev` does **not** migrate for you; the lifecycle scripts below (`memex.sh` / `memex.ps1`) do, on every start.

### 3. Run

```bash
npm run dev      # client on http://localhost:5175, server on http://localhost:3002
```

Open [http://localhost:5175](http://localhost:5175) and create your account.

### Path A: local AI (default)

```bash
ollama pull llama3.2
ollama pull nomic-embed-text
```

That is all: Memex uses Ollama for classification, answers and embeddings out of the box. Optional extras are at the end of this section.

### Path B: cloud-only (no Ollama)

You do not need Ollama. **Do the steps in this order**, in the app:

1. **Settings → Keys & Privacy**: paste an API key (for example Gemini from [aistudio.google.com](https://aistudio.google.com)). Keys are stored encrypted and never shown again.
2. **Settings → AI → Provider & model**: choose that provider and turn on **Allow cloud AI** (your consent).
3. **Settings → AI → Search & embeddings**: choose **Gemini (cloud)** (or OpenAI), press **Review change**, then **Switch**. Claude and Groq can answer questions but have no embeddings API, so use Gemini or OpenAI here.
4. Now save a note, search, and use **Ask**.

> **Do step 3 before you save anything.** Embeddings default to Ollama, and saving a note embeds it right away. Until you switch, saving fails with "Failed to classify text" even though your answers already come from the cloud.

What to expect:

- **Privacy still holds.** Items in the *Passwords* or *Personal* categories, items tagged `private`, `no-cloud` or `local-only`, and vault items are never sent to a cloud provider (they are skipped, and search finds them by keyword). **Strict Local Mode** blocks every cloud call; semantic search then falls back to keywords and says so.
- **You see the cost before anything is sent.** "Review change" shows how many items will be embedded and roughly how many tokens (a few hundred notes is tens of thousands of tokens). Nothing is sent until you confirm.
- **Images, voice and file conversion are separate.** Image understanding still needs an Ollama vision model; voice (Whisper) and file conversion (MarkItDown) are local Python tools, independent of which AI you choose.
- **Tested how:** verified end to end on a fresh database with Ollama unreachable, using Gemini (account, classification, embeddings, search, Ask; a note tagged `private` was never embedded). OpenAI embeddings and Claude, OpenAI and Groq chat are implemented and unit-tested but have not yet been run against the live APIs.

### Local or cloud: what runs where

| | Local (Ollama) | Cloud (opt-in) |
|---|---|---|
| Classification, answers, digest, insights | `llama3.2` / `gemma3:4b` | Gemini, OpenAI, Claude or Groq |
| Embeddings (search, Ask, related items) | `nomic-embed-text` | Gemini or OpenAI |
| Needs a key and consent | no | yes |
| Private items (see above) | always handled here | never sent |
| Image understanding | Ollama vision model | not available |

You can choose a provider per task (Settings → AI → Advanced), for example Gemini for **Ask** and Ollama for everything else.

### Changing the embedding model later

Search, Ask and related items can only compare vectors made by the **same** model, so changing the model means re-embedding your library. In **Settings → AI → Search & embeddings**:

1. **Review change** shows what would happen and sends nothing.
2. **Switch and re-embed** switches and starts a background job you can cancel; it resumes where it left off.
3. Old vectors are kept, so switching back is instant. Until the job finishes, items without a vector from the new model are found by keyword.

Each model has its own similarity thresholds (what counts as a duplicate, or a related note in the graph). Gemini's start as estimates; tune them to your library with `server/src/scripts/calibrateEmbedding.ts` (see the comments at the top of the file). Switching models saves the reference it needs automatically.

### Optional extras

**File ingestion (MarkItDown)** — PDF, Word, PowerPoint, Excel, CSV and image uploads:

```bash
pip install 'markitdown[all]'
```

Restart the server. **Settings → Library** shows the status.

**Voice transcription (Whisper)** — in-browser recording and audio upload (MP3/WAV/M4A/OGG/WebM/FLAC):

```bash
pip install openai-whisper
```

Restart the server. The `WHISPER_MODEL` env var selects the model size (default: `base`).

**Vision AI for images** — auto-detected from installed Ollama models:

```bash
ollama pull llama3.2-vision:11b
# or a lighter alternative:
ollama pull llava:7b
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

Everything lives in one file at the **project root**: copy `.env.example` to `.env`. It documents every variable; the essentials are:

```env
DATABASE_URL=postgresql://memex:memex@localhost:5436/memex   # host port 5436 (see docker-compose.yml)
PORT=3002
JWT_SECRET=<random 32+ characters>      # signs your login; also encrypts saved API keys unless KEY_ENCRYPTION_SECRET is set

# Local AI (Path A). Not needed for a cloud-only install.
OLLAMA_URL=http://localhost:11434
OLLAMA_CHAT_MODEL=llama3.2
OLLAMA_EMBED_MODEL=nomic-embed-text

# Cloud AI (optional). A key only makes a provider AVAILABLE: it is used only if you also pick it in Settings and
# turn on cloud consent, and never in Strict Local Mode. Keys can also be pasted in Settings instead of here.
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
OPENAI_API_KEY=
GROQ_API_KEY=
```

The AI provider, models, cloud consent and embedding model switch at runtime in **Settings**, with no restart. If `JWT_SECRET` (or `KEY_ENCRYPTION_SECRET`) changes, API keys saved in Settings can no longer be read and must be entered again.

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
| `/settings` | AI provider and models, API keys, search & embeddings, privacy (Strict Local Mode), library tools, vault, bookmarklet |
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

1. The question is embedded with the active embedding model (local `nomic-embed-text` by default)
2. Top 10 relevant notes retrieved via hybrid search (70% semantic + 30% full-text)
3. Your chosen AI (Ollama by default) synthesizes a cited answer from your notes only
4. Sources shown alongside the answer. If semantic search is unavailable (for example Strict Local Mode with cloud embeddings), Ask falls back to keyword matching and says so

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
# Server
cd server && npm test

# Client
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

*Runs on your machine. No subscriptions. No telemetry. Nothing leaves it unless you turn on a cloud provider.*
