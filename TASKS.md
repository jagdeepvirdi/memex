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

- [ ] **Category staging area — review AI-suggested categories before DB commit**
  - **Problem:** Ollama returns free-form category names ("book", "books", "travel", "Bangkok")
    that get created as new DB rows instead of mapping to the canonical seeded tree.
  - **Canonical tree (from `002_seed_categories.sql`) that must be preserved:**
    ```
    Food        → Bakery → Cakes / Cookies / Bread
                → Savory → Indian / Italian / Thai / Chinese
    Media       → Movies → Action / Drama / Horror / Comedy
                → Books  → Fiction / Non-Fiction / Technical
    Tech        → Laptops / Cameras / Phones / Specs
    Finance     → Stocks / Crypto / Notes
    Personal    → Numbers / Contacts
    Links       → YouTube / Instagram / Articles / Docs
    Travel      → Destinations / Hotels / Restaurants / Attractions
    ```
  - **Proposed fix — two-step approach:**
    1. **Fuzzy-map at classify time:** After Ollama returns `categories`, normalise them against
       the canonical tree (case-insensitive, singular/plural, e.g. "book" → "Media > Books",
       "travel" → "Travel"). Fall back to `mapToCategories(type, structured)` when no match.
    2. **Staging area in UI:** New "Review Categories" page — shows all items with AI-assigned
       categories that don't match the canonical tree. User can bulk-remap before commit,
       or approve and let a new root category be created intentionally.
  - **Immediate workaround:** Run a DB cleanup migration to delete rogue root categories
    (those not in the canonical list) and reassign their items to the correct canonical node.
  - **Do after enrichment completes** — running it mid-process would cause conflicts.

- [ ] **"Move to Vault" action on sensitive notes**
  - **Problem:** Google Keep notes often contain sensitive data — bank account numbers, UPI IDs,
    PINs, license keys, contact details — that should be encrypted in the vault, not stored as
    plain text in the items table.
  - **How to implement:**
    1. Add a **"Move to Vault"** button on the Item detail page (and item cards via context menu).
    2. On click: open a small modal asking for the vault master password (to derive the AES key).
    3. Encrypt `item.content` client-side using the existing `encryptVaultItem()` in `crypto.ts`.
    4. `POST /api/vault` to save the encrypted blob, then `DELETE /api/items/:id` to remove the
       plain-text version.
  - **AI can help identify candidates:** During enrichment, flag notes whose content matches
    patterns for bank details, PINs, license keys (regex on structured or content fields).
    Show a "Sensitive?" badge on those item cards so the user notices them.
  - **Vault fields mapping:** `service` = inferred label (e.g. "Bank — HDFC"), `username` = account
    holder name if found, `ciphertext` + `iv` = encrypted content.

- [ ] **Category proliferation / duplicates during AI enrichment**
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
  - **Wait until enrichment finishes** to see the full picture, then fix + re-enrich.

---

- [ ] **"Mark All as Reviewed" bulk action for enriched Keep notes**
  - **Problem:** Every Keep note imports with `reviewed=false`. After Ollama enriches them the
    badge stays — clicking 764 individual REVIEW badges is impractical.
  - **Where to add it:** Button on the `/items/enriched` page header — "Mark All as Reviewed".
  - **Server:** `PUT /api/items/review-all` — sets `reviewed=true` WHERE `source='keep'`
    AND `structured != '{}'::jsonb` (only enriched notes, not pending ones).
  - **Optional quality gate:** Only auto-approve notes that have at least one category AND a
    non-empty summary — leaves genuinely poor classifications still flagged for manual review.
  - **What "reviewed" means:** User has confirmed the AI's type/categories/tags are correct.
    It only controls the pulsing amber REVIEW badge on item cards — no other functional impact.

---

## 🟢 Features / Improvements

- [ ] **Table View — "View All" as a rich data table with filters**

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

  **Implementation notes:**
  - Route: `/items/table` (new page) with URL params for shareable filter state
    e.g. `/items/table?type=media&status=pending-review`
  - Reuse existing `GET /api/items` — it already accepts type, category, tag, enriched,
    pendingEnrichment, unreviewed. Add `q` (full-text) and `sortBy`/`sortDir` params.
  - Add `PUT /api/items/review-all` for the bulk "Mark All as Reviewed" action (see bug above)
  - Pagination: 50 rows per page, URL param `offset`
  - Columns that are long (summary, content) should be truncated with tooltip on hover
  - Export visible rows as CSV directly from this table

  **Why it matters:** With 764 notes, the card grid is impossible to scan. A table lets the
  user triage review status, spot bad AI classifications, and bulk-act in seconds.

---

- [ ] **Media Intelligence — Movie & Book database auto-extracted from notes**

  **Requirement A — Single note, multiple entities (note splitting):**
  When a note lists multiple movies or books (e.g. "Watched: Inception, Interstellar, Dune"),
  Ollama should detect this as a multi-entity note and split it into individual items — one
  item per movie/book — each with its own structured metadata.

  **Requirement B — Per-entity enrichment:**
  Each extracted movie/book item should be enriched with:

  *Movies:*
  - Genre (Thriller / Drama / Comedy / Action / Horror / Sci-Fi)
  - Director, year, cast (top 3)
  - Rating (user's own: 1–5 stars, stored in structured)
  - Watched status (watched / want-to-watch / watching)
  - Streaming platform if mentioned

  *Books:*
  - Author, year published, genre
  - Read status (read / reading / want-to-read)
  - User's rating (1–5 stars)
  - Notes/highlights from the note content

  **Requirement C — Dedicated collection views:**
  - `/media/movies` — table of all `type=media` items: poster placeholder, title, genre,
    director, year, watched status, rating. Filterable by genre/status/rating.
  - `/media/books` — table of all `type=book` items: title, author, genre, status, rating.
  - Both views should support inline status/rating updates without opening the item page.

  **Implementation approach:**

  *Step 1 — Multi-entity detection at classify time:*
  Add a `multiEntity` field to the classifier output. If Ollama detects a list of movies/books,
  return `{ type: 'media', multiEntity: true, entities: [{title, year, ...}, ...] }`.
  The ingest route checks `multiEntity` and creates N items instead of 1.

  *Step 2 — Structured schema extensions:*
  ```typescript
  // Current MediaData
  { genre, year, director, watched }

  // Extended MediaData
  { genre, year, director, cast: string[], watched: boolean,
    watchStatus: 'watched' | 'want-to-watch' | 'watching',
    userRating: 1 | 2 | 3 | 4 | 5 | null,
    streamingPlatform?: string }

  // Extended BookData
  { author, genre, year, status: 'read' | 'reading' | 'want-to-read',
    userRating: 1 | 2 | 3 | 4 | 5 | null,
    highlights?: string[] }
  ```

  *Step 3 — Collection pages:*
  New pages `/media/movies` and `/media/books` with table + filter + inline edit for
  status and rating. These are the "living databases" the user wants.

  *Note on external data enrichment:*
  Ollama can infer genre/director from training data for well-known titles. For unknown
  titles, consider optionally calling a free API:
  - Movies: OMDB API (free tier: 1000 req/day) — `http://www.omdbapi.com/?t=Inception`
  - Books: Open Library API (free, no key) — `https://openlibrary.org/search.json?title=Sapiens`
  This would be an opt-in setting, not automatic.

---

- [ ] **Place Intelligence — Restaurant, Café & Location database auto-extracted from notes**

  **Requirement:** Notes about restaurants, cafés, hotels, attractions, and destinations are
  very common in Google Keep ("Must try — Thai Garden, Bangkok", "Dog-friendly cafés near
  Kanchanaburi", "Hotels near Khao Yai"). These should be extracted and stored as structured
  place entities — not just plain notes — so they're easy to browse, filter, and act on.

  **Structured schema — Place:**
  ```typescript
  interface PlaceData {
    name: string                // "Thai Garden"
    type: 'restaurant' | 'cafe' | 'hotel' | 'attraction' | 'destination' | 'other'
    cuisine?: string            // "Thai", "Italian" — for restaurants/cafés
    city?: string               // "Bangkok"
    country?: string            // "Thailand"
    address?: string            // if mentioned in note or source
    visitStatus: 'visited' | 'want-to-visit' | 'want-to-revisit'
    userRating?: 1 | 2 | 3 | 4 | 5   // user's own rating from note context
    priceRange?: '$' | '$$' | '$$$'   // if mentioned
    notes?: string              // what to order, tips, highlights from note
    mapsUrl?: string            // Google Maps link if present in source
    tags?: string[]             // e.g. ["dog-friendly", "rooftop", "date-night"]
  }
  ```

  **Source enrichment — use every clue available:**
  - **Original note content:** Ollama extracts name, cuisine, city, visit context ("visited",
    "must try", "want to go back") and infers visitStatus + rating from sentiment.
  - **Keep labels:** Labels like "Travel", "Bangkok", "Food" carried over as tags give
    geographic context without needing AI.
  - **sourceUrl (if present):** If the Keep note had a URL (Google Maps link, TripAdvisor,
    Zomato, blog post), re-fetch the URL with Jina to extract richer details — address,
    hours, cuisine, rating from the platform.
  - **Google Maps URL pattern:** `maps.google.com/...` or `goo.gl/maps/...` links in note
    content or sourceUrl can be detected and stored as `mapsUrl` for one-click navigation.

  **Multi-entity detection (same as movies/books):**
  A single Keep note often lists many places ("Dog-friendly spots near Bangkok:
  Kanchanaburi, Khao Yai, Hua Hin"). Ollama should detect this as a multi-entity place
  note and split into N separate place items.

  **Collection view — `/places`:**
  Table with columns: Name | Type | Cuisine | City/Country | Visit Status | Rating | Tags | Source
  - Filter by: type (restaurant/café/hotel/attraction), city, country, visit status, rating
  - Inline edit: visit status (toggle visited/want-to-visit) and rating (star click)
  - "Open in Maps" button if `mapsUrl` is present
  - Group by city or country for trip planning view

  **Maps to canonical category tree:**
  - Restaurant/Café → `Travel > Restaurants`
  - Hotel → `Travel > Hotels`
  - Attraction → `Travel > Attractions`
  - Destination/City → `Travel > Destinations`

  **Why this is powerful:** A Keep note from 3 years ago saying "Try this ramen place in
  Tokyo" becomes a searchable, filterable entry in your Places database — with the original
  source URL, your own rating context, and one-click Google Maps navigation. Your entire
  travel history and wishlist lives in one structured table.

---

- [ ] **ETA on AI Enrichment progress widget (Sidebar)**
  - Track when enrichment started and how many notes were pending at that point
  - Every poll (5s), compute rate = notes_classified / elapsed_seconds
  - Display: "~12 min left" or "~3 notes/min" alongside the X/764 counter
  - Implementation: `GET /api/items/enrichment` already returns `pending` + `total`;
    store `{ startTime, startPending }` in component state on first non-zero result,
    then derive `rate = (startPending - pending) / elapsed` and `eta = pending / rate`
  - Edge cases: rate = 0 (just started, show "calculating..."), rate very slow (show hours)
  - Already have the data — purely a frontend calculation, no server changes needed

- [ ] Wire up model selector in Settings (llama3.2 vs gemma3:4b)
- [ ] Pagination on Dashboard and category pages (currently limited to 12/50)
- [ ] Bulk delete from PendingItems / EnrichedItems pages
- [ ] Export enriched items as CSV in addition to JSON
- [ ] PWA: test offline mode and share-target flow
