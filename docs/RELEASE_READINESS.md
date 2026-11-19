# Release readiness record (Phase 8)

Started 2026-11-19. Evidence is automated tests, builds and disposable-database rehearsals unless a row says otherwise. Synthetic data only; no provider or user-content call was made. This is a verification record, not a deployment claim: nothing here was deployed.

**Result column:** `pass` = automated evidence ran green in this phase; `partial` = covered by tests but not exercised in a real browser or against a live provider; `not run` = no evidence gathered yet.

## Release summary (2026-11-20)

**Verdict: ready for a release candidate on Linux/Docker via CI, with one open install risk and the limits below. Nothing was deployed by this phase except the pushed site.**

- **Blockers:** none. No critical or high finding is open.
- **Resolved after the summary:** F-8-004 (local Docker build failure) was caused by antivirus HTTPS scanning, not by Memex; an optional `certs/` hook now makes such builds work (R9-03). A second Windows machine would still be a useful confirmation.
- **Fixed this phase:** F-8-001 link-fetch disclosure (README, SECURITY, site), F-8-002 upload temp-name hardening, F-8-003 JWT algorithm pinned, F-8-005 unnamed controls and missing `h1`/`main`, F-8-006 dialog focus return and 24 px targets.
- **Evidence:** type checks, tests (server 1802, client 941, MCP 32), builds and `npm audit` (0) all green; route inventory unchanged (97 endpoints, same client routes); 26 migrations from empty; real backup and restore scripts rehearsed on an isolated database; 19 app routes x 3 widths x 2 themes swept (no console errors, overflow or contrast failures); keyboard order, skip link, focus rings and reduced motion checked; site accessibility, links and claims traced.
- **Deferred:** remaining small targets (Demo mode banner 23 px, table checkboxes, mobile back button); screen readers and real devices; live providers; a real MCP assistant; older-database upgrade rehearsal; junk-file refusal re-run (previously verified).

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
| Docker image build | `docker build .` (4 attempts, last two one stage at a time); CI `docker-smoke` | local: **failed** every time at `npm install` ("Exit handler never called!", see F-8-004). CI: pass on `1b1021f` (Linux). |

The backup *scripts* were run end to end on 2026-11-20 against an isolated compose project (`COMPOSE_PROJECT_NAME=memex_p8`, host port 5952, volume removed afterwards; the real library's container was not used): 25 synthetic items, `npm run backup` wrote a 33 KB file, 10 items were deleted and 1 added, `npm run restore -- <file>` without `--yes` refused and changed nothing, with `--yes` it wrote a safety copy and restored 25 items / 47 categories / 4 settings / 26 migrations with the added row gone. Refusal of a junk or truncated file was verified on the real library earlier (see `CLAUDE.md`) and is unit-tested in `lib/backup.test.ts`; it was not repeated in this run.

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
| 8 | App screens: 19 routes (dashboard, Ask, table, media, places, graph, vault, trash, pending, enriched, category review, digest, five settings tabs, appearance, item page) x 375/768/1280 px x dark/light, scratch server with 39 sample items, no Ollama, no cloud keys (Playwright, 2026-11-19) | 0 console errors; 0 horizontal overflow; 0 text-contrast failures (WCAG AA) in either theme. Found and fixed before this commit: icon-only back, close, clear, show-password and star-rating buttons, two checkbox groups and the reminder date field had no accessible name; the dashboard and the locked-vault screen had no `h1`, and the locked-vault screen had no `main` landmark. Re-run after the fix at 375 and 1280 px: 0 unlabeled controls, one `h1` and one main landmark per screen. | pass | Item page tested with one sample item only |
| 8 | App keyboard and reduced motion (Playwright, `prefers-reduced-motion: reduce` emulated, 2026-11-20) | 60 consecutive Tab stops on the dashboard in a sensible order (Capture, sidebar links in visual order), every one with a visible focus ring; skip link is the first stop on the table page and moves focus to `#main-content`; `/` opens search with focus in the input and Escape closes it; no animation with an infinite loop and a non-trivial duration while reduced motion is on; `MotionConfig reducedMotion="user"` and a CSS reduce rule exist. Found and fixed: closing the search dialog dropped focus to `body` (now returns to the control that opened it, verified for Escape and the close button). Target size: sidebar tag chips were 23 px tall and two dashboard link buttons 17 px; raised to 24 px. | pass | remaining targets under 24 px: the "Demo mode" banner button (23 px), table row checkboxes (13 px, rows are tall so spacing covers them under WCAG 2.5.8), the mobile back button (20 px); no screen reader; no real device |
| 9 | Public site and install path | Phase 7 checks at 375 and 1280 px, plus 768 px above; all 10 distinct external links return 200 (GitHub repo, README, SECURITY, CHANGELOG, issues, v1.2.0 release, MCP anchor, modelcontextprotocol.io, Docker Desktop, the live site); install path partly blocked by the Docker build failure | partial | claim-to-code trace done 2026-11-20 (three wording corrections); the six unused source PNGs were removed from `site/brand/` (copies remain in root `brand/`) |

## Defects and findings

| ID | Severity | Workflow | Finding | Disposition | Retest |
|---|---|---|---|---|---|
| F-8-001 | medium | 2, 9 | Saving a link contacts r.jina.ai, YouTube/Instagram oEmbed, and api.github.com for repos, but the README footer and site said nothing leaves the machine without a cloud provider | fixed in `README.md`, `SECURITY.md`, `site/index.html`; Strict Local already blocks it | copy reviewed; scraper and github tests green |
| F-8-002 | low | 2 | Upload filename went into the converter's temp path unsanitized (multer strips directories; no exploit found) | hardened in `services/markitdown.ts` | ingest tests green |
| F-8-003 | low | 1 | `jwt.verify` did not pin an algorithm (library default already limits string secrets to HMAC) | pinned to HS256 | 118 auth/session tests green |
| F-8-005 | low | 8 | Unlabeled icon buttons/inputs and missing `h1`/`main` on some app screens (see matrix row) | fixed in 16 client files; client tests 941 pass; browser re-check clean | done |
| F-8-006 | low | 8 | Search dialog did not return focus to its opener; sidebar chips and two dashboard buttons under 24 px | fixed in `SearchModal.tsx`, `Sidebar.tsx`, `Dashboard.tsx`; client tests 941 pass; browser re-check clean | done |
| F-9-001 | medium | 2, 5 | Batch imports (Keep, bulk paste, now Markdown) called the classifier without the note's tags or text, so the privacy guard could not keep a `private`-tagged or sensitive note off a cloud provider for the first classification. | fixed in `services/enrichBatch.ts`; `enrichBatch.test.ts` proves tags and sensitive text now yield `cloudSafe: false` | server suite green |
| F-9-002 | low | 4 | Keyword-only search required every query word to match (benchmark: 55% of natural-language questions found their note). | fixed in `services/retrievalService.ts` (terms OR-ed in keyword-only mode); benchmark now 100% | retrieval tests + benchmark green |
| F-8-004 | medium (install, networks that re-sign HTTPS) | 9 | `docker build` failed 4 times on this Windows 11 + Docker Desktop machine at `npm install` with npm's "Exit handler never called!". **Cause found 2026-11-20:** `UNABLE_TO_VERIFY_LEAF_SIGNATURE` for registry.npmjs.org; the certificate chain is re-signed by "AVG Web/Mail Shield Root" (antivirus HTTPS scanning). Windows trusts that root, the container does not. CI's Docker job passes (Linux runner, no interception). | fixed: the Dockerfile accepts optional `certs/*.crt` for the `npm install` steps (bind-mounted, not in any layer; `/certs` and the temp bundle verified absent from the image); `certs/README.md`, README troubleshooting bullet and a Docker capability table added; site install note reworded. With AVG's root certificate in `certs/` the full image build succeeded locally (322 MB, exit 0). | verified locally; CI re-run pending on push |

No critical or high finding is open.

## Cannot be exercised here

Live cloud providers (needs a key and your approval); a real MCP assistant; PWA install and share target on a phone; screen readers; the Docker image build on this machine; Ollama (never started on this laptop); upgrade from an older populated database.
