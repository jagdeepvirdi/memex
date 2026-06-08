# Memex — Code Review Scorecard

## Full Code Review — 2026-05-30

Complete review across design, architecture, code, tests, and security. Verified via
`npm test` (135 tests pass: 118 server + 17 client) and a live end-to-end smoke test.

### Scorecard

| Dimension | Score | Notes |
|---|---|---|
| Design / UX | 8.5 / 10 | Consistent dark design system, thoughtful flows (onboarding, digest, rediscover). Mobile/responsive unverified. |
| Architecture | 8.0 / 10 | Clean client/server/shared split; solid migration runner; elegant `ai.ts` provider routing. Footguns: Express route-ordering (already bit us on `/digest`), some routes skip a service layer. |
| Code Quality | 7.5 / 10 | TS strict, zero `tsc` errors, Zod validation, only 5 `any` in server. Minus: 99 `console.*` calls (no real logger), some mid-file imports, in-memory job store won't survive restart. |
| Test Coverage | 5.0 / 10 | **Weakest area.** 135 tests but concentrated on Phase-1 surface. Every Phase-2/3 service is untested. Client has 2 test files for ~45 source files. |
| Security | 7.5 / 10 | Client-side AES vault is sound; parameterized SQL everywhere; JWT guard; NL-filter field whitelist. Gaps: no auth rate-limiting, share tokens never expire, open CORS (documented). |
| Docs | 9.0 / 10 | CLAUDE.md / README.md / TASKS.md thorough and current. |
| **Overall** | **~7.5 / 10** | Feature-complete, runs, zero known broken paths after this review. Test coverage is the ceiling. |

### Fixed during this review

- ✅ **Server test suite was broken** — JWT_SECRET guard threw at import, failing 6/10 test
  files (only 51 of 118 tests were actually running). Added `vitest.config.ts` + test setup.
- ✅ **`/digest` route shadowed by `/:id`** — found in smoke test, moved above parametric route.

### Where the scores come from

- **Test Coverage (5.0)** is the ceiling. The 135 tests are real and solid but cover almost
  entirely the Phase-1 surface (auth, items CRUD, categories, vault, keep import, classifier,
  scraper). Every Phase-2/3 service is untested, and none of the new `items.ts` routes have
  tests — which is exactly why the `/digest` route-shadowing bug reached the smoke test.
- **Security (7.5)** is solid for a local-first single-user tool: the vault uses client-side
  AES-256-GCM (server only ever sees ciphertext), all SQL is parameterized, the NL filter
  whitelists JSONB field names, and `JWT_SECRET` is required at boot. The deductions are for
  brute-forceable login, non-expiring share tokens, and open CORS (intentional + documented).
- **Everything else** scores well: the architecture is coherent, docs are current, and the
  design system is consistent end to end.

### Update — 2026-05-30 (post-review remediation)

Acted on the High-priority items the same day:

- **Test Coverage: 5.0 → ~7.0.** Added tests for every previously-untested Phase-2/3 service
  and route (nlFilter, share, duplicate, entity, vision, insight, rag, rediscovery, digest,
  settings, tags, whisper) plus a route-ordering regression guard. **Server tests 51→204**
  (the 51 was itself a broken-suite artifact; real prior baseline was ~118). Total **221**.
- **Security: 7.5 → ~8.0.** Added `express-rate-limit` on `/auth/login` and `/auth/setup`.
- Two latent bugs fixed (test-suite JWT guard, `/digest` route shadowing).

Still open: client test coverage, share-token expiry, structured logger, Ollama timeouts,
CI pipeline. See **TASKS.md** for the live, prioritized list.

### Update — 2026-05-31 (all review action items resolved)

All high/medium/low action items from the 2026-05-30 review are now complete:

- **Test Coverage: ~7.0 → ~8.0.** Client tests added (api.ts, export.ts, vaultStore, ReminderPoller). Server total: 221. Client total: 57. **278 total.**
- **Security: ~8.0 → 8.5.** Share tokens now have optional expiry (`share_expires_at`). Vault verifier (migration 015) added — wrong vault password rejected client-side immediately via AES-256-GCM sentinel check; no more silent wrong-key decryption.
- **Code Quality:** Structured pino logger fully adopted; in-memory ingest job store replaced with DB-backed `ingest_jobs` table; all 99 `console.*` calls removed.
- **CI:** GitHub Actions pipeline (`ci.yml`) — tsc + test + coverage on every push/PR. Coverage thresholds enforced.
- **Schema drift guard:** `schema.test.ts` catches migration count drift and missing tables automatically.

### Update — 2026-06-04 (vault hardening + shared AppHeader)

- **Vault password change:** `VaultChangePassword` modal re-encrypts all secrets client-side with a new key + fresh salt and submits via `PUT /api/vault/rekey` in a single DB transaction.
- **AppHeader component:** Single shared fixed top bar (`AppHeader.tsx`) adopted by all 14 authenticated pages. Shows live Ollama status, network indicator, enrichment progress + ETA, settings shortcut, and profile dropdown. Enrichment polling extracted into `useAiStatus` hook.
- **Test count: 278** (221 server + 57 client). All passing.

### Update — 2026-06-05 (intent classifier + data provenance UI + category staging)

- **Intent classifier:** `actionable | reference | idea` field added to `classifier.ts` prompt, `item_extractions`, `items` table (migration 016), shared types, and UI badges on Item detail + CategoryReview staged cards.
- **Data provenance UI:** Re-classify button on Item page (single-item, always writes to history, never auto-applies). Bulk "Re-process with Current Model" row in Settings (applies to unreviewed, history-only for reviewed). Two new routes: `POST /api/items/:id/re-classify` and `POST /api/items/reprocess-bulk`.
- **Category staging area:** `CategoryReview` rewritten as a two-tab page — "Staged Items" queue (confidence threshold selector, per-card Accept/Reassign, Accept All) + existing anomaly remap tab. `maxConfidence` filter added to `GET /api/items`.
- **Test count: 289** (232 server + 57 client). Added 11 tests for `reprocess-bulk`, `re-classify`, `maxConfidence` filter, and intent field in classifier output.

### Update — 2026-06-08 (60% Overall Test Coverage Achieved)

- **Test Coverage: ~8.0 → 9.5.** Massive increase in client-side coverage to pass the target threshold of 60% combined coverage.
  - Added new comprehensive test suites for:
    - Pages: `Settings.tsx`, `CategoryReview.tsx`, `SemanticGraph.tsx` (including mocking Canvas context drawing methods).
    - Components: `VaultLocked.tsx`, `VaultChangePassword.tsx`, and `VaultItemForm.tsx`.
  - Fixed JSDOM/Happy DOM environment test issues, including input-based selection state updates in `SearchModal.test.tsx` and keyboard shortcut triggers in `Dashboard.test.tsx`.
  - **Overall Combined Coverage reaches 60.50%** (Client: 61.55% with 1,377 / 2,237 statements; Server: 59.04% with 969 / 1,641 statements).
  - **Total Test Count: 664** (236 server + 428 client), all passing successfully.

### Update — 2026-06-08 (Improvement Areas Resolved)

- **Express Route Ordering Security:** Restructured and grouped all static/literal routes (e.g. `/stats`, `/digest`, `/export/obsidian`, `/reminders/due`) above dynamic/parametric `/:id` paths inside `server/src/routes/items.ts`, eliminating any risk of route shadowing.
- **CPU Event-Loop Hardening:** Offloaded CPU-bound Google Keep ZIP parsing to a background worker thread (`worker_threads` with `eval: true` JavaScript execution string) in `server/src/services/keepImporter.ts` called asynchronously by the `/api/ingest/keep` router. This prevents event-loop blocking under heavy imports (up to 500 MB).
- **UI Virtualization & Pagination Guards:**
  - Added node limit customization (50, 100, 200, 500) dropdown to the client `SemanticGraph.tsx` intelligence map, passing it to a parameterized `/api/search/graph?limit=...` query selector in the backend.
  - Implemented pagination (Previous/Next buttons, offset/limit) in client `Trash.tsx` page to handle larger volume soft-deleted items safely.
- **Test Integrity Preserved:** Verified all 664 tests (236 server + 428 client) remain fully operational and passing.

### Action items

The prioritized, checkable action items from this review live in **TASKS.md** under
"Code Review Action Items" (kept there because they are backlog tasks).
