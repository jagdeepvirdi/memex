# Memex — Task Backlog

---

## 📋 Code Review Action Items — 2026-05-30

> Full scores, rationale, and review narrative are in **[SCORECARD.md](SCORECARD.md)**
> (overall ~7.5/10; test coverage is the identified ceiling). Two bugs were fixed during
> the review: the server test suite (JWT_SECRET guard broke 6/10 files) and the `/digest`
> route shadowing. The remaining action items are below.

### 🔴 Action Items — High Priority

- [~] **Test coverage for Phase-2/3 services (the big gap)** — IN PROGRESS
  - ✅ Done: `nlFilterService` (10 tests — whitelist, type validation, fallback),
    `share.ts` route (6 tests — public access, 400/404/500, query safety),
    `duplicateService` (6 tests — threshold, empty-embedding guard, never-throws),
    `entityService` (11 tests — getOrCreate dedup, embedding-failure path, role mapping).
    Server test count: 118 → 154.
  - ⬜ Still untested: `digestService`, `settings.ts` routes, `tags.ts` routes, `ragService`,
    `insightService`, `rediscoveryService`, `visionService` (model priority selection),
    `whisperService`. Plus route tests for `/nl-filter`, `/:id/share` (POST/DELETE), `/:id/extractions`.

- [x] **Add a route-ordering regression guard** ✅
  - `items.routing.test.ts` asserts `GET /api/items/digest` hits the digest handler (distinctive
    `period` shape), and `/reminders/due` + `/export/obsidian` return 200 through the real router —
    catching the `/:id` shadowing bug class that `tsc` and handler-level unit tests miss.

- [ ] **Auth rate-limiting**
  - `POST /api/auth/login` has no throttle — brute-forceable. Add `express-rate-limit`
    (e.g. 10 attempts / 15 min / IP) on the auth router.

### 🟡 Action Items — Medium Priority

- [ ] **Share tokens never expire**
  - `public_token` is permanent until manually revoked. Add optional `share_expires_at` and
    filter it out in `GET /api/share/:token`. Consider a "share expires in 7 days" default.

- [ ] **Replace in-memory ingest job store with something restart-safe**
  - `jobs` object in `ingest.ts` is lost on server restart — a Keep import in progress becomes
    unobservable. Either persist job state in a table or document the limitation in the UI.

- [ ] **Structured logger instead of 99 raw `console.*` calls**
  - Adopt `pino` (or similar) with levels. Keeps prod logs parseable and lets tests silence output.

- [ ] **Client test coverage**
  - Only `ItemCard` and `crypto` are tested. Add tests for `lib/api.ts` (request shaping),
    `lib/export.ts` (CSV/escaping), `store/vaultStore` (auto-lock timing), and the
    `ReminderPoller` / `MondayDigestRedirect` logic in `App.tsx`.

### 🟢 Action Items — Low Priority / Polish

- [ ] **CI pipeline** — GitHub Action running `npm test` + `tsc --noEmit` on push (nothing exists today).
- [ ] **Coverage reporting** — `vitest --coverage` with a threshold gate once coverage improves.
- [ ] **`schema.sql` drift guard** — a test that diffs `schema.sql` against applied migrations.
- [ ] **Accessibility pass** — keyboard nav, focus traps in modals, aria labels on icon-only buttons.
- [ ] **Rate-limit / size-cap file & voice uploads** — `multer` currently has no fileSize limit.

---

## ✅ Critical: Test Coverage (DONE — 65 tests passing)

### 1. `server/src/services/keepImporter.ts` ✅
- [x] Parses `Keep/*.json` path correctly
- [x] Parses `Takeout/Keep/*.json` path (bug we already hit)
- [x] Skips notes with empty title AND empty content
- [x] Deduplicates by content hash
- [x] Handles malformed JSON entries without crashing

### 2. `server/src/routes/items.ts` ✅
- [x] GET /api/items — list with type/category/tag filters
- [x] GET /api/items — `pendingEnrichment=true` filter
- [x] GET /api/items — `enriched=true` filter
- [x] POST /api/items — creates item, sets categories and tags
- [x] PUT /api/items/:id — updates title, categories, tags
- [x] DELETE /api/items/:id — soft delete (sets deleted_at)
- [x] GET /api/items/stats — returns correct counts
- [x] GET /api/items/enrichment — pending vs total counts

### 3. `server/src/db/helpers.ts` — `resolveCategoryPath` ✅
- [x] Creates root category (no parent) — uses single `[name]` param
- [x] Creates child category under existing parent
- [x] Creates full 3-level path: Food > Savory > Indian
- [x] ON CONFLICT partial-index fix is regression-covered

### 4. `server/src/routes/ingest.ts` ✅
- [x] POST /api/ingest/keep — parses uploaded ZIP, returns notes array
- [x] POST /api/ingest/keep/bulk — saves notes to DB, starts background job
- [x] GET /api/ingest/jobs/:id — returns job progress
- [x] POST /api/ingest/text — classifies plain text

### 5. `server/src/routes/vault.ts` ✅
- [x] Create vault item (encrypted payload stored correctly)
- [x] Read vault item requires auth
- [x] Delete vault item — 204 on success, 404 on miss

---

## ✅ Medium Priority (DONE — 130 tests total passing)

- [x] `server/src/services/classifier.ts` — classify() all types, mapToCategories all paths, retry/fallback logic; also fixed non-fiction/fiction key ordering bug
- [x] `server/src/routes/categories.ts` — buildTree nesting, CRUD, 409 conflicts, self-parent guard
- [x] `server/src/routes/search.ts` — query required, embed called, filters, graph endpoint
- [x] `client/src/lib/crypto.ts` — random IV, corrupted ciphertext, empty string, unicode, different salts, long strings

---

## 🔧 Setup & Dependencies

### MarkItDown — File Ingestion (PDF, Word, PPT, Excel, Images)
**License:** MIT — microsoft/markitdown — no restrictions.

**What it does:** Converts documents to Markdown so Ollama can classify them.
Adds a "File" tab to Quick Add (drag-and-drop PDF, Word, PowerPoint, Excel, CSV, images, HTML, EPUB).

**One-time installation (requires Python 3.10+):**
```bash
pip install 'markitdown[all]'
```

**Verify install:**
```bash
markitdown --help
```

**After installing:** Restart the Memex server. Settings → Intelligence Engine will show a green "Installed" badge.

**Supported formats:** PDF · DOCX/DOC · PPTX/PPT · XLSX/XLS · CSV · JPG/PNG/GIF/WebP · HTML · JSON · XML · EPUB · TXT · MD

**How the flow works:**
1. Open Quick Add → File tab
2. Drop or browse a file
3. Click "Convert & Classify with AI" → MarkItDown converts to Markdown → Ollama classifies
4. Review the preview card (title, type, categories, tags)
5. Click "Save to Memex"

**If MarkItDown is not installed:** The File tab shows the pip install command. The server returns HTTP 503 with the install instructions.

**Server endpoints added:**
- `GET /api/ingest/markitdown/health` — returns `{ installed: true/false }` (public, no auth)
- `POST /api/ingest/file` — accepts multipart file, returns classified preview item

---

## 🐛 Known Bugs / Planned Improvements

- [x] **Category staging area — review AI-suggested categories before DB commit** ✅
  - **Done:** Added `GET /api/categories/anomalies` (finds rogue root categories with preview items
    and suggested remapping) and `POST /api/categories/remap` (bulk reassigns all items in a rogue
    subtree to a canonical path, then deletes the subtree bottom-up). New `/categories/review` page
    in the sidebar lists all anomalies, pre-populates the AI suggestion, and supports per-card or
    "Remap All" actions. Also fixed missing `PlaceData` import in `classifier.ts`.

- [x] **"Move to Vault" action on sensitive notes** ✅
  - **Problem:** Google Keep notes often contain sensitive data — bank account numbers, UPI IDs,
    PINs, license keys, contact details — that should be encrypted in the vault, not stored as
    plain text in the items table.
  - **How to implement:**
    1. Add a **"Move to Vault"** button on the Item detail page (and item cards via context menu).
    2. On click: check if vault is unlocked, then encrypt `item.content` client-side.
    3. `POST /api/vault/migrate/:id` to save encrypted blob and hard-delete plain-text version.
  - **Done:** Implemented migration endpoint and UI buttons in Item page and Table View.

- [x] **Category proliferation / duplicates during AI enrichment** ✅
  - **Observed:** After enrichment, many new AI-generated categories appear (e.g. "book", "books",
    "recipe", "travel") alongside the pre-seeded tree (e.g. "Media > Books", "Food > Savory").
    The original seeded categories appear to be pushed down or replaced.
  - **Root cause:** Ollama returns free-form category names in its JSON response (e.g. `["book"]`
    or `["Travel", "Bangkok"]`). `resolveCategoryPath` creates these as new root categories if
    they don't match any existing node — it has no knowledge of the canonical tree.
  - **Fix approach:**
    1. After classify(), map AI categories to the canonical tree using `mapToCategories` as
       primary source when AI categories don't match known roots
    2. OR: normalise AI category names before calling `resolveCategoryPath` — fuzzy-match
       against existing category names and reuse them instead of creating new ones
    3. OR: add a "merge categories" admin action in Settings that deduplicates and reassigns
       items from rogue categories (e.g. "book" → "Media > Books")
  - **Note:** This will get worse as enrichment completes — all 764 notes will add their own
    AI-invented category paths. Best to fix the classifier pipeline before re-running enrichment.
  - **Done:** Implemented fuzzy-mapping in `classifier.ts` and ran a DB cleanup script.


---

- [x] **"Mark All as Reviewed" bulk action for enriched Keep notes** ✅
  - **Done:** `PUT /api/items/review-all` implemented; "Mark All Reviewed" button wired in
    TableView (`/items/table`). Marks only Keep notes with non-empty structured data as reviewed.

---

## 🟢 Features / Improvements

- [x] **Table View — "View All" as a rich data table with filters** ✅

  **Requirement:** Replace the card grid on "View All" with a dense, scannable table showing
  every item's key metadata in one place. Make review actions available inline.

  **Columns (sortable):**
  | Title | Type | Categories | Tags | Summary | Created | Last Updated | Reviewed |
  Each row has a ✓ button to mark reviewed inline (no page reload needed).

  **Filters panel (above table):**
  - Type: All / Note / Recipe / Media / Book / Link / Stock / Spec (pill toggles)
  - Category: dropdown from the canonical tree
  - Tags: multi-select chip input
  - Date range: Created / Updated from–to
  - Status: All / Pending Review / Reviewed / Pending Enrichment
  - Search: full-text across title + summary

  **Done:** Implemented `/items/table` with rich filtering, pagination, and bulk review action.


---

- [x] **Media Intelligence — Movie & Book database auto-extracted from notes** ✅
  - **Requirement:** Extract movies and books from notes. Split multi-entity notes.
  - **Done:** Implemented multi-entity detection in classifier, note splitting in ingest, and `/media` view.

- [x] **Place Intelligence — Restaurant, Café & Location database auto-extracted from notes** ✅
  - **Requirement:** Extract structured places from travel and food notes.
  - **Done:** Added `place` type, structured `PlaceData`, and `/places` view with Maps integration.

---

- [x] **ETA on AI Enrichment progress widget (Sidebar)** ✅
  - Track when enrichment started and how many notes were pending at that point
  - Every poll (5s), compute rate = notes_classified / elapsed_seconds
  - Display: "~12 min left" or "~3 notes/min" alongside the X/764 counter
  - Done: Implemented real-time rate and ETA tracking in Sidebar.

- [x] Wire up model selector in Settings (llama3.2 vs gemma3:4b) ✅
  - Done: Added `settings` table and API, wired UI to toggle models and cloud vs local.

- [x] Pagination on Dashboard and category pages (currently limited to 12/50) ✅
  - Done: Added "Load More" to Dashboard and Prev/Next to Category pages.
- [x] Bulk delete from PendingItems / EnrichedItems pages ✅
  - Done: Added multi-select and bulk delete to both pages.

- [x] Export enriched items as CSV in addition to JSON ✅
  - Done: Added "Export CSV" buttons to Table View, Places, and Media pages.

---

## 🚀 Vision / Future Phases (from Gemini Vision)

- [x] **Actionable Insights Dashboard (The "Wow" Moment)** ✅
  - **Requirement:** Automatically scan user's library and surface 1-3 near-term actionable
    insights on the Dashboard.
  - **Done:** Created `insightService` backend pulling recent/random items, and updated 
    Dashboard UI with an animated, staggered Insight card layout.

- [x] **Celebratory Welcome Experience ("Hello World")** ✅
  - **Requirement:** A personalized onboarding flow when a user first connects their data.
  - **Personas:** Choose between "The Helpful Productivity Partner" (logistics focused) 
    or "The Inspirational Creative Muse" (passion focused).
  - **Flow:** Celebrate the data connection, show immediate value via a few high-level 
    connections the AI made across different notes.
  - **Done:** Created an interactive, animated 3-step onboarding flow in `/welcome`.

- [x] **Advanced Local Structured Outputs (Reliability Upgrade)** ✅
  - Done: Enabled native JSON Mode in `ollama.ts`, implemented "Enum Trick" for categories 
    (providing strict leaf node list in prompt), and forced Temperature 0.0 for reliability.

---

## 🧠 "Knowledge OS" Architecture (Claude Recommendations)

- [x] **First-Class Entity Graph & Resolution** ✅
  - **Requirement:** Turn extracted strings (directors, authors, cities) into actual relational entities (`people`, `places` tables).
  - **Why:** Enables queries like "every movie by this director" or "everything connected to Bangkok" across all note types.
  - **Implementation:** Created `entities` and `item_entities` tables, added `extractAndLinkEntities` to the ingestion and update flows, and wrote an entity resolution background script.

- [x] **Local RAG Q&A ("Ask Your Knowledge")** ✅
  - **Requirement:** A chat interface that queries the local database.
  - **Done:** Implemented `ragService` backend using hybrid search context and AI synthesis,
    and created a dedicated `/ask` chat page with cited sources.


- [x] **Resurfacing / Serendipity Layer** ✅
  - **Requirement:** A dedicated section (or weekly digest) for rediscovery.
  - **Done:** Added `/api/items/rediscover` backend logic and a "Rediscover" widget on the 
    Dashboard showing "On this day" and forgotten items.

- [x] **Confidence Scoring & Curation Queue** ✅
  - **Requirement:** Capture a confidence signal from the AI during extraction.
  - **Done:** Added `confidence` column to schema, updated AI prompts to return a 0-100 score, 
    and added a color-coded "Score" column to the Table View for easy curation of low-confidence items.

- [x] **Data Provenance & Re-processing** ✅
  - **Done:** Added `raw_content TEXT` (immutable, set once at import — backfilled from `content` for existing items)
    and `extraction_model TEXT` to `items` (migration 009). New `item_extractions` table logs every AI run:
    model, type, title, summary, structured, categories, tags, confidence, applied flag.
  - Enrichment pipeline (`classifyAndUpdateBatch` in ingest + `/enrich` in items) now writes to
    `item_extractions` on every run. Auto-applies to `items` only when `reviewed = false` — manually
    confirmed items are protected from overwrite; their extraction is saved for user review.
  - `classify()` now stamps `result.model` from `getAiConfig()` so every extraction is traceable.
  - New endpoints: `GET /api/items/:id/extractions` (history), `POST /api/items/:id/apply-extraction/:id`
    (roll forward/back to any past extraction).
  - `Item.tsx` shows collapsible "Extraction History" panel — model name, date, confidence, active badge,
    per-extraction "Apply" button. "newer available" badge when a more recent extraction isn't active.

- [x] **Multi-modal Capture — Vision** ✅
  - **Done:** Added `visionService.ts` — auto-detects the best installed Ollama vision model
    (`llama3.2-vision:11b` → `llava:7b` → `llava` priority order), converts image buffer to base64,
    calls Ollama `/api/chat` with the image and a structured extraction prompt.
  - `POST /api/ingest/file` now branches: images → vision pipeline, documents → MarkItDown.
    Returns HTTP 503 with pull instructions if no vision model is installed.
  - `GET /api/ingest/vision/health` — returns `{ available, model }`.
  - `FileIngestPanel.tsx` updated: image thumbnail preview on drop, purple "Vision AI · model-name"
    badge when available, yellow warning + pull instructions when no vision model found, smart
    button label ("Analyse with Vision AI" vs "Convert & Classify with AI").
  - Audio (Whisper) not yet implemented.

---

- [x] PWA: test offline mode and share-target flow ✅
  - Done: Configured Workbox runtime caching (NetworkFirst) for API routes, registered SW,
    and implemented share-target intent handling in the Dashboard IngestPanel.

---

## 🚀 GitHub Release Checklist

- [x] **Commit 3 untracked files** ✅ (done in commit 38d0225)

- [x] **Fix ~20 unused import warnings in client** ✅ (done in commit 2c43f25)

- [ ] **Add timeout to insightService / digestService Ollama calls**
  - `insightService.ts` and `digestService.ts` have no timeout on `aiChat()` — a slow/hung
    Ollama blocks the Dashboard and Digest on first load.
  - Fix: wrap in `Promise.race` with a ~15s timeout; return `[]` / null on timeout.
  - (Tracked once here — was previously duplicated in the review action items above.)

---

## 🐞 Known Weaknesses (from full code review) — ALL RESOLVED ✅

- [x] **`crypto.ts` base64 encoding is unsafe on large payloads** ✅
  - Replaced `btoa(String.fromCharCode(...))` with loop-based `toBase64`/`fromBase64` helpers.

- [x] **`auth.ts` SELECT * leaks password_hash to application memory** ✅
  - Now `SELECT id, email, password_hash FROM users WHERE email = $1` (explicit columns).

- [x] **CORS is wide open with no documentation comment** ✅
  - Added explanatory comment in `index.ts`: intentional for local-first single-user use,
    with guidance to restrict origins if ever deployed to a shared server.

- [x] **`Skeleton.tsx` has a framer-motion type mismatch** ✅
  - Typed props as `HTMLMotionProps<'div'>` (was `React.HTMLAttributes<HTMLDivElement>`).
  - Also cleared the last remaining TS error project-wide: `crypto.ts` `deriveKey` salt now
    cast to `BufferSource` (generic-Uint8Array lib mismatch). **Codebase is now zero TS errors.**

---

## 🌟 Feature Backlog

### High Value / Reasonable Effort

- [x] **Browser extension / bookmarklet — one-click "Save to Memex" from any page** ✅
  - **Done:** Persistent bookmarklet key stored in `settings` table (48-char hex, never expires,
    regeneratable). Auth middleware updated to accept bookmarklet key as a JWT alternative.
  - `POST /api/settings/bookmarklet-key` — generates/regenerates the key.
  - `POST /api/ingest/quicksave` — scrape + classify + save in one call, also runs duplicate
    detection and returns `similarItems` in the response.
  - Settings > Bookmarklet section: draggable "Save to Memex" link + copy button + regenerate.
  - The bookmarklet shows a floating toast on any page: "✅ Saved: [title]" or error message.
    Warns if a similar item already exists in Memex.

- [x] **Duplicate / near-duplicate detection at ingest time** ✅
  - **Done:** `duplicateService.ts` — `findSimilarItems(embedding)` queries pgvector at 0.92
    cosine threshold, returns up to 3 hits with id/title/type/similarity.
  - All three preview endpoints (`/url`, `/text`, `/file`) run `classify` and `embedQuery` in
    parallel via `Promise.all`, then append `similarItems` to the response — zero added latency.
  - `IngestPanel` and `FileIngestPanel` show an amber warning card in the preview step listing
    each match with type badge, title, similarity %, and a link to the existing item.

- [x] **Remind me later — actionable dates on any item** ✅
  - Add `remind_at TIMESTAMPTZ` column to items (migration 011)
  - Item page: calendar/date picker to set a reminder
  - Background worker: poll every hour for `remind_at <= NOW()`, push a browser Notification API
    alert (works because it's a PWA)
  - Table View: "Remind" column, filterable by upcoming reminders
  - **Done:** Migration 011 adds `remind_at TIMESTAMPTZ`. `PUT /api/items/:id` accepts `remindAt`
    (ISO string or null). `GET /api/items/reminders/due` returns items with `remind_at <= NOW()`.
    `GET /api/items?hasReminder=true` filter added. `ReminderPoller` in `App.tsx` requests
    notification permission on mount, polls every 60s, fires `Notification` for due items and
    clears `remind_at`. Item page has a datetime picker + "Remind me" / "Clear" UI. Table View has
    "Has Reminder" filter toggle and bell icon on rows. Dashboard shows an "Upcoming Reminders"
    widget listing items with reminders in the next 7 days with relative time labels.

- [x] **Natural language filter on Table View** ✅
  - Text input: "Thai restaurants I haven't visited" → send to Ollama with system prompt asking
    it to return a JSON filter: `{ type: "place", structured.cuisine: "Thai", structured.visitStatus: "want-to-visit" }`
  - Server: `POST /api/items/nl-filter` — runs NL→query conversion, returns same shape as
    `GET /api/items` so Table View can consume it directly
  - Client: replace or augment the search box in TableView with a "Ask a filter" mode
  - **Done:** `nlFilterService.ts` parses NL queries into `{ type, searchQuery, structuredFilters }`
    using Ollama with JSON mode + temperature 0. Field names validated against a SAFE_FIELDS
    whitelist to prevent JSONB injection. `POST /api/items/nl-filter` builds a dynamic WHERE clause
    and returns `{ items, total, parsedFilter }`. TableView has an "Ask AI" sparkle toggle: switches
    the search input to a purple NL mode (fires on Enter or Send button). Below the filter bar,
    "Interpreted as:" badges show each parsed filter component (type, search terms, structured
    fields). Clicking ✕ or Reset returns to normal filter mode.

- [x] **Export to Obsidian / Markdown vault** ✅
  - Each item → `[title].md` with YAML frontmatter:
    ```yaml
    ---
    title: Pad Thai Recipe
    type: recipe
    categories: [Food, Savory, Thai]
    tags: [thai, noodles]
    source: keep
    created: 2024-03-15
    ---
    ```
  - Content goes below the frontmatter
  - Structured data → additional YAML keys (ingredients, director, visitStatus, etc.)
  - Export: ZIP download via `GET /api/items/export/obsidian`
  - Client: "Export as Obsidian Vault" button in Settings
  - **Done:** `GET /api/items/export/obsidian` builds a ZIP (adm-zip, no new deps) with one
    `.md` per item. YAML frontmatter includes title, type, source, created, reviewed, confidence,
    categories, tags, and all structured fields (excluding summary). Summary appears as a Markdown
    blockquote, original content follows. Encrypted items are excluded. Duplicate titles get `(n)`
    suffix. "Export Obsidian" button added to Settings > Data & Privacy.

### Medium Term

- [x] **Weekly digest — local summary of your knowledge activity** ✅
  - A new `/digest` page (or auto-shown on Mondays): what you saved this week, one "On this day"
    memory, one AI-generated connection between two unrelated notes you haven't seen together
  - Server: `GET /api/items/digest` — last 7 days + random older item + Ollama-generated connection
  - No email needed — just a dedicated page that Memex opens to on Monday morning
  - **Done:** `digestService.ts` generates: this-week items (last 7 days), week-over-week count
    comparison, "on this day" (same date a prior year), and an AI-generated cross-domain connection
    between 2 random reviewed items (prefers different types for maximum insight). `GET /api/items/digest`.
    `Digest.tsx` — newspaper-style layout: stat card with trend arrow, item grid, on-this-day
    memory, connection card showing both items as clickable tiles + AI insight in a quote block.
    "Regenerate" button refreshes the Ollama connection. Sidebar nav link added. `App.tsx`
    auto-redirects to `/digest` on Mondays (once per day, tracked in localStorage).

- [x] **Sharing — opt-in public links for items or collections** ✅
  - Add `public_token TEXT UNIQUE` column to items (migration 012)
  - `POST /api/items/:id/share` — generates a random token, sets `public_token`
  - `GET /api/share/:token` — unauthenticated read-only endpoint returns the item
  - Client: "Share" button on Item page copies the share link
  - Use case: "Here's my Bangkok restaurant list" shared with a friend
  - **Done:** Migration 012 adds `public_token TEXT UNIQUE`. `POST /api/items/:id/share` mints a
    40-char hex token; `DELETE` revokes it. Public `GET /api/share/:token` (in PUBLIC_PATHS, no auth)
    returns the item only if non-deleted and non-encrypted. `PublicItem.tsx` at `/share/:token` is a
    standalone read-only page (no sidebar/auth) with self-contained dark styling. Item page has a
    "Public Share" section: create link → copyable URL + revoke. Hidden for encrypted items.

- [x] **Voice memo ingestion (Whisper)** ✅
  - New "Voice" tab in Quick Add: record in-browser (`MediaRecorder` API → WebM blob)
    or upload an audio file (MP3/WAV/M4A/OGG/WebM/FLAC)
  - Server: `POST /api/ingest/voice` — transcribes audio, passes to `classify()`, returns preview
  - Completes the multi-modal capture story alongside vision
  - `GET /api/ingest/whisper/health` — checks if whisper CLI is installed
  - **Done:** `whisperService.ts` mirrors the MarkItDown spawn-a-CLI pattern using `openai-whisper`
    (`pip install openai-whisper`). NOTE: spec said "Ollama ships whisper" but Ollama has no audio
    transcription endpoint — using Whisper CLI directly is the correct local-first approach.
    `transcribeAudio()` writes a temp file, runs `whisper --model base --output_format txt --fp16 False`,
    reads the .txt sidecar, cleans up. `POST /api/ingest/voice` runs transcribe → classify → embed →
    dedupe in parallel, returns `{ preview, similarItems }`. `VoiceIngestPanel.tsx` — in-browser
    recorder (MediaRecorder, live timer, playback) + audio file upload. Shows install instructions
    if whisper missing. `WHISPER_MODEL` env var selects model size. Voice tab added to IngestPanel.
