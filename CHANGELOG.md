# Changelog

All notable changes to Memex are documented here.

---

## [1.0.0] — 2026-06-09

First public release. Everything below was built for this version.

---

### Ingestion

- **Google Keep import** — upload a Takeout ZIP; all notes save instantly to the database and are queued for background AI classification. Original `createdAt` / `updatedAt` timestamps from Keep are preserved.
- **URL ingestion** — paste any URL; content is fetched via Jina (free, no API key), classified by Ollama, and previewed before saving.
- **YouTube** — paste a video URL; transcript is fetched and classified (no API key).
- **Instagram** — oEmbed + caption scraping.
- **File ingestion** — drag-and-drop PDF, Word, PowerPoint, Excel, CSV, images, HTML, EPUB; MarkItDown (Python, optional) converts to Markdown before classification.
- **Vision AI** — images go through an Ollama vision model (auto-detects `llama3.2-vision` → `llava:7b` → `llava`); returns structured description + tags.
- **Voice memos** — record in-browser or upload MP3/WAV/M4A/OGG; transcribed locally by OpenAI Whisper CLI (Python, optional).
- **Browser bookmarklet** — one-click "Save to Memex" from any webpage. A floating toast confirms the save and warns if a near-duplicate already exists.
- **Quick Add modal** — keyboard shortcut `Ctrl+N` / `Cmd+N` opens the ingest panel from anywhere. Tabs: URL · Text · File · Voice.
- **Duplicate detection** — at preview time, all three ingest paths (URL, text, file) run a pgvector cosine similarity check (0.92 threshold) and show an amber warning card listing any near-duplicates.
- **Share-target PWA** — the app registers as a share target; sharing a URL or text from another app opens the ingest panel pre-filled.

---

### AI Classification

- **100% local, zero cost** — every item is classified by Ollama (default: `llama3.2`; switchable to `gemma3:4b` in Settings). No data leaves your machine.
- **JSON mode + temperature 0** — native Ollama JSON mode with the full canonical category leaf list in the prompt; enforces deterministic, structured output.
- **Types extracted** — `note`, `recipe`, `media` (movies), `book`, `place`, `stock`, `link`, `spec`.
- **Structured data** — recipes get ingredients + steps; movies get director/cast/genre/year/streaming platform; books get author/genre/read status; places get cuisine/city/visit status/Maps URL; stocks get ticker + exchange.
- **Multi-entity detection** — if a note contains a list of movies, books, or places, the classifier flags `multiEntity: true` and the ingest route splits it into N separate items automatically.
- **Confidence scoring** — every extraction includes a 0–100 self-assessed confidence score. Shown as a colour-coded badge in Table View. Low-confidence items are surfaced in the Category Review queue.
- **Intent classification** — every item is tagged `actionable` (todo / want-to-buy / want-to-visit), `reference` (factual, specs, how-to), or `idea` (brainstorm, creative concept). Badge shown on the Item detail page.
- **Fuzzy category mapping** — AI output is normalised against the canonical category tree before saving; prevents "book", "books", "Books", and "Media > Books" from proliferating as separate root categories.
- **Data provenance** — every AI run is logged in `item_extractions` (model, type, confidence, structured output). History is visible on the Item page; any past extraction can be applied or rolled back with one click.
- **Re-classify** — re-run the classifier on any item from the Item page; result is saved to history without auto-applying so you can compare and decide.
- **Bulk reprocess** — Settings page has a "Re-process with Current Model" action that re-classifies all unreviewed items in the background (pLimit 3), applying results; reviewed items get history-only entries.
- **Link summarisation** — for notes containing URLs, a "Summarize Links" button fetches each URL via Jina and generates a 2–3 sentence Ollama summary per link. Results are persisted in `structured.linkSummaries` and shown in the AI Summary card — idempotent, never re-runs.

---

### Knowledge Intelligence

- **RAG Q&A (`/ask`)** — chat interface that queries your own library. Hybrid search (70 % pgvector cosine + 30 % full-text), top-10 context window, Ollama synthesis with strict citation rules. Sources shown as linked cards below the answer.
- **Natural language filter** — Table View has an "Ask AI" mode: type "Thai restaurants I haven't visited" and Ollama converts it to a structured filter (`type=place`, `cuisine=Thai`, `visitStatus=want-to-visit`). Parsed components shown as dismissible badges.
- **Actionable insights** — Dashboard surfaces 1–3 AI-generated insights from recent + random items. Types: `event`, `habit`, `connection`, `suggestion`. Animated stagger on load. 15-second timeout so a slow Ollama never blocks the Dashboard.
- **Weekly digest (`/digest`)** — auto-shown every Monday (once per day via localStorage). Contains: this-week item grid with week-over-week trend, "on this day" memory, AI-generated cross-domain connection between two random items. Regenerate button refreshes the connection without reloading the page.
- **Rediscovery** — Dashboard "Rediscover" widget surfaces up to two items: one from the same calendar date in a prior year, one forgotten item (created > 30 days ago, random order).
- **Entity graph (`/graph`)** — directors, authors, cast, cities, and stock exchanges are extracted as relational entities (`entities` + `item_entities` tables). Graph view renders semantic connections. Background `resolveEntities` script deduplicates near-identical entities using embedding similarity.

---

### Views & Navigation

- **Dashboard** — stats grid (total items, AI enriched, reviewed, vault secrets, 24 h activity), insights widget, rediscovery widget, upcoming reminders widget, and the Quick Add panel.
- **Category sidebar** — full nested category tree with item counts. Live enrichment progress bar + ETA (notes/min rate). Dispatches a `memex:categories-changed` event when enrichment advances so counts refresh automatically.
- **Item detail page** — title, category (inline edit), tags (inline add/remove), AI Summary card (summary + link summaries), TipTap rich-text content viewer/editor, intent badge, source link, reminder picker, public share section, extraction history, related items (semantic).
- **Table View (`/items/table`)** — dense sortable table. Filters: type, category, tags, date range, status (pending/reviewed/enriched), has-reminder toggle. AI natural language filter mode. Inline "Mark reviewed" per row. Bulk "Mark all reviewed". CSV export. "Move to Vault" per row.
- **Media View (`/media`)** — movies and books library. Inline watch/read status and star rating edit. CSV export.
- **Places View (`/places`)** — restaurants, cafés, hotels, attractions. Visit status, Maps link, inline rating. CSV export.
- **Pending / Enriched item pages** — multi-select + bulk delete. Quick category change inline on enriched page.
- **Category Review (`/categories/review`)** — two-tab staging area: "Staged Items" (low-confidence unreviewed items with confidence threshold slider, per-card Accept / Reassign / Accept All); "Category Anomalies" (rogue root categories with AI-suggested remap target, per-card or "Remap All").
- **Shared `AppHeader`** — fixed top bar on all 14 authenticated pages: Ollama status pill, network indicator, enrichment progress + ETA, Settings link, profile dropdown with logout.
- **Trash page** — soft-deleted items with restore.
- **Welcome / onboarding (`/welcome`)** — animated 3-step persona flow shown on first setup.

---

### Password Vault

- AES-256-GCM encryption; key derived client-side via PBKDF2 (100 k iterations, SHA-256). Master password never sent to the server.
- **Verifier-based unlock** — an encrypted sentinel (`memex-vault-v1`) is stored on first setup; wrong password is rejected immediately instead of silently loading garbage.
- **Vault password change** — `VaultChangePassword` modal decrypts every item with the old key, re-encrypts with a new key + fresh random salt, and commits atomically via `PUT /api/vault/rekey`. Progress bar shown during re-encryption.
- **Move to Vault** — one-click button on the Item detail page and Table View encrypts a plain-text note client-side and calls `POST /api/vault/migrate/:id`, which saves the ciphertext and hard-deletes the original in a single transaction.
- Key cleared on manual lock or after 15-minute inactivity (configurable in Settings).
- Vault items of type `credential` and `note`; credentials store username, URL, and encrypted secret.

---

### Sharing & Export

- **Public links** — generate a public read-only link for any non-encrypted item from the Item page. Links expire after 7 days by default (stored as `share_expires_at`). Revoke at any time. Public page (`/share/:token`) is unauthenticated and self-contained.
- **Obsidian export** — `GET /api/items/export/obsidian` returns a ZIP of Markdown files with YAML frontmatter (title, type, source, categories, tags, all structured fields). Summary in a blockquote, content below. Duplicate titles get `(n)` suffix. Encrypted items excluded. Button in Settings → Data & Privacy.
- **CSV export** — available in Table View, Media View, and Places View. Flattens `structured` fields with an `s_` prefix; arrays joined.

---

### Reminders

- `remind_at TIMESTAMPTZ` column on items. Set via a datetime picker on the Item detail page and inline in Table View.
- `ReminderPoller` in `App.tsx` requests notification permission on mount, polls every 60 seconds, fires a `Notification` for due items, and clears `remind_at` after firing.
- Dashboard shows an "Upcoming Reminders" widget listing items due within the next 7 days with relative time labels.
- `GET /api/items/reminders/due` and `?hasReminder=true` filter on the list endpoint.

---

### Security

- **JWT authentication** with bcrypt password hashing. Single-user model.
- **Rate limiting** — login: 10 requests / 15 min / IP (`express-rate-limit`). Ingest endpoints: 30 requests / min / IP.
- **Structured logging** via `pino`. All `console.*` calls replaced; tests run silently.
- **Zod validation** on every API request body and query string.
- **SQL injection prevention** — parameterised queries throughout; NL filter uses a `SAFE_FIELDS` whitelist + `jsonb_extract_path_text` instead of string interpolation.
- **CORS** intentionally open for local-first single-user use (documented comment in `index.ts`).
- **Upload limits** — documents/images: 50 MB; audio: 100 MB; Keep ZIP: 500 MB.
- **Bookmarklet key** — 48-char hex token, stored in the `settings` table, accepted as a JWT alternative on ingest endpoints only.

---

### Database

- PostgreSQL 16 with `pgvector` extension (Docker).
- 17 sequential migrations (`001` → `017`).
- `pgvector` column on `items` for semantic search and duplicate detection.
- `item_extractions` table — full AI extraction history per item.
- `entities` + `item_entities` — relational entity graph.
- `ingest_jobs` — persistent background job state (survives server restart).
- `vault_config` — salt, verifier, verifier IV for the password vault.
- `settings` — key-value store for AI model, use_claude flag, auto-lock timeout, strict local mode, bookmarklet key.

---

### PWA

- `vite-plugin-pwa` + Workbox. `NetworkFirst` caching for all `/api/*` routes (30-day expiry, 500-entry max).
- Share-target manifest entry (`/?share=true` with `title`, `text`, `url` params).
- Installable on desktop and mobile. Dark theme (`#0D0D0D`), standalone display, maskable icons.

---

### Testing & CI

- **664 tests total** — 236 server (Vitest + Supertest), 428 client (Vitest + React Testing Library).
- Server coverage: classifier, all routes, all Phase-2/3 services (NL filter, share, duplicates, entity, vision, insight, RAG, rediscovery, digest, settings, tags, Whisper), vault reset, schema drift guard, route-ordering regression guard.
- Client coverage: `lib/api.ts`, `lib/export.ts`, `lib/crypto.ts`, `store/vaultStore`, `store/authStore`, `ItemCard`, `AppHeader`, `VaultChangePassword`, `VaultLocked`, and more.
- **GitHub Actions CI** (`.github/workflows/ci.yml`) on every push and PR: `tsc --noEmit`, `npm test`, `npm run coverage` with threshold gates (server ≥ 50 %, client ≥ 30 %).

---

### Developer Experience

- Root `package.json` with `npm run dev` (starts both client and server via `concurrently`), `npm test`, `npm install`.
- `.env.example` with all variables documented.
- `RUNBOOK.md` — server lifecycle, migration workflow, model management.
- `CONTRIBUTING.md` — project structure, code style, PR guidelines.

---

[1.0.0]: https://github.com/jagdeepvirdi/memex/releases/tag/v1.0.0
