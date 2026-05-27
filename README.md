# Memex — Personal Knowledge OS

Memex is a local-first, AI-powered knowledge management system that organizes your notes, recipes, media, and secrets into a beautiful, searchable second brain. It uses local AI to automatically classify and link your data, ensuring total privacy.

## ✨ Key Features

- **Local AI Ingestion**: Automatically classifies links (YouTube, Instagram, Web), recipes, books, and notes using Ollama.
- **Hybrid Search**: Combines semantic similarity (meanings) with traditional keyword search for perfect recall.
- **Semantic Intelligence Map**: Interactive 2D visualization of your knowledge clusters.
- **Google Keep Import**: Import your entire Google Keep history with background AI classification.
- **Encrypted Vault**: Client-side AES-256-GCM encryption for passwords and secrets. Master password never leaves your browser.
- **Rich Editor**: Premium editing experience powered by Tiptap (Markdown support, tasks, code blocks).
- **Versioning & Recovery**: Automated item history and a dedicated Trash bin for safe recovery.
- **PWA Ready**: Install as a standalone app on desktop or mobile with offline read support.

## 🛠️ Tech Stack

- **Frontend**: React, Vite, TypeScript, Tailwind CSS, Zustand, Framer Motion, Tiptap.
- **Backend**: Node.js, Express, TypeScript.
- **Database**: PostgreSQL with `pgvector` for vector storage.
- **AI**: [Ollama](https://ollama.com/) (local) using `llama3.2` and `nomic-embed-text`.

## 🚀 Quick Start

### 1. Requirements
- **Docker**: For the PostgreSQL database.
- **Ollama**: Installed natively on your machine (for GPU acceleration).
- **Node.js**: v18 or later.

### 2. Prepare AI Models
Pull the required models in your terminal:
```bash
ollama pull llama3.2
ollama pull nomic-embed-text
```

### 3. Start Database
```bash
docker-compose up -d
```

### 4. Setup Environment
```bash
cp .env.example .env
# Edit .env and set a random JWT_SECRET
```

### 5. Install & Migrate
```bash
# In /server
npm install
npm run migrate

# In /client
npm install
```

### 6. Run Development
Run these in separate terminals:
```bash
# Backend
cd server && npm run dev

# Frontend
cd client && npm run dev
```
Open **http://localhost:5175** to enter your workspace.

## 🔐 Security & Privacy
Memex is designed to be **fully local**.
- **No Cloud Required**: All AI processing happens on your machine via Ollama.
- **Zero-Knowledge Vault**: Your vault data is encrypted in your browser using the Web Crypto API. The server only sees encrypted blobs and salts.
- **Database Privacy**: Your data stays in your local Docker volume.

## ⌨️ Keyboard Shortcuts
- `⌘K` or `Ctrl+K`: Global Search
- `⌘N` or `Ctrl+N`: Quick Ingest
- `?`: Show all shortcuts

---
*Built for the private, intelligent future of personal knowledge.*
