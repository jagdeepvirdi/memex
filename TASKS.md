# Memex — Task Backlog

---

## 📋 Code Review Action Items — 2026-05-30

> Full scores, rationale, and review narrative are in **[SCORECARD.md](SCORECARD.md)**
> (overall ~7.5/10; test coverage is the identified ceiling). Two bugs were fixed during
> the review: the server test suite (JWT_SECRET guard broke 6/10 files) and the `/digest`
> route shadowing. The remaining action items are below.

### 🔴 Action Items — High Priority

- [x] **Test coverage for Phase-2/3 services (the big gap)** ✅
  - Covered: `nlFilterService` (whitelist/type/fallback), `share.ts` route, `duplicateService`,
    `entityService` (dedup, embedding-failure, role mapping), `visionService` (model priority +
    preference), `insightService` (threshold, JSON parse, cap-at-3), `ragService` (embed,
    synthesis, empty short-circuit), `rediscoveryService`, `digestService` (counts, connection
    pairing, graceful AI failure), `settings.ts` route (GET/PUT/bookmarklet-key), `tags.ts` route
    (list/add/remove), `whisperService` (mime + install check).
  - Server test count: 118 → **204**. Total with client: **221**.
  - ⬜ Remaining (lower value): route tests for `/nl-filter`, `/:id/share` POST/DELETE,
    `/:id/extractions` — services behind them are unit-tested; deferring to client coverage work.

- [x] **Add a route-ordering regression guard** ✅
  - `items.routing.test.ts` asserts `GET /api/items/digest` hits the digest handler (distinctive
    `period` shape), and `/reminders/due` + `/export/obsidian` return 200 through the real router —
    catching the `/:id` shadowing bug class that `tsc` and handler-level unit tests miss.

- [x] **Auth rate-limiting** ✅
  - `POST /api/auth/login` has no throttle — brute-forceable. Add `express-rate-limit`
    (e.g. 10 attempts / 15 min / IP) on the auth router.

### 🟡 Action Items — Medium Priority

- [x] **Share tokens never expire** ✅
  - `public_token` is permanent until manually revoked. Add optional `share_expires_at` and
    filter it out in `GET /api/share/:token`. Consider a "share expires in 7 days" default.

- [x] **Replace in-memory ingest job store with something restart-safe** ✅
  - `jobs` object in `ingest.ts` is lost on server restart — a Keep import in progress becomes
    unobservable. Either persist job state in a table or document the limitation in the UI.

- [x] **Structured logger instead of 99 raw `console.*` calls** ✅
  - Adopt `pino` (or similar) with levels. Keeps prod logs parseable and lets tests silence output.

- [x] **Client test coverage** ✅
  - Only `ItemCard` and `crypto` are tested. Add tests for `lib/api.ts` (request shaping),
    `lib/export.ts` (CSV/escaping), `store/vaultStore` (auto-lock timing), and the
    `ReminderPoller` / `MondayDigestRedirect` logic in `App.tsx`.

### 🟢 Action Items — Low Priority / Polish

- [x] **CI pipeline** ✅ — GitHub Action running `npm test` + `tsc --noEmit` on push (`.github/workflows/ci.yml`).
- [x] **Coverage reporting** ✅ — `vitest --coverage` via `npm run coverage`; thresholds configured in vitest.config.ts / vite.config.ts; coverage step in CI.
- [x] **`schema.sql` drift guard** ✅ — `schema.test.ts` checks sequential numbering, all migration tables present in schema.sql, and migration count comment accurate.
- [x] **Accessibility pass** ✅ — `SearchModal`: role="dialog", aria-modal, focus trap, Escape-to-close, aria-label on close button, role="listbox/option" on results. Icon-only buttons in VaultItemForm, Dashboard, Login, Settings all have aria-label.
- [x] **Rate-limit / size-cap file & voice uploads** ✅ — `multer` limits: documents/images 50 MB, audio 100 MB, Keep ZIP 500 MB.

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

## ✅ Vault Hardening & Shared AppHeader — 2026-06-04 (DONE)

- [x] **Shared `AppHeader` component** ✅
  - Fixed top bar with Ollama AI status pill, network indicator, enrichment progress + ETA,
    Settings link, and profile dropdown with logout.
  - Adopted across all 14 authenticated pages — replaces per-page inline headers.
  - `AppHeader.Spacer` sub-component prevents content sliding under the fixed bar.

- [x] **`useAiStatus` hook** ✅
  - Extracted Ollama health polling (30s) and enrichment progress polling (5s) from Sidebar
    into a reusable hook. Returns `{ aiStatus, enrichment, eta, rate, isOnline }`.
  - Dispatches `memex:categories-changed` event when enrichment advances so Sidebar
    category counts refresh automatically.

- [x] **Vault verifier (migration 015)** ✅
  - `verifier` + `verifier_iv` columns added to `vault_config`.
  - First-time setup encrypts sentinel `memex-vault-v1` via `POST /api/vault/setup`.
  - Unlock decrypts sentinel client-side to verify password; wrong password rejected
    immediately — eliminates silent wrong-key decryption.

- [x] **Vault password change** ✅
  - `VaultChangePassword` modal re-encrypts every vault item with a new key + fresh salt,
    submits to `PUT /api/vault/rekey` in a single DB transaction with progress bar.
  - New endpoints: `GET /vault/status`, `POST /vault/setup`, `PUT /vault/rekey`, `POST /vault/reset`.

- [x] **Vault test coverage** ✅
  - 15 new tests covering all new endpoints. **Total: 278 tests (221 server + 57 client).**

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

- [x] **Intent classifier — tag items as actionable | reference | idea** ✅
  - **Done (2026-06-05):** `intent VARCHAR(20)` added to `items` + `item_extractions` (migration 016).
    Classifier prompt updated with intent rules: `actionable` (todo/want-to-do/buy/visit/watch),
    `reference` (factual, how-to, specs, saved for lookup), `idea` (brainstorm, fleeting thought,
    creative concept). Intent badge shown on Item detail page (amber ⚡ / purple 💡 / muted 📖)
    and CategoryReview staged cards.

- [x] **Data provenance — re-classify UI** ✅
  - **Done (2026-06-05):** Re-classify button on Item page — runs classifier on current content,
    saves extraction to history with `applied=false`, never auto-applies; user decides via existing
    Apply button. Bulk "Re-process with Current Model" row in Settings re-classifies all unreviewed
    items in background (pLimit 3), applies results, saves history-only for already-reviewed items.
    New routes: `POST /api/items/:id/re-classify`, `POST /api/items/reprocess-bulk`.

- [x] **Category staging area — two-tab review queue** ✅
  - **Done (2026-06-05):** `CategoryReview` (`/categories/review`) rewritten with two tabs:
    "Staged Items" — low-confidence unreviewed items with confidence threshold selector (50–90%,
    default 70%), per-card Accept / Reassign with inline path input, Accept All;
    "Category Anomalies" — existing rogue root category remap (unchanged).
    `maxConfidence` query param added to `GET /api/items`.

---

- [x] PWA: test offline mode and share-target flow ✅
  - Done: Configured Workbox runtime caching (NetworkFirst) for API routes, registered SW,
    and implemented share-target intent handling in the Dashboard IngestPanel.

---

## 🚀 GitHub Release Checklist

- [x] **Commit 3 untracked files** ✅ (done in commit 38d0225)

- [x] **Fix ~20 unused import warnings in client** ✅ (done in commit 2c43f25)

- [x] **Add timeout to insightService / digestService Ollama calls** ✅
  - `insightService.ts` and `digestService.ts` have no timeout on `aiChat()` — a slow/hung
    Ollama blocks the Dashboard and Digest on first load.
  - Fix: wrap in `Promise.race` with a ~15s timeout; return `[]` / null on timeout.
  - (Tracked once here — was previously duplicated in the review action items above.)

---

## 🐞 Known Weaknesses (from 2026-06-05 brutal review)

- [x] **`nl-filter` SQL field interpolation** ✅
  - Replaced `i.structured->>'${field}'` with `jsonb_extract_path_text(i.structured, $n)`.
  - Exported `SAFE_FIELDS` from `nlFilterService.ts`; added explicit route-level guard as defence-in-depth.

- [x] **Ollama down = silent failure for bulk operations** ✅
  - `reprocess-bulk` now creates an `ingest_jobs` record and returns `{ queued, jobId }`.
  - Tracks per-item failures; marks job `failed` with error count on completion.
  - Callers can poll `GET /api/ingest/jobs/:id` for live progress and final status.

- [x] **Long route handlers — no service layer** ✅
  - Extracted `GET /api/items` list query, `POST /api/items/enrich`, and `POST /api/items/reprocess-bulk` into `server/src/services/itemService.ts`.
  - Added a shared `buildItemQuery()` helper. Refactored `/nl-filter`, `/reminders/due`, and `/:id/related` to use `buildItemQuery()`, reducing copy-paste SQL patterns.

- [x] **Vault reset has no confirmation guard** ✅
  - Server requires `verifiedSentinel === 'memex-vault-v1'` when vault has a stored verifier.
  - Settings replaces "type RESET" with a vault password input; client re-derives PBKDF2 key, decrypts verifier, and only calls reset on success.

- [x] **Remaining `any` types** (12 instances) ✅
  - `ingest.ts`: `notes: any[]` → `KeepNote[]`
  - `classifier.ts`: `entities?: any[]` → `Record<string, unknown>[]`
  - `entityService.ts`: `structured: any` → `StructuredData | null | undefined` with per-type casts
  - `SemanticGraph.tsx`: `GraphNode`/`GraphLink` interfaces replace all `any` callbacks; unused `graphRef` removed
  - `export.ts`: `items: any[]` → `Item[]`; dynamic field access via safe double-cast

- [x] **`POST /api/vault/reset` has no test coverage** ✅
  - 6 test cases: auth guard, no-verifier free reset, missing sentinel → 400, wrong sentinel → 400, correct sentinel → 200, DB rollback → 500.

- [x] **No rate limiting on ingest endpoints** ✅
  - `ingestLimiter`: 30 req/min/IP via `express-rate-limit` on `/url`, `/text`, `/file`, `/voice`, `/quicksave`.

---

## 🐞 Known Weaknesses (from earlier code review) — ALL RESOLVED ✅

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

---

## 🧠 Dev Knowledge Capture (GitHub repos, AI prompts/skills, explainers from Instagram) — planned 2026-11-11

> **Status: PLANNING ONLY — nothing implemented.** Manual paste only (links + captions); no Instagram
> scraping or API. Findings below were verified against the code and the live DB (read-only).
> **Decisions below were confirmed on 2026-11-11 ("go with your recommendations").** Implementation has not started.

### Decisions (DECIDED 2026-11-11)
- [x] **Priority:** new nullable `items.priority` (`essential|useful|skip`), user-owned. **Decided: separate column.**
      Do NOT reuse `intent` — it is AI-assigned, defaults to `reference`, is NULL on all 725 items,
      and `applyClassificationResult` overwrites it on re-classify of unreviewed items.
- [x] **Skip:** **Decided: label only for MVP** (not hidden from digest/search). Revisit hiding in a later phase.
- [x] **GitHub metadata:** **Decided: README-only (via Jina) for MVP.** GitHub API lookup (stars/language/updated)
      is optional in v1 and must respect strict-local mode.
- [x] **Multi-repo captions:** **Decided: split** one caption listing N repos into N items (existing `multiEntity`);
      each split item must get its own `sourceUrl`.
- [x] **Stray categories** (`Links` root holds 218 items, no leaf; `Tech>Link`, `Courses>Tech`, `Travel>Links`):
      **Decided: out of scope** for this feature (kept as optional Phase 3).
- [x] **Creator:** **Decided: handle in `structured` for MVP; link as entity in v1** (Phase 2).
- [x] **Category parent:** **Decided: existing `Tech > AI`** (avoid a name containing `/`, which breaks the `>`/`›` path UI).

### Verified findings that shape the plan
- No new `ItemType`: `item_type` is a Postgres enum; reuse `link` (293 of 725 items already).
  Avoids `CardBase.TYPE_BADGE` (`Record<ItemType,…>`), `ItemCard`/`SearchModal` switches, `SemanticGraph` colours.
- **Capture drops data on save:** `IngestPanel.handleSave` sends only title/type/content/categories/tags/
  source/sourceUrl — `structured`, `intent`, `confidence` are lost. `POST /api/items` also marks items
  `reviewed=true`. `createItem` (db/helpers.ts) and `classifyAndUpdateBatch` don't write `intent`.
- `/ingest/text|url|file|voice` and quicksave previews don't return `intent`; `CreateItemRequest` and
  `createItemSchema` have no `intent` field.
- **Classifier can't pick new leaves alone:** `normalizeCategories` maps the last AI name via flat
  `CANONICAL_MAPPING`; unmapped → parent or `['Links']` for `link`. New leaves need entries in
  `CANONICAL_LEAVES`, `CANONICAL_MAPPING`, and the `link` branch of `mapToCategories`.
  Collisions: `notes`→`Finance>Notes`, `instagram`→`Links>Instagram`, and
  `tutorial|course|design|development|programming`→bare `Tech`. Topic must beat source.
- Manual tab hardcodes `source:'manual'`; nothing is ever tagged `instagram`. No item has `source_url`
  (0 of 725) → no URL dedupe; `content_hash` is never written (CLAUDE.md is stale here).
- Instagram oEmbed in `scraper.ts` is thin/placeholder (login-walled) — the pasted caption is the real source.
- `entityService.extractAndLinkEntities` only branches on media/book/place/stock; `POST /api/items` never calls it.
  `entity_type` is a Postgres enum (person/place/organization/other) — repo→`other`, creator→`person`,
  owner→`organization` needs NO enum migration.
- `digestService.ITEM_COLS` does not select `i.intent` (always undefined there); `DigestResponse` has only `recentItems`.
- `/ingest/keep/bulk` problems to avoid: hardcodes `type='note'`/`source='keep'`, typed to `KeepNote`,
  no rate limit/size cap, job never completes if last note is empty (early return skips `completeJob`).
- Migrations: next is **018**. `migrate.ts` runs sorted, tracked in `_migrations`; `ALTER TYPE … ADD VALUE`
  must be alone in its file (runs outside txn). `schema.test.ts` drift guard: sequential numbers, every
  `CREATE TABLE` in `schema.sql`, and the "reflects all N migrations" comment must match.

---

### Phase 0 — Decisions & baseline (no code)
- [x] Decisions confirmed (see "Decisions (DECIDED 2026-11-11)" above)
- [ ] Read-only baseline: classify existing Tech + Links items with the current classifier, save the output
      to compare after mapping changes (guards against silent re-bucketing)
- [ ] Default (assumed, not explicitly confirmed): do NOT run `reprocess-bulk 'all'` until Phase 1 is verified;
      the 157 unreviewed items are the only ones exposed
      (≈580 reviewed items are already protected — `applyClassificationResult` skips reviewed)

### Phase 1 — MVP: paste a GitHub link or Instagram caption → right category + priority
*No new routes, no entity work. Files in order; migrations first.*

**1. Database**
- [ ] `server/src/db/migrations/018_priority.sql` — `ALTER TABLE items ADD COLUMN IF NOT EXISTS priority VARCHAR(20)` (no enum/CHECK, matches `intent`)
- [ ] `server/src/db/migrations/019_ai_dev_categories.sql` — seed `Tech > AI > Repos / Prompts & Skills / Explainers / Tools`;
      filter Tech root on `parent_id IS NULL`; `INSERT … SELECT … ON CONFLICT DO NOTHING` (idempotent; 018/019 independent)
- [ ] `server/src/db/schema.sql` — add `priority` column + bump "reflects all 19 migrations" comment (required by `schema.test.ts`)

**2. Shared types**
- [ ] `shared/types.ts` — `ItemPriority`, `Item.priority`; `RepoData` shape
      (`kind`, `repoName`, `repoUrl`, `owner`, `creatorHandle`, `whatItDoes`, `promptText`);
      add `structured`, `intent`, `priority`, `confidence` to `CreateItemRequest`

**3. Server persistence**
- [ ] `server/src/db/helpers.ts` — `ItemRow`, `rowToItem`, `ITEM_SELECT_SQL`, `createItem` carry `intent` + `priority`
- [ ] `server/src/services/itemService.ts` — list select + priority filter
- [ ] `server/src/routes/items.ts` — `createItemSchema`, `POST` INSERT (shifts param order), `updateItemSchema`, `listQuerySchema`;
      review the auto `reviewed=true` rule on `POST /api/items` so AI-captured items are not silently marked reviewed

**4. Classification**
- [ ] `server/src/services/classifier.ts` — add leaves to `CANONICAL_LEAVES`; `CANONICAL_MAPPING` entries
      (repos, prompts, skills, explainers, tools, github); `link` branch; **deterministic pre-pass:**
      `github.com/<owner>/<repo>` as main subject → Repos leaf; prompt rules for repo/prompt/skill/explainer
      `structured` shapes; rule that topic beats `instagram` source
- [ ] `server/src/services/summarizer.ts` — return `intent`, repo-aware summary ("what it is / what it's for")
- [ ] `server/src/routes/ingest.ts` (`/text`, `/url`) — return `intent`; detect instagram.com URL → `source='instagram'` + `sourceUrl`;
      regex-extract GitHub URL into `sourceUrl`

**5. Client**
- [ ] `client/src/components/ingest/IngestPanel.tsx` — send full payload (structured/intent/priority/confidence); priority picker; source auto-detect/selector
- [ ] `client/src/components/ingest/FileIngestPanel.tsx`, `VoiceIngestPanel.tsx` — same payload fix
- [ ] `client/src/lib/api.ts` — `fetchItems` priority filter option
- [ ] `client/src/components/cards/LinkCard.tsx`, `client/src/pages/Item.tsx` — show repo name/URL/what-it-does; priority picker on Item page

**6. Tests**
- [ ] `classifier.test.ts` (mapping, pre-pass, collisions), `items.test.ts` (INSERT param shift, priority), `ingest.test.ts`, `schema.test.ts` (migration count)
- [ ] Client: `IngestPanel` cases (payload includes structured/priority; instagram source detection)
- [ ] Run the before/after classify diff against the Phase 0 baseline

**Acceptance:** paste `https://github.com/owner/repo` → lands in `Tech > AI > Repos`, summary says what it is for,
`structured` + priority saved, source URL set. Paste an Instagram caption → topic category (not `Links>Instagram`),
`source='instagram'`.

### Phase 2 — v1: entity linking, digest, bulk import
- [ ] `server/src/services/entityService.ts` — branch on `type==='link' && structured.kind` (key on `structured.kind`, not `type`):
      creator→`person`, owner→`organization`, repo→`other`; call from `POST /api/items`; `seedEntityGraph.ts` backfill
- [ ] `server/src/services/digestService.ts` — add `i.intent`, `i.priority` to `ITEM_COLS`; additive `byPriority` field
      (keep `recentItems` so `Digest.test.tsx` passes); update `Digest.tsx` + tests
- [ ] **Bulk route** `POST /ingest/paste/bulk` (do NOT clone `/keep/bulk` as-is):
  - [ ] Generalize `classifyAndUpdateBatch` — source, sourceUrl, intent as parameters; fix the early-return job-completion bug
  - [ ] Add `ingestLimiter` + size cap; per-item error tracking
  - [ ] Dedupe by normalized URL; optional `items_source_url_idx` in migration 020 (must tolerate existing duplicates)
  - [ ] `PasteImportPanel` tab reusing Keep job polling (`GET /ingest/jobs/:id`)
- [ ] `TableView` — priority filter + bulk triage actions (set priority on selection)
- [ ] Optional: GitHub API lookup (stars, language, updated) — only if approved; respects strict-local mode
- [ ] Tests for each of the above

### Phase 3 — Optional / later
- [ ] Backfill priority/intent for existing items (explicit opt-in only; all 725 are NULL intent today)
- [ ] Fix intent plumbing on all capture paths (`classifyAndUpdateBatch`, quicksave) as a bonus
- [ ] Clean stray categories (`Tech>Link`, `Courses>Tech`, `Travel>Links`, 218 bare-`Links` items)
- [ ] Update stale CLAUDE.md claims (content-hash dedupe, Instagram caption scraping)
- [ ] If `'repo'` entity type is ever wanted: own migration file with only `ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'repo'`
      (no-txn), run before code that inserts it; update TS `EntityType` + `SemanticGraph.tsx` colours

### Risks
- **Silent re-bucketing:** new mapping keys (`ai`, `tools`, `prompts`) change every future capture; `reprocess-bulk 'all'`
  would re-map the 157 unreviewed items. Mitigate: append-only mapping changes + the Phase 0 diff.
- **GitHub pre-pass** must match only a repo URL as the main subject, not any mention of one.
- **Migrations:** 018/019 idempotent; keep numbering gapless; update `schema.sql` + count comment or `schema.test.ts` fails.
- **Re-classify clobber:** `applyClassificationResult` overwrites `intent`/categories on unreviewed items — another reason for a separate `priority`.
- **Accuracy:** a 3B local model gives vague "what it's for" on thin READMEs; a pasted caption often explains the use case better.
- **Strict-local mode** blocks the Jina fetch → bare GitHub links yield nothing useful; fall back to pasted text.
- **Existing data barely affected:** only 3 of 725 items mention GitHub/Instagram URLs.

---

## 🤖 Multi-AI Providers + 🎬 YouTube Understanding + 🍳 Recipe Extraction — planned 2026-11-11

> **Status: PLANNING ONLY — nothing implemented.** Requested by the user on 2026-11-11:
> (1) let Memex use Claude API and Gemini API as well as local Ollama;
> (2) understand, title, categorize and keep the many YouTube links already saved;
> (3) on request, extract the content of a video to explain it;
> (4) on request, extract a recipe from a video and save it as its own item.
> Findings below were verified against the code and the live DB (read-only).
> **Migration numbers:** 018/019 are reserved by the Dev Knowledge Capture plan above. Numbers below use
> `0NN` and must be assigned gaplessly in whatever order the work actually ships.
> **Decisions confirmed 2026-11-11** — see "Decisions (DECIDED …)" at the end of this section. Implementation has not started.

### Verified findings

**AI routing (`server/src/services/ai.ts`, `settings.ts`)**
- `aiChat()` supports exactly two backends: Ollama, or Claude when `use_claude=true` AND `ANTHROPIC_API_KEY` is set.
  `@anthropic-ai/sdk` is the only cloud SDK installed; no Gemini SDK (`@google/genai`) in `server/package.json`.
- The Settings UI hardcodes one cloud option (`Claude 3.5 Sonnet (Cloud)`) and a boolean `use_claude` — a single global
  switch, so there is no per-task choice (cheap bulk classification vs. smart on-demand explain).
- The Claude branch **ignores `format`** (no JSON mode), hardcodes `max_tokens: 2048`, and defaults the model to
  `claude-3-5-sonnet-20240620` (old). The classifier depends on strict JSON, so cloud classification relies on its
  parse-retry path.
- **`strict_local_mode` is enforced only in `scraper.ts`.** It is NOT checked in `aiChat()`. With `use_claude=true`
  and a key set, Claude is still called while strict-local is on. Must be fixed before any cloud provider is added.
- **Do not store API keys in the `settings` table:** `GET /api/settings` returns every row to the client (it already
  returns `bookmarklet_key`). Keys must stay in server env vars; the UI should only see "configured: yes/no".
- Embeddings always go through Ollama (`nomic-embed-text`, 768-dim pgvector). Changing the embedding provider would
  invalidate every stored vector → **keep embeddings local**; only chat/generation becomes multi-provider.
- Provenance already exists: `items.extraction_model` and versioned `item_extractions` (migration 009), so which
  provider/model produced a result can be recorded as a string (e.g. `claude:<model>`, `gemini:<model>`) with no schema change.
- Privacy exposure: the live DB holds plaintext credential-like items (now filed under `Personal > Bank`). Any cloud
  path (re-classify, insights, digest, ask/RAG) could send them off-machine. Needs an explicit guard.

**YouTube (`scraper.ts`, live DB)**
- 115 active items contain a YouTube URL (types: link 70, media 32, note 12, recipe 1); **113 of them are only a bare
  URL (<200 chars)** with titles like `YouTube Video` / `Untitled`. **0 have `source_url` set**, so the video URL
  is just text in `content` — no dedupe, no source badge.
- `extractYoutubeId` **does not recognise Shorts** (`youtube.com/shorts/<id>` → null; verified) → **14 saved links**
  fall through to the generic Jina scraper. Playlist links (0 saved) are also unhandled.
- Ingest path (`scrapeYoutube`): oEmbed title + `youtube-transcript` (unofficial package, breaks when YouTube changes).
  On any failure it returns the literal text `Transcript unavailable.` and the item is still classified on that.
  oEmbed also returns `author_name` (channel) which is discarded. No description, duration or publish date is kept.
- Nothing re-enriches the existing 113 bare links; `pendingEnrichment` only covers items that failed classification.
- Whole-transcript → classifier is untruncated in the scraper; long videos need chunk/summarise-then-classify.

**Recipes**
- There is **no `recipeParser.ts`** (CLAUDE.md is stale). Recipes only come from the classifier setting
  `type='recipe'` + `structured: RecipeData {ingredients[], steps[], servings?, prepTime?, cookTime?, cuisine?, mealType?}`.
  28 recipes exist; 19 have an `ingredients` field. Nothing links a recipe item back to a source item.

### Recommended design
- **Providers:** `ollama` (default, local), `claude`, `gemini`. One registry in `ai.ts`; `aiChat()` gains a `task`
  hint (`classify | summarize | explain | extract | ask | insight`). A per-task provider map lives in `settings`
  (`ai_provider_default`, `ai_provider_<task>`).
- **Default routing:** bulk/background work (classify, enrich, digest) stays on local Ollama (free, private, no rate limits).
  Cloud providers are opt-in per task, aimed at on-demand quality work (`explain`, `extract`, optionally `ask`).
- **Privacy rule:** a `cloudSafe(item)` guard blocks sending `type='password'`, encrypted items, and anything in
  `Personal > Bank` to a cloud provider; plus a one-time `allow_cloud_ai` consent flag. `strict_local_mode` hard-forces Ollama.
- **YouTube:** fix recognition (Shorts, `m.`, `music.`, embed, live), store the URL in `source_url` with
  `source='youtube'`, capture channel + title (+ description if obtainable), and keep the transcript out of `content`
  noise by storing a capped transcript separately (`structured.transcript`) with a flag when unavailable.
  Gemini can take a YouTube URL directly as video input (verify current API behaviour at implementation time), which would
  cover videos that have no transcript — treat as optional, cloud-only.
- **Backfill:** an explicit, user-triggered, resumable job over the 115 existing items (dry-run first, review queue,
  never overwrite reviewed items) — not automatic.
- **Explain / Extract on request:** new buttons on the Item page: *Explain this video*, *Extract recipe*.
  Results are saved on the item (`structured.explanation`) or as a **new linked item** (recipe) via a
  `derived_from` link back to the video item. User picks the provider per click (default = per-task setting).

---

### Phase A — Provider layer (foundation; do first)
*No data migration. Touches settings + AI plumbing only. Existing behaviour (Ollama default) must be unchanged.*

- [x] **A0. Fix `strict_local_mode` enforcement inside `aiChat()`** — when on, force Ollama and refuse cloud (ship this fix on its own first; it is a latent bug today)
  - **Done 2026-11-11:** `getAiConfig()` now returns `strictLocal`; `ai.ts` `claudeEnabled()` returns false when strict-local is on, used by both `aiChat()` and `activeProvider()`. New `ai.test.ts` (6 tests). Server tests 268 → 274, `tsc` clean. Not yet committed.
- [ ] `server/package.json` — add `@google/genai` (pin exact version, ≥2 weeks old)
- [ ] `server/src/services/ai.ts` — provider registry; `Provider { id, chat(), available() }`; `aiChat(..., { task, provider? })`;
      `activeProvider()` returns the resolved provider; keep `aiEmbed` Ollama-only
  - [ ] Claude: JSON mode (instruct + strip fences, or tool-use for structured output), configurable `max_tokens`, model from env/settings; update stale default model id
  - [ ] Gemini: `responseMimeType: 'application/json'` for JSON tasks, model from `GEMINI_MODEL` env/settings
  - [ ] Errors/timeouts/rate-limit (429) mapped to one error type; **fallback to Ollama** on provider failure for background tasks (log it), but not for user-initiated explain/extract (surface the error)
  - [ ] Record `extraction_model` as `<provider>:<model>`
- [ ] `server/src/services/settings.ts` — `getAiConfig()` returns `{ provider, model, perTask, allowCloud }`; keep backward compat with `use_claude`/`ai_model` (migrate old values on read)
- [ ] `server/src/routes/ai.ts` (new) — `GET /api/ai/providers` → `[{id, configured, models[]}]` (never returns keys); `POST /api/ai/test` → one tiny round-trip to verify a provider works
- [ ] Privacy guard — `cloudSafe(item)`; apply in re-classify, `reprocess-bulk`, insights, digest, RAG ask; unit-tested
- [ ] `.env.example` / docs — `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `GEMINI_MODEL`
- [ ] `client/src/pages/Settings.tsx` — replace hardcoded model `<select>` with provider + per-task selectors, "key configured" status, "Test connection", cloud-consent toggle, strict-local explanation
- [ ] `client/src/lib/api.ts` — `fetchAiProviders`, `testAiProvider`
- [ ] Tests: `ai.test.ts` (routing, strict-local, fallback, per-task, cloudSafe), Settings test update, settings route test
- **Acceptance:** with nothing configured, behaviour is identical to today; with a Claude or Gemini key set, a chosen task runs on that provider; strict-local always forces Ollama; no key is ever returned by an API.

### Phase B — YouTube understanding (organize what's saved + better capture)
- [ ] `server/src/services/scraper.ts` — widen `extractYoutubeId` (Shorts, `m.`/`music.` hosts, `/embed/`, `/live/`); keep oEmbed `author_name`; return structured `{title, channel, videoId, transcript?, transcriptAvailable}`; cap/chunk long transcripts
- [ ] `server/src/services/scraper.test.ts` — Shorts, mobile, `si=` params, playlist (graceful), transcript-failure cases
- [ ] `server/src/services/summarizer.ts` / `classifier.ts` — YouTube-aware prompt: topic category (topic beats `youtube` source), tags, 2–3 sentence summary, and **detect "this is a recipe / tutorial / review / talk"** to suggest the Extract action; when no transcript, classify on title + channel and mark low confidence
- [ ] `server/src/routes/ingest.ts` — set `source='youtube'` and `sourceUrl`; detect a YouTube URL in pasted *text* too (the Manual tab), not just the URL tab
- [ ] `server/src/routes/items.ts` — normalised-URL dedupe check for `source_url`
- [ ] **Backfill job** (explicit, user-triggered, resumable): `POST /api/ingest/youtube/backfill {dryRun}`
  - [ ] Select the 115 existing items containing a YouTube URL; extract URL → `source_url`, fetch title/channel/transcript, classify
  - [ ] Dry-run returns a before/after preview; apply writes extractions via the existing versioned `item_extractions` path; **skips reviewed items**; reuses the ingest job/progress mechanism (and fix its early-return `completeJob` bug)
  - [ ] Rate-limit politely against YouTube; per-item failure list (private/removed videos) instead of silent `Transcript unavailable.`
  - [ ] Multi-URL items (e.g. a note with two Gordon Ramsay links) → offer split
- [ ] `client` — video card variant (channel, thumbnail from `https://i.ytimg.com/vi/<id>/hqdefault.jpg`, "open on YouTube"), source badge; "Backfill YouTube" action with preview + progress
- [ ] Optional (cloud, needs Phase A): Gemini direct-URL video understanding for transcript-less videos
- [ ] Tests: scraper, classifier YouTube cases, backfill dry-run/skip-reviewed, ingest source detection
- **Acceptance:** pasting any YouTube/Shorts link yields a real title, channel, category, tags and summary with `source_url` set; the backfill turns bare `YouTube Video` items into named, categorised items without touching reviewed ones.

### Phase C — Explain & Extract on request
- [ ] Migration `0NN_derived_from.sql` — `items.derived_from UUID REFERENCES items(id) ON DELETE SET NULL` (+ index); mirror in `schema.sql` + migration-count comment (required by `schema.test.ts`)
- [ ] `shared/types.ts` — `Item.derivedFrom`; `ExplainResponse`; `structured.explanation` shape; request types with optional `provider`
- [ ] `server/src/services/explainService.ts` (new) — fetch/cached transcript (or page text) → chunk → map-reduce summary → structured explanation (key points, steps, takeaways); uses `aiChat({task:'explain'})`; honours `cloudSafe` + strict-local
- [ ] `server/src/services/recipeExtractor.ts` (new) — transcript/text → `RecipeData` (ingredients, steps, times, servings) with validation; returns `{ recipe, confidence }`; flags "no recipe found" instead of inventing one
- [ ] `server/src/routes/items.ts` — `POST /api/items/:id/explain` and `POST /api/items/:id/extract-recipe`:
  - explain → saves to `structured.explanation` on the same item (sets `extraction_model`)
  - extract-recipe → **creates a new `type='recipe'` item** under `Food`, `derived_from` = video item, `source_url` = video URL, `reviewed=false`; original video item untouched
  - both Zod-validated, rate-limited, return 409 if already extracted (with a force flag)
- [ ] `client/src/pages/Item.tsx` — *Explain* and *Extract recipe* buttons (shown by item kind), provider chooser, progress state, link between video item and derived recipe both ways
- [ ] `client/src/components/cards/*` — recipe card shows "from video" link
- [ ] `server/src/services/entityService.ts` — optional: channel as `organization` entity (YouTube channel) — only if the Phase 2 entity work above has shipped
- [ ] Tests: explain/extract services (mocked `aiChat`), route tests (new item created + linked, duplicate guard), Item page tests
- **Acceptance:** on a cooking video, *Extract recipe* creates a separate, editable recipe item linked to the video; on a lecture/tutorial, *Explain* stores a structured explanation; neither runs unless the user clicks.

### Risks
- **Cost & rate limits (cloud):** bulk work on cloud is billable and rate-limited — hence local default and per-task opt-in; show which provider will be used before running.
- **Privacy:** plaintext credentials exist in the DB today; without `cloudSafe` + consent a cloud re-classify/ask could upload them. Do not enable cloud before the guard ships.
- **Strict-local gap** (A0) is a live bug the moment `use_claude` is turned on.
- **Key leakage:** never put provider keys in the `settings` table (returned wholesale by `GET /api/settings`).
- **Transcript fragility:** `youtube-transcript` is unofficial; videos without captions, age-gated, removed or private will fail — backfill must report these, not fake content.
- **JSON reliability differs by provider:** Claude/Gemini need their own JSON handling; classifier's parse-retry must be tested against each.
- **Quality drift:** classifications from different providers differ; record `<provider>:<model>` in provenance and keep the existing "never overwrite reviewed" rule.
- **Backfill blast radius:** 115 items, some misfiled as `media`/`note`; always dry-run first; reviewed items are protected.
- **Migration ordering:** `derived_from` migration must take the next free number after the Dev Knowledge plan's 018/019 (and any 020 dedupe index); keep gapless.
- **Recipe hallucination:** a small model may invent steps; require "no recipe found" path and a confidence field; mark `reviewed=false`.

### Decisions (DECIDED 2026-11-11 — "go with your recommendations")
- [x] **Cloud scope:** on-demand tasks only (explain, extract, optionally ask). Ollama handles all bulk/background work.
- [x] **API keys:** server env vars only (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`); never in the `settings` table; UI shows "configured: yes/no" only.
- [x] **Models per task:** deferred to implementation — check current Claude/Gemini model lists and pricing then, and put ids in env/settings (no hardcoded ids).
- [x] **Gemini direct YouTube-URL input:** optional, last item of Phase B, cloud-only, needs Phase A.
- [x] **YouTube backfill:** button-triggered with a dry-run preview first; never automatic; skips reviewed items.
- [x] **Explain output:** separate `structured.explanation` block; never overwrites `content`.
- [x] **Recipe extraction:** always creates a new linked recipe item (`derived_from`); original video item kept.
- [x] **Privacy guard:** BLOCK `Personal > Bank`, `type='password'` and encrypted items from cloud providers (not just warn); plus `allow_cloud_ai` consent flag; `strict_local_mode` forces Ollama.
