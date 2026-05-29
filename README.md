# Memex — Personal Knowledge OS

A self-hosted knowledge management app that ingests, auto-classifies, and organizes everything you save — notes, recipes, movies, books, places, links, files, and more. Powered entirely by local AI (Ollama). Zero cloud costs. Runs on your machine.

## What it does

- **Import from Google Keep** — upload a Takeout ZIP; every note saves instantly and is classified in the background
- **Ingest anything** — URLs, YouTube videos, Instagram posts, PDFs, Word docs, images, plain text
- **Auto-classify with local AI** — Ollama tags, categorizes, and extracts structured data from each item (confidence-scored)
- **Ask your knowledge** — RAG-powered chat: ask questions, get cited answers from your own notes
- **Browse by type** — dedicated views for movies/books (ratings, watch status), places/restaurants (Maps links), and a dense table view for bulk review
- **Entity graph** — directors, authors, and cities are extracted as relational entities; query connections across all your notes
- **Rediscovery** — "On this day" and forgotten-item widgets surface things you've saved and forgotten
- **Actionable insights** — AI scans recent notes and surfaces events, habits, and suggestions on the dashboard
- **Password vault** — AES-256-GCM client-side encryption; master password never leaves the browser
- **Move to Vault** — one-click encryption of sensitive plain-text notes
- **PWA** — installable, works offline with cached API responses

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
| AI — chat | Ollama (`llama3.2` or `gemma3:4b`) |
| AI — embeddings | Ollama (`nomic-embed-text`) |
| AI — optional | Anthropic Claude API (opt-in via Settings, never automatic) |
| File ingestion | MarkItDown (Python, optional) |

---

## Quick Start

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Node.js 20+
- npm 9+

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

### 4. (Optional) File ingestion via MarkItDown

To support PDF, Word, PowerPoint, Excel, and image uploads:

```bash
pip install 'markitdown[all]'
```

Restart the server. **Settings → Intelligence Engine** will show a green "Installed" badge.

---

## Environment Variables

Create `server/.env`:

```env
DATABASE_URL=postgresql://memex:memex@localhost:5432/memex
OLLAMA_URL=http://localhost:11434
PORT=3002
JWT_SECRET=<random 32-char string>

# Optional — override default model names
OLLAMA_CHAT_MODEL=llama3.2
OLLAMA_EMBED_MODEL=nomic-embed-text

# Optional — Claude API (only used when enabled in Settings)
ANTHROPIC_API_KEY=
CLAUDE_MODEL=claude-3-5-sonnet-20240620
```

AI provider and model can be switched at runtime via **Settings** — no restart needed.

---

## Importing Google Keep

1. Go to [Google Takeout](https://takeout.google.com) → select **Keep** → export as ZIP
2. In Memex: **Quick Add → Keep Import** → upload the ZIP
3. Notes save immediately; AI enrichment runs in the background
4. Watch the sidebar progress bar — it shows live count and ETA

---

## Views

| Route | Description |
|---|---|
| `/` | Dashboard — stats, insights widget, rediscover widget |
| `/ask` | RAG chat — ask questions, get cited answers from your notes |
| `/items/table` | Dense table with filters, bulk review, CSV export |
| `/media` | Movies + books library with ratings and watch status |
| `/places` | Restaurants, cafés, hotels, attractions — with Maps links |
| `/items/pending` | Notes awaiting AI enrichment |
| `/items/enriched` | AI-classified notes ready for review |
| `/vault` | Encrypted password vault |
| `/settings` | Model selector, Claude API toggle, strict local mode |

---

## AI Classification

Every item is classified by Ollama with:

- **Type** — note, recipe, media, book, place, spec, stock, link
- **Categories** — fuzzy-mapped to the canonical tree (no rogue categories)
- **Tags** — auto-extracted
- **Summary** — 2–3 sentence overview
- **Confidence score** — 0–100, visible in Table View for easy curation
- **Structured data** — type-specific fields: recipe steps/ingredients, movie director/cast/rating, place city/cuisine/visitStatus, etc.

Multi-entity notes (e.g. "Watched: Inception, Interstellar, Dune") are automatically split into individual items.

Classification uses Ollama JSON mode + temperature 0 + a canonical category list in the prompt for deterministic, reliable output.

---

## Ask Your Knowledge (`/ask`)

Local RAG pipeline:

1. Question is embedded with `nomic-embed-text`
2. Top 10 relevant notes retrieved via hybrid search (70% semantic + 30% full-text)
3. Ollama synthesizes a cited answer from your notes only
4. Sources shown alongside the answer

---

## Entity Graph

Directors, authors, cast members, cities, and stock exchanges are automatically extracted as relational entities and linked to items. Enables cross-note queries like "everything connected to Bangkok" or "all movies by Christopher Nolan".

---

## Password Vault

- AES-256-GCM encryption, key derived client-side via PBKDF2 (100k iterations)
- Master password never sent to the server — key exists only in memory
- Key cleared on lock or after 15-minute inactivity
- **Move to Vault**: encrypt any plain-text note directly from the Item page or Table View

---

## Performance

| Model | CPU | GPU |
|---|---|---|
| llama3.2 (3B) | 3–8 s/item | ~1 s/item |
| gemma3:4b | 5–10 s/item | ~1.5 s/item |
| nomic-embed-text | ~200 ms | ~50 ms |

Bulk Keep imports are instant to save; background queue classifies at 3 concurrent items. Sidebar shows live progress and time estimate.

---

## Running Tests

```bash
npm test
```

130 tests covering ingestion, classification, search, vault, categories, and crypto.

---

## Keyboard Shortcuts

- `Ctrl+K` — Global search
- `Ctrl+N` — Quick add

---

## Roadmap

- [ ] Category staging area — review AI-suggested categories before DB commit
- [ ] Data provenance — keep raw notes immutable; treat AI extractions as a versioned layer
- [ ] Multi-modal capture — image OCR (local vision model) and voice memos (local Whisper)

---

*Runs 100% on your machine. No subscriptions. No telemetry.*
