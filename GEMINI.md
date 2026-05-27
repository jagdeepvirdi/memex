# GEMINI.md — Memex (Personal Knowledge OS)

## Project Context
Memex is a local-first personal knowledge management system. It uses local AI (Ollama) to classify and organize notes, recipes, media, and more. 

### Core Tech Stack
- **Frontend:** React, Vite, TS, Tailwind, Zustand, Framer Motion, Sonner.
- **Backend:** Node.js, Express, TS.
- **Database:** PostgreSQL + pgvector.
- **AI:** Ollama (local) - `llama3.2`, `nomic-embed-text`.
- **Security:** Web Crypto API (AES-256-GCM) for client-side vault encryption.

## Development Workflow
This project was co-developed using both **Claude** and **Gemini**. 

### Strategic Guidelines
1. **Local AI First:** Always prioritize Ollama for AI tasks unless explicitly directed to use Claude API.
2. **Security:** Never compromise the client-side encryption logic for the vault. Master passwords must never reach the server.
3. **Surgical Edits:** When modifying files, preserve existing logic and style.
4. **Validation:** Always verify changes with tests or by running the local dev environment if possible.

## Project Status: COMPLETED ✅
Memex is now fully implemented and ready for daily use.

### Final Features List
- **AI Classification**: Auto-organization of notes, recipes, media, stocks, and specs.
- **Multi-Source Ingestion**: URL scraping (Jina), YouTube transcripts, Instagram captions, Google Keep ZIP import, and Manual entry.
- **Hybrid Search**: Semantic vector search (pgvector) combined with traditional keyword search.
- **Secure Vault**: End-to-end encrypted password and secret storage.
- **Interactive UI**: Dashboard with stats, collapsible category tree, tag cloud, and inline editing.
- **PWA support**: Installable on desktop and mobile with offline capabilities.
- **Global Search**: Command+K shortcut for instant access to any information.

### Deployment Info
- **Database**: Docker-managed PostgreSQL on port `5436`.
- **AI**: Native Ollama service on port `11434`.
- **Backend**: Port `3002`.
- **Frontend**: Port `5175`.

---
*Mission Accomplished: Your second brain is now online.*
