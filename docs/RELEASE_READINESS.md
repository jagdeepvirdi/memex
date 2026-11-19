# Release readiness record (Phase 8)

Started 2026-11-19. Evidence is automated tests, builds and disposable-database rehearsals unless a row says otherwise. Synthetic data only; no provider or user-content call was made. This is a verification record, not a deployment claim: nothing here was deployed.

**Result column:** `pass` = automated evidence ran green in this phase; `partial` = covered by tests but not exercised in a real browser or against a live provider; `not run` = no evidence gathered yet.

## Gate commands (2026-11-19)

| Gate | Command | Result |
|---|---|---|
| Type checks | `npx tsc --noEmit` (server, client); `npm run typecheck` (mcp) | pass |
| Tests | `npm test` per package | server 1802 pass / 17 skipped (opt-in `*.realdb` suites); client 941 pass; mcp 32 pass |
| Builds | `npm run build` per package | pass |
| Advisories | `npm audit --omit=dev` per package | 0 vulnerabilities |
| Route inventory | `<Route path>` in `client/src/App.tsx` and every `router.<verb>('..')` in `server/src/routes/*.ts`, `4678331` vs now | client routes identical; 97 server endpoints, none added or removed |
| Migrations from empty | `npm run migrate` on a fresh pgvector Postgres (port 5951, container removed afterwards) | 26 applied; second run "Nothing to migrate" |
| Backup/restore mechanics | `pg_dump --no-owner --no-privileges`, mutate (delete 11 items, add 1), drop `public`, `psql -v ON_ERROR_STOP=1 -f` | 25 items, 47 categories, 4 settings, 26 migrations restored; the added row is gone; `vector` extension present |
| Docker image build | `docker compose build` | **blocked**: failed twice at `npm install` with npm's internal "Exit handler never called!" (2026-11-19, local Docker Desktop). Not re-verified; CI's `docker-smoke` job is the authority. |

The backup *script* (`npm run backup`) was not run: this machine has no `pg_dump`, and its Docker mode targets the real library's container. The script's logic is covered by `lib/backup.test.ts`; the dump/restore mechanics above were checked by hand.

## Regression matrix

| # | Workflow | Evidence | Result | Limitation |
|---|---|---|---|---|
| 1 | Account setup, login, logout, session refresh, rate limit | `routes/auth*.test.ts`, `lib/session.test.ts`, `sessionMiddleware.test.ts`, client `Login.test.tsx`, `authStore.test.ts` | pass | no real-browser login run this phase |
| 1 | JWT handling | `lib/session.ts` (7 d token, sliding refresh, 30 d cap); algorithm now pinned to HS256 in `index.ts` and `routes/auth.ts` | pass | |
| 2 | Capture: text, URL, YouTube, Instagram caption, file, audio, Keep ZIP, paste import, bookmarklet | `routes/ingest*.test.ts`, `services/scraper*.test.ts`, `keepImporter`, `pasteImport`, `quickSave`, `auth.bookmarklet.test.ts`, client `IngestPanel`, `PasteImportPanel` | partial | file and audio paths need MarkItDown and Whisper; mocked |
| 2 | Ingest job lifecycle, cancel, progress | `ingestJobs.*.test.ts`, `ingest.cancel.test.ts`, `jobControl`, client `useActionJob` | pass | |
| 2 | Classification and refinement | `services/classifier*.test.ts` | partial | model quality is not measured by these tests |
| 3 | Library, edit, versions, review, trash, bulk, CSV | `routes/items*.test.ts`, client `Item`, `Trash`, `TableView`, `PendingItems`, `EnrichedItems`, `export.test.ts` | pass | |
| 3 | Reminders | `items.routing.test.ts`, client `api.test.ts`, `Dashboard.test.tsx` | partial | no end-to-end firing test |
| 4 | Search, Ask with citations, keyword fallback | `search*.test.ts`, `ragService`, `retrievalService`, client `AskMemex`, `SearchModal` | pass | `*.realdb` ranking suites are opt-in and were not run |
| 4 | Graph, related items, duplicates, rediscovery, digest | `entity*`, `duplicateService`, `rediscoveryService`, `digestService`, client `SemanticGraph`, `Digest` | pass | |
| 5 | Settings, providers, consent, Strict Local, API keys | `routes/settings`, `ai*.test.ts`, `services/ai*.test.ts`, `cloudSafe*.test.ts`, `apiKeys`, client `Settings`, `AiProviderSettings`, `ApiKeysPanel`, `AiSetupStep` | pass | live providers not called (needs explicit approval) |
| 5 | Embedding switch and re-embed | `embeddingSwitch`, `reembedJob`, `ai.embedding.test.ts`, client `EmbeddingSettings` | pass | `reembed.realdb` opt-in, not run |
| 5 | Vault encrypt, lock, rekey | `routes/vault.test.ts`, client `crypto.test.ts`, `vaultStore`, `VaultChangePassword` | pass | |
| 6 | Public share, expiry, revoke | `routes/share.test.ts`, client `PublicItem.test.tsx` | pass | |
| 6 | MCP key scope, private filtering, strict local | `auth.mcp.test.ts`, `lib/mcpScope.test.ts`, `routes/mcp.test.ts`, `mcp/` (32 tests) | pass | not run against a real assistant (known) |
| 6 | CORS, loopback bind, bookmarklet scope | `lib/corsPolicy`, `lib/bookmarkletScope`, `lib/startup*.test.ts` | pass | |
| 7 | Backup and restore | rehearsal above; `lib/backup.test.ts` | partial | script not run end to end here |
| 7 | Migrations and data preservation | rehearsal above; `db/migrator.test.ts`, `db/schema.test.ts` | pass | upgrade from an older populated database not rehearsed this phase |
| 7 | Sample data load/clear | `routes/demo.test.ts`, `services/demoData.test.ts` | pass | `demoData.realdb` opt-in |
| 8 | PWA shell-only cache, no API caching | `lib/apiCachePolicy.test.ts`, client `pwaCache.test.ts`; build precaches 12 entries | pass | install and share target not run on a device |
| 8 | Theme (system, light, dark) | client `theme.test.ts`, `ThemeToggle.test.tsx` | partial | no visual review this phase |
| 8 | Site: 768 px layout, contrast, focus, semantics, reduced motion (Playwright, local static server, 2026-11-19) | 768 px: no horizontal overflow. WCAG AA text contrast over 159 text elements in both themes after transitions settle: 0 failures. All 27 visible focusable controls show a focus indicator. One `h1`, no skipped heading levels, `main`/`header`/`footer`, two labelled `nav`s, skip link, every image has `alt`, `lang=en`, a `prefers-reduced-motion` rule exists. | pass | reduced motion checked by CSS rule only; no screen reader; app screens (not the site) not yet reviewed |
| 8 | App screens: 19 routes (dashboard, Ask, table, media, places, graph, vault, trash, pending, enriched, category review, digest, five settings tabs, appearance, item page) x 375/768/1280 px x dark/light, scratch server with 39 sample items, no Ollama, no cloud keys (Playwright, 2026-11-19) | 0 console errors; 0 horizontal overflow; 0 text-contrast failures (WCAG AA) in either theme. Found and fixed before this commit: icon-only back, close, clear, show-password and star-rating buttons, two checkbox groups and the reminder date field had no accessible name; the dashboard and the locked-vault screen had no `h1`, and the locked-vault screen had no `main` landmark. Re-run after the fix at 375 and 1280 px: 0 unlabeled controls, one `h1` and one main landmark per screen. | pass | tap targets under 24 px remain in dense tables and card actions (not changed); keyboard order, reduced motion and screen readers not exercised in the app; Item page tested with one sample item only |
| 9 | Public site and install path | Phase 7 checks at 375 and 1280 px, plus 768 px above; all 10 distinct external links return 200 (GitHub repo, README, SECURITY, CHANGELOG, issues, v1.2.0 release, MCP anchor, modelcontextprotocol.io, Docker Desktop, the live site); install path partly blocked by the Docker build failure | partial | claim-to-code trace of the feature lists still open; unused source PNGs in `site/brand/` (about 1.8 MB, never loaded by the page) left in place |

## Defects and findings

| ID | Severity | Workflow | Finding | Disposition | Retest |
|---|---|---|---|---|---|
| F-8-001 | medium | 2, 9 | Saving a link contacts r.jina.ai, YouTube/Instagram oEmbed, and api.github.com for repos, but the README footer and site said nothing leaves the machine without a cloud provider | fixed in `README.md`, `SECURITY.md`, `site/index.html`; Strict Local already blocks it | copy reviewed; scraper and github tests green |
| F-8-002 | low | 2 | Upload filename went into the converter's temp path unsanitized (multer strips directories; no exploit found) | hardened in `services/markitdown.ts` | ingest tests green |
| F-8-003 | low | 1 | `jwt.verify` did not pin an algorithm (library default already limits string secrets to HMAC) | pinned to HS256 | 118 auth/session tests green |
| F-8-005 | low | 8 | Unlabeled icon buttons/inputs and missing `h1`/`main` on some app screens (see matrix row) | fixed in 16 client files; client tests 941 pass; browser re-check clean | done |
| F-8-004 | open, unrated | 9 | Docker image build failed twice locally at `npm install` (npm internal error) | not fixed; retry on a clean network or rely on CI `docker-smoke` before release | not retested |

No critical or high finding is open.

## Cannot be exercised here

Live cloud providers (needs a key and your approval); a real MCP assistant; PWA install and share target on a phone; screen readers; the Docker image build on this machine; Ollama (never started on this laptop); upgrade from an older populated database.
