# Memex — Task Backlog

## 🔴 Critical: Missing Test Coverage

These areas have zero tests and have already caused bugs in production.

### 1. `server/src/services/keepImporter.ts`
- [ ] Parses `Keep/*.json` path correctly
- [ ] Parses `Takeout/Keep/*.json` path (bug we already hit)
- [ ] Skips notes with empty title AND empty content
- [ ] Deduplicates by content hash
- [ ] Handles malformed JSON entries without crashing

### 2. `server/src/routes/items.ts`
- [ ] GET /api/items — list with type/category/tag filters
- [ ] GET /api/items — `pendingEnrichment=true` filter
- [ ] GET /api/items — `enriched=true` filter
- [ ] POST /api/items — creates item, sets categories and tags
- [ ] PUT /api/items/:id — updates title, categories, tags
- [ ] DELETE /api/items/:id — soft delete (sets deleted_at)
- [ ] GET /api/items/stats — returns correct counts
- [ ] GET /api/items/enrichment — pending vs total counts
- [ ] POST /api/items/enrich — queues unclassified items

### 3. `server/src/db/helpers.ts` — `resolveCategoryPath`
- [ ] Creates root category (no parent)
- [ ] Creates child category under existing parent
- [ ] Creates full 3-level path: Food > Savory > Indian
- [ ] Upserts (does not duplicate) existing category
- [ ] ON CONFLICT partial-index fix is regression-covered

### 4. `server/src/routes/ingest.ts`
- [ ] POST /api/ingest/keep — parses uploaded ZIP, returns notes array
- [ ] POST /api/ingest/keep/bulk — saves notes to DB, starts background job
- [ ] GET /api/ingest/jobs/:id — returns job progress
- [ ] POST /api/ingest/text — classifies plain text

### 5. `server/src/routes/vault.ts`
- [ ] Create vault item (encrypted payload stored correctly)
- [ ] Read vault item requires auth
- [ ] Delete vault item

---

## 🟡 Medium Priority

- [ ] `server/src/services/classifier.ts` — classify() returns valid schema for recipe, media, note, book types
- [ ] `server/src/routes/categories.ts` — tree structure, item counts
- [ ] `server/src/routes/search.ts` — semantic search returns ranked results
- [ ] `client/src/lib/crypto.ts` — expand beyond happy path (wrong password, corrupted ciphertext)

---

## 🟢 Features / Improvements

- [ ] Wire up model selector in Settings (llama3.2 vs gemma3:4b)
- [ ] Pagination on Dashboard and category pages (currently limited to 12/50)
- [ ] Bulk delete from PendingItems / EnrichedItems pages
- [ ] Export enriched items as CSV in addition to JSON
- [ ] PWA: test offline mode and share-target flow
