# Memex — Task Backlog

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

- [ ] **Commit 3 untracked files**
  - `client/src/pages/CategoryReview.tsx`
  - `server/src/db/migrations/009_data_provenance.sql`
  - `server/src/services/visionService.ts`
  - Also commit migration 010 (`010_place_type.sql`) and all other modified files from this session

- [ ] **Fix ~20 unused import warnings in client**
  - Pre-existing `TS6133`/`TS6196` errors across: `ItemCard.tsx`, `VaultCard.tsx`, `Editor.tsx`,
    `ErrorBoundary.tsx`, `KeepImportPanel.tsx`, `Sidebar.tsx` (Wifi/WifiOff/isOnline),
    `AskMemex.tsx`, `Category.tsx`, `Dashboard.tsx`, `EnrichedItems.tsx`, `MediaView.tsx`,
    `PlacesView.tsx`, `vaultStore.ts`
  - Harmless at runtime but messy; clean up before public release

- [ ] **Add timeout to insightService Ollama call**
  - `server/src/services/insightService.ts`: no timeout on `aiChat()` — if Ollama is slow or
    unresponsive the Dashboard hangs indefinitely on first load
  - Fix: wrap in `Promise.race` with a 15s timeout; return `[]` on timeout

---

## 🐞 Known Weaknesses (from full code review)

- [ ] **`crypto.ts` base64 encoding is unsafe on large payloads**
  - `btoa(String.fromCharCode(...new Uint8Array(encrypted)))` — the spread into `String.fromCharCode`
    hits the JS call stack limit (~125k bytes) on large vault items; silently corrupts data
  - Fix: replace with a loop-based encoder:
    ```ts
    const bytes = new Uint8Array(encrypted)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
    return btoa(binary)
    ```

- [ ] **`auth.ts` SELECT * leaks password_hash to application memory**
  - Line 20: `SELECT * FROM users WHERE email = $1` loads all columns including `password_hash`
  - Fix: `SELECT id, email, password_hash FROM users WHERE email = $1` (explicit columns)

- [ ] **CORS is wide open with no documentation comment**
  - `server/src/index.ts`: `app.use(cors())` — allows all origins, all methods, all headers
  - Correct for local-first use but should have an explicit comment:
    `// Local-first tool — restrict origins if ever deployed to a shared server`

- [ ] **`Skeleton.tsx` has a framer-motion type mismatch**
  - `TS2322` on `Skeleton.tsx:5` — `HTMLMotionProps<"div">` type incompatibility
  - Pre-existing Gemini code, not caught because `noEmit` doesn't run in strict mode for this component

---

## 🌟 Feature Backlog

### High Value / Reasonable Effort

- [ ] **Browser extension / bookmarklet — one-click "Save to Memex" from any page**
  - The ingest API already exists; needs a small browser extension (or simple bookmarklet) that
    sends the current tab's URL to `POST /api/ingest/url` and shows a confirmation popup
  - This is what makes a PKM get used daily — friction-free capture
  - Start with a bookmarklet (no browser store needed): a `javascript:` URL that POSTs to localhost
  - Extension version: Chrome/Firefox WebExtension, manifest v3, single popup UI

- [ ] **Duplicate / near-duplicate detection at ingest time**
  - `pgvector` already stores embeddings for all items
  - At `POST /api/ingest/file|url|text`: after classify, run a cosine similarity query against
    existing embeddings with threshold ~0.92; if matches found, show "You may have already saved
    this" warning with links to the similar items
  - Server: `GET /api/items/similar?itemId=...` (or inline in ingest response as `{ preview, similarItems }`)
  - Client: add a "Similar items found" warning card in the preview step

- [ ] **Remind me later — actionable dates on any item**
  - Add `remind_at TIMESTAMPTZ` column to items (migration 011)
  - Item page: calendar/date picker to set a reminder
  - Background worker: poll every hour for `remind_at <= NOW()`, push a browser Notification API
    alert (works because it's a PWA)
  - Table View: "Remind" column, filterable by upcoming reminders

- [ ] **Natural language filter on Table View**
  - Text input: "Thai restaurants I haven't visited" → send to Ollama with system prompt asking
    it to return a JSON filter: `{ type: "place", structured.cuisine: "Thai", structured.visitStatus: "want-to-visit" }`
  - Server: `POST /api/items/nl-filter` — runs NL→query conversion, returns same shape as
    `GET /api/items` so Table View can consume it directly
  - Client: replace or augment the search box in TableView with a "Ask a filter" mode

- [ ] **Export to Obsidian / Markdown vault**
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

### Medium Term

- [ ] **Weekly digest — local summary of your knowledge activity**
  - A new `/digest` page (or auto-shown on Mondays): what you saved this week, one "On this day"
    memory, one AI-generated connection between two unrelated notes you haven't seen together
  - Server: `GET /api/items/digest` — last 7 days + random older item + Ollama-generated connection
  - No email needed — just a dedicated page that Memex opens to on Monday morning

- [ ] **Sharing — opt-in public links for items or collections**
  - Add `public_token TEXT UNIQUE` column to items (migration 012)
  - `POST /api/items/:id/share` — generates a random token, sets `public_token`
  - `GET /api/share/:token` — unauthenticated read-only endpoint returns the item
  - Client: "Share" button on Item page copies the `http://localhost:3002/api/share/[token]` link
  - Use case: "Here's my Bangkok restaurant list" shared with a friend

- [ ] **Voice memo ingestion (Whisper)**
  - Ollama ships `whisper:base` (145 MB) — transcribes audio to text locally
  - New "Voice" tab in Quick Add: record in-browser (`MediaRecorder` API → WAV blob)
    or upload an audio file (MP3/WAV/M4A)
  - Server: `POST /api/ingest/voice` — sends audio to Ollama Whisper, gets transcript,
    passes to `classify()`, returns preview
  - Completes the multi-modal capture story alongside vision
  - `GET /api/ingest/whisper/health` — checks if whisper model is pulled
