---
project: Memex
last_updated: 2026-11-25
---

# Archived Tasks

## 🚀 Public Launch — planned 2026-11-16
<!-- archived_on: 2026-11-24 -->
- [x] Split `Settings.tsx` (780 lines) into a shell + one component per tab; keep tab in the URL (`/settings/ai`) <!-- done: 2026-11-16 -->
- [x] Tabs: **AI** (provider, model, cloud consent; per-task overrides + provider status/tests under "Advanced"), **Keys & Privacy** (API keys, Strict Local Mode moved out of Vault Security, cloud-safe explainer), **Library** (categories, import/export, MarkItDown, re-process, enrichment), **Vault** (auto-lock, change password, reset), **Capture** (bookmarklet, YouTube backfill) <!-- done: 2026-11-16 -->
- [x] "Setup status" strip at the top (local AI on/off, which cloud providers are connected, cloud allowed?) <!-- done: 2026-11-16 -->
- [x] Move `BookmarkletSection` out of `Settings.tsx`; update `Settings.test.tsx` <!-- done: 2026-11-16 -->
- [x] `ProviderId` + `PROVIDER_IDS` (`settings.ts`), `openaiProvider` in the `ai.ts` registry (`openai` npm package, JSON mode via the existing `withJsonInstruction`), `KEY_PROVIDERS` in `apiKeys.ts`, `OPENAI_API_KEY` env var, `openai_model` setting <!-- done: 2026-11-16 -->
- [x] Check OpenAI's current docs for the default model id when building; keep it editable like Claude/Gemini <!-- done: 2026-11-16 -->
- [x] Client: replace the hard-coded claude/gemini ternary in `AiProviderSettings` with a provider config map; add OpenAI to labels, key panel, status rows, test button, per-task dropdowns <!-- done: 2026-11-16 -->
- [x] `GET /api/ai/providers`, `POST /api/ai/test`, tests (mirror the existing Claude/Gemini cases); update CLAUDE.md routing section <!-- done: 2026-11-16 -->
- [x] Fifth provider `groq` <!-- done: 2026-11-17 -->
- [x] Check Groq's current docs for a default model id and for JSON-mode / token-cap quirks <!-- done: 2026-11-17 -->
- [x] Client: `aiProviders.ts` (label, short name, `groq_model`), `api.ts` types, key panel help text + order, provider / per-task dropdowns, Test button, "no key yet" hint, privacy wording; tests mirroring OpenAI's <!-- done: 2026-11-17 -->
- [x] Embeddings stay on Ollama / Gemini / OpenAI (Groq has no embeddings API); the embedding pickers do not list it <!-- done: 2026-11-17 -->
- [x] **B. Providers:** <!-- done: 2026-11-17 -->
- [x] **C. Switching and re-embed:** <!-- done: 2026-11-17 -->
- [x] **D. Thresholds and merging** <!-- done: 2026-11-17 -->
- [x] **E. Docs** <!-- done: 2026-11-17 -->
- [x] **Cloud path contract (the hook from L3 E)** <!-- done: 2026-11-17 -->
- [x] Embedding-failure robustness fix <!-- done: 2026-11-17 -->
- [x] One-command start <!-- done: 2026-11-17 -->
- [x] First-run wizard: create the single user, choose local or cloud AI, paste keys, set cloud consent <!-- done: 2026-11-17 -->
- [x] `.env.example` audit and a startup check that refuses weak/default secrets <!-- done: 2026-11-17 -->
- [x] Health endpoint + readable startup errors (DB down, weak secret, failed migration) <!-- done: 2026-11-17 -->
- [x] Upgrade path <!-- done: 2026-11-17 -->

## 🧠 Dev Knowledge Capture (GitHub repos, AI prompts/skills, explainers from Instagram) — planned 2026-11-11
<!-- archived_on: 2026-11-24 -->
- [x] Read-only baseline: classify existing Tech + Links items with the current classifier, save the output <!-- done: 2026-11-15 -->
- [x] Places mined from notes (2026-11-16): `minePlacesDryRun.ts` (rules-only default, or `--provider gemini,claude`) <!-- done: 2026-11-16 -->
- [x] Update stale CLAUDE.md claims (content-hash dedupe, Instagram caption scraping) — done 2026-11-15 <!-- done: 2026-11-15 -->

## 🚀 Public Launch — planned 2026-11-16
<!-- archived_on: 2026-11-25 -->
- [x] L1 leftovers fixed 2026-11-18 <!-- done: 2026-11-18 -->
- [x] Migration 026 applied to the local database (2026-11-18, `npm run migrate`, Postgres started for it and stopped again) <!-- done: 2026-11-18 -->
- [x] **Live Groq check passed 2026-11-18** (new `server/src/scripts/verifyGroq.ts`, synthetic text only, nothing from the library, writes nothing, never falls back to Ollama) <!-- done: 2026-11-18 -->
- [x] LICENSE (**MIT**, decided 2026-11-17), CONTRIBUTING, issue templates, SECURITY.md, CHANGELOG, version tag + GitHub release <!-- done: 2026-11-18 -->
- [x] **2026-11-18: site found down (404) and fixed; page updated.** The Vercel project had auto-connected to the GitHub repo with an empty Root Directory, so each push to `main` (mine from ~12:26 on) deployed the repo root, which has no `index.html`, and replaced the production alias; the custom domain and the vercel.app URL both answered 404. Fix: Root Directory set to `site` (Git deploys now serve the page; pushes publish it), redeployed, 200 on https://memex.jagdeepsinghvirdi.com. Page content: new "What is new in v1.1, and why it helps" section (12 items), Light/dark palette + a Theme button (auto / light / dark, remembered), footer link to the v1.1.0 release, install note about Linux CI. <!-- done: 2026-11-18 -->
- [x] Deploy to Vercel and point `memex.jagdeepsinghvirdi.com` at it <!-- done: 2026-11-18 -->
- [x] MCP server (Claude Desktop, Cursor and other MCP apps can search, read and save into Memex) <!-- done: 2026-11-18 -->
- [x] Direction chosen by Claude on the user's brief ("fresh colours that work in both dark and light"): **Midnight / Daylight** palettes with an **iris** (blue-violet) accent <!-- done: 2026-11-18 -->
- [x] Design tokens as CSS variables + Tailwind mapping, theme switch (system / light / dark, saved), pre-paint script, toggle in the header, themed toasts and graph canvas, landing page on the same palette <!-- done: 2026-11-18 -->
- [x] Settings > Appearance: choose System / Light / Dark (radio cards, same saved choice as the header button); checked in the browser, 915 tests <!-- done: 2026-11-18 -->
- [x] Light-mode review of the remaining pages <!-- done: 2026-11-18 -->

