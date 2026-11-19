# Roadmap (Phase 10)

Written 2026-11-20. Inputs: `docs/PRODUCT_ASSESSMENT.md` (evidence IDs E-xx, recommendations R9-xx), `docs/RELEASE_READINESS.md` (findings F-8-xx, F-9-xx), `TASKS_CODEX.md`.

**Nothing on this page is approved or in progress.** A roadmap entry is a proposal. Code changes need your explicit go-ahead for that item (section 4 records what has been authorized so far). No dates are given because the maintainer's capacity is unknown; sizes are rough and assume one person: **S** = up to a day, **M** = two to five days, **L** = one to three weeks.

**Labels:** `next release`, `later`, `needs validation`, `separate project`, `deferred`, `rejected`. **Status:** `proposed` (all of them today), `approved`, `in progress`, `done`.

## 1. How items were ranked

Filters, in order: (1) security or privacy blockers; (2) prerequisites other work depends on; (3) user impact and how often it is hit; (4) strength of evidence; (5) effort and recurring upkeep for a self-hoster; (6) fit with the product principles (private by default, self-hosted, no lock-in, no feature sprawl). There is no numeric score: the Phase 9 evidence is too thin on demand to make one honest.

**Blocker check:** no critical or high finding is open. The one privacy gap found in Phase 9 (F-9-001, batch imports ignoring the guard) is fixed. So the ordering starts with delivery readiness, not a fix.

## 2. Milestones

### M0: readiness (before announcing the next version)

| ID | Item | Label | Size | Depends on | Target outcome | Evidence | Risk / upkeep | Status |
|---|---|---|---|---|---|---|---|---|
| RM-01 | Push the three local commits and confirm CI, especially the new Postgres service step and the Dockerfile `certs` mount | next release | S | your go-ahead to push | CI green on the new workflow; if the benchmark step fails it is fixed or removed before a release | F-9-002, R9-02, R9-03 | the new CI job adds a service container; low upkeep | proposed |
| RM-02 | Cut v1.3.0: bump the root version, move CHANGELOG `Unreleased` to 1.3.0, write release notes, tag and publish the GitHub release | next release | S | RM-01; your explicit go-ahead (it is outward facing) | A named release containing Markdown import, benchmark, a11y fixes, privacy and search fixes | `CHANGELOG.md` | none beyond the usual release chore | proposed |
| RM-03 | Build the Docker image on one more Windows machine (no antivirus HTTPS scanning) and, if you have one, a Mac; update the README platform table with the result | next release | S | none | The "tested on" claims match reality for each OS | F-8-004, README platform notes | none | proposed |
| RM-04 | Run the phone guide end to end (Tailscale Serve to a real phone, install the web app) and record what you saw in the README | next release | S | none | The guide moves from "not run end to end" to verified or corrected | R9-06 | none | proposed |

### M1: highest-value improvements that stay small

| ID | Item | Label | Size | Depends on | Target outcome | Evidence | Risk / upkeep | Status |
|---|---|---|---|---|---|---|---|---|
| RM-05 | Raise the remaining small touch targets (Demo mode banner button 23 px, mobile back button 20 px, table row checkboxes) | next release | S | none | No interactive control under 24 px except where spacing covers it | Phase 8 target-size results (F-8-006) | tiny; see proposal P10-A | proposed |
| RM-06 | Decide whether the Docker install should be able to import PDFs, Office files and voice memos. If yes: an optional second image target with MarkItDown, Whisper and ffmpeg | needs validation (decision), then separate project | M | your decision | Docker users get file and voice capture, or the limit is stated as permanent | R9-03 finding, README Docker table | image grows by hundreds of MB; Python dependency upkeep and a second image to test in CI | proposed |
| RM-07 | Light-theme screenshots on the site, plus a script that retakes both themes from a scratch install | later | S-M | none | The site shows both themes; screenshots stop going stale silently | R9-13, R9-14, Phase 7 limits | the script is more code to maintain; see proposal P10-B | proposed |
| RM-08 | A short usability test (5 people) on how they find Search, Ask and the table filter, and a phone test of the dense tables | needs validation | M (mostly people time) | none | A yes/no on R9-04 and R9-07 with observed evidence instead of a code-only guess | R9-04, R9-07 (confidence low-medium) | none; avoids building the wrong redesign | proposed |
| RM-09 | Grow the retrieval benchmark: more cases and tougher distractors; later an opt-in live mode that scores a real embedding model on the synthetic notes | later | S (offline growth) / M (live mode) | live mode needs your approval each time it would send synthetic text to a provider | Ranking changes are measured on a bigger set; embedding model choices can be compared | R9-02, E-11 | fixture upkeep; live mode must never default on | proposed |

### M2: longer-term, only on evidence of demand

| ID | Item | Label | Size | Depends on | Target outcome | Evidence | Risk / upkeep | Status |
|---|---|---|---|---|---|---|---|---|
| RM-10 | More importers, one at a time: Notion export, Pocket/Readwise CSV, browser bookmarks | needs validation | M each | RM-08-style demand check; builds on the Markdown importer | A switching path from the tools people actually use | R9-01, E-07 | each format is a parser to keep current | proposed |
| RM-11 | Highlights on saved text, listed and searchable on the item | needs validation / separate project | M-L | schema change, a design note first | Keep what mattered in an article, not only the page | R9-10, E-03, E-09 | a schema migration (restore and upgrade must be rehearsed); UI on text selection | proposed |
| RM-12 | Scoped API keys (read and save) for scripts, reusing the MCP key pattern | later | M | none | Automation without a browser session | R9-11, E-09 | a second credential to protect and document | proposed |
| RM-13 | Browser extension for selection, tags and a private flag | separate project | L | demand | Richer one-click capture than the bookmarklet | R9-08 | store review, broad permissions, per-browser upkeep | proposed |
| RM-14 | Inbound newsletters via opt-in IMAP pull | separate project | L | demand | Newsletters land in the library | R9-09 | stores mail credentials; scope creep | proposed |
| RM-15 | Learn from user corrections (local few-shot examples) | later | M | RM-09 (to measure it) | Fewer repeat misclassifications | R9-12 | longer prompts; feedback must stay local | proposed |

### Deferred and rejected

| Item | Label | Rationale |
|---|---|---|
| R9-04 unify search/Ask/filter entry points | deferred until RM-08 | redesign value rests on observing users, not on code |
| R9-07 card layout for dense tables on phones | deferred until RM-08 | two layouts to maintain; no device evidence yet |
| Real-time collaboration, multiple users | rejected | one account is a stated boundary; a different product |
| Hosted SaaS | rejected | contradicts self-hosted, local-default premise |
| Whole-database end-to-end encryption | rejected | would disable server-side search, classification and Ask (Capacities states the same trade-off, E-05); the vault covers secrets |
| Custom sync protocol, native mobile apps | rejected for now | very large ongoing cost; the web app plus the phone guide covers the need until demand says otherwise |
| Task manager, Notion-style databases, plugin system | rejected | scope creep away from capture, organize, ask |
| Autonomous AI actions on the library | rejected | widens the data boundary with no evidence of need |

## 3. Sequence and dependency check

`RM-01` before `RM-02`. `RM-03` and `RM-04` have no prerequisites and can run beside RM-01. `RM-05` is independent. `RM-06` is a decision that gates any image work. `RM-08` gates R9-04 and R9-07 and informs RM-10. `RM-09` precedes `RM-15`. `RM-11` needs a design note before code. No cycles; nothing in M2 blocks M0 or M1.

A realistic first slice, if capacity is one person for about two weeks: RM-01, RM-03, RM-04, RM-05, then RM-02, with RM-08 recruited in parallel. That is a release, not new features, which matches the evidence: the biggest gaps found were reliability and trust, not capability.

## 4. Authorization record

**Authorized by you in this conversation, and done:** Phases 7 to 9 as tasks; implementing R9-01 (Markdown import), R9-02 (retrieval benchmark), R9-03 (Docker certificate hook, README, site notes), R9-05 (Docker-aware tool notices) and R9-06 (phone guide); the commits made along the way; pushing up to `8a338ea`.

**Not authorized:** every RM item above, and pushing the three newer local commits. Each needs its own go-ahead. If you authorize an item, its scope is the proposal text below or what you say, whichever is narrower, and anything that grows beyond it comes back as a revised proposal first.

## 5. Ready-to-start proposals for bounded refinements (P10-002)

These need no new infrastructure, no schema change, and little upkeep. None is started.

### P10-A: remaining small touch targets (RM-05)

- **Scope:** the "Demo mode" banner button (23 px tall), the mobile back button on the table page (20 px), and the row/select-all checkboxes in the table views (13 px glyph).
- **Change:** give each a 24 px minimum hit area (padding or a wrapping label), without changing the visible design more than a few pixels.
- **Files:** `client/src/components/DemoBanner.tsx`; the inline icon-only back buttons in the page headers (`TableView.tsx`, `AskMemex.tsx`, `EnrichedItems.tsx`, `PendingItems.tsx`, `PlacesView.tsx`, `MediaView.tsx`, `CategoryReview.tsx`, `Trash.tsx`, `Settings.tsx`; a shared back-button component would remove the repetition); the checkbox cells in `TableView.tsx` and `EnrichedItems.tsx`.
- **Privacy / accessibility:** no data change; this is an accessibility fix. The checkbox labels already exist.
- **Rollback:** a plain revert; no data or schema involved.
- **Acceptance:** a Playwright pass over the table, dashboard and media pages at 375 and 1280 px reports no visible button, link or checkbox under 24 px height (excluding the 1 px skip link). The client suite stays green (949 today).

### P10-B: light-theme screenshots and a capture script (RM-07)

- **Scope:** add `site/img/app-dashboard-light.webp` and `app-privacy-light.webp` and show the one matching the visitor's theme; add `scripts/capture-site-screenshots.md` or a small script that documents (or automates) the scratch-install steps used in Phase 7.
- **Change:** `<picture>` with `prefers-color-scheme` sources, or two images toggled by the site's existing theme attribute.
- **Privacy:** synthetic sample data only, scratch database, no cloud keys, never the real library (R-010). Review each image before commit.
- **Files:** `site/index.html`, `site/style.css`, `site/img/`, the script or doc.
- **Rollback:** revert the commit; the current dark images remain.
- **Acceptance:** both themes render a matching screenshot at 375, 768 and 1280 px with no layout shift (width and height attributes kept), page weight stays small (each new file under about 70 KB), and there are no console errors.

### P10-C: grow the retrieval benchmark offline (RM-09, offline part)

- **Scope:** add about a dozen more synthetic notes and questions, including near-duplicate distractors (two notes about similar topics where only one is correct), and tighten the gates to match the new baseline. No model, no network.
- **Files:** `server/src/services/retrievalFixture.ts`, `retrievalBenchmark.realdb.test.ts` (thresholds), `retrievalMetrics.test.ts` (fixture checks).
- **Privacy:** invented text only; the existing fixture test already rejects emails, URLs and long digit runs.
- **Rollback:** revert; the old fixture and gates return.
- **Acceptance:** the benchmark runs green locally and in CI, reports the new baseline in its log line, and fails if the ranking SQL is deliberately broken (checked once by hand and noted).

## 6. Open questions for you

1. Push the three local commits now (RM-01)?
2. Do you want a v1.3.0 release (RM-02) once CI is green?
3. RM-06: should the Docker install ever handle PDFs and voice memos, or is "from source only" the permanent answer?
4. Which of P10-A, P10-B and P10-C, if any, should start?
