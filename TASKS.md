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
