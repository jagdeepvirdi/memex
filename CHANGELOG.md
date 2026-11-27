# Changelog

All notable changes to Memex are documented here.

---

## [Unreleased]

### Added
- **Save for later (phone outbox).** Links and notes can be kept on the phone while the computer is off or out of reach, listed under an "N waiting" button, and sent by themselves (app opened, network back, new item, slowing timer) through the normal capture flow, so places, repo stats and recipes are picked up too. Nothing is removed until Memex confirms it; duplicates are not saved twice.
- **Same note, saved once.** Capturing text now also checks for a note with exactly the same words (spaces and line breaks ignored) and offers it as "you already have this", even when it has not been embedded yet, so a send that is retried from the phone does not create a second copy.
- **Share to Memex while it is unreachable.** A link or text shared from another app is kept for later automatically when Memex cannot be reached, instead of opening a capture panel that cannot save.
- **Phone guide, step by step.** README walks through Tailscale on Android (HTTPS certificates, `tailscale serve`, install the web app) and documents the queue; the landing page has a matching "Take it on your phone" section.
- **Places, GitHub, recipes, shops.** Places named in a note or web article are offered as their own entries; GitHub repos get a plain-English "what it is" line and stats; saved recipe videos queue recipe extraction; Shopping, Real Estate and Courses are new categories the classifier uses.
- **Bookmarks, Pocket and Raindrop import.** Add > Bookmarks takes the export file from Chrome, Edge, Firefox, Safari, Pocket or Raindrop (`.html`, or Raindrop's `.csv`), previews it, and saves up to 1,000 links per import with their title, date, tags and folder. Duplicates (in the file or already saved, in any spelling) and non-web addresses are skipped. No page is fetched, so nothing about your bookmarks is sent to a third party; classification runs in the background under your usual AI and privacy settings.
- **Markdown / Obsidian import.** Add > Markdown takes a zipped folder of `.md` notes (or one file), previews what will be saved and skipped, keeps titles, front matter and inline tags and dates, skips hidden folders and duplicates, and classifies in the background. `POST /api/ingest/markdown`.
- **Retrieval benchmark.** A synthetic library and labelled questions score search hit rates in CI against a throwaway Postgres (`retrievalBenchmark.realdb.test.ts`), so ranking changes are measured instead of judged by eye.
- **Phone guide.** README section on using Memex from a phone or another computer over HTTPS (Tailscale Serve or a reverse proxy) without opening the port to the network.
- **Docker builds behind HTTPS-scanning networks.** Optional `certs/*.crt` lets the image build trust an antivirus or proxy root certificate; the README documents what the Docker install does and does not include.

- **Fonts are self-hosted.** The app's three typefaces ship with it (no request to Google), and the PWA precaches them.
- **GitHub README fallback.** When the page reader cannot fetch a plain `github.com/owner/repo` page, the README is read through the GitHub API, so the summary comes from the real text and not from the model's memory.

### Fixed
- **File and voice panels tell Docker users the truth.** The Docker image has no Python tools, so the panels now say so (instead of a `pip install` that cannot work there).
- **Keyword-only search finds natural-language questions.** When no embedding model is available, search used to require every word to match (55% of the benchmark questions found their note); terms are now OR-ed and ranked by how many match (100%).
- **Batch imports respect the privacy guard.** Notes saved by Keep, bulk paste and Markdown import are now checked for tags such as `private` and for sensitive text before the first AI classification, so a cloud provider is not used for them.
- **Gemini short answers.** Gemini's thinking tokens count against the output cap, so tiny caps (the recipe yes/no check, the Settings test) came back empty; the cap now has a floor.

### Changed
- **Phone layout rework.** The header drops the theme button and shrinks the demo badge so page titles fit; the table becomes a list of cards; the home screen shows a two-column stats grid and a 2x2 action grid; the More menu is a two-column tile sheet with categories and tags behind one button; the capture dialog is a bottom sheet with Link and Note first and the other ways under "More ways to add"; the item page labels Vault / Edit / Delete; Settings tabs wrap instead of scrolling sideways. Media and Places are card lists on a phone with one item count in the filter bar; Pending, Enriched, Trash and the graph have titles that fit; Enriched always shows cards on a phone; the Ask box clears the bottom bar.
- **New brand identity.** The supplied folded-ribbon "M" logo replaces the earlier mark in the app, login/onboarding, landing page, README, favicon, PWA and touch icons and the social preview. Assets are built from the two master PNGs by `python brand/generate-assets.py` (see `brand/README.md`).
- **Interface redesign (phases 1-6).** Navigation is grouped into Home, Discover, Library and Review with a mobile quick-nav; search (`/`) and capture (`N`) are available app-wide; the dashboard leads with capture and search and shows load failures with a retry instead of looking empty; shared UI primitives, a documented design foundation (`DESIGN.md`, `PRODUCT.md`), skip links, reduced-motion support, safe-area handling and larger touch targets.
- The table's Reviewed filter now reaches the server query (`reviewed=true`), Trash explicitly requests deleted items, the item page offers Retry when loading fails, and a new public link states that it expires after 7 days.

### Security
- **Privacy scan widened.** A password-shaped token, a known secret-key prefix, a `login: value` line or a ledger-style note now keeps a note on this machine (never sent to a cloud AI).
- **The PWA no longer caches API responses.** Every `/api` response is now `Cache-Control: private, no-store`, and the old `api-cache` is deleted at startup and on logout, so library data no longer survives logout in the browser. The app shell still works offline; reading items offline no longer does.

---

## [1.2.0] — 2026-11-18

### Added
- **MCP server for AI assistants** (`mcp/`). Claude Desktop, Cursor and other MCP apps can search, read and save your notes through five tools (`search_memex`, `recent_memex_items`, `get_memex_item`, `save_note_to_memex`, `save_link_to_memex`). It uses its own key from Settings > Capture, which can reach only the assistant routes (not delete, edit, export, settings, API keys or the vault) and is stored as a hash. Private items (vault, Passwords / Personal, private tags, text that looks like account details) are never returned, and Strict Local Mode turns it off. Build it with `npm run mcp:build`.
- **Light and dark themes with a fresh palette.** "Midnight" (dark, default) and "Daylight" (light) with an iris accent. Follows your system setting; pick System, Light or Dark in Settings > Appearance, or cycle them with the button in the header; the choice is remembered in your browser. The landing page uses the same palette.

### Changed
- **Settings > Appearance** has the System / Light / Dark choice as three cards, next to the header button.
- Dependencies: `zod` 3 to 4 (server), `react-router-dom` 6 to 7 (web app), `qs` updated; `npm audit --omit=dev` now reports 0 advisories for both. CI actions moved to `checkout@v7` / `setup-node@v7`.
- Link badges and chips that use the blue "sky" shades were never styled (the shades were missing from the design tokens); they now render, in both themes.
- Phones: header actions get their own row under the title bar on every page, the Library category buttons are visible on touch devices, and the settings section strip shows a fade when more sections are off screen.

---

## [1.1.0] — 2026-11-18

### Added
- **Five AI providers.** Ollama (local, default) plus Claude, Gemini, OpenAI and Groq, each opt-in (a key, a provider choice, cloud consent), with per-task overrides. Keys can be saved in Settings (encrypted, write-only).
- **Choose your embedding model** (Ollama, Gemini or OpenAI) with a read-only estimate, a resumable re-embed job, per-model similarity thresholds, calibration, and a safe entity merge.
- **One-command Docker install** (`docker compose up -d`), startup checks with readable errors, `GET /api/health/status`, opt-in auto-migrate (on in Docker), and a first-run AI setup screen. Login no longer needs Ollama.
- **Privacy guard on text.** `cloudSafe()` now also keeps text that looks like account details on your machine, for classification, Ask, insights, digest and embeddings.
- **Which AI answered.** A badge on every item, a "Stays on this machine" chip with the reason, and "Re-classify" with a provider picker.
- **Sample data.** About forty made-up items with a "Demo mode" tag and a one-click clear that never touches your own notes.
- **Backup and restore.** `npm run backup` / `npm run restore -- <file> --yes`, with a refusal of unrelated or truncated files and a safety copy first.
- `SECURITY.md`, issue and PR templates, and a CI job that builds the Docker image and runs `scripts/smoke-test.sh`.

### Security
- **Loopback by default.** The server listens on `127.0.0.1`; Docker publishes the app and Postgres on `127.0.0.1` only (`MEMEX_BIND` changes it). Postgres was previously reachable from the network with a default password.
- **CORS tightened.** Only the bookmarklet's single route accepts any website; everything else allows localhost and `MEMEX_CORS_ORIGINS`.
- **Account rules.** New accounts need a 10+ character password (at most 72 bytes), a valid email and string inputs; bcrypt cost raised from 10 to 12. Existing accounts are unaffected.
- **Dependencies.** Fixed one critical and five high advisories on the server (`proxy-addr`, `body-parser`, `form-data`, `ip-address`, `multer`, `adm-zip`) and the Tiptap/ProseMirror paste XSS on the client. Open: `zod` and `react-router-dom` (both need a major version).
- Secrets scan of the whole git history: no keys, `.env` files or backups were ever committed.

### Fixed
- Saving a note no longer fails when the embedding service is unreachable (the "you may already have this" hint is skipped instead).
- Creating the first account now lands on the welcome flow instead of the Dashboard.
- The public health endpoint no longer shows the database address.

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

[Unreleased]: https://github.com/jagdeepvirdi/memex/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/jagdeepvirdi/memex/releases/tag/v1.2.0
[1.1.0]: https://github.com/jagdeepvirdi/memex/releases/tag/v1.1.0
[1.0.0]: https://github.com/jagdeepvirdi/memex/releases/tag/v1.0.0
