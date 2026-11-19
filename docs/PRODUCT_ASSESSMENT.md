# Product assessment and gap analysis (Phase 9)

Date: 2026-11-20. Repository state: `origin/main` at `3474519`. This is a recommendation record. It does not authorize implementation; the owner picks what to build.

**How to read the evidence.** Repository facts were checked in code or tests in this session or in Phase 8 and cite a file. Competitor facts come from search results restricted to each vendor's own domain on 2026-11-20 (vendor marketing and help pages, not independent reviews, not hands-on use). Prices in those results disagreed with each other in two cases, so no price is used to argue for anything. `inference` marks a judgment, not a sourced fact. No user research exists for Memex; audience statements are hypotheses.

## 1. Positioning (P9-001)

**What Memex is, verified.** A self-hosted personal knowledge app: capture (URL, text, file, voice, Google Keep ZIP, bulk paste, bookmarklet, PWA share target), AI classification into types/categories/tags/entities, hybrid semantic search, cited Ask, digest, rediscovery, reminders, vault, MCP server, backup/restore. Local Ollama by default; five providers optional behind key + consent + a content guard. Single account, Postgres + pgvector.

**Where it is differentiated (inference from E-01..E-09 below).** The combination "AI files it for you, you can ask it questions with citations, and nothing leaves your machine by default" is not offered together by the products surveyed: Obsidian is local Markdown with no built-in AI organizing; Anytype is local-first and encrypted but object-modelling is manual; Reader, Notion, Capacities and Mem are hosted. Reflect's newer version blocks notes marked private from AI, which resembles Memex's guard, but is a different product shape (notes app, Markdown files, Mac beta).

**Where it is weakest.** First-use friction (Docker, optional Python tools for files/voice, a vision model for images, Ollama or a key; local Windows image build failed 4 times, F-8-004) and a one-way adoption path (exports exist, imports do not, see G-03).

**Audience hypotheses, revised.** Kept: privacy-conscious self-hosters and people who save mixed material. Added by evidence: people who already keep Markdown (Obsidian) are the natural switchers, which makes import the most relevant missing path. Dropped: "non-technical general consumers" - the install and optional-tool model makes this unlikely without a hosted offering, which is a stated non-goal.

## 2. Evidence record

| ID | Question | Observation | Evidence type | Source | Date | Confidence |
|---|---|---|---|---|---|---|
| E-01 | Obsidian model | Core app free; Sync and Publish paid; clips from the Web Clipper are stored as local Markdown; vendor says it is built on local files. Sync tier/price details conflict between its pages. | primary external | [obsidian.md/pricing](https://obsidian.md/pricing), [obsidian.md/clipper](https://obsidian.md/clipper) | 2026-11-20 | high for model, low for price |
| E-02 | Anytype model | Local-first, content encrypted before sync, keys never sent to servers; sync modes: Anytype network, self-hosted, local-only; any-sync is MIT. Search indexes are stored unencrypted locally. | primary external | [doc.anytype.io sync](https://doc.anytype.io/anytype/data/sync-and-backup), [privacy](https://doc.anytype.io/anytype/data/privacy-and-encryption) | 2026-11-20 | high |
| E-03 | Readwise Reader | Saves articles, PDFs, EPUBs, newsletters, RSS, YouTube, X threads; built-in highlights exportable as Markdown; Ghostreader chat over one document or the whole library with cited answers; auto summaries and tags on save. | primary external | [docs.readwise.io/reader](https://docs.readwise.io/reader), [AI policy](https://readwise.io/ai-policy) | 2026-11-20 | medium (feature list may have shifted) |
| E-04 | Notion | Q&A searches workspace, connected apps (Slack, Drive, Jira, ...) and optionally the web; web search can be disabled per workspace; offline mode for recents/favorites on paid plans; web clipper. No evidence found on AI offline. | primary external | [notion.com help](https://www.notion.com/help/notion-ai-faqs), [release 2025-08-19](https://www.notion.com/releases/2025-08-19) | 2026-11-20 | medium |
| E-05 | Capacities | Object-based notes; AI assistant uses linked notes; MCP connection on Pro; EU-hosted; **not** end-to-end encrypted, stated as a deliberate trade for AI, integrations and API. Prices differ between its pages. | primary external (company claims) | [capacities.io/faq](https://capacities.io/faq), [facts](https://capacities.io/about/facts) | 2026-11-20 | medium |
| E-06 | Reflect / Mem | Reflect: chat with notes; newer "Reflect Open" keeps notes as local Markdown and blocks notes marked private from AI or other services; bring-your-own API key. Mem: AI chat; privacy and encryption detail not found. | primary external | [reflect.app/blog/reflect-open](https://reflect.app/blog/reflect-open), [get.mem.ai](https://get.mem.ai/blog/best-ai-note-taking-apps-2025) | 2026-11-20 | medium (Reflect), low (Mem) |
| E-07 | Memex imports | `/api/ingest` has `url`, `text`, `file`, `voice`, `keep`, `keep/bulk`, `paste/bulk`, `quicksave`, `youtube/backfill`. No importer for a Markdown folder, Notion, Pocket/Readwise or browser bookmarks. | repository | `server/src/routes/ingest.ts` | 2026-11-20 | high |
| E-08 | Memex exports | CSV (table, media, places), Obsidian ZIP of Markdown with frontmatter (excludes the encrypted vault and trash), SQL backup/restore. | repository | `routes/items.ts` `/export/obsidian`, `lib/export.ts`, `scripts/backup.ts` | 2026-11-20 | high |
| E-09 | Memex missing | No highlights/annotations on saved text, no inbound email capture, no calendar or webhook integration, no general-purpose API token (only the MCP and bookmarklet keys), no browser extension (bookmarklet only), no offline library data (shell only). | repository | grep of `server/src`, `client/src`, `shared/types.ts` | 2026-11-20 | high for absence in code |
| E-10 | Multi-device | Bound to loopback by default; phone/other computer needs a reverse proxy + `MEMEX_BIND` + CORS origins, documented. | repository | `README.md` ("Can I use it from my phone...") | 2026-11-20 | high |
| E-11 | Ask reliability | Prompt requires answering only from context, saying "don't know" otherwise, with [n] citations; UI lists sources. No retrieval or answer-quality benchmark exists; tests mock the model. `classifyBaseline.ts` measures classification only. | repository | `services/ragService.ts`, `ragService.test.ts`, `scripts/classifyBaseline.ts` | 2026-11-20 | high |
| E-12 | Data flows | Ask sends the top retrieved items' text (about 1000 chars each) to the chosen provider only when every item passes `cloudSafe`; any private item pins the call local. Capture of a link sends the address to r.jina.ai / YouTube / Instagram / GitHub regardless of AI choice (fixed in docs, F-8-001). Embeddings can go to Gemini/OpenAI for non-private items only. | repository | `services/ai.ts`, `cloudSafe.ts`, `scraper.ts`, `embeddingService.ts`, CLAUDE.md | 2026-11-20 | high |
| E-13 | Scale | Real library of about 813 items (counts only, per CLAUDE.md) on Postgres + pgvector, one worker, 768-d vectors. No measured bottleneck; no scale test exists. | repository | CLAUDE.md "Privacy..." section | 2026-11-20 | medium |
| E-14 | Release state | Builds, tests, audit, migrations, backup/restore, app-screen sweep: green (Phase 8). Docker build fails locally on one Windows machine; CI passes. | test + browser | `docs/RELEASE_READINESS.md` | 2026-11-20 | high |

## 3. Workflow audit (P9-002)

Existing capability is checked first. "Accept" means roadmap-worthy, not scheduled.

| Candidate | Exists today? | Value / friction | Privacy | Maintenance | Disposition |
|---|---|---|---|---|---|
| Capture breadth (URL, file, voice, Keep, paste, bookmarklet, share target) | yes (E-07) | high; file/voice need optional tools | link capture contacts hosts (disclosed) | medium | keep; surface missing-tool state (R9-05) |
| Browser clipper beyond a bookmarklet | no (E-09) | medium; selection, tags, private flag | extension permissions are broad | high (store review, per-browser) | defer until demand shown (R9-08) |
| Email / newsletter capture | no | medium-high for readers | needs inbound mail or IMAP credentials | high | defer; opt-in IMAP pull only if validated (R9-09) |
| Import: Markdown folder / Obsidian | no (E-07) | high for switchers | local files, none leave | medium | **accept** (R9-01) |
| Import: Notion, Pocket, Readwise, bookmarks | no | medium | local | medium each | defer behind R9-01; one format at a time on evidence |
| Organization (types, categories, tags, entities, graph) | yes | high | local | medium | keep |
| Search / Ask / NL filter | yes, three entry points | high; entry points are separate | per E-12 | medium | **unify framing** (R9-04) |
| Tasks / reminders | reminders only (due date + browser notification) | low-medium | local | low | no task manager (see section 6) |
| Highlights / annotations | no (E-09) | high for readers (Reader's core, E-03) | local | medium-high | opportunity (R9-10) |
| Bulk actions | yes (priority, reprocess, delete, review) | medium | local | low | keep |
| Export / portability | yes (E-08) | high | vault excluded by design | low | keep; document the vault exclusion (done on site) |
| Offline | shell only | low-medium; AI/DB need the server | n/a | high to do well | do not add (section 6) |
| Multi-device | reverse proxy only (E-10) | high for phone capture | exposes the instance to a network | medium (docs) | improve the guide, not the product (R9-06) |
| API for scripts | MCP + bookmarklet only | medium | scoped keys | low-medium | opportunity (R9-11) |

## 4. AI assessment (P9-003)

Reliability and provenance come first; novel AI features come last.

- **Provenance exists** (model recorded per item, "stays on this machine", redo with another model) and Ask cites sources (E-11). Strong relative to the surveyed products' public pages.
- **Measurable gap:** nothing measures whether search returns the right notes or whether Ask abstains correctly (E-11). Every future AI change is currently judged by eye. This is the highest-value AI item (R9-02).
- **Correction path:** a user can edit categories and mark reviewed, but corrections are not fed back. Treat as an opportunity only after R9-02 (R9-12).
- **Data boundary per flow:** classification, summaries, insights, digest, Ask, explain: item text to the chosen provider only if every bundled item passes `cloudSafe`, else local Ollama. Embeddings: same gate, cloud only when the active embedding model is cloud. MCP: results filtered by `cloudSafeReason`, no Ask tool. Link capture: address only (E-12). Failure modes: provider errors map to readable messages; user-initiated calls never silently fall back to another model.
- **Not recommended now:** autonomous agents, auto-actions on the library, fine-tuning, new generative features. No evidence of user need, and each widens the data boundary.

## 5. Security, privacy and claims (P9-004), architecture (P9-005)

- Phase 8 reviewed auth, caches, uploads, URL fetches, sharing, MCP scope, vault, consent and advisories. One public claim was wrong (link capture contacts third parties) and is fixed. No critical/high finding is open.
- **Claims versus implementation:** the site and README now state link-capture contact, the vault's absence from the Obsidian export, and that the privacy guard is a heuristic. Remaining claim risk: "Tested on Windows with Docker Desktop" was removed after F-8-004.
- **Residual risks (accepted, documented):** database and backups unencrypted; single user; heuristic guard can miss; backup holds the whole database including saved API keys encrypted with `JWT_SECRET`.
- **Architecture:** Postgres + pgvector, one Node process, an in-process worker, jobs in an `ingest_jobs` table. Fits a single-user personal library (E-13). No measured bottleneck, so **no rewrite or framework change is recommended**. Upgrade path risk is the main operator burden: migrations run automatically only in the Docker image, manually otherwise (documented), and there is no automatic update mechanism by design.

## 6. Competitor comparison (P9-006)

Limits: vendor pages only, one snapshot, no hands-on testing; a feature list is not product quality.

| Workflow | Memex | Obsidian | Anytype | Reader | Notion | Capacities | Reflect |
|---|---|---|---|---|---|---|---|
| Control of data | self-hosted DB, local AI default | local Markdown files | local-first, encrypted | hosted | hosted | EU-hosted, not E2EE | local Markdown (new) |
| AI organizes on capture | **yes** (classify, tags, entities) | no built-in (E-01) | not found | summaries/tags on save | assistant, not auto-filing (not verified) | assistant | chat |
| Cited Q&A over your notes | **yes** | no built-in | not found | yes (E-03) | yes (E-04) | assistant (E-05) | yes (E-06) |
| Privacy control for AI | content guard + consent + Strict Local | n/a | E2EE | vendor policy | workspace toggle for web | stated trade-off | private notes blocked |
| Import from other tools | **gap** (E-07) | n/a | not checked | many formats saved | not checked | not checked | not checked |
| Export / portability | CSV, Obsidian ZIP, SQL | native files | open protocol | Markdown export | not checked | not checked | native files |
| Highlights | **gap** | plugins | not checked | **core** | no | not checked | not checked |
| Setup effort | **high** (Docker + optional tools) | low | low-medium | none | none | none | low |
| Cost to run | free + your hardware or API keys | free core | free tier | paid | paid tiers | free + paid | paid |

Reading: Memex is **differentiated** on private, AI-organized, cited retrieval you host yourself; **at parity** on export; has **meaningful gaps** in import, highlights, capture surfaces, and setup effort.

## 7. Recommendations (P9-007)

Priority: P0 before announcing; P1 next; P2 later; P3 only on demand. Complexity S/M/L.

### Essential gaps

| ID | Problem | Importance | Proposed change | User benefit | Complexity | Priority | Depends on | Risks / trade-offs | Evidence | Confidence | Validation needed |
|---|---|---|---|---|---|---|---|---|---|---|---|
| R9-01 **(done 2026-11-20)** | No way to bring existing notes in (E-07); switching is one-way. | Adoption path for the likeliest switchers. | Import a Markdown folder or Obsidian vault ZIP: one item per file, frontmatter to tags/title, wikilinks kept as text, duplicates skipped, classification in the background, nothing sent anywhere. | Try Memex with real notes in minutes. | M | P1 | none | frontmatter variety; large vaults need batching; keep AI off until the user chooses | E-07, E-08, E-01 | high (gap), medium (demand) | ask 3-5 Obsidian users |
| R9-02 **(done 2026-11-20)** | No measure of retrieval or Ask quality (E-11). | Retrieval is the central promise; AI changes are unjudged. | Synthetic fixture library with labelled questions; script reporting top-k hit rate and abstention rate; run in CI as a regression gate. | Safe model, threshold and prompt changes. | M | P1 | none | fixture bias; thresholds per embedding model differ | E-11 | high | none |
| R9-03 **(done 2026-11-20)** | Windows Docker build failed locally (F-8-004); optional tools are a setup maze. | First-run success decides adoption. | Reproduce on a second Windows machine; if confirmed, pin npm or add retry/`--network` guidance; add a one-screen "what you get with each optional tool" matrix to the install section. | Fewer failed installs. | S-M | **P0** | another machine | may only be local | E-14 | medium | test elsewhere |

### UX improvements

| ID | Problem | Importance | Proposed change | User benefit | Complexity | Priority | Depends on | Risks | Evidence | Confidence | Validation |
|---|---|---|---|---|---|---|---|---|---|---|---|
| R9-04 | Search, Ask and the table's natural-language filter are three entry points (REC-004). | Users may not know which to use. | Keep the three behaviours; make the global search box offer "Ask this" and "Filter table" as visible next steps, and always show source and keyword-fallback state. | Fewer dead ends. | S-M | P2 | none | blurs query semantics | E-11, app sweep | low-medium | a short usability test |
| R9-05 **(done 2026-11-20, smaller than proposed)** | Optional tools (MarkItDown, Whisper, vision) fail at use time (REC-005, REC-007). **Correction:** the file and voice panels already check tool health up front and show the install command, so the proposal as written was already met; the real gap was that in the Docker install the shown `pip install` cannot work. | Clear next step beats an error. | Show tool availability on the capture panel using the existing health endpoints, with the install line. | Fewer confusing failures. | S | P2 | none | clutter for users who never use files | E-07 (health routes exist) | medium | none |
| R9-06 **(done 2026-11-20, docs only, not run end to end)** | Phone/other-device use needs a reverse proxy (E-10). | Phone capture is a common need. | Write a tested recipe (HTTPS proxy, bind, CORS) for one concrete setup; no code change. | A supported path to phone use. | S | P2 | none | exposes the instance; keep the security warning | E-10 | high | one test setup |
| R9-07 | Dense tables on phone (REC-002); a few targets under 24 px remain. | Mobile retrieval. | Card list below a breakpoint for table, media and places; raise remaining targets. | Practical mobile browsing. | M | P2 | none | two layouts to maintain | Phase 8 sweep | medium | device test |

### Opportunities

| ID | Problem | Importance | Proposed change | Benefit | Complexity | Priority | Risks | Evidence | Confidence | Validation |
|---|---|---|---|---|---|---|---|---|---|---|
| R9-08 | The bookmarklet cannot capture a selection with tags/private flag. | Capture friction. | Small browser extension (selection, tags, private). | One-click richer capture. | L | P3 | store review, broad permissions, per-browser upkeep | E-03, E-01 (competitor clippers) | medium | demand first |
| R9-09 | No inbound newsletters. | Reader parity for readers. | Opt-in IMAP pull of a labelled folder. | Newsletters land in the library. | L | P3 | stores mail credentials; scope creep | E-03 | medium | demand first |
| R9-10 | No highlights. | Core of reading tools (E-03). | Select-to-highlight on saved text, listed on the item, searchable. | Keeps what mattered, not just the page. | M-L | P3 | schema + UI; text-only | E-03, E-09 | medium | demand first |
| R9-11 | No general API token (E-09). | Scripts and other apps. | Scoped keys reusing the MCP key pattern, read and save only. | Automation without a session. | M | P3 | a second credential to protect | E-09 | medium | demand first |

### Advanced AI

| ID | Problem | Proposed change | Priority | Depends on | Risks | Evidence |
|---|---|---|---|---|---|---|
| R9-12 | Corrections are not learned (REC-006). | Store user category fixes locally and use them as few-shot examples for that user's classification. | P3 | R9-02 | prompts grow; feedback must stay local | E-11 |

### Nice-to-haves

| ID | Item | Priority |
|---|---|---|
| R9-13 | Light-theme screenshots on the site and docs | P3 |
| R9-14 | Retake screenshots each release from a scripted scratch install | P3 |

### Should not add (with reasons)

- **Real-time collaboration or multiple users.** One account is a stated boundary; Capacities' and Notion's strength here is a different product (E-04, E-05).
- **A hosted SaaS.** Contradicts the self-hosted, local-default premise and the stated non-goals.
- **Whole-database end-to-end encryption.** It would disable server-side search, classification and Ask; Capacities states this exact trade-off (E-05). The vault already covers secrets.
- **A custom sync protocol or native mobile apps.** Anytype's sync stack and Obsidian Sync are large, ongoing efforts (E-01, E-02); the PWA plus a reverse-proxy recipe covers the need until demand says otherwise.
- **A general task manager, databases/Notion-style pages, or a plugin system.** Scope creep away from capture-organize-ask; reminders already cover due dates.
- **Autonomous AI actions on the library.** Widens the data boundary with no evidence of need.

### 1-2 year opinion

Lean into one promise: a private, organized, askable library you own. In order: make install reliable (R9-03), make retrieval measurable (R9-02), lower the cost of arriving (R9-01), then add capture surfaces only where users ask. Do not chase feature parity with Notion or Obsidian plugins; the surveyed products spend their effort on sync, collaboration and ecosystems that Memex deliberately does not have.

**R9-03 outcome (2026-11-20).** Cause: antivirus HTTPS scanning (AVG) re-signs registry.npmjs.org and the build container does not trust the AVG root. Delivered: optional `certs/*.crt` hook in the Dockerfile (tested here: build succeeds with the root exported, certificate absent from the image), `certs/README.md`, a README troubleshooting bullet and platform-notes correction, and a capability table for the Docker install. The table surfaced a larger fact: the image has no Python, MarkItDown, Whisper or ffmpeg, so PDF/Office/CSV/EPUB uploads and voice memos do not work in the one-command install, only from source (the site and README now say so). Open question for the owner: add those tools to the image (larger image, more upkeep) or keep them source-only.

**R9-02 outcome.** `retrievalFixture.ts` (24 invented notes, 24 labelled questions), `retrievalMetrics.ts` (hit@k, MRR, hashed-embedding stand-in), `retrievalBenchmark.realdb.test.ts` (runs the real ranking SQL on a rolled-back transaction; CI now has a throwaway pgvector service). Baseline: hybrid hit@1 0.95, hit@3 1.00, MRR 0.98. It measures the ranking SQL and weights, not embedding-model quality, and does not measure Ask answers. It found a real defect: keyword-only fallback found only 55% of natural-language questions because every word had to match; fixed (terms OR-ed), now 100%.

**R9-01 outcome.** `POST /api/ingest/markdown` + the Markdown tab of the capture dialog; verified end to end on a scratch install with a synthetic vault ZIP (dry run, import, tags, dates, dedupe, re-import all skipped, bad file refused). While wiring it, a privacy gap was found and fixed: batch imports (Keep, bulk paste, Markdown) did not pass the note's tags or text to the privacy guard for their first classification (`enrichBatch.ts`), so an imported `private` tag was not honoured by a cloud provider; they now are.

**R9-05 outcome.** `MEMEX_IN_DOCKER=1` is set in the image; the `markitdown` and `whisper` health routes return `inDocker`; the file and voice panels then say the Docker install does not include the tool instead of showing a pip command that cannot work (tests added). **R9-06 outcome.** README "Using Memex from your phone": Tailscale Serve (private to your tailnet; syntax checked against Tailscale's docs) and a reverse-proxy option, with the loopback binding kept. Not run end to end here; stated in the README.

**Not started (need a decision):** R9-04 (unify search / Ask / filter entry points) and R9-07 (card layout for dense tables on phones) are UI redesigns whose value rests on a usability test, not on code evidence; P3 items R9-08..R9-14 are demand-first. 

## 8. Disposition of the initial hypotheses (REC-001 to REC-008)

| Hypothesis | Disposition |
|---|---|
| REC-001 navigation/discovery | Kept at P2; needs a usability test, no evidence either way from code alone |
| REC-002 phone workflows | Became R9-07 |
| REC-003 API cache/session | Closed in Phase 6/8 (no API caching, no-store, cache purge at logout; tests) |
| REC-004 search/Ask/filters | Became R9-04 |
| REC-005 first-run dependencies | Became R9-03 and R9-05 |
| REC-006 AI trust and correction | Became R9-02 (first) and R9-12 |
| REC-007 ingestion partial failures | Job lifecycle, cancel and progress exist and are tested (Phase 8); remaining part is R9-05 |
| REC-008 imports/portability | Exports exist; imports are the gap, R9-01 |

## 9. Limits of this assessment

Vendor pages only for competitors, one snapshot dated 2026-11-20, two conflicting price sets ignored; no hands-on use of any competitor; no interviews or usage data for Memex, so all demand statements are hypotheses; the Memex walkthrough used sample data on a scratch install; scale is judged from one real library's size (counts only); AI quality is not measured (that is R9-02).
