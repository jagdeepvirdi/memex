# Closeout report: Memex redesign and product evolution (Phases 0 to 10)

Written 2026-11-20. Companion documents: `TASKS_CODEX.md` (the tracker), `docs/RELEASE_READINESS.md` (Phase 8 evidence), `docs/PRODUCT_ASSESSMENT.md` (Phase 9), `docs/ROADMAP.md` (Phase 10 plan and proposals).

## 1. Summary

All eleven phases are written up and marked complete in the tracker. The app was redesigned and verified, the public site was rebuilt and checked against the code, a release-readiness review found and fixed several real issues (including one wrong public privacy claim, one privacy-guard gap and one search weakness), and an independent assessment produced ranked recommendations. Five of those recommendations were built at your request. Nothing else on the roadmap is approved.

**Honest status in one line:** the work is done and verified locally; three newer commits are not pushed and CI has not yet run on them; no release has been cut.

## 2. Completed work, by phase

| Phase | What was delivered | Evidence |
|---|---|---|
| 0 Discovery | Repository audit, capability inventory, product position, risks, phase gates | `TASKS_CODEX.md` |
| 1 Brand | Identity chosen and documented, then replaced by the logos you supplied; exports for app, PWA, social | `brand/`, `1e060a3` |
| 2 Design system | Tokens, shared primitives, focus and reduced-motion conventions, site and app tokens aligned | tests in Phase 2 log, `b0d3577` |
| 3 Shell and navigation | Home / Discover / Library / Review grouping, mobile quick-nav, app-wide search and capture shortcuts | `b0d3577` |
| 4 Core workflows | Dashboard, capture modes, search and Ask refinements, partial-failure states | `b0d3577` |
| 5 Remaining screens | Category, item, table, media, places, graph, digest, trash, vault, settings, login, onboarding reviewed and fixed; two data-filter bugs fixed | `b0d3577` |
| 6 Responsive, accessibility, PWA | Safe areas, touch sizes, reduced motion, skip links, contrast; API caching removed and purged (R-005 closed) | `b0d3577`, `9fb5f02` |
| 7 Landing page | Product-led rewrite, real sample-data screenshots, metadata, claim-to-code trace with three wording corrections, unused brand PNGs removed | `690b775`, `eb29a7e`; live site checked |
| 8 Release readiness | Gates, route inventory, 26 migrations from empty, backup/restore scripts rehearsed, app and site accessibility sweeps, release summary | `9b54b86`, `1b1021f`, `3474519` |
| 9 Assessment | Evidence record, workflow and AI data-flow audit, competitor comparison, ranked recommendations, should-not-add list; then five recommendations built | `8a338ea`, `b9fcf56`, `fd1adf8`, `de4dfed` |
| 10 Roadmap | Prioritized roadmap, ready-to-start proposals, this report | this commit |

### Issues found and fixed during verification (not part of the redesign itself)

| ID | What | Where fixed |
|---|---|---|
| F-8-001 | Public copy said nothing leaves your machine without a cloud AI; saving a link contacts third parties | README, SECURITY, site |
| F-8-002 / F-8-003 | Upload filename in a temp path; JWT algorithm not pinned | `markitdown.ts`, `index.ts`, `routes/auth.ts` |
| F-8-005 / F-8-006 | Unnamed icon controls, missing `h1`/`main`, dialog focus not restored, targets under 24 px | 17 client files |
| F-8-004 | Docker build failed on one machine: antivirus HTTPS scanning, not a Memex bug | optional `certs/` hook, README |
| F-9-001 | Batch imports skipped the privacy guard for the first classification | `enrichBatch.ts` |
| F-9-002 | Keyword-only search found 55% of natural-language questions | `retrievalService.ts` (now 100% on the benchmark) |

### Built from Phase 9 recommendations (authorized by you)

R9-01 Markdown and Obsidian import; R9-02 retrieval benchmark in CI; R9-03 Docker certificate hook and Docker capability table; R9-05 Docker-aware tool notices; R9-06 phone guide (written, not run end to end).

## 3. Verification state

Last full runs (2026-11-20): server 1,837 tests passed (19 skipped: the opt-in real-database suites, which the new CI step partly enables); client 949 passed; MCP 32 passed (package unchanged since its last run); type checks and production builds clean; `npm audit --omit=dev` showed 0 in all three packages when last run in Phase 8 and dependencies have not changed since. CI was green on the pushes from Phase 7 onward (`1b1021f`, `3474519`, `8a338ea`). The three newer commits (`b9fcf56`, `fd1adf8`, `de4dfed`) are local only; they include a changed CI workflow and Dockerfile, so CI there is unproven.

## 4. Recommended next-release items (see `docs/ROADMAP.md`)

RM-01 push and confirm CI; RM-02 cut v1.3.0 (needs your go-ahead); RM-03 confirm the Docker build on another machine; RM-04 run the phone guide on a real phone; RM-05 remaining small touch targets. These are mostly verification, which matches what the evidence said: reliability and trust were the biggest gaps.

## 5. Strategic initiatives needing a separate proposal

A Docker image with the Python tools (RM-06, decision first); highlights (RM-11, schema change); browser extension (RM-13); inbound email (RM-14). Each needs demand evidence and a design note before code.

## 6. Deferred and rejected

Deferred: R9-04 and R9-07 until a usability and device test (RM-08). Rejected, with reasons in `docs/ROADMAP.md`: collaboration and multi-user, hosted SaaS, whole-database end-to-end encryption, custom sync, native mobile apps, task manager and databases, autonomous AI actions.

## 7. Open risks

| Risk | Status |
|---|---|
| Docker image build on Windows behind HTTPS-scanning software | mitigated (certs hook, README); second-machine confirmation pending (RM-03) |
| Unpushed commits and an unrun CI step | open until RM-01 |
| Phone guide never run end to end | open (RM-04) |
| Ask answer quality is still not measured (the benchmark measures ranking only) | open (RM-09) |
| Privacy guard is a heuristic and can miss sensitive text | accepted, documented in README, SECURITY and the site |
| Real MCP assistant (Claude Desktop, Cursor) never tried against a real instance | open since v1.2; stated on the site |
| Screen-reader and real-device checks never done | open |
| Upgrade from an older populated database not rehearsed | open |
| Competitor facts come from vendor pages at one point in time | accepted; stated in the assessment |

The tracker's risk table (section 12) still lists R-001 to R-012 with their earlier statuses; R-005 and R-011 are now closed in substance (API caching removed; claims traced), the rest stay open or accepted as above.

## 8. Assumptions and limits

No user research exists, so every statement about demand is a hypothesis. Sizes in the roadmap assume one maintainer. The public site's screenshots are dark theme only. The Memex data used for every screenshot and test was synthetic or the built-in sample set; the real library was never opened and no note content was sent to any provider. Ollama was never started on the laptop.

## 9. Suggested next decision

Push the three local commits and watch CI (RM-01). If it is green, decide whether to cut v1.3.0 (RM-02) and which of the three ready proposals (P10-A, P10-B, P10-C) to start. The one question that changes the product rather than the process is RM-06: should the Docker install ever handle PDFs and voice memos?
