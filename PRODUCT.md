# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Working hypothesis: privacy-conscious individuals and self-hosters who save useful material across formats and want to retrieve and use it later. Researchers and knowledge workers are likely adjacent audiences; validate this rather than treating it as confirmed segmentation.

## Product Purpose

Memex is a self-hosted personal knowledge workspace. It captures notes, links, files, media, places, and other saved information; helps organize it with AI; and makes it searchable, connected, and useful over time.

Success means a person can quickly save something, understand how it was organized, find it again with search or an answer grounded in their library, and retain control over where their information is stored and processed.

## Positioning

Memex combines personal capture, AI-assisted organization, semantic retrieval, connected knowledge, local-first operation, and scoped MCP access in a self-hosted product the user controls.

## Operating Context

Memex runs as a self-hosted web application backed by PostgreSQL and pgvector. Local Ollama AI is supported; cloud AI providers are optional and depend on the user's provider, key, and consent settings. People may use it from desktop or mobile browsers and can install the PWA. The library may include sensitive personal material.

## Capabilities and Constraints

- Existing workflows include text, URL, file, image, voice, Google Keep, and bookmarklet capture; classification and structured extraction; categories and tags; full-text and semantic search; Ask with source items; reminders, rediscovery, and a weekly digest; specialized library views; sharing; export/backup/restore; an encrypted browser-side vault; and scoped MCP tools.
- Existing local/cloud AI privacy boundaries, vault behavior, self-hosting, open-source status, and data integrity must be preserved and accurately described.
- Optional local services and external AI providers may be unavailable. The product should communicate their availability and the processing consequences clearly.
- The primary user segment and the long-term scope of “Personal Knowledge OS” remain open for later product validation.

## Brand Commitments

- Product name: Memex.
- Positioning: Personal Knowledge OS.
- Desired personality: intelligent, premium, minimal, thoughtful, trustworthy, calm, modern, and professionally engineered.
- The user prefers that the initial logo exploration include a continuous folded Memory Ribbon forming an abstract M. This is a starting concept, not a requirement to select it.
- Identity should work across the application, login, public site, PWA, and documentation. Prefer clean hand-crafted vector marks.

## Evidence on Hand

- Repository source, documentation, existing application flows, and the public site are available for product-claim checks.
- No approved customer testimonials, user counts, performance statistics, security certifications, or real user-content screenshots are supplied. Do not invent or imply them.
- Existing theme/font assets and implementation are in `client/src/index.css`, `client/src/lib/theme.ts`, `site/style.css`, and `site/fonts/`.

## Product Principles

- Keep user information under the user's control.
- Make capture and retrieval direct and dependable.
- Make AI assistance transparent, grounded, and correctable.
- Preserve existing information and workflows as the product evolves.
- Add complexity only when it delivers clear user value.
