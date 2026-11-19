# Memex Redesign and Product Evolution Roadmap

**Status:** Phase 7 complete (awaiting owner review); Phase 8 in progress.  
**Repository:** `jagdeepvirdi/memex`  
**Planning baseline:** local repository source and docs reviewed 2026-11-19. The working tree already contains the user-provided, untracked `CODEX_PROMPT.md`; it was left untouched.

## 1. Project vision and objectives

Evolve Memex into a coherent Personal Knowledge OS that makes it easy to capture, organize, find, connect, and use personal information while preserving its local-first defaults, user control, privacy boundaries, self-hosting, and open-source character.

This initiative improves the product experience and its visual identity, not only its appearance. Existing working capabilities and user data must remain supported. New functionality is justified only where discovery, user value, and operational cost warrant it.

Objectives:

- Establish a distinctive, consistent identity across the app, site, login, install assets, and documentation.
- Create a reusable, accessible design foundation and apply it screen by screen to the existing product.
- Improve capture, organization, global search, Ask Knowledge, and rediscovery while preserving existing data and workflows.
- Make responsive behavior, onboarding, failure states, and setup clear for self-hosted users.
- Review privacy, security, AI boundaries, architecture, and product gaps from implementation evidence.
- Deliver a realistic, prioritized post-redesign product roadmap without feature bloat.

## 2. Current application assessment

### Product and feature inventory

Memex is an MIT-licensed, self-hosted personal knowledge manager. It stores its library in PostgreSQL with pgvector. It supports local Ollama AI and opt-in cloud providers, with settings for provider choice and embedding models.

**Core workflows and capabilities found in source/docs:**

- Account setup and login, protected application routes, sample/demo data, and first-run AI setup.
- Capture of text/notes, URLs, quick saves/bookmarklet, Google Keep Takeout ZIPs, pasted batches, files, images, and voice recordings/transcripts; optional local MarkItDown, Whisper, and image vision support.
- Background ingest/enrichment jobs, cancellation/status, AI classification, structured extraction, confidence and intent, user review, reclassification, extraction provenance/history, and category anomaly review.
- Hierarchical categories, tags, filtering, item detail/edit/version history, soft-delete/trash, bulk actions, priorities, reminders, and data export (including Obsidian Markdown ZIP).
- Keyword/full-text and semantic search; Ask Knowledge/RAG with cited source items; natural-language table filters; related items and entity/semantic graph.
- Dashboard statistics, insights, rediscovery, and weekly digest; specialized Places, Media & Books, Table, Pending, and Enriched screens.
- Password vault with browser-side AES-GCM encryption, password change/rekey, and conversion of sensitive notes into vault entries.
- Public item sharing with expiry/revocation; scoped MCP search/recent/read/save tools and API keys, with private-content filtering.
- Light/dark/system theme support, PWA install/share target, service worker API caching, and browser reminder notifications.
- Settings divided into AI, Keys & Privacy, Library, Vault, and Capture areas.

**Secondary and less visible capabilities:** per-task AI provider overrides, embedding review/switch/re-embedding, local-only/cloud-safe explanations, data provenance, AI enrichment status, YouTube backfill, optional provider tests, MCP configuration, category remapping, duplicate detection, and restore/backup scripts. Their discovery and user comprehension should be evaluated before changing their placement.

### What is working well

- Product breadth is real and unusually well integrated for a self-hosted application: capture, processing, retrieval, review, and rediscovery are all represented.
- Privacy has implementation-level mechanisms, not only marketing language: cloud consent/Strict Local behavior, guarded provider calls, private-item exclusions, scoped MCP keys, client-encrypted vault entries, and loopback-oriented Docker defaults are documented and represented in code.
- There are extensive client, server, MCP, and database-focused tests, CI, migration history, setup/backup docs, and operational scripts.
- The backend separates routes, services, libraries, and migrations; shared API types exist; provider selection and embedding migration are explicit capabilities.
- The public site contains real product explanations and install guidance, self-hosted fonts, responsive HTML/CSS, and privacy explanation rather than generic stock imagery.
- Existing UI already uses shared shell elements, theme tokens, type-specific cards/views, loading components, and a shared header.

### Main UX/design issues to address (source review; validation required)

- The sidebar exposes many destinations in one flat list, while some useful destinations (Graph, Pending, Enriched, Category Review, setup status, and capture tools) are not consistently surfaced in the main navigation. Category/tag lists can also become long. Review the hierarchy and progressive disclosure without removing routes.
- The app shell is desktop-sidebar-centered. Recent header and touch fixes are documented, but the table and other information-dense screens need targeted mobile/tablet audits; current evidence is not a complete responsive review.
- The current brand treatment appears to be a text wordmark plus a simple `M` tile in the app and an inline `M` favicon on the site. It does not yet express the distinctive connected-memory/vault concept consistently across product and install assets.
- The design system has a meaningful tokenized two-theme foundation and locally hosted fonts, but the visible implementation is utility-class-heavy. Consistency of spacing, type hierarchy, component states, semantics, and theme contrast across every screen remains to be audited.
- Dashboard ambitions can easily become a crowded widget grid. Prioritize capture/search and useful next actions; retain insights, digest, reminders, statistics, and rediscovery only with a clear hierarchy and data-backed usefulness.
- Capture accepts many formats and optional local tools. First-run and failure handling must make dependency availability, processing progress, retries, and partial failure understandable without implying optional tools are always installed.
- Search, NL filters, and Ask are distinct entry points. Clarify their roles, make filters/results navigable, and make answer citations, semantic-vs-keyword limitations, sources, and errors legible.
- Feature richness creates settings complexity and discoverability cost. Review advanced controls and provider/data-sharing language so the user can understand the consequence of each choice.
- Source/docs present screenshot references, but this audit did not conduct a live browser walkthrough or confirm the referenced screenshots exist. Visual judgments above are hypotheses from source and docs, not usability-study results.
- Accessibility, reduced-motion behavior, screen-reader semantics, keyboard flow, real empty/error/loading states, and performance need systematic verification; existing focus styling alone does not establish conformance.

## 3. Product positioning and target experience

**Positioning:** a private, self-hosted knowledge workspace that turns things a person saves into an organized, searchable library they can revisit and question. “Personal Knowledge OS” is a useful north star, but the public-facing promise should stay concrete: capture, find, understand, and retain control of saved material.

**Target experience:** capture takes seconds; useful organization happens with transparent AI assistance; search and Ask return grounded results with paths back to originals; resurfacing is relevant rather than noisy; the user always understands where data is stored and what can leave the machine.

**Likely primary users:** privacy-conscious individuals, self-hosters, researchers/knowledge workers, and people who save material across formats and want retrieval beyond folders. These are working hypotheses; Phase 9 should challenge them against the actual product and deployment model.

The app should feel like one calm personal library, not a collection of unrelated utility screens. The landing page must explain who it helps, the local/cloud tradeoff accurately, and how to get started.

## 4. Existing architecture and technology assessment

### Observed architecture

- Client: React 18, TypeScript, Vite, Tailwind CSS, Zustand, React Router, Framer Motion, TipTap, Lucide, Sonner, PWA plugin/Workbox.
- API: Node.js/TypeScript, Express, PostgreSQL (`pg`) and pgvector; SQL schema plus 26 ordered migrations at planning baseline.
- AI: provider/service abstractions for Ollama, Gemini, OpenAI, Anthropic/Claude, and Groq; embedding-provider choice and re-embedding workflows; retrieval, classification, RAG, insight, digest, and ingestion services.
- Integrations: separate TypeScript MCP server with scoped tools; optional Python-based MarkItDown/Whisper and external YouTube/GitHub APIs.
- Quality/operations: Vitest suites, CI typecheck/tests/coverage and Docker smoke workflow, Docker Compose, runbook, backup/restore scripts, security guidance, Vite static site under `site/` (deployed separately per existing task notes).

### Recommended technical direction

- Preserve the current stack unless an observed deficiency in Phase 8/9 demonstrates a substantial benefit to change. A framework migration or component-library replacement is not justified by the repository audit alone.
- Keep PostgreSQL/pgvector and the provider abstractions for this initiative; focus on retrieval quality, observability, predictable failure handling, and privacy boundary review before proposing new infrastructure.
- Consolidate visual primitives and tokens incrementally. Prefer semantic component boundaries and documented tokens over a broad rewrite of stable workflows.
- Build an end-to-end verification matrix that reflects optional services and deployment modes; tests must avoid real personal library content and cloud calls without explicit approval.
- Review service-worker caching and session/logout behavior carefully: Vite config caches `/api/` responses with `NetworkFirst` for up to 30 days, while auth state is in local storage. Determine the actual cache contents and lifecycle, then decide if private/authenticated responses need cache exclusions or explicit cleanup. This is a security/privacy review item, not a conclusion that a vulnerability is confirmed.
- Review optional dependency boundaries, upload limits, SSRF protections for URL ingestion, secrets handling, MCP scope, public sharing, and migration/backup compatibility during the security phase.
- No new production dependency is proposed at Phase 0. First use the current stack and browser tooling; evaluate a dependency only against a concrete gap, maintenance cost, bundle/performance impact, compatibility, and security.

## 5. Design principles and visual direction

- **Brand personality:** intelligent, premium, minimal, thoughtful, trustworthy, calm, and technically credible.
- **Logo exploration:** explore the proposed continuous folded “Memory Ribbon” M alongside at least two distinct ideas (for example, linked index/recall mark and an abstract vault/archive form). Judge silhouette, legibility at favicon size, monochrome use, app icon behavior, and whether the idea is ownable. Prefer hand-authored vector assets; do not ship raster artwork embedded in SVG.
- **Recommended direction:** a restrained geometric symbol suggesting a folded/connected ribbon, paired with a crisp wordmark. Keep it recognizable in one color and avoid literal brain, sparkle, or generic AI imagery. This is a recommendation to explore, not an approved final logo.
- **Typography:** retain the self-hosted DM Sans / Playfair Display / JetBrains Mono assets initially. Use a highly readable sans for UI/body, a measured display face for editorial moments, and mono only for technical metadata. Reconsider fonts only if actual rendering tests show a meaningful improvement.
- **Colour:** evolve the existing dark graphite and light porcelain token sets. Use one controlled primary accent (indigo is a plausible candidate), with muted jade reserved for privacy/local status where it carries meaning. Keep semantic status colors distinct and contrast-checked. Do not add accent colors for decoration.
- **Themes:** support dark, light, and system preference. Tokens must preserve contrast, focus visibility, charts/canvas colors, PWA chrome, and site/app consistency in both palettes.
- **Components:** accessible, composable, data-aware primitives; strong typography and spacing; quiet surfaces; clear active/hover/focus/disabled/loading/error states; motion only when it improves orientation or feedback and respects reduced motion.
- **Application layout:** prioritize global capture and search, group destinations by user intent, make frequent actions visible, and keep advanced review/administration available without letting it dominate. Preserve specialized layouts for table, graph, places, media, and vault.
- **Landing page:** editorial, product-led, evidence-based. Use real app screenshots or carefully constructed, clearly representative interface previews; avoid fake metrics, invented testimonials, unsupported security promises, stock photos, and decorative AI art.
- **Responsive approach:** design from actual workflows at phone, tablet, and desktop widths. Reflow or offer purpose-built compact interactions for dense data; do not treat horizontal overflow as the mobile solution by default.
- **Experience principles:** quick capture; useful defaults; transparent AI; grounded answers; recoverable actions; clear privacy choices; respectful rediscovery; progressive disclosure; no silent feature removal.

## 6. Project milestones and phases

| Milestone | Phase | Scope | Status |
|---|---:|---|---|
| 0. Discovery and plan | 0 | Repository/product audit, strategy, full roadmap | DONE; approval required to start implementation |
| 1. Brand and design foundation | 1 | Identity exploration, final logo and brand assets | NOT STARTED |
| 1. Brand and design foundation | 2 | Tokens, reusable UI foundation, theme validation | NOT STARTED |
| 2. Application redesign | 3 | App shell, navigation, global actions | NOT STARTED |
| 2. Application redesign | 4 | Dashboard, capture, search, Ask workflows | DONE |
| 2. Application redesign | 5 | Remaining app screens and specialized layouts | DONE |
| 2. Application redesign | 6 | Responsive, accessibility, interaction, PWA polish | IN PROGRESS |
| 3. Website and release quality | 7 | Public site, copy, metadata, product previews | NOT STARTED |
| 3. Website and release quality | 8 | Regression, security, performance, release readiness | NOT STARTED |
| 4. Product review and evolution | 9 | Independent product/security/architecture gap analysis | NOT STARTED |
| 4. Product review and evolution | 10 | Prioritized future roadmap and approved small enhancements | NOT STARTED |

Phases are gated. Work stops at each phase boundary. Phase 0 does not authorize Phase 1. The user must approve the initial plan or explicitly instruct the next phase. Any significant scope change is recorded here before implementation expands.

## 7. Detailed task breakdown

Task entries use: **Reason/outcome; Dependencies; Acceptance criteria; Verification; Status.** “Verification” describes evidence required when the task is executed; Phase 0 itself did not run tests or builds.

### Phase 0 — Repository discovery, product audit, planning

| ID | Priority | Description and reason/outcome | Dependencies | Acceptance criteria | Verification | Status |
|---|---|---|---|---|---|---|
| P0-001 | P0 | Inspect repository structure, docs, client, server, shared types, DB/migrations, AI, MCP, UI, PWA, tests, CI, Docker and deployment artifacts; establish evidence-based baseline. | None | Architecture and implementation areas recorded, including limits of source-only review. | Source/doc inventory; no application code changed. | DONE |
| P0-002 | P0 | Inventory current user-facing features/workflows so existing capability is not mistaken for a gap. | P0-001 | Core and secondary capabilities, discoverability risks, and verification caveats documented. | Cross-check route, service, UI, docs, and test inventories. | DONE |
| P0-003 | P0 | Assess product experience, design and UX risks; define recommended positioning and visual direction. | P0-001, P0-002 | Strengths, issues, hypotheses, and design strategy documented. | Trace claims to repository artifacts; separate observations from assumptions. | DONE |
| P0-004 | P0 | Assess current technologies and recommend a maintainable technical direction. | P0-001 | Current stack, justified recommendations, and security/privacy review areas documented. | Review package manifests, architecture, migrations, CI, deployment config. | DONE |
| P0-005 | P0 | Create this complete governed roadmap and initial tracker before implementation. | P0-001–P0-004 | Required governance sections, phase tasks, dependencies, phase criteria, decisions, risks, progress, and future review structure exist in `TASKS_CODEX.md`. | Manual completeness review; application files unchanged. | DONE |

### Phase 1 — Memex brand identity and logo

**Phase acceptance:** a documented concept comparison and selected direction; production-ready primary/standalone/light/dark/monochrome marks, app icon, favicon, PWA icons, and social image; assets render consistently in app, login, site, and documentation; no capability or accessibility regression. Final acceptance requires visual review at small and large sizes and confirmation that delivered vector assets are genuine vectors.

| ID | Priority | Description and reason/outcome | Dependencies | Acceptance criteria | Verification | Status |
|---|---|---|---|---|---|---|
| P1-001 | P1 | Explore Memory Ribbon and at least two alternatives; identify a distinct, scalable Memex mark. | Phase 0 approval | Concepts compared against recall/connection, small-size legibility, mono use, app icon behavior, and brand fit; recommendation and rationale recorded. | Hand-authored vector concepts; inspect light/dark icon exports and social preview. | DONE |
| P1-002 | P1 | Define wordmark, spacing, color usage, and identity rules. | P1-001 | Compact usage guidance covers clear space, minimum sizes, background variants, and prohibited treatments. | Verify supplied vector variants and usage against `brand/README.md` and `DESIGN.md`. | DONE |
| P1-003 | P1 | Produce clean vector logo family and raster deliverables only where platform formats require them. | P1-002 | Primary lockup, standalone symbol, light/dark/monochrome, app, favicon, PWA and social assets are present and correctly sized/formatted. | XML-parse SVG copies; inspect PNG output; confirm generated manifest and build asset files. | DONE |
| P1-004 | P1 | Integrate approved identity across app shell, login/onboarding, public site, and docs. | P1-003 | No conflicting legacy mark remains in reviewed entry points; theme variants and clear-space rules hold. | Source/route search, 921 client tests, typecheck/build; rendered screenshot could not be captured because headless Chromium GPU initialization fails here. | DONE |

### Phase 2 — Design system and UI foundation

**Phase acceptance:** shared tokens and documented conventions cover color, type, spacing, radii, elevation, breakpoints, icon, motion, and state; both themes work across representative and audited screens; reusable accessible primitives reduce divergence without forcing specialized experiences into generic layouts.

| ID | Priority | Description and reason/outcome | Dependencies | Acceptance criteria | Verification | Status |
|---|---|---|---|---|---|---|
| P2-001 | P1 | Audit existing tokens, font loading, utility conventions, component duplication, and theme-specific hardcoded values. | Phase 1 | Token migration plan prioritizes repeated/high-impact gaps and preserves established behavior. | Search styles/source; inspect representative components in both themes. | DONE |
| P2-002 | P1 | Refine semantic color, typography, spacing, radius, elevation, breakpoint, focus, and motion tokens. | P2-001 | Token names and usage guidance are documented; no arbitrary palette expansion; system theme remains supported. | Contrast sampling and UI inspection at key breakpoints. | DONE |
| P2-003 | P1 | Establish reusable button, form/input, search, card, nav, table, badge/tag, dialog/drawer, dropdown, toast, tabs, empty/loading, tooltip, and context-menu patterns. | P2-002 | Shared patterns expose accessible names/roles, keyboard states, disabled/busy/error states as applicable. | Added and tested shared button, form, search, card, badge, tabs, empty, loading primitives; documented semantic navigation/table/dialog/menu/tooltip/toast patterns using native elements and Sonner where appropriate. | DONE |
| P2-004 | P1 | Validate light/dark/system theme across app, PWA chrome, graph/canvas, and public site. | P2-002, P2-003 | No unreadable, invisible, or mismatched theme states in reviewed workflows; saved preference and system fallback behave consistently. | Theme preference tests, graph resolved-theme palette source review, dynamic browser theme-color source review, public-site system/override CSS review, production build. Headless screenshot sweep unavailable (GPU initialization failure). | DONE |

### Phase 3 — Application shell and navigation

**Phase acceptance:** a cohesive authenticated shell with clear hierarchy, accessible responsive navigation, global search/capture, profile/theme/status controls, and discoverable access to every existing route and capability.

| ID | Priority | Description and reason/outcome | Dependencies | Acceptance criteria | Verification | Status |
|---|---|---|---|---|---|---|
| P3-001 | P1 | Rework sidebar/navigation hierarchy, grouping frequent and library/review destinations. | Phase 2 | All current destinations remain reachable; active state, category/tag access and long-list behavior are understandable. | Route inventory reconciliation; tests cover every destination, category/tag action, mobile menu, keyboard dismissal and focus return. | DONE |
| P3-002 | P1 | Refine shared header, profile menu, theme control, AI/network status and responsive action row. | Phase 2 | Header controls are consistent and do not overlap or obscure titles/actions at supported widths. | Header responsive-layout and profile tests; status, progress, theme, settings, account menu ARIA and Escape checks. Browser screenshots unavailable after headless GPU failure in this environment. | DONE |
| P3-003 | P1 | Define global search and capture entry points and shortcuts. | Phase 2 | Search and capture are quickly reachable, labeled, keyboard accessible, and have no shortcut conflict. | Global actions tests cover slash/N shortcuts, editable-field conflict, PWA share prefill, close behavior, plus desktop/mobile entry points. | DONE |
| P3-004 | P2 | Surface setup and processing states without making transient AI/network status dominate. | P3-002 | AI/provider readiness and active ingest state are understandable with useful next actions and failure states. | Header tests cover online/offline, Ollama ready/checking/unavailable, progress semantics, and link to AI setup. | DONE |

### Phase 4 — Dashboard and core workflows

**Phase acceptance:** dashboard establishes a useful next action; notes/URL/file/image/voice/Keep/bookmarklet capture remain available; global search and Ask return understandable, navigable results with source provenance; failures and optional integrations are explicit.

| ID | Priority | Description and reason/outcome | Dependencies | Acceptance criteria | Verification | Status |
|---|---|---|---|---|---|---|
| P4-001 | P1 | Reorder dashboard around capture/search, useful library overview, and evidence-backed rediscovery. | Phase 3 | Clear hierarchy; no fabricated data; optional widgets have meaningful empty/loading/error states and can lead to source records. | Added capture, search, Ask, and digest actions; moved library overview ahead of insights; separated API loading/error/empty states and retry actions. Client tests cover populated, partial, delayed-insight, and insight-failure states. | DONE |
| P4-002 | P1 | Improve capture affordances and cross-format ingestion progress, preview, retry, and duplicate cues. | P3-003 | Existing capture paths preserved; optional MarkItDown/Whisper/vision availability explained; user can tell saved vs processing vs failed. | Manual API calls now use the shared authenticated client; capture tabs expose tab semantics and horizontal scrolling; bulk imports refresh dashboard; Keep import returns without reload; Whisper wording matches server processing. Existing tests cover manual classification/save; optional tool availability was source-reviewed, not runtime-smoke-tested. | DONE |
| P4-003 | P1 | Improve global search results, filters, navigation, and semantic/keyword fallback clarity. | P3-003 | Search results expose useful context and filters; opening a result preserves expected navigation; fallback is not misrepresented. | Added item-type filter, type/date/context per result, stale-request protection, keyword-only notice, and retryable failure state; existing tests cover keyword/semantic result handling, keyboard navigation, and item routing. | DONE |
| P4-004 | P1 | Improve Ask Knowledge answer, suggested prompts, source citations, processing, history decision, and error/empty states. | P4-003 | Answers link back to original items; source boundaries and semantic limitations are visible; no fabricated conversation persistence. | Suggestions now submit their own text; provider failures can retry; all returned sources link to their original items; keyword-only and zero-source states are clear. Copy states that the page conversation is not saved and provider selection follows configuration/privacy handling. Client tests cover successful, empty-source, keyword-only, and failure answers. | DONE |
| P4-005 | P2 | Review dashboard insights, reminders, digest entry, and rediscovery for relevance and hierarchy. | P4-001 | Each retained element has a clear user benefit, understandable cadence, useful empty state, and source path. | Retained insights as optional pattern summaries with loading/failure/empty states, reminders only when present or unavailable, and rediscovery with retry and source-item navigation. Added a direct Weekly Digest action; existing sidebar and Monday digest behavior remain. Insight API does not expose source item IDs, so insights remain non-clickable summaries; source-backed rediscovery/digest links are available separately. | DONE |

### Phase 5 — Remaining application screens

**Phase acceptance:** every authenticated/public route is audited and updated; every existing action remains accounted for; specialized information architecture is retained where useful; content, privacy, and error states are handled per screen.

| ID | Priority | Description and reason/outcome | Dependencies | Acceptance criteria | Verification | Status |
|---|---|---|---|---|---|---|
| P5-001 | P1 | Redesign category, item detail/edit/history, tags, and public shared item experiences. | Phase 2, 3 | Classification, provenance, reminders, related items/entities, versions, sharing and expiry/revoke controls remain accessible and clear. | Route/action review; differentiated loading, missing/error and retry states; exact tag search; explicit 7-day public-link expiry; focused client tests included in the full suite. | DONE |
| P5-002 | P1 | Redesign table, pending, enriched, and category review workflows. | Phase 2, 3 | Dense scanning, filtering, bulk operations, confidence/review decisions, and category remapping remain usable. | Added functional `reviewed=true` and `deleted=true` list filters across client, route and service; responsive controls, accessible table caption/filter names, and retryable failures; server/client tests passed. Large live libraries were not available for manual stress review. | DONE |
| P5-003 | P2 | Redesign Places and Media & Books as curated domain views. | Phase 2, 3 | Structured fields, status, ratings, source links and exports are legible and editable where currently supported. | Route/action review; searchable/loading/error/empty states, table captions, keyboard-operable place details and named rating/status controls; related client coverage passed. Browser screenshot review remains for Phase 6. | DONE |
| P5-004 | P1 | Redesign graph, weekly digest, reminders and trash. | Phase 2, 3 | Graph remains navigable and bounded; digest sources and time range are clear; restore/delete semantics are explicit. | Graph loading/failure/retry and semantic-link availability; digest retry state; reminders remain accessible from item/dashboard flows; trash now requests deleted records and supports retry. Client/server tests passed. | DONE |
| P5-005 | P0 | Redesign vault, settings, login and onboarding with security consequence clarity. | Phase 2, 3 | Vault boundaries, irreversible reset, provider consent, key handling, local/cloud setup and account flow remain accurate and understandable. | Corrected misleading vault/login/onboarding copy; settings wait for saved configuration and offer retry on load failure; vault failures remain distinct from empty state. Tests use synthetic credentials only; client coverage passed. | DONE |

### Phase 6 — Responsive, accessibility, interaction and PWA polish

**Phase acceptance:** supported desktop/tablet/mobile layouts work without clipped core content; keyboard/focus/labels/semantics/contrast/reduced-motion and PWA install/offline/share/reminder behavior have documented outcomes and unresolved defects are tracked.

| ID | Priority | Description and reason/outcome | Dependencies | Acceptance criteria | Verification | Status |
|---|---|---|---|---|---|---|
| P6-001 | P1 | Audit all screens at representative desktop, tablet, and phone sizes, including dense table and graph. | Phases 3–5 | Core actions/content stay available; overflow is intentional and usable; findings are fixed or documented. | Headless Chrome viewport sweep of 14 routes at 360, 390, 768, and 1280 CSS px; no document-level horizontal overflow. API-backed screens showed expected empty/error states; real-content stress cases and handset testing remain unverified. | DONE |
| P6-002 | P1 | Audit keyboard order, skip/navigation landmarks, accessible names, dialogs, status messages, screen-reader semantics, focus, and contrast. | Phases 2–5 | Critical flows are operable without pointer; meaningful semantics and focus states; contrast meets agreed WCAG target. | Added skip-to-main targets on routed views, checked skip-link keyboard focus in Chrome, reviewed landmarks/labels/status semantics and semantic faint-text token contrast. No dedicated axe scan or screen-reader/device audit was available; full screen-by-screen contrast remains a limitation. | DONE |
| P6-003 | P2 | Audit reduced motion, transition timing, loading skeletons, empty/error feedback, and interaction polish. | Phases 2–5 | Motion respects user preference; state changes give feedback without delaying use. | MotionConfig uses the system preference; Chrome emulation confirmed reduced motion and shortened animation duration. Client tests cover notification opt-in, loading/error behavior, and empty states. Live slow-network timing and hardware feel remain unverified. | DONE |
| P6-004 | P1 | Review PWA install, offline behavior, share target, reminder permission, cache privacy, and logout/session transitions. | P3–P5 | Offline claims match tested behavior; private data cache/session lifecycle is understood and handled safely; install assets are correct. | Removed API runtime caching; seeded legacy api-cache was absent after app reload; API no-store middleware and logout cleanup tests pass. Production SW has app-shell precache/navigation fallback only; manifest, icons, and share target verified. No installed-device offline transaction was exercised. | DONE |

### Phase 7 — Complete landing page redesign

**Purpose:** make the public site explain Memex clearly to a first-time visitor, show what the product actually does, and help a self-hoster decide whether and how to try it. This phase is a redesign of the existing public site, not a new marketing platform.

**What will change:** review the current `site/` pages and assets; rewrite and reorder page content around the capture → organize → find/use loop; make navigation and primary calls to action clear; update visual hierarchy, spacing, typography, color, and responsive layout to use the approved identity and design tokens; add authentic app imagery or a clearly labeled, synthetic product preview; refine install instructions and FAQ against the repository's actual deployment requirements; and correct document metadata, semantics, and asset loading. Keep the site lightweight and compatible with its current hosting/deployment setup.

**Page-level review:** check the current site inventory first, then map content to these visitor questions: what Memex is and who it serves (hero); what can be captured and how AI-assisted organization works (workflow/capabilities); how search, Ask, and rediscovery help later (retrieval); what stays local and what optional providers may receive (privacy); how to self-host and where to get the source (installation/CTA); and what setup, integrations, or limitations a new user should know (FAQ). Keep or link existing support/legal/source content where present rather than silently dropping it. This is a review outline, not a requirement to add a separate page for every topic.

**Phase acceptance:** responsive, accessible product-led site uses approved identity; accurately presents capabilities, privacy/AI options, installation and source; metadata/social assets work; no unsupported metrics, testimonials, or security guarantees are introduced. All major links and calls to action have a verified destination, and any remaining visual or browser limitations are recorded.

**Review sizes and evidence:** inspect narrow phone (360–390 CSS px), tablet (around 768 CSS px), and desktop (1280 CSS px or wider). At each size check navigation, heading wraps, CTA visibility, image crop/readability, page order, footer access, and absence of unintended horizontal overflow. Also check keyboard-only navigation, visible focus, reduced motion, image alt text, and contrast in the supported theme. Record screenshots or equivalent observations, browser/version, viewport, and findings with each defect.

**Phase 7 progress (2026-11-19):** Audited `site/` (single static page: `index.html`, `style.css`, `site.js`, `theme-init.js`, `brand/`, `fonts/`). Done so far: (1) removed a contradiction ("no account" vs "create your account") from the hero; (2) moved "What is new" (release-note content) below the capability, privacy and assistant sections, just before Install; (3) mobile nav now keeps Install, GitHub and Theme (previously Install and Privacy were hidden); (4) added canonical, `og:url`, `og:site_name`, full Twitter card tags and accurate `SoftwareApplication` JSON-LD; (5) header logo swapped from a 163 KB PNG to an 11 KB 96 px asset with explicit dimensions. Checked at 375 and 1280 px (Chromium via Playwright): no horizontal overflow, no console warnings, all in-page anchors and local assets resolve. **Screenshots (P7-002, 2026-11-19):** two real app captures added to the page ("See it before you install it"): `site/img/app-dashboard.webp` and `site/img/app-privacy.webp` (46 KB and 55 KB, dark theme, 1440x838, header strip cropped, lazy-loaded with width/height and descriptive alt text). Source: a scratch Postgres container and the local server with a throwaway account, loaded with the built-in sample data (39 items, no AI calls, Ollama and all cloud keys disabled for those processes); the scratch database and volume were removed afterwards and the real library was never opened. Captions say the data is made up. Limits: dark theme only (no light variants); at the 2-column desktop size the screens are previews, not readable text; the Docker image build failed twice in this environment (`npm install` "Exit handler never called", an npm-internal error), so the app was run from source instead — the Docker install path was NOT re-verified here. **Completed (2026-11-20):** (a) claim-to-code trace of the hero, capture/organize/ask, local-vs-cloud table, feature list, privacy, MCP and "What is new" sections. Verified against code or tests: 7-day share expiry and revoke, weekly digest with on-this-day and a connection, due-date reminders with opt-in browser notifications, extraction history with apply, per-job providers (`ask` task), Obsidian export, five MCP tools and their scope, Node 20+ for the MCP server, 10-character minimum password, clean `npm audit` (re-run 2026-11-19: 0 in server, client, MCP). Three corrections made: capture now says PDFs/Office files, photos and voice memos need optional local tools (MarkItDown, an Ollama vision model, Whisper; README line 145); the Obsidian export is described as notes without the encrypted vault (`encrypted = FALSE` filter); sample data is "about forty" (39 loaded). (b) 768 px, contrast in both themes, focus, semantics and reduced-motion rule checked (see `docs/RELEASE_READINESS.md`). (c) All 10 distinct external links return 200. (d) The six unused 150-680 KB PNGs in `site/brand/` were removed; byte-identical copies remain in the repo-root `brand/`, and `site/brand/` is now 192 KB. (e) `CLAUDE.md` landing-page note updated for the screenshots. Residual: the "tested on Windows with Docker Desktop" install claim was not re-run here (local image build failed with an npm-internal error; Linux is covered by CI `docker-smoke`); screenshots are dark theme only.

| ID | Priority | Description and reason/outcome | Dependencies | Acceptance criteria | Verification | Status |
|---|---|---|---|---|---|---|
| P7-001 | P1 | Audit the current public-site pages and rewrite/reorder the narrative, navigation, hero, capability sections, installation guidance, FAQ, and footer. Lead with who Memex helps and its capture/find/control benefits; explain local versus optional cloud AI and setup requirements in plain language. | Phase 1, 2; Phase 4–6 product language | Visitors can identify the product, intended user, main workflows, privacy choices, and next step without claims beyond the implementation. Existing useful install/source information remains available. | Trace every material feature, privacy, and deployment statement to code/docs; walk through the page as a new self-hoster and check all navigation/CTA destinations. | DONE |
| P7-002 | P1 | Create or select current product screenshots/previews, then integrate them with the supplied brand assets. Use a non-sensitive demo account/library; redact secrets and personal data; label illustrative mockups honestly and ensure captures show current UI rather than planned functionality. | P1-003, P3–P5 | Images are legible, optimized, responsive, accessible with useful alt text, visually consistent, and reflect shipped behavior. No real personal library data or unsupported feature is shown. | Review every asset's source/content and desktop/mobile rendering; verify image dimensions, loading behavior, and alternative text. | DONE |
| P7-003 | P2 | Complete technical site polish: page title/description/canonical/social preview metadata; appropriate structured data only where accurate; semantic headings/landmarks; keyboard/focus and contrast checks; font/image loading and page-weight review; broken-link and console-error sweep. Preserve the current static build/deploy flow. | P7-001, P7-002 | Metadata is accurate and complete; page semantics and keyboard access are sound; assets/links load; performance findings are fixed when proportionate or documented with rationale. | Inspect generated HTML/build output, validate links and metadata, review browser console and performance at desktop/mobile sizes, and confirm current deployment instructions still apply. | DONE |

### Phase 8 — Integration, testing and release readiness

**Purpose:** establish whether the combined redesign is coherent, safe, and ready for a release candidate. First map existing tests and workflows to evidence, then close gaps that can be addressed within the phase and report any residual risk. This is verification and proportionate remediation, not a feature-development phase or a deployment authorization.

**What will change:** create a workflow-by-workflow regression record; reconcile routes, controls, API behavior, migrations, and data preservation; review dependency/build health and security/privacy boundaries; fix confirmed release-blocking regressions within the approved scope; and record platform/provider scenarios that cannot be safely or realistically exercised. Use disposable databases and synthetic records for migration, backup, restore, and integration work.

**Regression record format:** keep one row per workflow with `ID/workflow`, preconditions and synthetic fixture, steps or command, expected result, evidence (test name, build output, browser observation, or review reference), result (`pass`, `fail`, `blocked`, `not run`), defect IDs, and limitation. Group coverage into (1) account/session, (2) capture/import/processing, (3) library/edit/review/trash, (4) search/Ask/graph/rediscovery, (5) settings/providers/vault, (6) share/MCP/API boundaries, (7) export/backup/restore/migrations, (8) PWA/theme/responsive/accessibility, and (9) public site/install path. Track defects with severity, affected workflow, reproduction evidence, disposition, and retest result; unresolved critical/high findings block readiness.

**Phase acceptance:** production client/server/MCP builds and applicable quality checks pass; core workflows are regression-verified; privacy/security/performance review is documented; untestable provider/platform scenarios are explicitly listed. Any critical/high issue is fixed or marked as a release blocker with evidence and owner/next action. Deployment is not claimed unless performed and verified.

**Phase 8 progress (2026-11-19, P8-001 to P8-003 substantially done):**

| Check | Command | Result |
|---|---|---|
| Type checks | `npx tsc --noEmit` in `server/` and `client/`; `npm run typecheck` in `mcp/` | pass, no errors |
| Tests | `npm test` in each package | server 1802 passed / 17 skipped (opt-in real-DB suites); client 941 passed; MCP 32 passed |
| Production builds | `npm run build` in each package | pass (client PWA precaches 12 entries, no API caching) |
| Dependency advisories | `npm audit --omit=dev` in each package | 0 vulnerabilities |
| Route inventory | compared `<Route path>` in `client/src/App.tsx` and every `router.<verb>('...')` in `server/src/routes/*.ts` between `4678331` (pre-redesign) and now | client route set identical; 97 server endpoints, none removed or added |

Findings:
- **F-8-001 (medium, fixed):** saving a link sends its address to `r.jina.ai`, YouTube/Instagram oEmbed and, for repos, `api.github.com`, even with local AI. The README footer ("Nothing leaves it unless you turn on a cloud provider") and the site privacy section did not say so. Fixed in `README.md`, `SECURITY.md` and `site/index.html`; Strict Local Mode already blocks all of it (`scraper.ts`, `githubApi.ts`).
- **F-8-002 (low, hardened):** `convertToMarkdown` put the client-supplied upload name into the temp path. multer already strips directories and `spawn` uses no shell, so no exploit was found; the name is now reduced to plain characters (`markitdown.ts`). Related server tests pass.
- Reviewed with no finding: server never fetches a user-supplied URL directly (only fixed hosts; the one env-configured webhook is operator-set); upload limits exist (50 MB files, 100 MB audio); public share honours `share_expires_at` and revocation; auth endpoints are rate limited; `npm audit` clean.

- **F-8-003 (low, hardened):** `jwt.verify` now pins HS256 (`index.ts`, `routes/auth.ts`); auth/session tests pass.
- **F-8-004 (open):** the Docker image build failed twice locally with an npm-internal error; rely on CI `docker-smoke` or retry before release.

The regression matrix, migration-from-empty and dump/restore rehearsal are recorded in `docs/RELEASE_READINESS.md`. Site accessibility checks are done (768 px, contrast in both themes, focus, semantics, links; see the matrix). - **F-8-005 (low, fixed):** the app-screen sweep (19 routes, 3 widths, both themes) found no console errors, overflow or contrast failures, but icon-only controls without accessible names and missing `h1`/`main` on the dashboard and locked vault; fixed and re-verified. Still to do: keyboard order and reduced motion inside the app, the claim-to-code trace (Phase 7), and the final release summary. No external provider call was made.

| ID | Priority | Description and reason/outcome | Dependencies | Acceptance criteria | Verification | Status |
|---|---|---|---|---|---|---|
| P8-001 | P0 | Build a regression matrix covering account setup/login/session/logout; every capture/import path and ingest job lifecycle; search/filters/Ask citations; classification/review; settings and provider boundaries; vault; edit/history/trash/share; export plus backup/restore; reminders; MCP scopes; PWA install/share/cache; themes; and redesigned site entry points. For each, state setup, expected behavior, evidence source, result, and limitations. | Phases 3–7 | Every inventoried core capability is mapped to automated or manual evidence, with gaps explicitly called out. Synthetic data and provider mocks are defaults; no external call or user-content transmission is assumed. | Run existing and narrowly targeted tests/builds in this authorized phase; record exact commands/results and any skips. Live external calls require separate explicit approval. | IN PROGRESS |
| P8-002 | P0 | Reconcile app routes and actions against the pre-redesign capability inventory; inspect API success/error contracts and client handling; review migration ordering/backward compatibility and preservation of existing records; rehearse backup/restore and upgrade on disposable data; confirm client/server/MCP production outputs. | P8-001 | No existing route or capability has disappeared unintentionally; data and recovery behavior are understood; applicable production builds and type checks succeed or blockers are documented. | Route/action inventory comparison, type checks, unit/integration suite, production builds, disposable upgrade/restore rehearsal. | IN PROGRESS |
| P8-003 | P0 | Review authentication/session handling, API response/cache lifecycle, secrets/logging, upload size/type/path handling, URL-ingest SSRF defenses, public share expiry/revocation, MCP key scopes/private filtering, vault encryption/rekey, AI provider consent/data flow, network exposure, and dependency advisories. Verify relevant protections in implementation and configuration; remediate confirmed in-scope findings and document residual risk. | P6-004, P8-001 | Findings include severity, evidence, impact, and disposition; critical/high findings are fixed or explicitly release-blocking; no credentials or real user content appear in artifacts/logs. | Focused code/config review, dependency review, safe boundary tests using synthetic inputs; no actual user-content transmission. | IN PROGRESS |
| P8-004 | P1 | Review representative redesigned and high-risk workflows for visual consistency, responsive behavior, keyboard/focus/semantics, contrast, reduced motion, console errors, and loading/performance behavior. Include site and app plus dense/mobile and privacy-sensitive screens; record unavailable device/screen-reader checks. Produce a release-readiness summary with blockers, deferred defects, and exact evidence. | P8-001–P8-003 | Desktop/tablet/mobile checks and accessibility/performance findings are recorded; regressions are fixed or tracked; unperformed checks and release limitations are transparent. | Browser console and rendered visual review, available automated accessibility/performance tooling, and a concise release report. | IN PROGRESS |

### Phase 9 — Independent product assessment and gap analysis

**Purpose:** step back from implementation and judge the redesigned product against user needs, its self-hosted operating model, implementation evidence, and current alternatives. Separate verified product gaps from ideas that are merely common in competing products. This phase produces recommendations; it does not automatically authorize implementation.

**What will change:** conduct a fresh product walkthrough and source-based feature audit; research relevant current competitors and primary product documentation; examine AI/retrieval usefulness and provenance; independently trace security and privacy claims; assess architecture and operational burden; then replace or refine the initial recommendation hypotheses in this file with a ranked, evidence-linked set. Record dates and sources for time-sensitive findings and clearly label inference or uncertainty.

**Evidence record format:** for each finding capture `finding ID`, question/workflow, observation, evidence type (repository behavior, docs, test, browser review, primary external source, or inference), exact file/route/source link, observation/research date, user impact, confidence (`high/medium/low`) with reason, and unresolved uncertainty. For external comparisons, record product, workflow compared, source URL/title, access date, and limits; avoid unsupported conclusions from marketing copy. For each recommendation record problem, importance, proposed change, expected user benefit, complexity/maintenance, priority, dependencies, risks/trade-offs, evidence IDs, confidence, and validation still needed. The classification describes what kind of recommendation it is; priority describes sequencing importance.

**Phase acceptance:** `TASKS_CODEX.md` includes an evidence-based review across positioning, UX, functional gaps, AI, privacy/security, architecture/scaling, and competitors; every recommendation has ID, problem, importance, solution, user benefit, complexity, priority, dependencies, and risks/trade-offs; essential gaps, UX improvements, opportunities, advanced AI, nice-to-haves, and “do not add” items are separated. Recommendations account for privacy, self-hosting, ongoing maintenance, and evidence strength.

| ID | Priority | Description and reason/outcome | Dependencies | Acceptance criteria | Verification | Status |
|---|---|---|---|---|---|---|
| P9-001 | P1 | Reassess positioning, likely user groups, first-use friction, capture-to-retrieval daily loop, feature discovery, and coherence of scope using the redesigned app/site. Separate direct source observations from assumptions about user behavior; identify flows that create value, confusion, or unnecessary upkeep. | Phase 8 | Differentiation and major UX/product questions are described with evidence and uncertainty; audience hypotheses are revised or retained with rationale. | Walk through representative workflows and current relevant product research; cite sources and distinguish inference from sourced fact. | NOT STARTED |
| P9-002 | P1 | Audit current and missing user workflows across capture sources, browser/email/calendar, imports, organization, search, tasks/reminders, bulk actions, export/portability, offline, and integrations. For each candidate, verify current capability first, then assess frequency/value, friction, privacy implications, and maintenance cost. | P9-001 | Each candidate is explicitly accepted for roadmap consideration, rejected, or deferred with user value and product-fit rationale; existing capability is not mislabeled as absent. | Codebase capability audit plus comparative research where material; link evidence to the recommendation record. | NOT STARTED |
| P9-003 | P1 | Evaluate semantic retrieval, grounded answers/citations, classification and correction, entity/related-item links, duplicate detection, synthesis/summaries, recommendations, reminders, and MCP. Identify measurable reliability/provenance gaps separately from speculative AI features; map what content each flow sends to which provider. | P9-001, P9-002 | Reliability, user control, and provenance needs are prioritized separately from novel AI ideas; each AI recommendation states its data boundary and failure mode. | Trace prompts, services, and data flows; use existing synthetic tests/evidence only; send no real library content to providers. | NOT STARTED |
| P9-004 | P0 | Independently verify user data ownership and deletion/export paths, cloud permissions/consent, handling of sensitive content, vault and key lifecycle, authentication, encryption, backup exposure, public sharing, MCP scope, network binding, and cache/session behavior. Compare public product language with implementation and identify mitigations plus residual risk. | P8-003 | Claims match implementation or are corrected/recommended for correction; concrete safeguards are prioritized with severity, evidence, and limitations. | Security and data-flow review; document scope/limits and avoid exposing secrets or user data. | NOT STARTED |
| P9-005 | P1 | Assess database/API boundaries, ingest/job reliability, search/embedding operations, cache/offline approach, extension points, deployment choices, migrations, backup/restore, and upgrade/support burden. State current scale assumptions and identify bottlenecks only where evidence supports them; evaluate proposed architecture changes by their user and operator benefit. | P8-002 | Proposed changes have proportional benefit and include operational, compatibility, and maintenance costs; no rewrite is recommended without concrete evidence. | Architecture and migration review; inspect current configuration/docs and identify scale assumptions explicitly. | NOT STARTED |
| P9-006 | P2 | Compare relevant products (including Obsidian, Notion, Anytype, Capacities, Reflect, Readwise Reader, Mem.ai, and others if relevant) across selected user workflows: capture, organization, retrieval, privacy/control, portability, and setup. Use current sources and avoid treating feature checklists as proof of product quality. | P9-001 | Comparison identifies where Memex is differentiated, at parity, or has a meaningful gap; sources, access dates, and comparison limits are recorded. | Current web research, favoring primary product documentation for feature claims; cite claims in the review. | NOT STARTED |
| P9-007 | P1 | Consolidate findings into structured recommendations and a 1–2 year product opinion. Assign each item one of: essential gaps, UX improvements, opportunities, advanced AI, nice-to-haves, or should not add. Include required fields plus evidence strength, confidence, and whether more user validation is needed. | P9-001–P9-006 | Recommendations have unique IDs, problem, importance, proposed solution, user benefit, complexity, priority, dependencies, and risks/trade-offs; “should not add” is explicit; evidence and uncertainty are clear. | Completeness and evidence review against the Phase 9 deliverable and this roadmap's product principles. | NOT STARTED |

### Phase 10 — Future roadmap and selected enhancements

**Purpose:** turn Phase 9 findings into a practical sequence of work that a maintainer can estimate and deliver. Make the distinction between a recommendation, a committed next-release item, and authorized implementation explicit. No major feature, infrastructure change, deployment, or release is presumed approved by this planning phase.

**What will change:** score and group recommendations by user value, evidence/confidence, effort, risk, dependency, privacy/security impact, and ongoing operator burden; define a near-term release slice and later strategic work; describe sequencing and milestones; identify items that need user research or a separate design/architecture proposal; and, only where scope is explicitly authorized, select bounded low-risk refinements, implement them, update task/decision records, and verify their effects.

**Prioritization and tracking:** use a short written rationale rather than a falsely precise score. First filter for security/privacy blockers and prerequisite dependencies; then compare user impact and frequency, evidence/confidence, effort, maintenance cost, and strategic fit. Label each recommendation `next release`, `later`, `needs validation`, `separate project`, `deferred`, or `rejected`; include a target outcome, rough size, dependency/order, owner only if known, and a clear status (`proposed`, `approved`, `in progress`, `done`). Organize work into milestones such as readiness/blocker fixes, highest-value user improvements, and longer-term initiatives, adjusting these to Phase 9 evidence instead of committing to dates without capacity estimates. A roadmap status of approved does not by itself authorize implementation; record explicit authorization and scope for code changes.

**Phase acceptance:** recommendations are prioritized by user value, effort, architecture, maintenance, security, dependency and sequence; only small, low-risk in-scope improvements are implemented under approved scope; larger initiatives have proposals and are not silently started; completed/next-release/strategic work are separated. Each roadmap item has an observable outcome and a clear status, while deferred and rejected items include rationale.

| ID | Priority | Description and reason/outcome | Dependencies | Acceptance criteria | Verification | Status |
|---|---|---|---|---|---|---|
| P10-001 | P1 | Prioritize Phase 9 recommendations using user impact, evidence/confidence, urgency, effort, dependencies, architecture, privacy/security, compatibility, and recurring maintenance/operator cost. Define a feasible next-release slice, sequence prerequisites and milestones, and state what is deferred/rejected and why. | P9-007 | Roadmap communicates order and rationale, expected user outcome, rough effort/complexity, dependencies, risk, maintenance burden, and evidence for each selected initiative. Priorities fit the product principles and realistic project capacity. | Review ranking against Phase 9 evidence, self-hosting constraints, and product principles; check sequence for dependency conflicts. | NOT STARTED |
| P10-002 | P2 | Identify bounded refinements that can be completed without new infrastructure, broad schema changes, or disproportionate maintenance. For each, define exact scope, acceptance criteria, affected files/systems, privacy/accessibility considerations, rollback or recovery approach where relevant, and verification. Implement only after the user explicitly authorizes that specific work; otherwise leave it as a ready-to-start proposal. | P10-001, explicit authorization for implementation | No enhancement is treated as approved by inclusion on the roadmap. Authorized changes remain bounded, tracked, documented, and verified; out-of-scope dependencies trigger a revised proposal before work expands. | Appropriate acceptance/regression checks for the approved change, with commands/results and any remaining limits recorded. | NOT STARTED |
| P10-003 | P1 | Update the future roadmap and closeout report with completed work, recommended next-release items, strategic initiatives requiring separate projects, deferred/rejected ideas, open risks, assumptions, and suggested next decision. Cross-link recommendations to their Phase 9 evidence and phase/task IDs. | P10-001, P10-002 | Report clearly distinguishes completed, recommended, authorized/in-progress, deferred, and strategic work; no recommendation is represented as implemented or approved without evidence. | Roadmap cross-reference/completeness review and final project report. | NOT STARTED |

## 8. Dependencies and prerequisites

- Phase 0 plan approval is required before Phase 1 begins.
- Phase 1 identity decisions precede broad asset replacement and site/app brand integration.
- Phase 2 tokens/primitives precede large-scale screen work; foundational APIs and current route/data behavior should be preserved.
- Phase 3 shell precedes workflow restyling in Phases 4–5.
- Phase 6 audits require representative redesigned routes from Phases 3–5; cache/privacy work may identify a necessary remediation that must be documented before expanding scope.
- Phase 7 should use product and privacy language verified against implementation and product assets from the app.
- Phase 8 depends on the implementation phases and uses synthetic data, local fixtures, or provider mocks by default.
- Phase 9 competitor and standards claims are time-sensitive and must be researched when that phase starts.
- Any database migration must preserve existing data, include compatibility/recovery notes, and receive appropriate migration tests in its approved phase.
- External AI calls using the user's library, deployment, destructive data actions, publishing, or push/commit actions require explicit authorization; fixtures must remain synthetic.

## 9. Acceptance criteria by phase

Phase-level criteria are stated at each phase heading above. A phase is not DONE because code was written: all listed criteria must have evidence, required verification must be reported, and any exceptions must be documented. Update the progress tracker and decision/risk logs before reporting each phase boundary. Stop and wait for the user's next instruction at that boundary.

## 10. Testing and quality assurance requirements

- Do not add or run tests during Phase 0. During implementation, use the existing Vitest/typecheck/build/CI infrastructure where suitable; run tests/builds only in the authorized phase and report exact outcomes.
- Preserve and extend existing coverage rather than replacing tests with broad snapshots. Test privacy boundaries, failure states, data preservation, theme variants, responsive interactions, and all existing user-facing capabilities affected by a change.
- Use synthetic fixtures only. Never expose `.env` values, API keys, real library titles/content, or real user screenshots in reports/assets.
- Validate in a browser at desktop/tablet/mobile sizes when tooling is available; source-only inspection is not a substitute for rendered UI review.
- Check keyboard-only operation, accessible names/semantics, focus, contrast, reduced motion, empty/loading/error states, console errors, and long/worst-case data.
- Exercise production builds and upgrade/migration/restore compatibility before release readiness. Document provider/platform flows not run.
- Do not claim deployment or live-provider verification unless it was actually completed and observed.

## 11. Technical decisions and rationale

| Decision | Rationale | Status |
|---|---|---|
| Use the existing React/Vite/TypeScript, Express, PostgreSQL/pgvector and MCP architecture as the baseline. | It already supports current product breadth, tests, provider routing, migrations, and self-hosted operation; no source-based evidence currently justifies a rewrite. | Recommended for approval; revisit with evidence only. |
| Keep the current locally hosted font assets as the initial typography baseline. | Avoid unnecessary download/runtime dependencies and preserve known rendering; review in the design phase. | Recommended. |
| Select the Memory Ribbon after comparing it with Index Aperture and Linked Recall. | It best ties the user's preferred initial direction to capture, connected knowledge, and recall while remaining a simple, scalable vector mark. | DONE in Phase 1. |
| Retain React, Tailwind and the current theme mechanism; add semantic tokens and a small native-accessible primitive layer rather than a UI dependency. | Existing palette utilities, Lucide icons, and Sonner cover the base needs; a dependency would add migration and styling cost before a demonstrated gap. | Phase 2 decision. |
| Keep specialized page composition in feature phases; Phase 2 standardizes token roles and interaction patterns without wholesale screen migration. | Preserves distinct workflows and bounds regression risk. | Phase 2 decision. |
| Preserve dark, light and system theme behavior; refine the existing tokens rather than add a theme as a new feature. | Both palettes and preference handling already exist in `client/src/index.css` and `client/src/lib/theme.ts`. | Audit/refinement pending. |
| Do not add dependencies at Phase 0. | No concrete unmet capability has yet shown that a new dependency is worth its security, maintenance, and bundle cost. | Current decision. |
| Group the shell around Home, Discover, Library and Review, with every current route available on desktop and mobile. | Brings less visible graph and processing/review routes into the information architecture without removing existing access. | Phase 3 decision. |
| Expose global search and capture through shared app-level overlays; use `/` for search and `N` for capture outside editable controls. | Makes actions available on every authenticated route while avoiding browser-reserved Ctrl/Cmd+N and search shortcuts. | Phase 3 decision. |
| Do not persist API responses in the PWA cache. | The prior URL-keyed Workbox cache could retain authenticated library responses across sessions. The replacement precaches only the app shell, marks API responses private/no-store, and removes the legacy cache at startup and logout. | Implemented and verified in Phase 6; revisit during Phase 8 security review. |

**Decision log template:** date; decision; alternatives considered; rationale; compatibility/migration; risks; affected task IDs. Add an entry for every material design, architecture, data, security, or dependency choice.

## 12. Risks and identified issues

| ID | Risk / issue | Impact | Mitigation / follow-up | Status |
|---|---|---|---|---|
| R-001 | Broad screen redesign could regress or hide existing capabilities. | User workflow/data access loss. | Route/action inventory; phase acceptance checks; test existing workflows. | OPEN |
| R-002 | Scope is large and the product already has substantial breadth. | Incomplete redesign or feature sprawl. | Phase gates; finish all approved phase tasks; prioritize coherence over adding new features. | OPEN |
| R-003 | Source/docs can be stale or reflect unverified behavior. | Incorrect design or product claims. | Validate in browser and against implementation during the relevant phase; label hypotheses. | OPEN |
| R-004 | Dense views may remain awkward on phones despite header fixes. | Mobile tasks become inaccessible or frustrating. | Browser viewport sweep shows no page-level overflow; real content density and handset interaction still need follow-up. | MITIGATED |
| R-005 | API cache may persist user-specific or sensitive responses across offline/logout lifecycle. | Privacy exposure on a shared device. | Removed API runtime caching; added private/no-store API responses and legacy-cache cleanup on startup/logout. Recheck in Phase 8. | CLOSED |
| R-006 | AI provider behavior, model availability, and provider policies change over time. | Broken onboarding/retrieval or inaccurate claims. | Keep provider checks explicit; research current docs; report live checks separately from mocks. | OPEN |
| R-007 | Local AI and optional Python tools can be resource-intensive/unavailable. | Poor setup experience and laptop/resource impact. | Keep local/cloud options truthful; surface status, resource expectations, optional tool fallback. | OPEN |
| R-008 | Visual polish may mask content hierarchy or accessibility gaps. | App looks premium but remains hard to use. | Accessibility, content density, and workflow checks at each phase. | OPEN |
| R-009 | Schema/API changes can complicate restore and upgrades for self-hosters. | Data loss or failed upgrades. | Avoid unnecessary schema changes; provide forward/backward compatibility and disposable DB rehearsal. | OPEN |
| R-010 | Public screenshots or examples could accidentally reveal personal data. | Privacy breach in public repository/site. | Synthetic fixtures only and explicit content review before publishing assets. | OPEN |
| R-011 | Landing page privacy/security claims can exceed actual safeguards. | Trust and legal/reputation risk. | Map every claim to code/docs; describe heuristic limits plainly. | OPEN |
| R-012 | PWA offline behavior can imply stronger availability/privacy than implemented. | Misleading expectations or stale content. | README now limits offline support to the app shell and requires an instance connection for library data/actions. Installed-device offline testing remains for release QA. | MITIGATED |

## 13. Progress tracker

- **Current milestone:** 2 — Application redesign.
- **Current phase:** Phase 6 — Responsive, accessibility, interaction and PWA polish (complete).
- **Last completed phase:** Phase 6.
- **Active tasks:** none. P0-001–P0-005, P1-001–P1-004, P2-001–P2-004, P3-001–P3-004, P4-001–P4-005, P5-001–P5-005, and P6-001–P6-004 are DONE.
- **Blockers:** none. Handset/screen-reader testing, data-heavy visual stress cases, and installed-device offline verification remain documented release-QA limits.
- **Next recommended action:** finish Phase 8 (keyboard order and reduced motion inside the app, tap targets in dense tables, retry or confirm the Docker build in CI, final release summary), then request review before Phase 9.
- **Last updated:** 2026-11-19.

## 14. Completed work

- Reviewed root documentation and task backlog, client routes and representative shell/theme files, server route/service organization, shared types, database schema/migrations, MCP tools, manifests, PWA config, Docker config, CI workflow, and site assets/metadata.
- Mapped existing product capabilities and marked source-only UX judgments as findings to verify rather than claims from live usability testing.
- Recorded recommended product position, visual direction, technical baseline, dependencies, risks, phase gates, and QA requirements.
- Created `TASKS_CODEX.md` without modifying application source, styles, existing branding, or `TASKS.md`.
- Phase 1 completed: compared Memory Ribbon, Index Aperture, and Linked Recall; selected and documented Memory Ribbon; created vector identity variants and generated app/PWA/social image exports; integrated the mark in the app shell, login, onboarding, shared-item header, site, favicon metadata, PWA manifest, and README.
- Added `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, `brand/README.md`, and a reproducible `brand/generate-assets.ps1` raster/export script.
- Client verification passed: 921/921 tests, TypeScript check, and Vite production build. All 33 checked SVG copies parse as XML; generated web manifest and icon files are present in `client/dist`.
- Phase 2 audit found the app already had theme-aware semantic colors and font families, but lacked one documented scale for spacing, type, radii, elevation, focus, and motion, plus a shared accessible primitive layer. No new UI dependency was justified.
- Added foundation tokens and guidance for both application and public site, global focus/reduced-motion conventions, shared primitives (`Button`, `TextField`, `SearchField`, `Card`, `Badge`, `Tabs`, `EmptyState`, `LoadingState`), and updated `.impeccable/design.json`.
- Phase 2 verification passed: client suite 926/926, TypeScript check, and production build. Added five primitive behavior tests. Theme preference tests cover system/light/dark and the browser theme-color; source review confirmed the graph uses its resolved-theme palettes and the site supports system preference plus explicit override.
- Phase 3 grouped every current navigation destination into Home, Discover, Library, and Review; added mobile quick navigation with a keyboard-dismissable full route menu, nested category access, popular-tag search actions, and a pinned desktop capture action.
- Promoted search and capture to authenticated app-wide actions, preserved PWA share-target prefill, and moved shortcuts to `/` (search) and `N` (capture) outside editable fields to avoid browser-reserved key combinations.
- Refined header account keyboard/focus behavior, compact search/capture entry points, explicit local Ollama/network state, accessible enrichment progress, and a direct AI settings path.
- Phase 3 verification: full client suite 931/931, TypeScript check, production build; the latest focused AppHeader suite passed 12/12. Browser screenshots could not be captured due to the known headless GPU initialization failure; responsive classes, route behavior, keyboard interactions, and focus behavior were covered through source and tests.
- Phase 4 reordered the dashboard around capture/search and the library overview, added direct Ask and Weekly Digest actions, and made dashboard partial failures distinct from empty data with retry paths. Insights remain optional summaries; reminders and rediscovery retain clear empty/failed behavior and item links where records exist.
- Phase 4 preserved all capture modes, improved authenticated manual-text requests and capture tab semantics, refreshed the dashboard after bulk imports, removed a Keep-import full-page reload, and corrected Whisper data-flow wording. Existing file/voice health checks and duplicate previews remain in place; optional Python/provider services were not available for live integration smoke tests.
- Phase 4 improved global search with type filtering, richer result context, stale-response protection, clear keyword fallback and retryable errors. Ask now submits suggested prompts directly, exposes every returned source as a link, handles empty/error states, supports retry, and clearly states that chat history is not saved.
- Phase 4 verification passed: all 933 client tests, TypeScript `--noEmit`, and Vite production build. Build reports the existing >500 kB main-chunk advisory; Vite also prints existing config/esbuild deprecation warnings. No API/schema changes were made.
- Phase 5 reviewed and refined the remaining category, item detail/edit/history, tags, public share, table, pending/enriched/category review, Places, Media & Books, graph, digest, reminders, trash, vault, settings, login, and onboarding flows. Existing actions and specialized layouts remain accounted for; loading, error/retry, empty, responsive, and accessible-name handling was strengthened across the reviewed routes.
- Phase 5 fixed two data-filter gaps: the table's Reviewed filter now reaches the server query, and Trash explicitly requests deleted records. Public share creation now communicates its existing seven-day expiry. Settings distinguish loading/failure from loaded configuration and pause controls until saved values arrive; onboarding, login, and vault copy was corrected to match actual data/privacy behavior.
- Phase 5 verification passed: full repository tests (server 1,801 passed/17 skipped; client 936 passed; MCP 32 passed), client and server TypeScript checks, and the Vite production build. The build retains the existing >500 kB main-chunk and Vite config/esbuild deprecation advisories. Tests use mocks/fixtures; no live database/provider integration was exercised.
- Phase 6 improved mobile safe-area handling, dynamic viewport sizing, hover capability gating, touch-control sizing, reduced-motion handling, skip navigation, and muted text contrast; browser emulation confirmed 16px touch inputs, visible keyboard skip link, and reduced animation duration.
- Phase 6 removed Workbox API response caching, purges the legacy `api-cache` at startup and logout, and marks API responses `private, no-store`. Browser cache seeding/reload confirmed the legacy cache was deleted. Reminder notifications now require an explicit dashboard opt-in.
- Phase 6 headless Chrome swept 14 routes at 360, 390, 768, and 1280 CSS px with no document-level horizontal overflow. API-backed routes used an authenticated synthetic session without a configured backend; vault/item detail and real content-density cases could not be fully exercised. Physical handset and screen-reader validation remain outstanding.
- Phase 6 verification passed: server tests 1,802 passed/17 skipped; client tests 941 passed; MCP tests 32 passed; client and server TypeScript checks; Vite production build. The generated manifest/share target/icons and app-shell-only service worker were inspected. Existing >500 kB bundle and Vite/esbuild advisory warnings remain.
- Logo replaced (post Phase 6): the user supplied dark and light raster logos, which replaced the vector Memory Ribbon family. `brand/generate-assets.py` (pillow/numpy/scipy) replaces `generate-assets.ps1` and rebuilds lockups, marks, icons, favicon, PWA/touch icons and the social preview from `brand/source/`. `brand/README.md` and `DESIGN.md` were updated; the old SVGs and concept sketches were deleted.

## 15. Deferred and outstanding work

- Phase 6 is complete. The browser sweep used headless Chrome with DevTools viewport emulation and a synthetic authenticated session; no physical handset, screen reader, axe scan, large real-library dataset, or installed-PWA offline transaction was available. Optional MarkItDown/Whisper/vision runtime availability was not exercised against a live configured server.
- No browser-run product audit or screen-by-screen visual verification was performed in Phase 0.
- No tests/builds were run in Phase 0.
- No external competitor research was performed; do it in Phase 9 when current comparisons are needed.
- The browser-generated screenshots of app/site integration could not be captured: Chrome and Edge headless both failed during GPU initialization. The logo raster exports were inspected directly; UI integration was checked by tests, source, and build.
- Identity and design foundation are complete. Broader screen redesign, security review/remediation, new capabilities, and deployment remain outstanding and gated by their phases.
- Confirm whether referenced screenshot assets exist and whether any current deployment details have changed before using them as evidence.
- The supplied logo is raster only: there is no vector or monochrome version, so Phase 1's monochrome/vector acceptance items (P1-003) are not met until one is supplied. The mark is wider than tall and sits on a square canvas, so it renders about 25% shorter than the old square mark at the same size.
- The section 6 milestone table still shows Phases 1-3 as NOT STARTED and Phase 6 as IN PROGRESS; section 13 and the completed-work log are authoritative.

## 16. Product improvement recommendations (initial hypotheses)

These are candidates for investigation, not commitments to implement. Phase 9 must re-evaluate them after the redesign and current research.

| ID | Problem or opportunity | Why it matters | Proposed solution | Expected user benefit | Complexity | Priority | Dependencies | Risks / trade-offs | Status |
|---|---|---|---|---|---|---|---|---|---|
| REC-001 | Navigation and feature discovery may be difficult as the number of screens grows. | Valuable functions can be effectively absent when users cannot find them. | Group by capture/library/discover/review/settings; selectively expose contextual links and shortcuts. | Faster orientation and access without removing capability. | Medium | P1 | Phase 3 route/action audit | Over-grouping may hide less frequent but important tools. | Investigate in Phase 3/9 |
| REC-002 | Phone use of dense table/library/graph workflows is uncertain. | Capture and retrieval should work away from desktop. | Audit real workflows on phone; create compact alternatives where needed. | Practical mobile use instead of merely fitting the viewport. | Medium | P1 | Phase 6 browser audit | Separate mobile UI can create maintenance divergence. | Investigate in Phase 6 |
| REC-003 | API response caching and logout/session lifecycle need a privacy-focused review. | Self-hosted personal libraries can contain sensitive material on shared devices. | Determine cached response scope and headers; exclude sensitive/authenticated API data or purge it at safe session boundaries if findings require. | More predictable local data exposure. | Medium | Phase 6/8/9 | Cache changes can reduce offline utility; behavior must be tested. | Investigate; no confirmed vulnerability |
| REC-004 | Search, Ask, and natural-language filters may feel like separate tools. | Retrieval is Memex's central promise. | Clarify when to use each; unify entry points/results and keep source, filter, and fallback context visible. | More reliable discovery with fewer dead ends. | Medium | Phase 4 | A shared UI can blur distinct query semantics. | Investigate in Phase 4/9 |
| REC-005 | First-run setup has multiple optional provider/tool dependencies. | Users need to know the product works before trusting it with their library. | Provide progressive setup, provider verification, optional-tool explanations, and recoverable next steps. | Lower setup failure and clearer local/cloud choice. | Medium | Phases 4/5 | Too much guidance can overwhelm experienced self-hosters. | Investigate in Phase 5/9 |
| REC-006 | AI output quality and confidence require user trust and correction paths. | Misclassification can degrade a library silently. | Retain review/provenance; evaluate correction feedback and retrieval citations before adding more AI automation. | Better control and understandable AI behavior. | Medium–High | Phase 9 evidence | Feedback capture could collect sensitive content or add friction. | Investigate in Phase 9 |
| REC-007 | Ingestion breadth can create unclear partial-failure states. | Users need to know whether a capture is saved, pending, or lost. | Audit job lifecycle, retries/cancellation, and format-specific availability states. | Fewer duplicate captures and less uncertainty. | Medium | Phase 4/8 | More persistent job state can add operational complexity. | Investigate in Phase 4/9 |
| REC-008 | Import paths from other knowledge tools and cross-device flows may be limited. | Migration and adoption depend on a safe path into/out of Memex. | Inventory current exports/imports and investigate high-value formats/integration only with evidence. | Lower switching cost and better data portability. | Medium–High | Phase 9 | Provider/API maintenance and schema mapping burden. | Research in Phase 9 |

**Likely “do not add” candidates pending Phase 9:** a social network or public-by-default sharing layer; always-on cloud sync/AI that weakens local-first control; arbitrary AI-generated dashboards without evidence of usefulness; broad integration catalog before a stable API/use case; gamification or engagement notifications that create noise; user metrics/testimonials unsupported by evidence. Revisit only with a compelling, user-led rationale.

## 17. Future roadmap

Phase 10 will turn validated Phase 9 recommendations into a sequenced roadmap. The initial hypothesis is to prioritize (1) a clear, dependable capture-to-retrieval loop; (2) privacy/cache/session safeguards and transparent AI boundaries; (3) mobile and accessibility quality; and (4) high-value portability/integrations only when user evidence and maintenance economics justify them. No large new capability is pre-approved. Each selected initiative must state value, effort, architecture, maintenance, security, dependencies, and sequence.

### Phase completion report template

At each phase boundary, update this file and report: phase completed; tasks completed; created/modified files; dependencies changed; technical decisions; tests/builds and results; remaining issues; outstanding tasks; next recommended phase. Stop for the user's instruction before entering the next phase.
