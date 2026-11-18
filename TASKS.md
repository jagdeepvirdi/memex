---
last_updated: 2026-11-18T12:30:00
---

# Memex — Task Backlog

## ▶ Start here (updated 2026-11-17)
**State on 2026-11-18:** everything is committed and **pushed**; `main` is at `a530e3b` (docs commit after the `a9ba116` release commit) and **v1.1.0 is tagged and released on GitHub**. CI is green on `a9ba116` and `a530e3b` (checked 2026-11-18, ~2m20s each: client, server, Docker smoke test). Done since the plan was made: L1-L7 (L5 trust features `e70ecc3`, L6 security + hygiene `d59a7c3` + CI fix `ad37aa9`, L7 landing page `c10b78b`). **Landing page is live at https://memex.jagdeepsinghvirdi.com** (Vercel project `memex-site`). Server 1706 tests, client 902, both `tsc` clean. The local Postgres is at migration **026** (applied 2026-11-18; it is stopped again). Postgres and the test containers are stopped. **Ollama may be running (the Windows tray app auto-starts it at login, not started by Claude); the user said it crashes the laptop, so consider turning off its auto-start.** Before any push: check the diff for personal data (public repo).
**Next up:** nothing is queued for Claude except what the user picks. **Waiting on the user:** (1) OpenAI: the key is saved and accepted; the live check is SKIPPED by the user's choice (no API credits will be bought; OpenAI support is covered by mocks and works when the account has credits) (Groq is done: live check passed 2026-11-18); (2) the Gemini thresholds were APPLIED 2026-11-18 at the user's request (duplicate 0.8873, graph 0.8635, stored as `embedding_thresholds` for `gemini:gemini-embedding-001`; restart the dev server to load them; to undo, delete that key from the `embedding_thresholds` setting) (3) try the first-run screen with a real key; (4) a macOS or Linux install run; (5) look at the new light/dark themes and say what to change (L9 colours are done, layout is not). **Done 2026-11-18:** Gemini thresholds applied, the real Gemini switch + re-embed (backup `backups/memex-backup-2026-11-18-170552.sql` first; 654 items embedded, 0 failures, 159 private items stayed home, calibration reference saved; done with the new `server/src/scripts/switchEmbedding.ts`), Private vulnerability reporting enabled, landing page deployed with its domain, v1.1.0 tagged and released, Groq live check, L1 phone fixes (header actions row on every page), `zod` 4 + `react-router-dom` 7 + `qs` (0 advisories), CI actions bumped to v7 (not yet seen green: needs a push). **Claude-side candidates:** L9 visual redesign (deferred until the user picks a direction), self-hosting the app's fonts (L9), L8 ideas only on request. Rules: never start Ollama (it crashes the laptop); start only Postgres (`docker compose up -d postgres`) and stop it after; migrations are the user's step OUTSIDE Docker; cloud AI only with the user's say-so for anything from their library; fixtures stay synthetic; commit/push only when asked.

### Done 2026-11-17
- **Gemini default fixed** to `gemini-3.8-flash` in code, Settings suggestions, `.env.example`, CLAUDE.md (`a956f0a`).
- **L3 Phase A committed** (`eaa66df`): migration 025, `embeddingService` (single writer), `retrievalService` (shared search/Ask SQL, model filter, keyword fallback, `semantic` flag, NULL-rank fix confirmed on the real DB), same-model-only comparisons everywhere, worker skips skipped rows. New opt-in real-DB test `retrievalService.realdb.test.ts` (`MEMEX_REALDB_TEST=1`).
- **L3 Phase B committed** (`b782080`): `embeddingConfig.ts`, `aiEmbed(text, {kind})` with Gemini and OpenAI embeddings (768 dims, L2 normalisation, response checks, timeout, retry on 429/5xx, consent gate, key redaction), `GET /api/ai/embedding`, `verifyEmbeddingProvider.ts`. **Live Gemini check passed.**
- **L3 Phase C committed** (`ab31f4e`): switching and re-embedding (see L3 C). Server 1260 tests + 5 opt-in real-DB tests, client 811, both `tsc` clean; checked in a real browser against a stubbed API. The live path (a real switch to Gemini and re-embed) was NOT run: it would send library text to Google and waits for the user's go-ahead.
- **Groq provider committed** (`533acc8`): fifth provider through the `openai` SDK at `https://api.groq.com/openai/v1`, default `openai/gpt-oss-120b`; migration 026 written, not applied. Endpoint URL verified live with an invalid key (401); a real round trip waits for migration 026 + a key.
- **L3 Phase D committed** (`793e5f3`): per-model similarity profiles, graph + duplicate check read them, `resolveEntities` rewritten (dry run by default, safe transactional merge, per-model entity threshold), calibration script (equivalent strictness) + automatic reference snapshot on a model switch. Server 1426 tests + 16 opt-in real-DB tests, client 822, both `tsc` clean.
- **L3 Phase E committed** (`e2c10ff`): README, `.env.example`, RUNBOOK, CLAUDE.md corrected; a verified local path and a verified cloud-only path.
- **Save fix committed (`abcf287`):** capture routes (text, url, file, voice, quicksave) no longer fail when the embedding fails: `embedForDuplicateCheck` returns `[]` and the duplicate hint is skipped (logged). Route-level tests with the real embedder prove it, and that a classification failure still fails the request.
- **L4 built and committed (`6a3187e`)** (see L4): startup checks, readable errors, health status, auto-migrate (opt-in; on in Docker), one-command Docker start (verified), first-run AI setup screen, login without Ollama, upgrade/backup notes. Server 1530 tests, client 854, both `tsc` clean.

- **L5 pushed (`e70ecc3`):** content layer in `cloudSafe()`, which-AI badge + "Redo with...", sample data (40 items, one-click clear), `npm run backup` / `restore` (verified on the real library into a scratch database).
- **L6 pushed (`d59a7c3`, CI fix `ad37aa9`):** loopback binding for the app and Postgres, CORS policy, account rules (10+ chars, bcrypt 12), dependency fixes (server 9 -> 3 advisories, client 33 -> 2), `scripts/smoke-test.sh` + `docker-smoke` CI job (green on GitHub), SECURITY.md, templates, CHANGELOG, README (two-minute start, privacy model, FAQ). First CI run failed on four Login tests (`minLength` on the setup password field); removed.
- **L7 pushed (`c10b78b`):** static landing page in `site/` with a live privacy ledger and self-hosted fonts. Not deployed.

### Decisions made 2026-11-17
- **Private items under cloud embeddings: skip entirely** (no local-only set). First cloud embedding provider: **Gemini**. Live Gemini call with synthetic text: approved and done. Phase A shipped as its own commit.
- **Licence: MIT** (alternatives discussed: Apache 2.0 for a patent grant, AGPL-3.0 to stop closed hosted clones; revisit only if hosted forks worry the user).
- **Default Gemini model is `gemini-3.8-flash`** (`gemini-2.5-flash` did not work for this account).
- **Groq is wanted as a provider** (see L2b). Custom OpenAI-compatible base URL and the other extras are NOT being built now: see "Add if requested" in L8.
- **OpenAI key:** the user will add it later (live OpenAI checks wait for it).
- **Pre-push rule:** the user pushes; before that I check for personal data.

### Everything not completed (consolidated 2026-11-17)
**Questions waiting on the user:** (a) the look: what do you like about aiceos-bkk.pages.dev and 100xengineers.com/workshop (I could not fetch them; screenshots or a list would do). (a1) Optional: run `npx tsx src/scripts/calibrateEmbedding.ts --model ollama:nomic-embed-text --save-reference` yourself (writes one settings row) if you want the reference saved now; otherwise switching models saves it for you. (a2) Run migration 026 and add a Groq key so the Groq live checks can run. (b) Permission to run the real switch to Gemini and a real re-embed (it sends the text of ~657 non-private items, about 35,000 tokens, to Google; 156 private items stay home; the user decides when, and Cancel is available). (c) Permission for aggregate-only counts on the real DB when we reach `looksSensitiveContent` / "which AI answered" (counts, never titles).
**Launch plan (sections below):** L1-L7 are built and pushed. Open: L2 live OpenAI and Groq checks (need keys), screenshots after L9 (tag/release, deploy and DNS are done 2026-11-18), L8 post-launch ideas (only on request), L9 visual redesign (deferred).
**L1 leftovers:** fixed 2026-11-18 (header overlap, hover-only category buttons, settings nav scroll hint); checked in a real browser at 390px; header actions on every page now get their own row on a phone.
**Older work still open:** (1) review the 88 mined places in Pending (tag `from-note`), fix `visitStatus`, delete extras; place mining is not in the app UI yet. (2) ~178 bare-`Links` items need a decision on new categories for shops/listings. (3) "which AI answered" badge + "Redo with…" UI. (4) wire `looksSensitiveContent` into `cloudSafe()`. (5) embeddings for the 88 items that have none (the mined places; the status endpoint shows them as `pending`): covered by L3 Phase C, do not start Ollama. (5b) the library has many near-duplicates: the read-only calibration run (2026-11-17) found ~0.32% of the 262,450 item pairs (about 850 pairs) at or above the 0.92 duplicate threshold; a review/merge-duplicates feature could use `duplicateService` + the profile (idea, not planned). (6) classifier leftovers: 3 YouTube courses flipped `link` to `media`; "Udemy Course"/"Oracle Learn" still in `Links`; a couple of ML tutorials in `Tech > AI > Explainers`; the Personal guard was checked on saved results, not re-run end to end. (7) Phase 1/2/3 items further down: "Tests for each of the above", `seedEntityGraph.ts` backfill, priority/intent backfill (opt-in), optional `'repo'` entity type, Gemini direct-URL video understanding, and the standing rule not to run `reprocess-bulk 'all'` until Phase 1 is verified.
1. ~~Run after-pass #2~~ **DONE 2026-11-16.** 279 items via gemini → claude: 137 unchanged, 141 re-bucketed (~25 are noise). `Tech > AI > Explainers` 51→10, `Tech > AI > Tools` 27→3, `Finance > Notes` 11→0, `Tech` 2→109; the 33 programming courses now land in `Tech`. It also sent 11 shop/product links to top-level `Personal` (the `shopping` → `Personal` fuzzy mapping), fixed by a new `refineCategories` guard (links leave `Personal` unless Contacts or a profile). Output and compare files are in `sessions/baselines/` (`classify-after-pass2-2026-11-16.json`, `compare-after-pass2-2026-11-16.txt`; gitignored). Not re-run end-to-end after the guard; it was checked on the 14 saved `Personal` entries (11 → `Links`, 3 contacts stay).
   Known leftovers: 3 YouTube courses flipped `link` → `media`; "Udemy Course" / "Oracle Learn" still in `Links`; a couple of ML tutorials sit in `Tech > AI > Explainers`.
2. ~~Commit~~ **DONE.** Place mining was already committed (990d323); classifier guardrails + `classifier.refine.test.ts` (generic fixtures, no personal titles) + TASKS.md committed 2026-11-16.
3. ~~Review the 88 new places / remaining Phase 1 items / bare-`Links` / which-AI-answered / `looksSensitiveContent` / embeddings / stale Gemini default~~ moved into "Everything not completed" above.

---

## 🚀 Public Launch — planned 2026-11-16
Goal: Memex as a standalone, downloadable personal product (local AI or cloud AI), with a landing page at memex.jagdeepsinghvirdi.com.
Repo is PUBLIC: generic fixtures and demo data only, no personal note titles, review files or screenshots of real data.
**Deferred for now:** all visual redesign (tokens, shell, screen restyle, light mode, reference sites aiceos-bkk.pages.dev and 100xengineers.com/workshop) and the landing page build (needs the new look for screenshots).

### L1 — Settings reorganisation (page is overcrowded)
- [x] Split `Settings.tsx` (780 lines) into a shell + one component per tab; keep tab in the URL (`/settings/ai`) <!-- done: 2026-11-16 -->
      *(shell is now ~150 lines; route `/settings/:tab?`; unknown tab falls back to AI; tabs live in `components/settings/tabs/`)*
- [x] Tabs: **AI** (provider, model, cloud consent; per-task overrides + provider status/tests under "Advanced"), **Keys & Privacy** (API keys, Strict Local Mode moved out of Vault Security, cloud-safe explainer), **Library** (categories, import/export, MarkItDown, re-process, enrichment), **Vault** (auto-lock, change password, reset), **Capture** (bookmarklet, YouTube backfill) <!-- done: 2026-11-16 -->
      *(API keys are no longer embedded in `AiProviderSettings`; when the chosen provider has no key the AI tab shows an "Add a key" shortcut to Keys & Privacy. Shared helpers: `lib/aiSettings.ts` (`resolveAiSettings`, one place for the legacy `use_claude` rules), `settingsTabs.ts`, `SettingsSection.tsx`)*
- [x] "Setup status" strip at the top (local AI on/off, which cloud providers are connected, cloud allowed?) <!-- done: 2026-11-16 -->
      *(`SetupStatus.tsx`: "Answering with …", explains a fallback to Ollama (cloud off / no key), Strict Local chip, which cloud keys exist; re-reads provider status on every tab switch)*
- [x] Move `BookmarkletSection` out of `Settings.tsx`; update `Settings.test.tsx` <!-- done: 2026-11-16 -->
      *(now `BookmarkletPanel.tsx`, reads the key from the shared settings; `Settings.test.tsx` rewritten per tab; client 751 tests, `tsc` clean. Eyeballed in a real browser at 1280px and 390px against a stubbed API: all five tabs render, no console errors, no horizontal overflow. Rows stack on narrow screens.)*
- [x] L1 leftovers fixed 2026-11-18 <!-- done: 2026-11-18 -->
      *(Found earlier, fixed together: `AppHeader` was `left-64` at every width although the sidebar is hidden below `md`, leaving ~130px for the title, which wrapped under the avatar -> `left-0 md:left-64`, `px-4 md:px-8`, the title shrinks and is cut with an ellipsis. Library rename/delete buttons were `opacity-0` until hover -> hidden only where the device can hover (`[@media(hover:hover)]`), always visible on touch. Mobile settings nav gets a right-edge fade while sections are hidden to the right (goes away at the end of the strip). Client `tsc` clean, 905 tests (3 new), build compiles the new CSS. **Checked 2026-11-18 in a real browser** (touch context, 390x844, `/api` stubbed with made-up data): no title/avatar overlap, category buttons visible on touch (still hover-only on desktop), settings fade shows and disappears at the end of the strip. **Every page's header actions (2026-11-18):** the actions were crowding the title (Table: title squeezed to 0px; Places/Media 144px; Enriched 193px). Fixed once in `AppHeader` instead of page by page: from `md` up the actions sit in the bar as before; on a phone they get a row of their own under the bar (scrolls sideways if needed), and `AppHeader.Spacer` grows by that row (a tiny store tells it). Applies to Category, Table, Places, Media, Enriched, Pending, Digest, Vault, Item, Graph, Dashboard and Category Review. Checked in a real browser at 390px (touch) and 1280px with stubbed data: titles fully visible, no overlap, no sideways page scroll, spacer = header height, desktop unchanged; client `tsc` clean, 908 tests. Not looked at: the pages' own content on a phone (e.g. the Table's wide columns), Item/Vault/Graph/Digest headers (they crash under my simple stubs, so they were not measured), and Category Review has a ~29px element above its header that predates this change.)*

### L2 — OpenAI (ChatGPT API) provider
- [x] `ProviderId` + `PROVIDER_IDS` (`settings.ts`), `openaiProvider` in the `ai.ts` registry (`openai` npm package, JSON mode via the existing `withJsonInstruction`), `KEY_PROVIDERS` in `apiKeys.ts`, `OPENAI_API_KEY` env var, `openai_model` setting <!-- done: 2026-11-16 -->
      *(reasoning models `o*`/`gpt-5*`: no `temperature`, token cap floored at 1024; migration 024 widens the `api_keys.provider` CHECK; also added to `items.ts` explain/extract zod, `shared/types.ts`, the two baseline scripts, `.env.example`, CLAUDE.md)*
- [x] Check OpenAI's current docs for the default model id when building; keep it editable like Claude/Gemini <!-- done: 2026-11-16 -->
      *(default `gpt-5.4-mini` per the docs search; `gpt-5`/`gpt-5-mini`/`gpt-5-nano` shut down 2026-12-11, `gpt-4o-mini` deprecated. Re-check before launch.)*
- [x] Client: replace the hard-coded claude/gemini ternary in `AiProviderSettings` with a provider config map; add OpenAI to labels, key panel, status rows, test button, per-task dropdowns <!-- done: 2026-11-16 -->
      *(new `client/src/lib/aiProviders.ts`; also used by `ItemAiActions`)*
- [x] `GET /api/ai/providers`, `POST /api/ai/test`, tests (mirror the existing Claude/Gemini cases); update CLAUDE.md routing section <!-- done: 2026-11-16 -->
      *(server 1113 tests, client 706 tests, both `tsc` clean; migration 024 applied to the local DB and checked against the real constraint)*
- [ ] **Live check with a real OpenAI key** (Settings > API keys > Test OpenAI). Everything is verified against mocks only; no key was available. Try both a reasoning model (`gpt-5.4-mini`) and a non-reasoning one.
      *(2026-11-18: key saved in Settings and OpenAI accepted it; all calls refused with `429 no credits remaining`, so the check is blocked on billing, not on code. Run: `cd server && npx tsx src/scripts/verifyChatProvider.ts openai gpt-5.4-mini gpt-4.1-mini` (a reasoning and a non-reasoning model; synthetic text only), then `npx tsx src/scripts/verifyEmbeddingProvider.ts openai`.)*
- [x] Fix stale default `gemini-2.5-flash` in code → `gemini-3.8-flash` <!-- done: 2026-11-17, a956f0a -->
- [~] Custom base URL for OpenAI-compatible endpoints: **not building now**; Groq gets its own provider instead (L2b). OpenRouter / LM Studio / others: "Add if requested" in L8.

### L2b — Groq provider (decided and built 2026-11-17, uncommitted; live check waits for migration 026 + a key)
- [x] Fifth provider `groq` <!-- done: 2026-11-17 -->
      *(`ProviderId` + `PROVIDER_IDS`, `groqProvider` in the `ai.ts` registry (the `openai` SDK with `baseURL` `GROQ_BASE_URL`, its own key, client rebuilt when the key changes), `KEY_PROVIDERS`/`KEY_ENV`/`KEY_LABEL` + `GROQ_API_KEY`, `groq_model` setting + `GROQ_MODEL` env + `DEFAULT_GROQ_MODEL`, `GET /api/ai/providers` (suggestions), `POST /api/ai/test`, settings / Explain / Extract / key-route enums, `shared/types.ts`, both baseline scripts, `.env.example`, `schema.sql`, **migration 026** (widens the `api_keys.provider` CHECK; NOT applied, the user runs it). Same consent / `cloudSafe` / Strict Local rules as every cloud provider: tests cover no consent, no key, private content, explicit-but-blocked, per-task override, fallback to Ollama.)*
- [x] Check Groq's current docs for a default model id and for JSON-mode / token-cap quirks <!-- done: 2026-11-17 -->
      *(Docs search: `max_tokens` is deprecated in favour of `max_completion_tokens` (used); `llama-3.3-70b-versatile` and `llama-3.1-8b-instant` carry a deprecation notice (shutdown 2026-08-16 for free/developer tiers, while another page still lists the 70B as production), so the default is `openai/gpt-oss-120b`; gpt-oss is a reasoning model so reasoning models (gpt-oss, qwen3, deepseek-r1) get a token floor of 4096; JSON mode (`json_object`) is documented for gpt-oss and Llama and a model that rejects it with a 400 is retried once without it; `reasoning_effort` is only valid for gpt-oss and is not sent. The docs pages disagree in places, so the model id and these quirks are re-checked once a real key exists. Model id is editable in Settings.)*
- [x] Client: `aiProviders.ts` (label, short name, `groq_model`), `api.ts` types, key panel help text + order, provider / per-task dropdowns, Test button, "no key yet" hint, privacy wording; tests mirroring OpenAI's <!-- done: 2026-11-17 -->
      *(Server 1303 tests incl. a new `ai.groq.test.ts` (33 tests); client 818. A live Groq key check is still open: Settings > Keys & Privacy > Test Groq.)*
- [x] Embeddings stay on Ollama / Gemini / OpenAI (Groq has no embeddings API); the embedding pickers do not list it <!-- done: 2026-11-17 -->
- [x] Migration 026 applied to the local database (2026-11-18, `npm run migrate`, Postgres started for it and stopped again) <!-- done: 2026-11-18 -->
- [x] **Live Groq check passed 2026-11-18** (new `server/src/scripts/verifyGroq.ts`, synthetic text only, nothing from the library, writes nothing, never falls back to Ollama) <!-- done: 2026-11-18 -->
      *(`openai/gpt-oss-120b` is in Groq's `/models` list (11 models); plain reply OK; JSON mode returned a valid classification-style object; `max_tokens: 16` still returned a full sentence, so the 4096 reasoning floor works. Still not tried through the app's own classify route; the Settings "Test Groq" button was not clicked by Claude.)*
- [x] (original checklist, covered by the line above except the app-route classification): Test Groq; one classification with `ai_provider=groq` on synthetic text; confirm gpt-oss answers within the token floor; re-check the default model id against Groq's `/openai/v1/models`.

### L3 — Cloud-only path (no Ollama required)
**Planned 2026-11-16; A and B done and committed 2026-11-17, C done 2026-11-17 (uncommitted), D-E open.** Goal: a user with no Ollama gets semantic search, Ask, related items and duplicate detection from Gemini or OpenAI embeddings, without silent corruption and without sending private items out.
**Findings that shape the plan (verified in code):** one choke point `aiEmbed()` (always Ollama); vectors are written from 6 places (`items.ts` x2, `ingest.ts`, `embeddingWorker.ts`, `extractRecipeJob.ts`, `entityService.ts` for entities) and nothing records which model made a vector, so two models' 768-dim vectors would compare with no error and wrong results; columns are fixed `vector(768)` (`items` has an HNSW cosine index, `entities` too); thresholds are tuned to nomic-embed-text: 0.92 duplicates (`duplicateService`), 0.92 entity auto-merge (`resolveEntities.ts`, destructive, no dry run), 0.85 graph links (`search.ts`); `POST /api/search` has NO keyword fallback (a failed embed returns 500) and no `embedding IS NOT NULL` filter, so rows without a vector get a NULL rank, which Postgres sorts FIRST in DESC (suspected existing bug: write a failing test first); the worker retries every NULL embedding every 60 s forever; embeddings never consult `cloudSafe()` (they were always local).
**Design decisions:** (D1) one active embedding space at a time: settings `embedding_provider` + `embedding_model`, default stays ollama/nomic. (D2) tag every vector: `items.embedding_model` + `entities.embedding_model` (migration 025; backfill existing vectors as `ollama:nomic-embed-text`); every similarity query filters to the active model, old vectors are kept until replaced, so switching back is an instant rollback. (D3) stay at 768 dims, no column or index change: Gemini `gemini-embedding-001` with `output_dimensionality: 768` + manual L2 normalisation (Google's docs say non-3072 sizes are not normalised) + `RETRIEVAL_DOCUMENT`/`RETRIEVAL_QUERY` task types (note `gemini-embedding-2` normalises itself but has no task_type); OpenAI `text-embedding-3-small` with `dimensions: 768` ($0.02 per 1M tokens per the pricing page; 768 NOT yet confirmed as an accepted value, verify with a live call before building). Model ids are settings, not constants. (D4) privacy: a cloud embedding is made only if the item passes `cloudSafe()` AND `allow_cloud` AND not Strict Local AND a key exists; otherwise the item is skipped (NULL vector + `embedding_skip` reason), keyword search only, and the UI shows the count. Strict Local Mode with a cloud-embedded library pauses semantic features (keyword fallback + banner), never silently calls cloud. (D5) one writer: `embeddingService.embedAndStoreItem(itemId)` replaces the 6 ad-hoc `UPDATE items SET embedding` sites; the worker uses it and skips rows marked skipped. (D6) per-model threshold profiles; a calibration script suggests thresholds from the user's own library; new models start conservative.
- [x] **A. Safety groundwork (no new provider; behaviour unchanged for Ollama users):** <!-- done: 2026-11-17, committed eaa66df -->
      *(migration 025 applied to the local DB; `embeddingService` (single writer, `activeEmbedding()`, privacy gate with an injectable model for tests) and `retrievalService` (shared search/Ask SQL, model filter, `COALESCE` rank fix, keyword fallback, `semantic` flag on `/api/search` and `/api/ask`); worker skips skipped rows; related items, graph, duplicate check, `resolveEntities` filter to the active model; entities store `embedding_model`. NULL-first ordering confirmed on the real Postgres (`[null,0.9,0.5]`) and covered by the opt-in `retrievalService.realdb.test.ts`. Server 1146 tests + 3 opt-in, both `tsc` clean. NOT done from the original A list: a client notice when a result is keyword-only (`semantic:false` is returned by the API but nothing shows it yet; do it with C's UI); the migration backfill assumes existing vectors came from the default `nomic-embed-text`.)*
      Original scope:  migration 025 (`embedding_model`, `embedding_skip` on items; `embedding_model` on entities; backfill; schema.sql); `embeddingService.embedAndStoreItem` as the single writer (loads categories/tags for `cloudSafe`); `activeEmbeddingModel()` and model-filtered queries in `search.ts`, `ragService`, `duplicateService`, related items (`items.ts` ~616), graph; search + Ask fall back to keyword (FTS) when embedding fails or no vector matches, with a `semantic:false` flag in the response; fix the NULL-rank ordering with `COALESCE`; worker skips skipped rows and clears the skip when tags/categories/content change; tests (including the NULL-sort case against the real DB with savepoints)
- [x] **B. Providers:** <!-- done: 2026-11-17 -->
      *(`embeddingConfig.ts` (cached active model, settings `embedding_provider`/`embedding_model`), `aiEmbed(text, {kind})` with `geminiEmbed`/`openaiEmbed`, `embeddingStatus.ts` + `GET /api/ai/embedding`, `verifyEmbeddingProvider.ts`; server 1193 tests, `tsc` clean. **Live Gemini check passed:** `gemini-embedding-001` accepts `outputDimensionality: 768`, the raw norm is 0.5935 so normalising is required, related text scores above unrelated. **Finding for D:** unrelated texts still score ~0.72 (pasta doc vs bicycle doc) and two pasta recipes 0.916, so the nomic-tuned thresholds (0.92 duplicate, 0.85 graph) must be recalibrated per model. Known gap for C: entity names are embedded through `embedQuery` without a per-item privacy check, so under a cloud model a name from a private item could be sent; decide whether to skip entity embeddings or gate them. No endpoint switches the model yet (that is C). OpenAI embeddings are verified against mocks only (needs a key). The real-DB status query was checked read-only: 725 embedded, 88 pending, 0 needing re-embed.)*
      Original scope:  `aiEmbed(text, {kind:'document'|'query'})` routes by `embedding_provider`; `geminiEmbed` (768, normalise, task types) and `openaiEmbed` (`dimensions`), timeouts, 429 backoff, `AiProviderError` mapping, key redaction; privacy gate (D4); `GET /api/ai/embedding` status (active model, counts: embedded / needs re-embed / skipped private / pending); tests with SDK mocks. **Live-verify Gemini first** (saved key) with a few fake strings: dimension, normalisation, similarity sanity. OpenAI stays mock-only until a key exists
- [x] **C. Switching and re-embed:** <!-- done: 2026-11-17 -->
      *(Server: `embeddingSwitch.ts` (`estimateReembed` read-only, `switchEmbeddingModel`), `reembedJob.ts` (kind `reembed`, resumable, 3 at a time, cancellable, stops on blocked/auth and after 5 failures in a row, 6 h cap, not in `AI_JOB_KINDS`), routes `GET /api/ai/embedding/estimate`, `PUT /api/ai/embedding` (a cloud model needs Strict Local off + consent + key; refused while a job runs; switching to Ollama clears the private-skip markers), `POST /api/ai/embedding/reembed` (needs `confirm: true` and the model `id` the user saw), status now includes the running `job` and ignores encrypted items; `PUT /api/settings` refuses `embedding_provider` / `embedding_model`; cancel route accepts the new kind; `loadEmbeddingConfig()` runs on every switch. Client: `EmbeddingSettings.tsx` + `useReembedJob.ts` replace the static "nomic-embed-text" row (status, counts, paused banner, Review -> Confirm -> progress -> Cancel, resumes a running job after reload), `fetchSearchResult` + keyword-only notices in the search modal and Ask (the Ask error text no longer blames Ollama).)*
      *(Decisions made while building: (1) a skipped private item KEEPS its older vector instead of losing it, so switching back is instant (`embedAndStoreItemDetailed` only sets `embedding_skip`); (2) **entity names are embedded only by a local model**: under a cloud model `getOrCreateEntity` stores no vector, and the job's entity step runs for a local target only (an entity cannot tell if its item was private; names are only used for same-model merging); (3) the worker no longer re-selects the same failing items every minute (per-item back-off 1, 2, 4 ... 60 min in memory), pauses while the active cloud model is blocked, and ignores encrypted items; (4) the job row's count field is `failures`, not `failed`, to avoid clashing with the array other jobs store there. New opt-in `reembed.realdb.test.ts` proves the estimate, status and job SQL against the real Postgres (rolled back, independent connection checked). Read-only estimate on the real library: Gemini would send 657 items (~35k tokens), keep 156 private items home; switching back to Ollama would embed only the 88 pending items.)*
      *(Not done: the live end-to-end run with a real provider (needs the user's go-ahead, see Questions); the AI tab's "Test Ollama Connection" only checks chat reachability, not embedding.)*
      Original scope: `PUT /api/ai/embedding` validates and never auto-starts a job; estimate endpoint and an explicit confirm before any library text is sent; re-embed as a background job (kind `reembed`): batches, 429-aware, cancel, resumable; UI in the AI tab; strict-local mismatch banner; also embeds the items that have no vector today (the 88 mined places) without starting Ollama (reachable once Ollama is allowed, or via a cloud model).
- [x] **D. Thresholds and merging** <!-- done: 2026-11-17 -->
      *(Server: `embeddingProfiles.ts` (`BUILT_IN_PROFILES`, `profileFor`, `activeProfile`; basis tuned / probe / library / default; fallback for an unmeasured model: duplicate 0.97, no graph links, no merges; user overrides in setting `embedding_thresholds`, validated field by field so a bad value can never become 0 or NaN); `duplicateService` and `/api/search/graph` read the active profile (graph returns `semanticLinks: false` and skips the pairwise query when the model has no graph threshold); `GET /api/ai/embedding` reports `thresholds`; `entityMerge.ts` + rewritten `scripts/resolveEntities.ts` (DRY RUN unless `--commit`, same-model only, per-model entity threshold, keeps the entity with more links, one merge per entity per run, one transaction per merge that deletes colliding links first and rolls back on error); `embeddingCalibration.ts` + `scripts/calibrateEmbedding.ts` ("equivalent strictness": match the share of library pairs a trusted model flags; `--save-reference`, `--apply`; only numbers are printed); `switchEmbeddingModel` saves the reference automatically before leaving a tuned/library model (best effort). Client: a note in Settings > AI for `probe` / `default` thresholds.)*
      *(Measured, not guessed: a synthetic probe with `gemini-embedding-001` (768 dims, document task type): near-duplicates 0.971-0.994 (mean 0.983), same topic but a different note 0.796-0.870 (mean 0.834), unrelated 0.610-0.753 (mean 0.681) -> duplicate 0.94 (between the groups, biased high), graph 0.80 (just above the unrelated maximum), entity off (cloud models never embed entity names). Read-only run on the real library (nomic, 725 items, 262,450 pairs): p50 0.502, p90 0.603, p99 0.774, p99.9 0.994; 0.32% of pairs above 0.92, 0.52% above 0.85. Found and fixed an existing bug: `resolveEntities` caught a unique-key error inside a transaction and then ran a DELETE, which Postgres rejects (the transaction is already aborted), and it never rolled back. New opt-in `entityMerge.realdb.test.ts` proves the merge SQL on the real Postgres (and `embeddingCalibration.realdb.test.ts` the calibration reads/writes: reference save/read, snapshot on the real library, merged per-model thresholds, settings unchanged afterwards) using savepoints inside a rolled-back transaction (the merge issues its own BEGIN/COMMIT), with an independent connection checking nothing leaked.)*
      *(Not done: OpenAI embedding thresholds (no key to probe: uses the strict fallback until calibrated); a UI to run calibration (it is a script on purpose: it needs a saved reference and a human look at the result); the equivalence method assumes the same library under both models.)*
      Original scope: `EMBEDDING_PROFILES` per model; `duplicateService`, graph and `resolveEntities` read the active profile; `resolveEntities` same-model only, DRY RUN by default, `--commit` to merge; calibration script (local only, prints distributions, never writes personal text into the repo)
- [x] **E. Docs** <!-- done: 2026-11-17 -->
      *(README: intro and tech stack no longer claim local-only; Quick Start rewritten (the `.env` is at the PROJECT ROOT, Postgres is on host port 5436, Ollama is native and NOT in `docker-compose.yml`, `npm run dev` does NOT migrate but `memex.sh` / `memex.ps1` do: the old README said the opposite on all four); Path A (local) and Path B (cloud-only, in the order that works); a local-vs-cloud table; changing the embedding model; calibration; env block; test counts removed (they go stale). `.env.example`, RUNBOOK (stale `docker exec memex-ollama-1`) and CLAUDE.md (stale compose block, migration tree, "Cloud-only first run" section) corrected. UI labels quoted in the README were checked against the code.)*
      *(**Verified, not assumed:** a fresh database (`CREATE DATABASE memex_e2e`, dropped afterwards; your database was never touched) took all 26 migrations from scratch; a server with `OLLAMA_URL` pointing nowhere then ran: account setup, set provider Gemini + consent, switch embeddings, save a synthetic note (classified as recipe, confidence 95), save a `private`-tagged note (`embedded=1 skippedPrivate=1`), semantic search (`semantic: true`), Ask (correct answer, 1 source). The encrypted Gemini key row was copied between databases as ciphertext, never decrypted by me.)*
      *(**Finding:** before the embedding model is switched, saving a note fails with `500 "Failed to classify text"` even with Gemini chosen for chat and consent on, because `POST /api/ingest/text` (and the url/file/voice/quicksave routes) await `embedQuery()` for the duplicate check and embeddings default to Ollama. Documented as "switch embeddings before saving". **Recommended fix (not done, needs a decision):** wrap `embedQuery` in those routes so a failed embedding only skips the duplicate hint instead of failing the whole save (`findSimilarItems` already returns [] for an empty embedding). It also helps a cloud-chat user whose local Ollama is down, and the 500 message hides the real cause.)*
      *(Not verified live: OpenAI embeddings, and Claude / OpenAI / Groq chat (mocks and unit tests only; no keys). The README says so.)*
      Original scope: README "cloud-only quick start", CLAUDE.md (embeddings section, new settings, migration 025), `.env.example`, hook for the L4 first-run wizard (cloud path asks for an embedding provider)
- **Open decisions:** (1) private items under cloud embeddings: skip them (recommended) vs. a second local-only vector set that needs Ollama; (2) default provider: Gemini first (a key is already saved) or OpenAI; (3) OK to make a tiny live Gemini embedding call with synthetic text to verify dims before Phase B; (4) ship Phase A as its own commit first (recommended: it also fixes the search fallback and NULL-order problems).
- **Risks:** thresholds cannot be chosen without measuring real neighbours (needs a run on the user's own library, kept local); Gemini free-tier rate limits; a library is only partly searchable semantically while re-embedding runs (progress shown); if OpenAI rejects 768 dims we would need `vector(1536)` (a bigger migration, decide before C); whole-library upload on re-embed needs the explicit confirm.

### L4 — Install and first run
- [x] **Cloud path contract (the hook from L3 E)** <!-- done: 2026-11-17 -->
      *(Implemented by `client/src/components/setup/AiSetupStep.tsx`, step 0 of `/welcome`: key -> consent text -> `PUT /api/settings` -> `POST /api/ai/test` -> `PUT /api/ai/embedding`; Claude/Groq (no embeddings API) ask where search should run and need a Gemini/OpenAI key or local Ollama; stops at the first failure with a readable message and can be retried; 24 tests incl. the order of calls.)*
- [x] Embedding-failure robustness fix <!-- done: 2026-11-17 -->
      *(see Done 2026-11-17 above.)*
- [x] One-command start <!-- done: 2026-11-17 -->
      *(`Dockerfile` (multi-stage; one process serves the API and the built web app on port 3002), `.dockerignore`, `docker-compose.yml` `app` service (waits for Postgres health, `JWT_SECRET` required, `MEMEX_AUTO_MIGRATE=true`, `host.docker.internal` incl. Linux `host-gateway`) and an optional `ollama` profile; `npm run db:up` now starts only Postgres. **Verified on Windows (Docker Desktop) under a separate project name (own volume, your data untouched):** `docker compose up -d` -> Postgres healthy -> app applied all 26 migrations to an empty database by itself -> healthy; `/api/health/status` ok, `/` and a client route serve the web app without login, `/api/items` without a token is 401, `needsSetup: true`; a weak `JWT_SECRET` in the image is refused with a readable message (exit 1); an unreachable database gives the instructions with the password masked; compose itself refuses a missing `JWT_SECRET`. **Found and handled:** `npm ci` fails on Linux because the lock files were generated on Windows (missing esbuild platform packages), so the image uses `npm install` like CI does (a cleaner fix is regenerating the lock files on Linux); `tsc` emits `dist/server/src/index.js` (not `dist/index.js`) so `npm start` was pointing at a file that did not exist and is fixed.)*
- [x] First-run wizard: create the single user, choose local or cloud AI, paste keys, set cloud consent <!-- done: 2026-11-17 -->
      *(Not done: the "optional demo data" choice, because demo data is L5. **Found and fixed:** the setup form disabled "Initialize Memex" unless Ollama was running, so a cloud-only user could not even create an account in the browser (the API-level test of L3 E had bypassed the UI); Ollama is now informational. New `GET /api/auth/status` -> `{needsSetup}` opens setup on a fresh install. **Found in a real browser and fixed (pre-existing):** after the account was created the app landed on the Dashboard instead of `/welcome`, because creating the account signs the user in and the "already signed in" effect in `Login.tsx` navigated to `/` after the `navigate('/welcome')`; the whole welcome flow (and so the new AI setup step) was unreachable. The old test never saw it because its mocked auth store never changes state; the new test does, and fails without the fix.)*
      *(**Checked in a real browser against the production container** (fresh database, real Gemini with a deliberately fake key): the setup form opens by itself, "Initialize" is enabled, the account lands on `/welcome` with the AI setup, the button stays disabled until key + consent, the steps run in order (key done, consent done, test failed, search pending) and "Try again" appears; 390px has no horizontal overflow. **Two more findings from that run, both fixed:** (1) Google answers an invalid key with HTTP 400 `API_KEY_INVALID`, which was classed `unavailable`, so the user saw a raw JSON blob instead of "rejected the key": now mapped to `auth` on the server (also helps the Settings Test button) and the wizard shows only the provider's sentence; (2) the PWA service worker from an earlier visit served the previous bundle after an upgrade (documented in the README upgrade notes: reload once or twice). Not run in a browser: the success path with a real key (needs the user's key, covered by 27 unit tests and by the API-level run in L3 E).)*
- [x] `.env.example` audit and a startup check that refuses weak/default secrets <!-- done: 2026-11-17 -->
      *(`lib/startupChecks.ts`: missing, known example value, < 32 characters or repetitive is weak; production (the Docker image) refuses, development warns, `MEMEX_ALLOW_WEAK_SECRETS=1` is the visible escape hatch; `KEY_ENCRYPTION_SECRET` is checked only when set. `.env.example` documents the rules, the Docker-only variables and `MEMEX_AUTO_MIGRATE`.)*
- [x] Health endpoint + readable startup errors (DB down, weak secret, failed migration) <!-- done: 2026-11-17 -->
      *(`prepareStartup` before `listen`; `GET /api/health/status` is public and reveals no host/user/port; Ollama down is not a degradation; "Ollama down" and "missing key" are not startup errors because a cloud-only install has no Ollama and keys are added in the app.)*
- [x] Upgrade path <!-- done: 2026-11-17 -->
      *(README "Upgrading": back up, pull, rebuild/migrate, how to roll back. **The backup and restore commands were run:** a `pg_dump` of the throwaway database restored into a fresh database with all 26 migration records and 47 seeded categories. A failed migration rolls back and the app refuses to start with the reason. Not done: a backup/restore button in the app (L5).)*
- [~] Tested install notes for Windows, macOS, Linux <!-- partly done: 2026-11-17 -->
      *(README "Platform notes" table with tested / untested stated plainly. **Only Windows (Docker Desktop) has been run.** macOS and Linux use standard Docker features and the compose file has the Linux `host-gateway` mapping, but nothing was tried there: needs a run on each (or a CI job on Linux, which would double as L6's smoke test). GPU passthrough for Ollama in Docker is documented as not included.)*

### L5 — Demo mode and trust features
- [x] Demo seed: ~40 generic sample items across all types (recipes, media, places, links, notes, specs), no personal data; "Demo mode" banner + one-click clear <!-- done 2026-11-17 -->
      *(`services/demoData.ts` (40 invented items, `example.com` links only, a test that they hold no e-mail/phone/account-like text and pass `cloudSafe`), `GET/POST/DELETE /api/demo`, header "Demo mode" tag, Settings > Library > Sample data with a confirm before clearing. Clear removes exactly `structured.demo` items, entities the load created (never one the user already had), and sample tags nothing else uses. Load is one transaction, refuses a second load, calls no AI. Opt-in real-DB test in a rolled-back transaction. Not done: the offer in the first-run wizard (only in Settings for now).)*
- [x] Full backup and restore (DB + vault config), documented <!-- done 2026-11-17 -->
      *(`npm run backup` / `npm run restore -- <file> --yes`, README "Backup and restore". **Run on the real library:** restored into a scratch database with every count equal (items 849, categories 72, vault config, keys, settings, links, embeddings, vector extension); a junk file and a truncated file are refused with the database untouched; the scratch database and the dump files were deleted. The backup cannot hold the vault master password or `JWT_SECRET`, and says so. Not done: a button in the app (command line only).)*
- [x] "Which AI answered" badge on items + "Redo with…" <!-- done 2026-11-17 -->
      *(`extractionModel` + `localOnly` on `GET /api/items/:id`; `POST /re-classify {provider}` pins one run and reports why it cannot (409/429/502) instead of falling back; `AiBadge` and `ReClassifyControl` on the Item page.)*
- [x] Wire `looksSensitiveContent` into `cloudSafe()` <!-- done 2026-11-17 -->
      *(New content layer with refined rules, applied to every cloud call that passes title/content, the embedding gate and the switch estimate. Tuned on the real library with counts only: the first draft flagged 62 items by digit runs, 63% of them URL ids; the final rules flag 3 beyond the 156 already private by category.)*

### L6 — Repo and launch hygiene
- [x] Security pass before wide sharing: CORS, default ports, rate limits, auth defaults, dependency audit, secrets scan of git history <!-- done 2026-11-17 -->
      *(**Found and fixed:** Docker published Postgres (password `memex`) and the app on all interfaces, and the server listened on every interface -> now loopback (`HOST`, `MEMEX_BIND`, `MEMEX_DB_PORT`); CORS was wide open -> `lib/corsPolicy.ts` (any site only for the bookmarklet's one route, else localhost + `MEMEX_CORS_ORIGINS`); account setup had no password rule and a non-string body could crash bcrypt -> 10+ chars, <=72 bytes, valid email, strings only, bcrypt cost 12 (login/existing accounts untouched). Rate limits were already on auth, ingest, AI test/key/embedding writes and AI actions: left as is. **Dependencies:** server 9 -> 3 advisories (critical `proxy-addr` and 5 highs fixed, `adm-zip` 0.6.1), client 33 -> 2 moderate (Tiptap 3.34 fixes the paste XSS). **2026-11-18: the two open ones are fixed:** `zod` 3 -> 4 on the server (`z.record` needs a key schema, `z.string().uuid()` -> `z.guid()` because v4's `uuid()` rejects the all-zero test ids and any non-RFC id; `flatten()` still works, deprecated) and `react-router-dom` 6 -> 7 in the client; also `qs` via `npm audit fix`. Both `npm audit --omit=dev` now report 0. Server 1706 tests, client 908, both `tsc` clean; the built client was checked in a browser (signed-out redirect to /login, tab links and back button, unknown route -> /, no console errors). **History scan:** no keys, `.env`, `.pem` or backup file was ever committed (only the fake `gsk_...` test strings).)*
- [~] README rewrite (what it is, 2-minute quick start, local vs cloud table, privacy model, FAQ), screenshots/GIF from demo data <!-- partly done: 2026-11-17 -->
      *(Added "Try it in two minutes", "Privacy model", a FAQ, backup/sample-data sections. **Not done: screenshots/GIF**, on purpose: the redesign (L9) will change every screen, so they would be stale at once; take them from the sample data after L9.)*
- [x] LICENSE (**MIT**, decided 2026-11-17), CONTRIBUTING, issue templates, SECURITY.md, CHANGELOG, version tag + GitHub release <!-- done: 2026-11-18 -->
      *(LICENSE already existed (MIT, "Memex Authors"). Added SECURITY.md (private reporting via GitHub advisories, so no email is published), issue + PR templates, fixed the `yourusername` clone URL. **2026-11-18:** the user enabled "Private vulnerability reporting" on the repo. Released **v1.1.0** (not v0.1.0: `v1.0.0` already existed, released 2026-06-09, so the user chose v1.1.0): root `package.json` + lockfile bumped, CHANGELOG "Unreleased" dated `[1.1.0] — 2026-11-18`, `RELEASE_NOTES_v1.1.0.md` is the release body, commit `a9ba116`, annotated tag pushed, GitHub release created as latest: https://github.com/jagdeepvirdi/memex/releases/tag/v1.1.0. `server/` and `client/` stay at 0.1.0 (internal). CI on `a9ba116` is green.)*
- [~] CI green on main; `docker compose` smoke test in CI <!-- partly done: 2026-11-17 -->
      *(`scripts/smoke-test.sh` builds the image and starts postgres + app in its own compose project on spare ports, then runs 18 checks (migrations on boot, health shows no connection details, setup/login/second-account refusal, weak password refused, API/vault need a login, sample data load/clear, CORS blocks a random site but not the bookmarklet, both ports loopback-only). **Run locally: 18/18 passed in ~2 min.** Added as the `docker-smoke` job in `ci.yml`. Not done: seeing that job go green on GitHub (needs a push), and a macOS/Linux run.)*

### L7 — Landing page (after the redesign)
- [x] **2026-11-18: site found down (404) and fixed; page updated.** The Vercel project had auto-connected to the GitHub repo with an empty Root Directory, so each push to `main` (mine from ~12:26 on) deployed the repo root, which has no `index.html`, and replaced the production alias; the custom domain and the vercel.app URL both answered 404. Fix: Root Directory set to `site` (Git deploys now serve the page; pushes publish it), redeployed, 200 on https://memex.jagdeepsinghvirdi.com. Page content: new "What is new in v1.1, and why it helps" section (12 items), Light/dark palette + a Theme button (auto / light / dark, remembered), footer link to the v1.1.0 release, install note about Linux CI. <!-- done: 2026-11-18 -->
- [x] Static `site/` page sharing the app's design tokens: hero, problem, Capture/Organize/Ask, local-vs-cloud toggle, feature grid, privacy, quick start, footer <!-- done 2026-11-17 -->
      *(`site/index.html`, `style.css`, `site.js`: no build step, no framework. App tokens (dark, amber, Playfair/DM Sans/JetBrains Mono). The hero is a live "where does each note go?" ledger: flip the AI between this computer and Gemini and see which sample notes are sent and which are held back, with the reason (the same rules as `cloudSafe`). Fonts are self-hosted (`site/fonts`, OFL), nothing loads from a third party (checked in the browser's network list, zero console messages), keyboard focus, skip link, reduced motion respected, checked at 1360 and 390 px wide. Preview: `cd site && python -m http.server 4173`.)*
- [x] Deploy to Vercel and point `memex.jagdeepsinghvirdi.com` at it <!-- done: 2026-11-18 -->
      *(Deployed `site/` to production on Vercel as project `memex-site` (https://memex-site-three.vercel.app), logged in as the user's account; the files were checked first (only the public GitHub handle appears). Domain added to the project; the user added the GoDaddy DNS record (CNAME `memex` -> `2d68eb0c2aa632f6.vercel-dns-017.com.`; nameservers are GoDaddy's). Vercel did not issue the certificate on its own, so `vercel certs issue memex.jagdeepsinghvirdi.com` was run by hand; https://memex.jagdeepsinghvirdi.com now answers 200 with the page. Redeploy with `vercel deploy --prod` from `site/`. `site/.gitignore` (created by the Vercel CLI, ignores `.vercel`) is untracked.)*
- [ ] Screenshots from the restyled app on demo data, added to the landing page and README
      *(Not done: screenshots wait for the L9 redesign (the page uses no screenshots today). **Found for L9:** the app itself loads Playfair/DM Sans/JetBrains Mono from Google Fonts (`client/index.html`), which tells Google every time a user opens a "nothing leaves your machine" app: self-host them the way `site/fonts` does.)*

### L8 — Post-launch ideas
- [ ] MCP server (Claude Desktop, Cursor, ChatGPT can search/save into Memex)
- [ ] Browser extension (upgrade from bookmarklet); Telegram/email capture
- [ ] More importers: Obsidian, Notion, Pocket/Raindrop, browser bookmarks, Kindle highlights, Apple Notes
- [ ] Weekly digest email, shareable collections (read-only link)

**Add if requested** (decided 2026-11-17: shown as roadmap, built only when someone asks): custom base URL for OpenAI-compatible endpoints (OpenRouter, LM Studio, others); the other importers and ideas above unless a user needs them; a local-only embedding set for private items (they are skipped instead).

### L9 — Visual redesign (colours + light/dark done 2026-11-18; layout redesign not started)
- [x] Direction chosen by Claude on the user's brief ("fresh colours that work in both dark and light"): **Midnight / Daylight** palettes with an **iris** (blue-violet) accent <!-- done: 2026-11-18 -->
      *(Replaces the warm amber / aged-paper palette. Fonts and card layout unchanged for now. Dark: bg `#0B0E14`, accent `#7C83FF`; light: bg `#F5F7FB`, accent `#5558E8`. The user did not look at the reference sites, so this is Claude's call: easy to retune in one place, the `:root` blocks of `client/src/index.css`.)*
- [x] Design tokens as CSS variables + Tailwind mapping, theme switch (system / light / dark, saved), pre-paint script, toggle in the header, themed toasts and graph canvas, landing page on the same palette <!-- done: 2026-11-18 -->
      *(Tailwind `white` is the theme overlay, so ~500 `bg-white/N` / `border-white/N` classes needed no edits; the standard green/red/amber/... shades are variables (deeper in light); hardcoded hex colours in cards, PublicItem, graph and toasts replaced. Client `tsc` clean, 914 tests (6 new; they caught a real bug: the toggle did not re-render when the choice changed from "light"/"dark" to "system" while the system already matched). Checked in a real browser in both themes with stubbed data: Category, Dashboard, Settings > AI, Login, error screen, landing page (dark + light). NOT looked at in light: Item, Vault, Ask, Table, Places, Media, Digest, Graph, Trash, Welcome, Public share page, the modals/ingest panel; some may have low-contrast spots (`bg-black/...`, `text-[#...]`, gradients) to tidy.)*
- [ ] Review the remaining pages in light mode and fix contrast spots (list above)
- [ ] Layout / typography redesign (fonts, spacing, card style), if wanted; self-host the app's fonts (they load from Google Fonts)
- [ ] Screenshots for README and landing page (now unblocked; take them from sample data)

---

## 📋 Code Review Action Items — 2026-05-30

> Full scores, rationale, and review narrative are in **[SCORECARD.md](SCORECARD.md)**
> (overall ~7.5/10; test coverage is the identified ceiling). Two bugs were fixed during
> the review: the server test suite (JWT_SECRET guard broke 6/10 files) and the `/digest`
> route shadowing. The remaining action items are below.

### 🔴 Action Items — High Priority

- [x] **Test coverage for Phase-2/3 services (the big gap)** ✅
  - Covered: `nlFilterService` (whitelist/type/fallback), `share.ts` route, `duplicateService`,
    `entityService` (dedup, embedding-failure, role mapping), `visionService` (model priority +
    preference), `insightService` (threshold, JSON parse, cap-at-3), `ragService` (embed,
    synthesis, empty short-circuit), `rediscoveryService`, `digestService` (counts, connection
    pairing, graceful AI failure), `settings.ts` route (GET/PUT/bookmarklet-key), `tags.ts` route
    (list/add/remove), `whisperService` (mime + install check).
  - Server test count: 118 → **204**. Total with client: **221**.
  - ⬜ Remaining (lower value): route tests for `/nl-filter`, `/:id/share` POST/DELETE,
    `/:id/extractions` — services behind them are unit-tested; deferring to client coverage work.

- [x] **Add a route-ordering regression guard** ✅
  - `items.routing.test.ts` asserts `GET /api/items/digest` hits the digest handler (distinctive
    `period` shape), and `/reminders/due` + `/export/obsidian` return 200 through the real router —
    catching the `/:id` shadowing bug class that `tsc` and handler-level unit tests miss.

- [x] **Auth rate-limiting** ✅
  - `POST /api/auth/login` has no throttle — brute-forceable. Add `express-rate-limit`
    (e.g. 10 attempts / 15 min / IP) on the auth router.

### 🟡 Action Items — Medium Priority

- [x] **Share tokens never expire** ✅
  - `public_token` is permanent until manually revoked. Add optional `share_expires_at` and
    filter it out in `GET /api/share/:token`. Consider a "share expires in 7 days" default.

- [x] **Replace in-memory ingest job store with something restart-safe** ✅
  - `jobs` object in `ingest.ts` is lost on server restart — a Keep import in progress becomes
    unobservable. Either persist job state in a table or document the limitation in the UI.

- [x] **Structured logger instead of 99 raw `console.*` calls** ✅
  - Adopt `pino` (or similar) with levels. Keeps prod logs parseable and lets tests silence output.

- [x] **Client test coverage** ✅
  - Only `ItemCard` and `crypto` are tested. Add tests for `lib/api.ts` (request shaping),
    `lib/export.ts` (CSV/escaping), `store/vaultStore` (auto-lock timing), and the
    `ReminderPoller` / `MondayDigestRedirect` logic in `App.tsx`.

### 🟢 Action Items — Low Priority / Polish

- [x] **CI pipeline** ✅ — GitHub Action running `npm test` + `tsc --noEmit` on push (`.github/workflows/ci.yml`).
- [x] **Coverage reporting** ✅ — `vitest --coverage` via `npm run coverage`; thresholds configured in vitest.config.ts / vite.config.ts; coverage step in CI.
- [x] **`schema.sql` drift guard** ✅ — `schema.test.ts` checks sequential numbering, all migration tables present in schema.sql, and migration count comment accurate.
- [x] **Accessibility pass** ✅ — `SearchModal`: role="dialog", aria-modal, focus trap, Escape-to-close, aria-label on close button, role="listbox/option" on results. Icon-only buttons in VaultItemForm, Dashboard, Login, Settings all have aria-label.
- [x] **Rate-limit / size-cap file & voice uploads** ✅ — `multer` limits: documents/images 50 MB, audio 100 MB, Keep ZIP 500 MB.

---

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

## ✅ Vault Hardening & Shared AppHeader — 2026-06-04 (DONE)

- [x] **Shared `AppHeader` component** ✅
  - Fixed top bar with Ollama AI status pill, network indicator, enrichment progress + ETA,
    Settings link, and profile dropdown with logout.
  - Adopted across all 14 authenticated pages — replaces per-page inline headers.
  - `AppHeader.Spacer` sub-component prevents content sliding under the fixed bar.

- [x] **`useAiStatus` hook** ✅
  - Extracted Ollama health polling (30s) and enrichment progress polling (5s) from Sidebar
    into a reusable hook. Returns `{ aiStatus, enrichment, eta, rate, isOnline }`.
  - Dispatches `memex:categories-changed` event when enrichment advances so Sidebar
    category counts refresh automatically.

- [x] **Vault verifier (migration 015)** ✅
  - `verifier` + `verifier_iv` columns added to `vault_config`.
  - First-time setup encrypts sentinel `memex-vault-v1` via `POST /api/vault/setup`.
  - Unlock decrypts sentinel client-side to verify password; wrong password rejected
    immediately — eliminates silent wrong-key decryption.

- [x] **Vault password change** ✅
  - `VaultChangePassword` modal re-encrypts every vault item with a new key + fresh salt,
    submits to `PUT /api/vault/rekey` in a single DB transaction with progress bar.
  - New endpoints: `GET /vault/status`, `POST /vault/setup`, `PUT /vault/rekey`, `POST /vault/reset`.

- [x] **Vault test coverage** ✅
  - 15 new tests covering all new endpoints. **Total: 278 tests (221 server + 57 client).**

---

## 🐛 Known Bugs / Planned Improvements

- [x] **Category staging area — review AI-suggested categories before DB commit** ✅
  - **Done:** Added `GET /api/categories/anomalies` (finds rogue root categories with preview items
    and suggested remapping) and `POST /api/categories/remap` (bulk reassigns all items in a rogue
    subtree to a canonical path, then deletes the subtree bottom-up). New `/categories/review` page
    in the sidebar lists all anomalies, pre-populates the AI suggestion, and supports per-card or
    "Remap All" actions. Also fixed missing `PlaceData` import in `classifier.ts`.

- [x] **"Move to Vault" action on sensitive notes** ✅
  - **Problem:** Google Keep notes often contain sensitive data — bank account numbers, UPI IDs,
    PINs, license keys, contact details — that should be encrypted in the vault, not stored as
    plain text in the items table.
  - **How to implement:**
    1. Add a **"Move to Vault"** button on the Item detail page (and item cards via context menu).
    2. On click: check if vault is unlocked, then encrypt `item.content` client-side.
    3. `POST /api/vault/migrate/:id` to save encrypted blob and hard-delete plain-text version.
  - **Done:** Implemented migration endpoint and UI buttons in Item page and Table View.

- [x] **Category proliferation / duplicates during AI enrichment** ✅
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
  - **Done:** Implemented fuzzy-mapping in `classifier.ts` and ran a DB cleanup script.


---

- [x] **"Mark All as Reviewed" bulk action for enriched Keep notes** ✅
  - **Done:** `PUT /api/items/review-all` implemented; "Mark All Reviewed" button wired in
    TableView (`/items/table`). Marks only Keep notes with non-empty structured data as reviewed.

---

## 🟢 Features / Improvements

- [x] **Table View — "View All" as a rich data table with filters** ✅

  **Requirement:** Replace the card grid on "View All" with a dense, scannable table showing
  every item's key metadata in one place. Make review actions available inline.

  **Columns (sortable):**
  | Title | Type | Categories | Tags | Summary | Created | Last Updated | Reviewed |
  Each row has a ✓ button to mark reviewed inline (no page reload needed).

  **Filters panel (above table):**
  - Type: All / Note / Recipe / Media / Book / Link / Stock / Spec (pill toggles)
  - Category: dropdown from the canonical tree
  - Tags: multi-select chip input
  - Date range: Created / Updated from–to
  - Status: All / Pending Review / Reviewed / Pending Enrichment
  - Search: full-text across title + summary

  **Done:** Implemented `/items/table` with rich filtering, pagination, and bulk review action.


---

- [x] **Media Intelligence — Movie & Book database auto-extracted from notes** ✅
  - **Requirement:** Extract movies and books from notes. Split multi-entity notes.
  - **Done:** Implemented multi-entity detection in classifier, note splitting in ingest, and `/media` view.

- [x] **Place Intelligence — Restaurant, Café & Location database auto-extracted from notes** ✅
  - **Requirement:** Extract structured places from travel and food notes.
  - **Done:** Added `place` type, structured `PlaceData`, and `/places` view with Maps integration.

---

- [x] **ETA on AI Enrichment progress widget (Sidebar)** ✅
  - Track when enrichment started and how many notes were pending at that point
  - Every poll (5s), compute rate = notes_classified / elapsed_seconds
  - Display: "~12 min left" or "~3 notes/min" alongside the X/764 counter
  - Done: Implemented real-time rate and ETA tracking in Sidebar.

- [x] Wire up model selector in Settings (llama3.2 vs gemma3:4b) ✅
  - Done: Added `settings` table and API, wired UI to toggle models and cloud vs local.

- [x] Pagination on Dashboard and category pages (currently limited to 12/50) ✅
  - Done: Added "Load More" to Dashboard and Prev/Next to Category pages.
- [x] Bulk delete from PendingItems / EnrichedItems pages ✅
  - Done: Added multi-select and bulk delete to both pages.

- [x] Export enriched items as CSV in addition to JSON ✅
  - Done: Added "Export CSV" buttons to Table View, Places, and Media pages.

---

## 🚀 Vision / Future Phases (from Gemini Vision)

- [x] **Actionable Insights Dashboard (The "Wow" Moment)** ✅
  - **Requirement:** Automatically scan user's library and surface 1-3 near-term actionable
    insights on the Dashboard.
  - **Done:** Created `insightService` backend pulling recent/random items, and updated 
    Dashboard UI with an animated, staggered Insight card layout.

- [x] **Celebratory Welcome Experience ("Hello World")** ✅
  - **Requirement:** A personalized onboarding flow when a user first connects their data.
  - **Personas:** Choose between "The Helpful Productivity Partner" (logistics focused) 
    or "The Inspirational Creative Muse" (passion focused).
  - **Flow:** Celebrate the data connection, show immediate value via a few high-level 
    connections the AI made across different notes.
  - **Done:** Created an interactive, animated 3-step onboarding flow in `/welcome`.

- [x] **Advanced Local Structured Outputs (Reliability Upgrade)** ✅
  - Done: Enabled native JSON Mode in `ollama.ts`, implemented "Enum Trick" for categories 
    (providing strict leaf node list in prompt), and forced Temperature 0.0 for reliability.

---

## 🧠 "Knowledge OS" Architecture (Claude Recommendations)

- [x] **First-Class Entity Graph & Resolution** ✅
  - **Requirement:** Turn extracted strings (directors, authors, cities) into actual relational entities (`people`, `places` tables).
  - **Why:** Enables queries like "every movie by this director" or "everything connected to Bangkok" across all note types.
  - **Implementation:** Created `entities` and `item_entities` tables, added `extractAndLinkEntities` to the ingestion and update flows, and wrote an entity resolution background script.

- [x] **Local RAG Q&A ("Ask Your Knowledge")** ✅
  - **Requirement:** A chat interface that queries the local database.
  - **Done:** Implemented `ragService` backend using hybrid search context and AI synthesis,
    and created a dedicated `/ask` chat page with cited sources.


- [x] **Resurfacing / Serendipity Layer** ✅
  - **Requirement:** A dedicated section (or weekly digest) for rediscovery.
  - **Done:** Added `/api/items/rediscover` backend logic and a "Rediscover" widget on the 
    Dashboard showing "On this day" and forgotten items.

- [x] **Confidence Scoring & Curation Queue** ✅
  - **Requirement:** Capture a confidence signal from the AI during extraction.
  - **Done:** Added `confidence` column to schema, updated AI prompts to return a 0-100 score, 
    and added a color-coded "Score" column to the Table View for easy curation of low-confidence items.

- [x] **Data Provenance & Re-processing** ✅
  - **Done:** Added `raw_content TEXT` (immutable, set once at import — backfilled from `content` for existing items)
    and `extraction_model TEXT` to `items` (migration 009). New `item_extractions` table logs every AI run:
    model, type, title, summary, structured, categories, tags, confidence, applied flag.
  - Enrichment pipeline (`classifyAndUpdateBatch` in ingest + `/enrich` in items) now writes to
    `item_extractions` on every run. Auto-applies to `items` only when `reviewed = false` — manually
    confirmed items are protected from overwrite; their extraction is saved for user review.
  - `classify()` now stamps `result.model` from `getAiConfig()` so every extraction is traceable.
  - New endpoints: `GET /api/items/:id/extractions` (history), `POST /api/items/:id/apply-extraction/:id`
    (roll forward/back to any past extraction).
  - `Item.tsx` shows collapsible "Extraction History" panel — model name, date, confidence, active badge,
    per-extraction "Apply" button. "newer available" badge when a more recent extraction isn't active.

- [x] **Multi-modal Capture — Vision** ✅
  - **Done:** Added `visionService.ts` — auto-detects the best installed Ollama vision model
    (`llama3.2-vision:11b` → `llava:7b` → `llava` priority order), converts image buffer to base64,
    calls Ollama `/api/chat` with the image and a structured extraction prompt.
  - `POST /api/ingest/file` now branches: images → vision pipeline, documents → MarkItDown.
    Returns HTTP 503 with pull instructions if no vision model is installed.
  - `GET /api/ingest/vision/health` — returns `{ available, model }`.
  - `FileIngestPanel.tsx` updated: image thumbnail preview on drop, purple "Vision AI · model-name"
    badge when available, yellow warning + pull instructions when no vision model found, smart
    button label ("Analyse with Vision AI" vs "Convert & Classify with AI").

- [x] **Intent classifier — tag items as actionable | reference | idea** ✅
  - **Done (2026-06-05):** `intent VARCHAR(20)` added to `items` + `item_extractions` (migration 016).
    Classifier prompt updated with intent rules: `actionable` (todo/want-to-do/buy/visit/watch),
    `reference` (factual, how-to, specs, saved for lookup), `idea` (brainstorm, fleeting thought,
    creative concept). Intent badge shown on Item detail page (amber ⚡ / purple 💡 / muted 📖)
    and CategoryReview staged cards.

- [x] **Data provenance — re-classify UI** ✅
  - **Done (2026-06-05):** Re-classify button on Item page — runs classifier on current content,
    saves extraction to history with `applied=false`, never auto-applies; user decides via existing
    Apply button. Bulk "Re-process with Current Model" row in Settings re-classifies all unreviewed
    items in background (pLimit 3), applies results, saves history-only for already-reviewed items.
    New routes: `POST /api/items/:id/re-classify`, `POST /api/items/reprocess-bulk`.

- [x] **Category staging area — two-tab review queue** ✅
  - **Done (2026-06-05):** `CategoryReview` (`/categories/review`) rewritten with two tabs:
    "Staged Items" — low-confidence unreviewed items with confidence threshold selector (50–90%,
    default 70%), per-card Accept / Reassign with inline path input, Accept All;
    "Category Anomalies" — existing rogue root category remap (unchanged).
    `maxConfidence` query param added to `GET /api/items`.

---

- [x] PWA: test offline mode and share-target flow ✅
  - Done: Configured Workbox runtime caching (NetworkFirst) for API routes, registered SW,
    and implemented share-target intent handling in the Dashboard IngestPanel.

---

## 🚀 GitHub Release Checklist

- [x] **Commit 3 untracked files** ✅ (done in commit 38d0225)

- [x] **Fix ~20 unused import warnings in client** ✅ (done in commit 2c43f25)

- [x] **Add timeout to insightService / digestService Ollama calls** ✅
  - `insightService.ts` and `digestService.ts` have no timeout on `aiChat()` — a slow/hung
    Ollama blocks the Dashboard and Digest on first load.
  - Fix: wrap in `Promise.race` with a ~15s timeout; return `[]` / null on timeout.
  - (Tracked once here — was previously duplicated in the review action items above.)

---

## 🐞 Known Weaknesses (from 2026-06-05 brutal review)

- [x] **`nl-filter` SQL field interpolation** ✅
  - Replaced `i.structured->>'${field}'` with `jsonb_extract_path_text(i.structured, $n)`.
  - Exported `SAFE_FIELDS` from `nlFilterService.ts`; added explicit route-level guard as defence-in-depth.

- [x] **Ollama down = silent failure for bulk operations** ✅
  - `reprocess-bulk` now creates an `ingest_jobs` record and returns `{ queued, jobId }`.
  - Tracks per-item failures; marks job `failed` with error count on completion.
  - Callers can poll `GET /api/ingest/jobs/:id` for live progress and final status.

- [x] **Long route handlers — no service layer** ✅
  - Extracted `GET /api/items` list query, `POST /api/items/enrich`, and `POST /api/items/reprocess-bulk` into `server/src/services/itemService.ts`.
  - Added a shared `buildItemQuery()` helper. Refactored `/nl-filter`, `/reminders/due`, and `/:id/related` to use `buildItemQuery()`, reducing copy-paste SQL patterns.

- [x] **Vault reset has no confirmation guard** ✅
  - Server requires `verifiedSentinel === 'memex-vault-v1'` when vault has a stored verifier.
  - Settings replaces "type RESET" with a vault password input; client re-derives PBKDF2 key, decrypts verifier, and only calls reset on success.

- [x] **Remaining `any` types** (12 instances) ✅
  - `ingest.ts`: `notes: any[]` → `KeepNote[]`
  - `classifier.ts`: `entities?: any[]` → `Record<string, unknown>[]`
  - `entityService.ts`: `structured: any` → `StructuredData | null | undefined` with per-type casts
  - `SemanticGraph.tsx`: `GraphNode`/`GraphLink` interfaces replace all `any` callbacks; unused `graphRef` removed
  - `export.ts`: `items: any[]` → `Item[]`; dynamic field access via safe double-cast

- [x] **`POST /api/vault/reset` has no test coverage** ✅
  - 6 test cases: auth guard, no-verifier free reset, missing sentinel → 400, wrong sentinel → 400, correct sentinel → 200, DB rollback → 500.

- [x] **No rate limiting on ingest endpoints** ✅
  - `ingestLimiter`: 30 req/min/IP via `express-rate-limit` on `/url`, `/text`, `/file`, `/voice`, `/quicksave`.

---

## 🐞 Known Weaknesses (from earlier code review) — ALL RESOLVED ✅

- [x] **`crypto.ts` base64 encoding is unsafe on large payloads** ✅
  - Replaced `btoa(String.fromCharCode(...))` with loop-based `toBase64`/`fromBase64` helpers.

- [x] **`auth.ts` SELECT * leaks password_hash to application memory** ✅
  - Now `SELECT id, email, password_hash FROM users WHERE email = $1` (explicit columns).

- [x] **CORS is wide open with no documentation comment** ✅
  - Added explanatory comment in `index.ts`: intentional for local-first single-user use,
    with guidance to restrict origins if ever deployed to a shared server.

- [x] **`Skeleton.tsx` has a framer-motion type mismatch** ✅
  - Typed props as `HTMLMotionProps<'div'>` (was `React.HTMLAttributes<HTMLDivElement>`).
  - Also cleared the last remaining TS error project-wide: `crypto.ts` `deriveKey` salt now
    cast to `BufferSource` (generic-Uint8Array lib mismatch). **Codebase is now zero TS errors.**

---

## 🌟 Feature Backlog

### High Value / Reasonable Effort

- [x] **Browser extension / bookmarklet — one-click "Save to Memex" from any page** ✅
  - **Done:** Persistent bookmarklet key stored in `settings` table (48-char hex, never expires,
    regeneratable). Auth middleware updated to accept bookmarklet key as a JWT alternative.
  - `POST /api/settings/bookmarklet-key` — generates/regenerates the key.
  - `POST /api/ingest/quicksave` — scrape + classify + save in one call, also runs duplicate
    detection and returns `similarItems` in the response.
  - Settings > Bookmarklet section: draggable "Save to Memex" link + copy button + regenerate.
  - The bookmarklet shows a floating toast on any page: "✅ Saved: [title]" or error message.
    Warns if a similar item already exists in Memex.

- [x] **Duplicate / near-duplicate detection at ingest time** ✅
  - **Done:** `duplicateService.ts` — `findSimilarItems(embedding)` queries pgvector at 0.92
    cosine threshold, returns up to 3 hits with id/title/type/similarity.
  - All three preview endpoints (`/url`, `/text`, `/file`) run `classify` and `embedQuery` in
    parallel via `Promise.all`, then append `similarItems` to the response — zero added latency.
  - `IngestPanel` and `FileIngestPanel` show an amber warning card in the preview step listing
    each match with type badge, title, similarity %, and a link to the existing item.

- [x] **Remind me later — actionable dates on any item** ✅
  - Add `remind_at TIMESTAMPTZ` column to items (migration 011)
  - Item page: calendar/date picker to set a reminder
  - Background worker: poll every hour for `remind_at <= NOW()`, push a browser Notification API
    alert (works because it's a PWA)
  - Table View: "Remind" column, filterable by upcoming reminders
  - **Done:** Migration 011 adds `remind_at TIMESTAMPTZ`. `PUT /api/items/:id` accepts `remindAt`
    (ISO string or null). `GET /api/items/reminders/due` returns items with `remind_at <= NOW()`.
    `GET /api/items?hasReminder=true` filter added. `ReminderPoller` in `App.tsx` requests
    notification permission on mount, polls every 60s, fires `Notification` for due items and
    clears `remind_at`. Item page has a datetime picker + "Remind me" / "Clear" UI. Table View has
    "Has Reminder" filter toggle and bell icon on rows. Dashboard shows an "Upcoming Reminders"
    widget listing items with reminders in the next 7 days with relative time labels.

- [x] **Natural language filter on Table View** ✅
  - Text input: "Thai restaurants I haven't visited" → send to Ollama with system prompt asking
    it to return a JSON filter: `{ type: "place", structured.cuisine: "Thai", structured.visitStatus: "want-to-visit" }`
  - Server: `POST /api/items/nl-filter` — runs NL→query conversion, returns same shape as
    `GET /api/items` so Table View can consume it directly
  - Client: replace or augment the search box in TableView with a "Ask a filter" mode
  - **Done:** `nlFilterService.ts` parses NL queries into `{ type, searchQuery, structuredFilters }`
    using Ollama with JSON mode + temperature 0. Field names validated against a SAFE_FIELDS
    whitelist to prevent JSONB injection. `POST /api/items/nl-filter` builds a dynamic WHERE clause
    and returns `{ items, total, parsedFilter }`. TableView has an "Ask AI" sparkle toggle: switches
    the search input to a purple NL mode (fires on Enter or Send button). Below the filter bar,
    "Interpreted as:" badges show each parsed filter component (type, search terms, structured
    fields). Clicking ✕ or Reset returns to normal filter mode.

- [x] **Export to Obsidian / Markdown vault** ✅
  - Each item → `[title].md` with YAML frontmatter:
    ```yaml
    ---
    title: Pad Thai Recipe
    type: recipe
    categories: [Food, Savory, Thai]
    tags: [thai, noodles]
    source: keep
    created: 2024-03-15
    ---
    ```
  - Content goes below the frontmatter
  - Structured data → additional YAML keys (ingredients, director, visitStatus, etc.)
  - Export: ZIP download via `GET /api/items/export/obsidian`
  - Client: "Export as Obsidian Vault" button in Settings
  - **Done:** `GET /api/items/export/obsidian` builds a ZIP (adm-zip, no new deps) with one
    `.md` per item. YAML frontmatter includes title, type, source, created, reviewed, confidence,
    categories, tags, and all structured fields (excluding summary). Summary appears as a Markdown
    blockquote, original content follows. Encrypted items are excluded. Duplicate titles get `(n)`
    suffix. "Export Obsidian" button added to Settings > Data & Privacy.

### Medium Term

- [x] **Weekly digest — local summary of your knowledge activity** ✅
  - A new `/digest` page (or auto-shown on Mondays): what you saved this week, one "On this day"
    memory, one AI-generated connection between two unrelated notes you haven't seen together
  - Server: `GET /api/items/digest` — last 7 days + random older item + Ollama-generated connection
  - No email needed — just a dedicated page that Memex opens to on Monday morning
  - **Done:** `digestService.ts` generates: this-week items (last 7 days), week-over-week count
    comparison, "on this day" (same date a prior year), and an AI-generated cross-domain connection
    between 2 random reviewed items (prefers different types for maximum insight). `GET /api/items/digest`.
    `Digest.tsx` — newspaper-style layout: stat card with trend arrow, item grid, on-this-day
    memory, connection card showing both items as clickable tiles + AI insight in a quote block.
    "Regenerate" button refreshes the Ollama connection. Sidebar nav link added. `App.tsx`
    auto-redirects to `/digest` on Mondays (once per day, tracked in localStorage).

- [x] **Sharing — opt-in public links for items or collections** ✅
  - Add `public_token TEXT UNIQUE` column to items (migration 012)
  - `POST /api/items/:id/share` — generates a random token, sets `public_token`
  - `GET /api/share/:token` — unauthenticated read-only endpoint returns the item
  - Client: "Share" button on Item page copies the share link
  - Use case: "Here's my Bangkok restaurant list" shared with a friend
  - **Done:** Migration 012 adds `public_token TEXT UNIQUE`. `POST /api/items/:id/share` mints a
    40-char hex token; `DELETE` revokes it. Public `GET /api/share/:token` (in PUBLIC_PATHS, no auth)
    returns the item only if non-deleted and non-encrypted. `PublicItem.tsx` at `/share/:token` is a
    standalone read-only page (no sidebar/auth) with self-contained dark styling. Item page has a
    "Public Share" section: create link → copyable URL + revoke. Hidden for encrypted items.

- [x] **Voice memo ingestion (Whisper)** ✅
  - New "Voice" tab in Quick Add: record in-browser (`MediaRecorder` API → WebM blob)
    or upload an audio file (MP3/WAV/M4A/OGG/WebM/FLAC)
  - Server: `POST /api/ingest/voice` — transcribes audio, passes to `classify()`, returns preview
  - Completes the multi-modal capture story alongside vision
  - `GET /api/ingest/whisper/health` — checks if whisper CLI is installed
  - **Done:** `whisperService.ts` mirrors the MarkItDown spawn-a-CLI pattern using `openai-whisper`
    (`pip install openai-whisper`). NOTE: spec said "Ollama ships whisper" but Ollama has no audio
    transcription endpoint — using Whisper CLI directly is the correct local-first approach.
    `transcribeAudio()` writes a temp file, runs `whisper --model base --output_format txt --fp16 False`,
    reads the .txt sidecar, cleans up. `POST /api/ingest/voice` runs transcribe → classify → embed →
    dedupe in parallel, returns `{ preview, similarItems }`. `VoiceIngestPanel.tsx` — in-browser
    recorder (MediaRecorder, live timer, playback) + audio file upload. Shows install instructions
    if whisper missing. `WHISPER_MODEL` env var selects model size. Voice tab added to IngestPanel.

---

## 🧠 Dev Knowledge Capture (GitHub repos, AI prompts/skills, explainers from Instagram) — planned 2026-11-11

> **Status (2026-11-12): Phase 1 implemented** except the multi-repo caption split and the before/after classify diff
> (waiting on the baseline run). Phases 2–3 not started. Manual paste only (links + captions); no Instagram
> scraping or API. The "Verified findings" below describe the code *before* Phase 1 and are kept as history.
> **Decisions below were confirmed on 2026-11-11 ("go with your recommendations").**

### Decisions (DECIDED 2026-11-11)
- [x] **Priority:** new nullable `items.priority` (`essential|useful|skip`), user-owned. **Decided: separate column.**
      Do NOT reuse `intent` — it is AI-assigned, defaults to `reference`, is NULL on all 725 items,
      and `applyClassificationResult` overwrites it on re-classify of unreviewed items.
- [x] **Skip:** **Decided: label only for MVP** (not hidden from digest/search). Revisit hiding in a later phase.
- [x] **GitHub metadata:** **Decided: README-only (via Jina) for MVP.** GitHub API lookup (stars/language/updated)
      is optional in v1 and must respect strict-local mode.
- [x] **Multi-repo captions:** **Decided: split** one caption listing N repos into N items (existing `multiEntity`);
      each split item must get its own `sourceUrl`.
- [x] **Stray categories** (`Links` root holds 218 items, no leaf; `Tech>Link`, `Courses>Tech`, `Travel>Links`):
      **Decided: out of scope** for this feature (kept as optional Phase 3).
- [x] **Creator:** **Decided: handle in `structured` for MVP; link as entity in v1** (Phase 2).
- [x] **Category parent:** **Decided: existing `Tech > AI`** (avoid a name containing `/`, which breaks the `>`/`›` path UI).

### Verified findings that shape the plan
- No new `ItemType`: `item_type` is a Postgres enum; reuse `link` (293 of 725 items already).
  Avoids `CardBase.TYPE_BADGE` (`Record<ItemType,…>`), `ItemCard`/`SearchModal` switches, `SemanticGraph` colours.
- **Capture drops data on save:** `IngestPanel.handleSave` sends only title/type/content/categories/tags/
  source/sourceUrl — `structured`, `intent`, `confidence` are lost. `POST /api/items` also marks items
  `reviewed=true`. `createItem` (db/helpers.ts) and `classifyAndUpdateBatch` don't write `intent`.
- `/ingest/text|url|file|voice` and quicksave previews don't return `intent`; `CreateItemRequest` and
  `createItemSchema` have no `intent` field.
- **Classifier can't pick new leaves alone:** `normalizeCategories` maps the last AI name via flat
  `CANONICAL_MAPPING`; unmapped → parent or `['Links']` for `link`. New leaves need entries in
  `CANONICAL_LEAVES`, `CANONICAL_MAPPING`, and the `link` branch of `mapToCategories`.
  Collisions: `notes`→`Finance>Notes`, `instagram`→`Links>Instagram`, and
  `tutorial|course|design|development|programming`→bare `Tech`. Topic must beat source.
- Manual tab hardcodes `source:'manual'`; nothing is ever tagged `instagram`. No item has `source_url`
  (0 of 725) → no URL dedupe; `content_hash` is never written (CLAUDE.md is stale here).
- Instagram oEmbed in `scraper.ts` is thin/placeholder (login-walled) — the pasted caption is the real source.
- `entityService.extractAndLinkEntities` only branches on media/book/place/stock; `POST /api/items` never calls it.
  `entity_type` is a Postgres enum (person/place/organization/other) — repo→`other`, creator→`person`,
  owner→`organization` needs NO enum migration.
- `digestService.ITEM_COLS` does not select `i.intent` (always undefined there); `DigestResponse` has only `recentItems`.
- `/ingest/keep/bulk` problems to avoid: hardcodes `type='note'`/`source='keep'`, typed to `KeepNote`,
  no rate limit/size cap, job never completes if last note is empty (early return skips `completeJob`).
- Migrations: next is **018**. `migrate.ts` runs sorted, tracked in `_migrations`; `ALTER TYPE … ADD VALUE`
  must be alone in its file (runs outside txn). `schema.test.ts` drift guard: sequential numbers, every
  `CREATE TABLE` in `schema.sql`, and the "reflects all N migrations" comment must match.

---

### Phase 0 — Decisions & baseline (no code)
- [x] Decisions confirmed (see "Decisions (DECIDED 2026-11-11)" above)
- [x] Read-only baseline: classify existing Tech + Links items with the current classifier, save the output <!-- done: 2026-11-15 -->
      to compare after mapping changes (guards against silent re-bucketing)
      *(DONE 2026-11-15: `sessions/baselines/classify-baseline-gemini-2026-11-15.json` — 294 items, 0 failed, 292 by
      `gemini:gemini-3.8-flash`, 2 by `claude:claude-sonnet-4-6` (Gemini unparseable). Run the after-pass with the same
      command: `npx tsx src/scripts/classifyBaseline.ts run <out.json> --provider gemini,claude`, then `compare`.
      The 11-12 Ollama file (299 items, 58 failed) is superseded; do not compare across models. Needs `gemini_model` =
      `gemini-3.8-flash` in settings: the built-in default `gemini-2.5-flash` is unavailable to new Google accounts.)*
      *(in progress 2026-11-12: `server/src/scripts/classifyBaseline.ts` written; full run writes
      `sessions/baselines/classify-baseline-2026-11-12.json` (gitignored). Tick when the run completes. Re-run with the same
      `OLLAMA_NUM_PREDICT=768 OLLAMA_TIMEOUT_MS=60000`, then `compare`.)*
- [ ] Default (assumed, not explicitly confirmed): do NOT run `reprocess-bulk 'all'` until Phase 1 is verified;
      the 157 unreviewed items are the only ones exposed
      (≈580 reviewed items are already protected — `applyClassificationResult` skips reviewed)

### Phase 1 — MVP: paste a GitHub link or Instagram caption → right category + priority
*No new routes, no entity work. Files in order; migrations first.*

**1. Database** *(done 2026-11-12, committed 9a07fae / 6d55bba; also added `020_priority_check.sql` — dedupe-index migration below is now 021)*
- [x] `server/src/db/migrations/018_priority.sql` — `ALTER TABLE items ADD COLUMN IF NOT EXISTS priority VARCHAR(20)` (no enum/CHECK, matches `intent`)
- [x] `server/src/db/migrations/019_ai_dev_categories.sql` — seed `Tech > AI > Repos / Prompts & Skills / Explainers / Tools`;
      filter Tech root on `parent_id IS NULL`; `INSERT … SELECT … ON CONFLICT DO NOTHING` (idempotent; 018/019 independent)
- [x] `server/src/db/schema.sql` — add `priority` column + bump "reflects all 19 migrations" comment (required by `schema.test.ts`)

**2. Shared types**
- [x] `shared/types.ts` — `ItemPriority`, `Item.priority`; `RepoData` shape
      (`kind`, `repoName`, `repoUrl`, `owner`, `creatorHandle`, `whatItDoes`, `promptText`);
      add `structured`, `intent`, `priority`, `confidence` to `CreateItemRequest`

**3. Server persistence**
- [x] `server/src/db/helpers.ts` — `ItemRow`, `rowToItem`, `ITEM_SELECT_SQL`, `createItem` carry `intent` + `priority`
- [x] `server/src/services/itemService.ts` — list select + priority filter
- [x] `server/src/routes/items.ts` — `createItemSchema`, `POST` INSERT (shifts param order), `updateItemSchema`, `listQuerySchema`;
      **still open:** review the auto `reviewed=true` rule on `POST /api/items` so AI-captured items are not silently marked reviewed

**4. Classification**
- [x] *(done 2026-11-12; GitHub helpers live in `githubRepo.ts`, source detection in `sourceDetect.ts`; `/quicksave` now persists intent/confidence)*
      `server/src/services/classifier.ts` — add leaves to `CANONICAL_LEAVES`; `CANONICAL_MAPPING` entries
      (repos, prompts, skills, explainers, tools, github); `link` branch; **deterministic pre-pass:**
      `github.com/<owner>/<repo>` as main subject → Repos leaf; prompt rules for repo/prompt/skill/explainer
      `structured` shapes; rule that topic beats `instagram` source
- [x] `server/src/services/summarizer.ts` — return `intent`, repo-aware summary ("what it is / what it's for")
      (summary comes from the classifier prompt's `whatItDoes` rule; passes `sourceUrl` hint to `classify`)
- [x] `server/src/routes/ingest.ts` (`/text`, `/url`) — return `intent`; detect instagram.com URL → `source='instagram'` + `sourceUrl`;
      regex-extract GitHub URL into `sourceUrl`
- [x] ~~Still open from step 4:~~ multi-repo caption split — each split item needs its own `sourceUrl` (`multiEntity` path in `ingest.ts`) *(done 2026-11-15 in the shared batch (`enrichBatch.ts`): a split item gets the entity's own `repoUrl`/`url` when the model found one, else the note's URL)*

**5. Client**
- [x] `client/src/components/ingest/IngestPanel.tsx` — send full payload (structured/intent/priority/confidence); priority picker; source auto-detect/selector
      *(done 2026-11-12: shared `lib/ingest.ts` `previewToCreateRequest`, `PriorityPicker`; source is auto-detected server-side, no manual selector — add one only if wanted. Saves now send `reviewed` from the preview, so AI captures enter the review queue; `POST /api/items` accepts an explicit `reviewed`)*
- [x] `client/src/components/ingest/FileIngestPanel.tsx`, `VoiceIngestPanel.tsx` — same payload fix *(server `/file` + `/voice` previews now return intent/confidence/reviewed; no route tests for those two yet)*
- [x] `client/src/lib/api.ts` — `fetchItems` priority filter option
- [x] `client/src/components/cards/LinkCard.tsx`, `client/src/pages/Item.tsx` — show repo name/URL/what-it-does; priority picker on Item page

**6. Tests**
- [x] `classifier.devKnowledge.test.ts` (mapping, pre-pass, collisions), `items.test.ts` (INSERT param shift, priority, reviewed), `ingest.test.ts`, `sourceDetect.test.ts`, `schema.test.ts` (migration count)
- [x] Client: `IngestPanel` cases (payload includes structured/priority; instagram source detection) + `PriorityPicker`, `LinkCard`, `Item` page, `lib/ingest`
- [x] Places mined from notes (2026-11-16): `minePlacesDryRun.ts` (rules-only default, or `--provider gemini,claude`) <!-- done: 2026-11-16 -->
      then `createPlacesFromMining.ts <review.json> [--commit]`. 88 unreviewed place items created from 21 notes
      (tag `from-note`, `derived_from` = the note, `visitStatus` placeholder `want-to-visit`); 13 skipped with reasons.
      Review them in Pending. They have NO embeddings yet: embed when Ollama is free. Review file:
      `sessions/place-mining/places-dry-run-gemini-2026-11-16.json` (private, gitignored). Not yet in the app UI.
- [x] Run the before/after classify diff against the Phase 0 baseline <!-- done: 2026-11-16, see Start here step 1 -->
      <!-- original note follows -->
      (historical)
      *(2026-11-16: mapping fix written in `classifier.ts` — prompt tightening + `refineCategories()` guardrails,
      14 new tests in `classifier.refine.test.ts`, UNCOMMITTED. After-pass #1 (`classify-after-mapping-fix-2026-11-16.json`)
      removed the targeted misfilings but sent ~33 programming courses to `Links > YouTube/Articles/Docs`; the
      "topic beats platform for every item" prompt line was added after that and has NOT been re-run. Tomorrow: start
      Postgres only, `npx tsx src/scripts/classifyBaseline.ts run ../sessions/baselines/<out>.json --provider gemini,claude`,
      then `compare` against `classify-baseline-gemini-2026-11-15.json`; judge the targeted buckets, not the raw total
      (~25 moves per run are model noise). Then commit and stop Postgres.)*

**Acceptance:** paste `https://github.com/owner/repo` → lands in `Tech > AI > Repos`, summary says what it is for,
`structured` + priority saved, source URL set. Paste an Instagram caption → topic category (not `Links>Instagram`),
`source='instagram'`.

### Phase 2 — v1: entity linking, digest, bulk import
- [x] `server/src/services/entityService.ts` — branch on `type==='link' && structured.kind` (key on `structured.kind`, not `type`): *(done 2026-11-15: keyed on `structured.kind`/`videoId`; roles `repo`/`owner`/`creator`/`channel`; identifiers are not embedded so `resolveEntities` cannot fuzzy-merge them; re-linking replaces old links; wired into POST /api/items, quicksave, apply-extraction, `applyClassificationResult`, bulk paste and PUT. **Backfill still to run:** `npx tsx src/scripts/seedEntityGraph.ts` from `server/`. Item page "Connected" section reads the links (`GET /api/items/:id/entities`, done 2026-11-15).)*
      creator→`person`, owner→`organization`, repo→`other`; call from `POST /api/items`; `seedEntityGraph.ts` backfill
- [x] `server/src/services/digestService.ts` — add `i.intent`, `i.priority` to `ITEM_COLS`; additive `byPriority` field *(done 2026-11-15: this week's counts per priority + top 5 essential/useful; `Digest.tsx` shows chips, essential cards, "to triage" shortcut)*
      (keep `recentItems` so `Digest.test.tsx` passes); update `Digest.tsx` + tests
- [x] **Bulk route** `POST /ingest/paste/bulk` (do NOT clone `/keep/bulk` as-is):
  - [x] Generalize `classifyAndUpdateBatch` — source, sourceUrl, intent as parameters; fix the early-return job-completion bug *(done 2026-11-15: `services/enrichBatch.ts`, entries carry source/sourceUrl; intent now written on apply, in extractions and on split items)*
  - [x] Add `ingestLimiter` + size cap; per-item error tracking *(done: `ingestLimiter`, max 200 entries / 1M chars / 20k per entry — over-long entries are skipped, never truncated; failures listed in job `details.failed`, job `failed` if every item failed)*
  - [x] Dedupe by normalized URL (in the paste and against saved items; no index needed yet). *Optional `items_source_url_idx` still deferred — see below.* Text-only entries are deduped within the paste only (`content_hash` is never written).
  - [x] `PasteImportPanel` ("Bulk Paste" tab): preview (dry run) → import → job polling, skip reasons, failure list *(done 2026-11-15)*
- [x] `TableView` — priority filter + bulk triage actions (set priority on selection) *(done 2026-11-15: filter, priority column, row checkboxes, bulk bar, `PUT /api/items/bulk/priority` (max 500 ids); items leave the list when they stop matching an active filter)*
- [x] GitHub API lookup (stars, forks, language, licence, last push, archived) *(done 2026-11-15: `githubApi.ts` unauthenticated + cached + rate-limit gate, never in Strict Local Mode; attached at the end of `classify()`; `POST /api/items/:id/github` Refresh; `GithubMeta` on the Item page, stars/language on `LinkCard`; verified against the real GitHub API and the UPDATE against the real schema in a rolled-back transaction. No token option yet — 60 requests/hour per IP)*
- [ ] Tests for each of the above

### Phase 3 — Optional / later
- [ ] Backfill priority/intent for existing items (explicit opt-in only; all 725 are NULL intent today)
- [x] Fix intent plumbing on all capture paths (`classifyAndUpdateBatch`, quicksave) as a bonus
      *(partly done 2026-11-12: quicksave, `/text`, `/url`, `/file`, `/voice` previews pass `intent`; still open: the Keep
      multi-entity split `createItem` call in `classifyAndUpdateBatch` omits it) — all done 2026-11-15 in `enrichBatch.ts`)*
- [~] Clean stray categories (`Tech>Link`, `Courses>Tech`, `Travel>Links`, 218 bare-`Links` items) — small strays done, ~178 bare-`Links` left
      *(2026-11-15: read-only audit written, `server/src/scripts/auditStrayCategories.sql`, not yet run — needs Postgres up; no Ollama. Cleanup itself still to do.)*
      *(2026-11-15: audit run. Small strays = 6 items, all reviewed; dry-run `server/src/scripts/dryRunStrayCategoryMoves.sql` run, apply script `applyStrayCategoryMoves.sql` written, previewed, then APPLIED 2026-11-15 (6 items fixed; verified from a separate connection). Still open: the bare-`Links` items.
      *(2026-11-15: 21 of the 199 bare-`Links` items moved into hotels/restaurants/cameras/laptops/phones/cookies/stocks
      via `applyBareLinksMoves.sql` (applied; 178 remain bare). The other ~175 were NOT moved on purpose: the Gemini
      baseline misfiles them. `Tech > AI > Explainers` (30) holds generic programming courses, `Tech > AI > Tools` (20)
      holds Photoshop/VSCode/etc., `Finance > Notes` (11) holds shopping and real estate (the `notes`→`Finance>Notes`
      collision), `Tech > Specs`/`Media > Books > Technical` hold furniture/courses, and `Links > Articles/Docs/YouTube/
      Instagram` are source buckets, not topics. Fix the classifier mapping first, verify with the baseline `compare`,
      then re-map the rest.)* The 218 bare-`Links` items (180 reviewed / 38 unreviewed) need a topic mapping.)*
- [x] Update stale CLAUDE.md claims (content-hash dedupe, Instagram caption scraping) — done 2026-11-15 <!-- done: 2026-11-15 -->
- [ ] If `'repo'` entity type is ever wanted: own migration file with only `ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'repo'`
      (no-txn), run before code that inserts it; update TS `EntityType` + `SemanticGraph.tsx` colours

### Risks
- **Silent re-bucketing:** new mapping keys (`ai`, `tools`, `prompts`) change every future capture; `reprocess-bulk 'all'`
  would re-map the 157 unreviewed items. Mitigate: append-only mapping changes + the Phase 0 diff.
- **GitHub pre-pass** must match only a repo URL as the main subject, not any mention of one.
- **Migrations:** 018/019 idempotent; keep numbering gapless; update `schema.sql` + count comment or `schema.test.ts` fails.
- **Re-classify clobber:** `applyClassificationResult` overwrites `intent`/categories on unreviewed items — another reason for a separate `priority`.
- **Accuracy:** a 3B local model gives vague "what it's for" on thin READMEs; a pasted caption often explains the use case better.
- **Strict-local mode** blocks the Jina fetch → bare GitHub links yield nothing useful; fall back to pasted text.
- **Existing data barely affected:** only 3 of 725 items mention GitHub/Instagram URLs.

---

## 🤖 Multi-AI Providers + 🎬 YouTube Understanding + 🍳 Recipe Extraction — planned 2026-11-11

> **Status: PLANNING ONLY — nothing implemented.** Requested by the user on 2026-11-11:
> (1) let Memex use Claude API and Gemini API as well as local Ollama;
> (2) understand, title, categorize and keep the many YouTube links already saved;
> (3) on request, extract the content of a video to explain it;
> (4) on request, extract a recipe from a video and save it as its own item.
> Findings below were verified against the code and the live DB (read-only).
> **Migration numbers:** 018/019 are reserved by the Dev Knowledge Capture plan above. Numbers below use
> `0NN` and must be assigned gaplessly in whatever order the work actually ships.
> **Decisions confirmed 2026-11-11** — see "Decisions (DECIDED …)" at the end of this section. Implementation has not started.

### Verified findings

**AI routing (`server/src/services/ai.ts`, `settings.ts`)**
- `aiChat()` supports exactly two backends: Ollama, or Claude when `use_claude=true` AND `ANTHROPIC_API_KEY` is set.
  `@anthropic-ai/sdk` is the only cloud SDK installed; no Gemini SDK (`@google/genai`) in `server/package.json`.
- The Settings UI hardcodes one cloud option (`Claude 3.5 Sonnet (Cloud)`) and a boolean `use_claude` — a single global
  switch, so there is no per-task choice (cheap bulk classification vs. smart on-demand explain).
- The Claude branch **ignores `format`** (no JSON mode), hardcodes `max_tokens: 2048`, and defaults the model to
  `claude-3-5-sonnet-20240620` (old). The classifier depends on strict JSON, so cloud classification relies on its
  parse-retry path.
- **`strict_local_mode` is enforced only in `scraper.ts`.** It is NOT checked in `aiChat()`. With `use_claude=true`
  and a key set, Claude is still called while strict-local is on. Must be fixed before any cloud provider is added.
- **Do not store API keys in the `settings` table:** `GET /api/settings` returns every row to the client (it already
  returns `bookmarklet_key`). Keys must stay in server env vars; the UI should only see "configured: yes/no".
- Embeddings always go through Ollama (`nomic-embed-text`, 768-dim pgvector). Changing the embedding provider would
  invalidate every stored vector → **keep embeddings local**; only chat/generation becomes multi-provider.
- Provenance already exists: `items.extraction_model` and versioned `item_extractions` (migration 009), so which
  provider/model produced a result can be recorded as a string (e.g. `claude:<model>`, `gemini:<model>`) with no schema change.
- Privacy exposure: the live DB holds plaintext credential-like items (now filed under `Personal > Bank`). Any cloud
  path (re-classify, insights, digest, ask/RAG) could send them off-machine. Needs an explicit guard.

**YouTube (`scraper.ts`, live DB)**
- 115 active items contain a YouTube URL (types: link 70, media 32, note 12, recipe 1); **113 of them are only a bare
  URL (<200 chars)** with titles like `YouTube Video` / `Untitled`. **0 have `source_url` set**, so the video URL
  is just text in `content` — no dedupe, no source badge.
- `extractYoutubeId` **does not recognise Shorts** (`youtube.com/shorts/<id>` → null; verified) → **14 saved links**
  fall through to the generic Jina scraper. Playlist links (0 saved) are also unhandled.
- Ingest path (`scrapeYoutube`): oEmbed title + `youtube-transcript` (unofficial package, breaks when YouTube changes).
  On any failure it returns the literal text `Transcript unavailable.` and the item is still classified on that.
  oEmbed also returns `author_name` (channel) which is discarded. No description, duration or publish date is kept.
- Nothing re-enriches the existing 113 bare links; `pendingEnrichment` only covers items that failed classification.
- Whole-transcript → classifier is untruncated in the scraper; long videos need chunk/summarise-then-classify.

**Recipes**
- There is **no `recipeParser.ts`** (CLAUDE.md is stale). Recipes only come from the classifier setting
  `type='recipe'` + `structured: RecipeData {ingredients[], steps[], servings?, prepTime?, cookTime?, cuisine?, mealType?}`.
  28 recipes exist; 19 have an `ingredients` field. Nothing links a recipe item back to a source item.

### Recommended design
- **Providers:** `ollama` (default, local), `claude`, `gemini`. One registry in `ai.ts`; `aiChat()` gains a `task`
  hint (`classify | summarize | explain | extract | ask | insight`). A per-task provider map lives in `settings`
  (`ai_provider_default`, `ai_provider_<task>`).
- **Default routing:** bulk/background work (classify, enrich, digest) stays on local Ollama (free, private, no rate limits).
  Cloud providers are opt-in per task, aimed at on-demand quality work (`explain`, `extract`, optionally `ask`).
- **Privacy rule:** a `cloudSafe(item)` guard blocks sending `type='password'`, encrypted items, and anything in
  `Personal > Bank` to a cloud provider; plus a one-time `allow_cloud_ai` consent flag. `strict_local_mode` hard-forces Ollama.
- **YouTube:** fix recognition (Shorts, `m.`, `music.`, embed, live), store the URL in `source_url` with
  `source='youtube'`, capture channel + title (+ description if obtainable), and keep the transcript out of `content`
  noise by storing a capped transcript separately (`structured.transcript`) with a flag when unavailable.
  Gemini can take a YouTube URL directly as video input (verify current API behaviour at implementation time), which would
  cover videos that have no transcript — treat as optional, cloud-only.
- **Backfill:** an explicit, user-triggered, resumable job over the 115 existing items (dry-run first, review queue,
  never overwrite reviewed items) — not automatic.
- **Explain / Extract on request:** new buttons on the Item page: *Explain this video*, *Extract recipe*.
  Results are saved on the item (`structured.explanation`) or as a **new linked item** (recipe) via a
  `derived_from` link back to the video item. User picks the provider per click (default = per-task setting).

---

### Phase A — Provider layer (foundation; do first)
*No data migration. Touches settings + AI plumbing only. Existing behaviour (Ollama default) must be unchanged.*

- [x] **A0. Fix `strict_local_mode` enforcement inside `aiChat()`** — when on, force Ollama and refuse cloud (ship this fix on its own first; it is a latent bug today)
  - **Done 2026-11-11:** `getAiConfig()` now returns `strictLocal`; `ai.ts` `claudeEnabled()` returns false when strict-local is on, used by both `aiChat()` and `activeProvider()`. New `ai.test.ts` (6 tests). Server tests 268 → 274, `tsc` clean. Not yet committed.
- [x] `server/package.json` — add `@google/genai` (pin exact version, ≥2 weeks old) — **done 2026-11-12:** pinned `2.31.0` (released 2026-10-23; 3.x was only days old)
- [x] `server/src/services/ai.ts` — provider registry; `Provider { id, chat(), available() }`; `aiChat(..., { task, provider? })`;
      `activeProvider()` returns the resolved provider; keep `aiEmbed` Ollama-only
  - [x] Claude: JSON mode (instruct + strip fences), configurable `max_tokens` (from `max_tokens`/`num_predict`), model from env/settings; default now `claude-sonnet-5-5`
  - [x] Gemini: `responseMimeType: 'application/json'` for JSON tasks, model from `GEMINI_MODEL` env/settings (default `gemini-2.5-flash` — **unverified, check before relying on it**)
  - [x] Errors/timeouts/rate-limit (429) mapped to one `AiProviderError`; **fallback to Ollama** on provider failure for background tasks (logged), but not for user-initiated/explicit calls (surface the error)
  - [x] Record `extraction_model` as `<provider>:<model>` (via `onProvider` callback in `classify()`; old rows keep plain names)
  - **Done 2026-11-12.** Also: explicit `provider` that can't be honoured is refused (`kind:'blocked'`), never silently downgraded; 30s/120s timeouts.
- [x] `server/src/services/settings.ts` — `getAiConfig()` returns `{ provider, model, perTask, allowCloud, ... }`; backward compat with `use_claude`/`ai_model` (migrated on read); single query; strict-local forces ollama/no consent
- [x] `server/src/routes/ai.ts` (new) — `GET /api/ai/providers` → `[{id, configured, cloud, models[]}]` (never returns keys); `POST /api/ai/test` → one tiny round-trip (rate-limited, errors redacted). `PUT /api/settings` now zod-validates the AI keys.
- [x] Privacy guard — `cloudSafe(item)` in `services/cloudSafe.ts`; applied in re-classify, `enrichItems`, `reprocess-bulk`, insights, digest, RAG ask, summarize-links; bundled prompts pinned local if any item is private; unit-tested. New-content ingest passes no flag (not yet a stored item).
- [x] `.env.example` / docs — `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `GEMINI_MODEL`; stale `USE_CLAUDE` removed; CLAUDE.md AI Routing/settings/env sections updated
- [x] `client/src/pages/Settings.tsx` — replace hardcoded model `<select>` with provider + per-task selectors, "key configured" status, "Test connection", cloud-consent toggle, strict-local explanation — **done 2026-11-12:** new `components/settings/AiProviderSettings.tsx` (provider, model, consent, per-task, per-provider key status + test); strict-local toggle now saves a real boolean; failed saves roll back the optimistic update
- [x] `client/src/lib/api.ts` — `fetchAiProviders`, `testAiProvider`
- [x] Tests: `ai.test.ts` (routing, strict-local, fallback, per-task, cloudSafe), Settings test update, settings route test
  - **Done 2026-11-12:** server 274 → 386 tests, client 504 (new `AiProviderSettings.test.tsx`; `Settings.test.tsx` updated for the new controls).
- [x] **Bug found + fixed (2026-11-12): string booleans.** The old Settings UI saved `strict_local_mode` as the string `'true'`/`'false'`. `getAiConfig` only accepted boolean `true`, so strict-local set from the UI never forced local AI (A0 was inert from the UI), and `scraper.ts` treated the string `'false'` as truthy, blocking all scraping once the toggle had been touched. New `asBool()` in `settings.ts` reads both forms (used by `getAiConfig` and `scraper`); UI now writes booleans; regression tests added.
- **Phase A complete (2026-11-12). Not yet committed.** Follow-ups: verify the default Gemini model id (`gemini-2.5-flash` is unverified); decide whether new-content ingest should also default to local when cloud is on (currently it follows the normal provider/consent settings).
- **Acceptance:** with nothing configured, behaviour is identical to today; with a Claude or Gemini key set, a chosen task runs on that provider; strict-local always forces Ollama; no key is ever returned by an API.

### Phase B — YouTube understanding (organize what's saved + better capture)
- [x] `server/src/services/scraper.ts` — widen `extractYoutubeId` (Shorts, `m.`/`music.` hosts, `/embed/`, `/live/`); keep oEmbed `author_name`; return structured `{title, channel, videoId, transcript?, transcriptAvailable}`; cap/chunk long transcripts
  - **Done 2026-11-13:** URL-parser based `extractYoutubeId`; new `findYoutubeUrl(text)` for the Manual-tab item; `ScrapedContent` gains `videoId/channel/transcript/transcriptAvailable/transcriptTruncated/failure`; oEmbed and transcript failures are independent; transcript capped at 30k chars (`MAX_TRANSCRIPT_CHARS`, truncation flagged — chunking is left to the classifier step); no-transcript content = title + channel. Not yet committed.
- [x] `server/src/services/scraper.test.ts` — Shorts, mobile, `si=` params, playlist (graceful), transcript-failure cases — **done 2026-11-13** (33 tests in scraper files, `tsc` clean)
- [x] `server/src/services/summarizer.ts` / `classifier.ts` — YouTube-aware prompt: topic category (topic beats `youtube` source), tags, 2–3 sentence summary, and **detect "this is a recipe / tutorial / review / talk"** to suggest the Extract action; when no transcript, classify on title + channel and mark low confidence
  - **Done 2026-11-13:** `ClassifyHints.video` switches on a YouTube prompt addendum + `applyYoutube()` post-step (all three paths: normal, strict retry, fallback). Video is always `type='link'` (recipe is extracted later, Phase C); categories are the model's topic choice, `Links > YouTube` only as fallback; `structured` gains `videoKind` (`recipe|tutorial|review|talk|other`, invalid values dropped), `videoId`, `channel`, `transcriptAvailable`; no transcript ⇒ confidence capped at 40. Dev-knowledge still wins (YouTube explainer on a repo/tool → `Tech > AI`). `summarizer.ts` builds a bounded prompt (title, channel, transcript head 4k + middle 1k + tail 1k) — this is the "chunk" half of the scraper's cap/chunk item. 21 new tests; server suite 386 → 427, `tsc` clean. Not yet committed.
  - **Decision:** transcript stays in `content` (search/embeddings/explain read it); not duplicated into `structured.transcript`. Revisit in Phase C if `content` should hold a summary instead.
  - **Not covered yet:** `classify()` is only given the video hint from `summarizeAndClassify`; the ingest route and backfill must pass it too (next items).
- [x] `server/src/routes/ingest.ts` — set `source='youtube'` and `sourceUrl`; detect a YouTube URL in pasted *text* too (the Manual tab), not just the URL tab
  - **Done 2026-11-13:** `/url` and `/quicksave` already got `source='youtube'` + `sourceUrl` + the video hint via `scrapeUrl` → `summarizeAndClassify`. For pasted text (`/text`), `detectPasteSource` now returns `source='youtube'` + the URL when the text has exactly ONE distinct video (watch/youtu.be counted once; several different videos stay `manual` — a list to split, not mislabel; Instagram/GitHub still win). Pure URL helpers moved to `services/youtubeUrl.ts` (`extractYoutubeId`, `findYoutubeUrl(s)`; re-exported from `scraper.ts`) so `sourceDetect` doesn't import the DB/transcript code. Server suite 427 → 435, `tsc` clean. Not yet committed.
  - **Decision:** pasted text is NOT given the `video` classifier hint — no transcript was fetched, and the hint forces `type='link'`, which would wrongly flatten a real note that happens to contain a link. Pasted-note enrichment (title/transcript) is the backfill's job.
  - **Still open:** `/keep` bulk import and `classifyAndUpdateBatch` don't detect YouTube links either (they were out of this item's scope; the backfill covers the existing 115).
- [x] `server/src/routes/items.ts` — normalised-URL dedupe check for `source_url`
  - **Done 2026-11-13** (in `ingest.ts`/`duplicateService.ts`, not `items.ts` — see decision). New pure `services/urlNormalize.ts` (`normalizeSourceUrl`, `sameSourceUrl`): all YouTube forms → one canonical watch URL; otherwise ignores scheme/`www.`/fragment/trailing slash/tracking params (`utm_*`, `si`, `igsh`, `fbclid`…), sorts query, GitHub case-insensitive + `.git`. `findItemsBySourceUrl()` pre-filters with an escaped `ILIKE` on host/path/video-id then compares exactly in JS (stored spellings vary; no migration/index needed at ~700 items). `mergeSimilar()` puts exact-URL matches (similarity 1) ahead of embedding matches. Wired into `/ingest/url` and `/ingest/text` (appear in `similarItems`, which the ingest panel already renders — no client change), and `/ingest/quicksave` is now idempotent (returns the existing item with `duplicate: true`, skips scrape/classify). Server suite 435 → 454, `tsc` clean. Not yet committed.
  - **Decision:** `POST /api/items` is NOT blocked with a 409 — the app's duplicate model is warn-not-block (preview shows `similarItems`, user decides) and the client doesn't handle a 409 on save. Only quicksave, which has no confirmation step, dedupes hard.
  - **Open:** the client doesn't yet read `duplicate: true` from quicksave (the bookmarklet script in `Settings.tsx` just shows a similar-item hint); optional `items_source_url_idx` is still deferred — add it only if the ILIKE shows up as slow.
- [x] **Backfill job** (explicit, user-triggered, resumable): `POST /api/ingest/youtube/backfill {dryRun=true, preview=0..5}` ✅ *(server side; client UI is the next item)*
  - [x] Selection (`planBackfill`, pure): live, unencrypted, `cloudSafe` items with a YouTube URL in `content`/`source_url`. Candidates = exactly one distinct video AND ≤200 chars of text once URLs are stripped. Everything else is reported, never touched: `reviewed`, `already-backfilled` (has an extraction with `structured.videoId` → this is what makes it resumable), `needs-split` (several videos), `note-with-link` (long note that merely mentions a video), `protected` (private/vault/Passwords/Personal)
  - [x] Dry-run (default) is synchronous and writes nothing: counts, candidate list, skip reasons, duplicate-video groups (via `findYoutubeUrls`), time estimate; optional `preview: N` fetches + classifies N samples and returns before/after
  - [x] Apply returns `202 {jobId}`; one video at a time with 1.5–2.5 s jitter; writes via `applyClassificationResult` (→ `item_extractions`), re-checks `reviewed`/deleted inside the transaction (`FOR UPDATE`); sets `source_url` only when empty; **never overwrites `content`** (user's note text kept); `source` left as-is (video card keys off `source_url`)
  - [x] Per-item results (`applied | skipped | failed` + reason, `warning` for transcript-less videos classified from title/channel) stored in new `ingest_jobs.details`, returned by `GET /ingest/jobs/:id` (now also returns `error`, `details`); aborts after 5 consecutive failures (assume YouTube rate-limiting; re-run skips finished items); 409 in Strict Local Mode or if a backfill is already running
  - [x] Migration `021_ingest_job_details.sql` (`ingest_jobs.kind`, `ingest_jobs.details JSONB`); `schema.sql` mirrored, count → 21. **Note:** this took 021 — the optional `items_source_url_idx` and the Phase C `derived_from` migration are now 022+.
  - [x] Job helpers moved to `services/ingestJobs.ts`; **fixed the early-return bug** in `classifyAndUpdateBatch` — `completeJob` now runs once after `Promise.all`, so a trailing empty note no longer leaves the job `processing` forever (regression test added). `reprocessBulkItems` already completed after `Promise.all`; its `if (!text.trim()) { done++; return }` still skips a progress update (minor, left as-is)
  - Files: `services/youtubeBackfill.ts`, `services/ingestJobs.ts`, `routes/ingest.ts`; tests `youtubeBackfill.test.ts` (18) + route/regression cases in `ingest.test.ts`. Server suite 472 passing, `tsc` clean.
  - **Open:** multi-video notes are only *reported* (`needs-split`) — an actual split action is not built; `note-with-link` items get no `source_url` (decision: leave untouched); dry-run `before.type` is not populated for samples.
- [x] `client` — video card variant (channel, thumbnail from `https://i.ytimg.com/vi/<id>/hqdefault.jpg`, "open on YouTube"), source badge; "Backfill YouTube" action with preview + progress
- [ ] Optional (cloud, needs Phase A): Gemini direct-URL video understanding for transcript-less videos
- [x] Tests: scraper, classifier YouTube cases, backfill dry-run/skip-reviewed, ingest source detection ✅ (all server-side tests done; client tests come with the client item)
- **Acceptance:** pasting any YouTube/Shorts link yields a real title, channel, category, tags and summary with `source_url` set; the backfill turns bare `YouTube Video` items into named, categorised items without touching reviewed ones.

### Phase C — Explain & Extract on request
- [x] Migration `0NN_derived_from.sql` — `items.derived_from UUID REFERENCES items(id) ON DELETE SET NULL` (+ index); mirror in `schema.sql` + migration-count comment (required by `schema.test.ts`)
- [x] `shared/types.ts` — `Item.derivedFrom`, `ExplanationData`, `ExplainRequest/Response`, `ExtractRecipeRequest/Response` *(done 2026-11-15)*
- [x] `server/src/services/explainService.ts` (new) — fetch/cached transcript (or page text) → chunk → map-reduce summary → structured explanation (key points, steps, takeaways); uses `aiChat({task:'explain'})`; honours `cloudSafe` + strict-local *(done 2026-11-15; source loading in `itemSource.ts` — fetches the transcript for bare video links)*
- [x] `server/src/services/recipeExtractor.ts` (new) — transcript/text → `RecipeData` (ingredients, steps, times, servings) with validation; returns `{ recipe, confidence }`; flags "no recipe found" instead of inventing one *(done 2026-11-15; rejects results with <2 ingredients or <2 steps)*
- [x] `server/src/routes/items.ts` — `POST /api/items/:id/explain` and `POST /api/items/:id/extract-recipe`: *(done 2026-11-15; 10/min limiter; also `GET /:id/derived`, and `derived_from` added to `ITEM_SELECT_SQL` — it was missing, so `derivedFrom` never reached the client)*
  - explain → saves to `structured.explanation` on the same item (sets `extraction_model`)
  - extract-recipe → **creates a new `type='recipe'` item** under `Food`, `derived_from` = video item, `source_url` = video URL, `reviewed=false`; original video item untouched
  - both Zod-validated, rate-limited, return 409 if already extracted (with a force flag)
- [x] `client/src/pages/Item.tsx` — *Explain* and *Extract recipe* buttons (shown by item kind), provider chooser, progress state, link between video item and derived recipe both ways *(done 2026-11-15; `components/item/ItemAiActions.tsx`)*
- [x] `client/src/components/cards/*` — recipe card shows "Extracted from a saved link" marker; the Item page links back to the source
- [x] `server/src/services/entityService.ts` — optional: channel as `organization` entity (YouTube channel) — only if the Phase 2 entity work above has shipped *(done 2026-11-15 with the entity linking above: role `channel`)*
- [x] Tests: explain/extract services, itemSource, route tests (linked item created, duplicate guard, error mapping, rollback), ItemAiActions + Item page + RecipeCard *(done 2026-11-15: server 472 → 534, client 529)*
- [x] **Real-video smoke test (2026-11-15)** — real transcripts + real Ollama (llama3.2) on 9 saved videos, and the new SQL against the real DB in a rolled-back transaction. Fixed: transcript took an arbitrary caption track (Chinese/Afrikaans) → English first, default as fallback; recipe extraction invented recipes for a tech tutorial and a talk → yes/no "mainly about cooking?" gate (7/7 on real videos; two other wordings failed 2) + confidence computed from completeness (the model's own was 0–90 noise) + 3-ingredient minimum; explain/extract now answer in English. **Findings still open:** (1) the real DB is at migration 020 — run `npm run migrate` in `server/` (021 `ingest_jobs.kind/details` and 022 `items.derived_from` are missing, so listing/saving items and the paste/backfill jobs fail until then; the server does not auto-migrate); (2) URL dedupe only searches `source_url`, and 115 of 116 saved YouTube items keep the link in `content` only, so bulk paste cannot see them until the YouTube backfill runs (or the lookup also matches bare-link content); (3) `videoKind` was unreliable on llama3.2 (English cooking videos tagged `tutorial`, tech talk untagged) — **fixed 2026-11-15**: a separate focused call on title + channel only (`detectVideoKind` in `classify()`); measured on 25 hand-labelled saved videos: old 10/25, new prompt 23/25 (transcript-in-prompt variants did worse, 19-22/25; the 2 misses are documentaries called `talk` not `other`); fails open to the model's own value; (4) explain on a 30k-char transcript took ~200 s locally (map-reduce) — works, but a long spinner; (5) captions are disabled on some videos (explain/extract report it cleanly).
- [x] **User-supplied API keys + YouTube Data API (2026-11-15)** — Settings > API keys for Claude, Gemini and YouTube. Keys are stored ENCRYPTED in a new `api_keys` table (migration 023; AES-256-GCM, secret = `KEY_ENCRYPTION_SECRET` or `JWT_SECRET`, provider bound as AAD), never in `settings`; write-only (`GET /api/ai/keys` returns configured/source/last4 only); env vars take priority; routes refuse the bookmarklet key; provider and YouTube errors are redacted. This supersedes the earlier "env vars only" decision. YouTube key fetches the video description (header auth, null when no key / Strict Local Mode / quota) and feeds Explain, Extract recipe (ingredients usually live there), the classifier text, and is the fallback source when captions are disabled. **Needs `npm run migrate` (021–023) in `server/`.** Changing `JWT_SECRET`/`KEY_ENCRYPTION_SECRET` makes saved keys unreadable (UI says so). Not done: playlist/channel import, storing duration/date on items.
- [x] **Bookmarklet key scope (2026-11-15)** — the bookmarklet key was accepted on EVERY authenticated route, and (found while fixing it) never actually authenticated: the middleware compared the stored value to `JSON.stringify(token)` but `pg` returns JSONB strings already parsed, so the comparison was always false. Fixed the comparison (constant-time) and restricted the key to its one real request, `POST /api/ingest/quicksave` (`lib/bookmarkletScope.ts`); everything else returns 403. Verified end to end with the real stored key against the real DB (quicksave reachable; items/settings/api keys/vault/regenerate all 403; wrong key 401; nothing written). Settings now says the key can only save pages. **If you set the bookmarklet up before this fix, it never worked — click the bookmark again after restarting the server.**
- [x] **URL dedupe sees legacy items (2026-11-15)** — `findItemsBySourceUrl` only searched `source_url`, so the 115 saved YouTube items whose link lives only in `content` were invisible to bulk paste, the URL preview and the bookmarklet. It now also matches items with no `source_url` whose content is essentially just that link (one distinct page after normalisation, prose around it ≤ 200 chars, content ≤ 600 chars, not encrypted/password); `source_url` matches are listed first. Helpers `extractUrls` / `isBareLinkTo` in `urlNormalize.ts`. Checked read-only on the real library: 103 of 115 found from their own link, 0 false positives; the other 12 are lists of several videos, a note with two different links, and a real recipe note — correctly not treated as duplicates. Closes finding (2) of the smoke test above. Side effect: the bookmarklet on a page you saved as a bare link now returns the existing item (not enriched) instead of making a copy — run the YouTube backfill to enrich those.
- [x] **Long Explain wait (2026-11-15)** — Explain on a 30k-char video took ~200 s with a frozen button. Now: (1) the per-part notes are capped (≤6 bullets, 350 tokens) and the final pass is told to write full sentences — 196 s → ~95 s on the real long video with good key points; (2) `POST /api/items/:id/explain` returns `202 {jobId}` at once and runs as a background job (`services/explainJob.ts`, kind `explain`, one at a time, 15 min cap, 20 min stale window); progress (`stage`, part n of N) is on the job row and read via `GET /api/ingest/jobs/:id`; the explanation is saved on the item even if nobody is watching; failures are stored as a readable message (`services/actionErrors.ts`, shared with Extract recipe). The Item page shows a progress bar with the current step, can be left and resumed (job id kept per item in sessionStorage), and re-reads the item when it finishes. Verified end to end on the real library (real transcript, real Ollama, real DB in a rolled-back transaction): 0% → 100% across 7 steps in ~2 min. Not done: a Cancel button, and the same treatment for Extract recipe (~45 s, still synchronous).
- [x] **Extract recipe as a background job (2026-11-15)** — `POST /api/items/:id/extract-recipe` now returns `202 {jobId}` like Explain (`services/extractRecipeJob.ts`, kind `extract-recipe`). Steps reported on the job row: reading → checking it is a recipe → extracting. **"No recipe found" is a completed job with `found:false` + the reason, not a failure**; a found recipe becomes a NEW unreviewed item linked via `derived_from` (created in the runner, in a transaction) and the job carries `recipeId` / `confidence`. One AI job at a time across Explain **and** Extract (`services/actionJobs.ts`). The client's polling/resume logic is now one hook, `useActionJob`, shared by both actions (job ids kept per action + item). Verified on the real library with real Ollama: bread video → recipe in ~36 s (33% → 67% → 100%), tech video → "not a recipe" in 3 s; nothing persisted (verified from a second connection). Not done: Cancel button.
- [x] **Cancel for Explain / Extract recipe (2026-11-15)** — `POST /api/ingest/jobs/:id/cancel`; runners register an AbortController (`services/jobControl.ts`) merged with the 15 min timeout, so cancelling aborts the model call itself. Status `cancelled` (not a failure, no toast); nothing is saved or created even if the cancel lands as the last call returns; orphaned jobs (server restarted) are cleared instead of stuck; only AI jobs are cancellable. UI: a Cancel button beside the progress, "Cancelling…" until the server confirms, the real result shown if the job finished first. Verified on the real library (real Ollama, real DB in the verified rollback harness): cancel mid-summarising / mid-extracting stopped the runner within ~0.01 s, job `cancelled`, nothing saved, lock freed, and a fresh model call right after took 0.4 s (Ollama really stopped); cancelling during the transcript fetch takes up to ~1 s (that fetch cannot be aborted).
- **Acceptance:** on a cooking video, *Extract recipe* creates a separate, editable recipe item linked to the video; on a lecture/tutorial, *Explain* stores a structured explanation; neither runs unless the user clicks.

### Risks
- **Cost & rate limits (cloud):** bulk work on cloud is billable and rate-limited — hence local default and per-task opt-in; show which provider will be used before running.
- **Privacy:** plaintext credentials exist in the DB today; without `cloudSafe` + consent a cloud re-classify/ask could upload them. Do not enable cloud before the guard ships.
- **Strict-local gap** (A0) is a live bug the moment `use_claude` is turned on.
- **Key leakage:** never put provider keys in the `settings` table (returned wholesale by `GET /api/settings`).
- **Transcript fragility:** `youtube-transcript` is unofficial; videos without captions, age-gated, removed or private will fail — backfill must report these, not fake content.
- **JSON reliability differs by provider:** Claude/Gemini need their own JSON handling; classifier's parse-retry must be tested against each.
- **Quality drift:** classifications from different providers differ; record `<provider>:<model>` in provenance and keep the existing "never overwrite reviewed" rule.
- **Backfill blast radius:** 115 items, some misfiled as `media`/`note`; always dry-run first; reviewed items are protected.
- **Migration ordering:** `derived_from` migration must take the next free number after the Dev Knowledge plan's 018/019 (and any 020 dedupe index); keep gapless.
- **Recipe hallucination:** a small model may invent steps; require "no recipe found" path and a confidence field; mark `reviewed=false`.

### Decisions (DECIDED 2026-11-11 — "go with your recommendations")
- [x] **Cloud scope:** on-demand tasks only (explain, extract, optionally ask). Ollama handles all bulk/background work.
- [x] **API keys:** server env vars only (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`); never in the `settings` table; UI shows "configured: yes/no" only.
- [x] **Models per task:** deferred to implementation — check current Claude/Gemini model lists and pricing then, and put ids in env/settings (no hardcoded ids).
- [x] **Gemini direct YouTube-URL input:** optional, last item of Phase B, cloud-only, needs Phase A.
- [x] **YouTube backfill:** button-triggered with a dry-run preview first; never automatic; skips reviewed items.
- [x] **Explain output:** separate `structured.explanation` block; never overwrites `content`.
- [x] **Recipe extraction:** always creates a new linked recipe item (`derived_from`); original video item kept.
- [x] **Privacy guard:** BLOCK `Personal > Bank`, `type='password'` and encrypted items from cloud providers (not just warn); plus `allow_cloud_ai` consent flag; `strict_local_mode` forces Ollama.
