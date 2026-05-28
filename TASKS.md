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
