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

### Action items

The prioritized, checkable action items from this review live in **TASKS.md** under
"Code Review Action Items" (kept there because they are backlog tasks).
