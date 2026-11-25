![Memex — Personal Knowledge OS](brand/memex-lockup-dark.png)

# Memex — Personal Knowledge OS

A self-hosted knowledge management app that ingests, auto-classifies, and organizes everything you save — notes, recipes, movies, books, places, links, files, voice memos, and more. Runs on your machine with local AI (Ollama) by default. Gemini, OpenAI, Claude or Groq are optional and used only with your key, your choice and your consent.

Project site: https://memex.jagdeepsinghvirdi.com · Latest release: [v1.2.0](https://github.com/jagdeepvirdi/memex/releases/tag/v1.2.0)

## Try it in two minutes

You need [Docker Desktop](https://www.docker.com/products/docker-desktop/) and nothing else.

```bash
git clone https://github.com/jagdeepvirdi/memex.git && cd memex
cp .env.example .env        # open it and set JWT_SECRET (the command that makes one is in the file)
docker compose up -d        # Postgres + the app; the first build takes a few minutes
```

Open [http://localhost:3002](http://localhost:3002), create your account (10+ characters), and on the first screen pick local AI or a cloud key. Then **Settings > Library > Load sample data** gives you about forty made-up items to look around in, and one click removes them again. No AI is needed for that.

Everything is reachable from this computer only by default. More detail, local AI and cloud-only setups are under [Quick Start](#quick-start).

![The Memex dashboard (dark theme, built-in sample data)](site/img/app-dashboard.webp)

![Settings > Keys & Privacy: cloud AI is off until you add a key and consent](site/img/app-privacy.webp)

*Both screenshots use the built-in sample data on a fresh install, never a real library. Memex also has a light theme (Settings > Appearance).*

---

## What it does

- **Import from Google Keep** — upload a Takeout ZIP; every note saves instantly and is classified in the background with a live sidebar ETA
- **Import Markdown / Obsidian notes** — Add > Markdown takes a zipped folder of `.md` files (or one file), previews what will be saved or skipped, keeps titles, front matter, tags and dates, and classifies in the background (see [Importing Markdown notes](#importing-markdown-notes-obsidian-or-any-folder-of-md-files))
- **Ingest anything** — URLs, YouTube videos, Instagram posts, PDFs, Word docs, PowerPoint, images (vision AI), voice memos (Whisper), plain text
- **Auto-classify with local AI** — Ollama tags, categorizes, and extracts structured data from each item (confidence-scored, multi-entity detection)
- **Ask your knowledge** — RAG-powered chat: ask questions, get cited answers from your own notes
- **Natural language filters** — type "Thai restaurants I haven't visited" in Table View; Ollama converts it to a structured query
- **Weekly digest** — every Monday, a newspaper-style summary of what you saved, an "on this day" memory, and an AI-generated cross-domain connection
- **Browse by type** — dedicated views for movies/books (ratings, watch status), places/restaurants (Maps links), and a dense table view for bulk review
- **Entity graph** — directors, authors, and cities are extracted as relational entities; query connections across all your notes
- **Rediscovery** — "On this day" and forgotten-item widgets surface things you've saved and forgotten
- **Actionable insights** — AI scans recent notes and surfaces events, habits, and suggestions on the dashboard
- **Reminders** — attach a date to any item; opt in from the dashboard to receive browser notifications when reminders are due
- **Sharing** — generate a public link for any item (expires in 7 days by default); revokable at any time
- **Obsidian export** — download your entire library as a ZIP of Markdown files with YAML frontmatter
- **Bookmarklet** — one-click "Save to Memex" from any browser page; warns if a duplicate already exists
- **AI assistants (MCP)** — let Claude Desktop, Cursor and other MCP apps search, read and save your notes, with a key that can do nothing else and never sees private items
- **Category Review** — two-tab staging area: review low-confidence items before accepting them, and remap rogue AI-generated categories to the canonical tree
- **Password vault** — AES-256-GCM client-side encryption; master password never leaves the browser
- **Move to Vault** — one-click encryption of sensitive plain-text notes
- **Data provenance** — every AI extraction is logged; roll back or apply any past extraction to an item
- **Light and dark themes** — "Midnight" and "Daylight" with an iris accent; follows your system, or pick System / Light / Dark in Settings > Appearance
- **Search and capture anywhere** — press `/` to search and `N` to capture from any page; the sidebar groups Home, Discover, Library and Review, with a quick-nav on phones
- **Sample data** — about forty made-up items to look around in, removed again with one click
- **PWA** — installable with an offline app shell and share-target support, plus **Save for later**: links and notes kept on the phone while your computer is off and sent by themselves when it answers (see the [phone guide](#using-memex-from-your-phone-or-another-computer)); API responses are never cached (and the old cache is deleted on logout), so viewing and changing library data requires a connection to your Memex instance

**Monthly cost: $0 with local AI.** Cloud providers are optional and billed by them, not by Memex.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React + Vite + TypeScript |
| Styling | Tailwind CSS |
| Animation | framer-motion |
| PWA | vite-plugin-pwa + Workbox |
| State | Zustand |
| Backend | Node.js + Express (TypeScript) |
| Database | PostgreSQL + pgvector (Docker) |
| Logging | pino (structured, silent in tests) |
| AI — chat | Ollama (`llama3.2` or `gemma3:4b`) |
| AI — embeddings | Ollama (`nomic-embed-text`, default) or Gemini / OpenAI (cloud, opt-in) |
| AI — vision | Ollama vision model (auto-detected: `llama3.2-vision` → `llava`) |
| AI — optional cloud | Gemini, OpenAI, Claude, Groq (opt-in: a key, a provider choice and cloud consent; blocked by Strict Local Mode) |
| File ingestion | MarkItDown (Python, optional) |
| Voice transcription | OpenAI Whisper CLI (Python, optional) |
| Auth | bcrypt + JWT + express-rate-limit |

---

## Quick Start

Memex stores everything in Postgres on your machine. The AI can be **local** (Ollama: nothing leaves your computer) or **cloud** (Gemini, OpenAI, Claude or Groq: only with your key and consent), or a mix. You choose on the first screen after creating your account.

### Option 1: Docker, one command (recommended)

You need [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine with the compose plugin). Nothing else.

```bash
cp .env.example .env       # then set JWT_SECRET in .env (the command that generates one is in the file)
docker compose up -d       # Postgres + the app; the first run builds the image (a few minutes)
```

Open [http://localhost:3002](http://localhost:3002), create your account, and follow the AI setup screen.

- **Migrations apply by themselves** when the app starts (`MEMEX_AUTO_MIGRATE=true` in the image). If one fails it is rolled back and the app refuses to start, with the reason in `docker compose logs app`.
- **A weak `JWT_SECRET` is refused.** The same secret signs your login and encrypts the API keys you save, so the app will not start with an example value or one shorter than 32 characters. Compose itself stops, with a message, if `JWT_SECRET` is missing.
- **Local AI**: install [Ollama](https://ollama.com/download) natively and run `ollama pull llama3.2` and `ollama pull nomic-embed-text`; the container reaches it at `host.docker.internal`. Prefer everything in Docker? `docker compose --profile ollama up -d`, set `OLLAMA_URL_DOCKER=http://ollama:11434` in `.env`, then `docker compose exec ollama ollama pull llama3.2` (CPU only unless you add GPU passthrough).
- **Cloud-only**: skip Ollama entirely (see "Path B" below).
- **Stop / start**: `docker compose down` keeps your data (the `pg_data` volume); `docker compose up -d` brings it back. `docker compose down -v` deletes the data.
- **Check it**: `http://localhost:3002/api/health` (alive?) and `http://localhost:3002/api/health/status` (database, pending migrations, Ollama).
- **The build fails with `UNABLE_TO_VERIFY_LEAF_SIGNATURE` or npm's `Exit handler never called!`**: something on your network (often antivirus "HTTPS scanning" or a company proxy) re-signs HTTPS and the build container does not trust it. Turn that scanning off for Docker, or drop its root certificate into `certs/` and run `docker compose up -d --build`. [certs/README.md](certs/README.md) has the steps.

**What works with the Docker install, and what needs more**

| Capture or feature | Docker one-command install | What it needs |
|---|---|---|
| Text, links, YouTube, Google Keep ZIP, bulk paste, bookmarklet, share target | works | nothing extra (classification needs local Ollama or a cloud key) |
| Photos and screenshots | works with a vision model | native Ollama with `ollama pull llama3.2-vision:11b` (or `llava:7b`) |
| PDF, Word, PowerPoint, Excel, CSV, EPUB uploads | **not in the image** | MarkItDown (Python 3.10+): run Memex from source (Option 2) and `pip install 'markitdown[all]'` |
| Voice memos and audio files | **not in the image** | Whisper (Python): run from source and `pip install openai-whisper` |
| Search and Ask | works | an embedding model: Ollama `nomic-embed-text`, or a Gemini/OpenAI key |

The upload and voice routes answer with a clear "not installed" message instead of failing silently. Adding these tools to the Docker image is possible but not provided.

### Option 2: from source (development)

You need Node.js 22+, npm 10+ and Docker (for Postgres).

```bash
cp .env.example .env              # the file lives at the PROJECT ROOT; set JWT_SECRET
docker compose up -d postgres     # Postgres + pgvector on host port 5436 (just the database)
npm run install:all
npm run db:migrate                # creates the tables (safe to run again)
npm run dev                       # client on http://localhost:5175, server on http://localhost:3002
```

`npm run dev` does **not** migrate for you; the lifecycle scripts below (`memex.sh` / `memex.ps1`) do, on every start. Use `docker compose up -d postgres`, not a bare `docker compose up -d`, in development: the bare command would also start the app container on the same port as your dev server.

If something is wrong at startup, Memex says what and how to fix it instead of failing later:

| You see | Meaning | Do |
|---|---|---|
| `Cannot reach the database at ...` | Postgres is not running or `DATABASE_URL` is wrong | `docker compose up -d postgres`; check the port (5436) in `.env` |
| `Memex will not start with a weak secret` | `JWT_SECRET` (or `KEY_ENCRYPTION_SECRET`) is missing, an example value, or too short | generate one with the command in `.env.example` |
| `N database migration(s) are pending` (a warning) | you pulled new code but have not migrated | `npm run db:migrate` |
| `A database migration failed, so Memex will not start` | a migration was rolled back | read the message; restore your backup if needed |

### Path A: local AI (default)

```bash
ollama pull llama3.2
ollama pull nomic-embed-text
```

That is all: Memex uses Ollama for classification, answers and embeddings out of the box. Optional extras are at the end of this section.

On the first-run screen choose **On my computer (Ollama)**.

### Path B: cloud-only (no Ollama)

You do not need Ollama, and you can create your account without it. The first-run screen (**In the cloud**) does the steps below for you, in the right order: it saves your key, asks for your consent, tests the connection, then switches search to the cloud. To do it by hand later, **use this order**, in the app:

1. **Settings → Keys & Privacy**: paste an API key (for example Gemini from [aistudio.google.com](https://aistudio.google.com)). Keys are stored encrypted and never shown again.
2. **Settings → AI → Provider & model**: choose that provider and turn on **Allow cloud AI** (your consent).
3. **Settings → AI → Search & embeddings**: choose **Gemini (cloud)** (or OpenAI), press **Review change**, then **Switch**. Claude and Groq can answer questions but have no embeddings API, so use Gemini or OpenAI here.
4. Now save a note, search, and use **Ask**.

> **Do step 3 before you save anything.** Embeddings default to Ollama, and saving a note embeds it right away. Until you switch, saving fails with "Failed to classify text" even though your answers already come from the cloud.

What to expect:

- **Privacy still holds.** Items in the *Passwords* or *Personal* categories, items tagged `private`, `no-cloud` or `local-only`, and vault items are never sent to a cloud provider (they are skipped, and search finds them by keyword). **Strict Local Mode** blocks every cloud call; semantic search then falls back to keywords and says so.
- **You see the cost before anything is sent.** "Review change" shows how many items will be embedded and roughly how many tokens (a few hundred notes is tens of thousands of tokens). Nothing is sent until you confirm.
- **Images, voice and file conversion are separate.** Image understanding still needs an Ollama vision model; voice (Whisper) and file conversion (MarkItDown) are local Python tools, independent of which AI you choose.
- **Tested how:** verified end to end on a fresh database with Ollama unreachable, using Gemini (account, classification, embeddings, search, Ask; a note tagged `private` was never embedded). OpenAI embeddings and Claude, OpenAI and Groq chat are implemented and unit-tested but have not yet been run against the live APIs.

### Local or cloud: what runs where

| | Local (Ollama) | Cloud (opt-in) |
|---|---|---|
| Classification, answers, digest, insights | `llama3.2` / `gemma3:4b` | Gemini, OpenAI, Claude or Groq |
| Embeddings (search, Ask, related items) | `nomic-embed-text` | Gemini or OpenAI |
| Needs a key and consent | no | yes |
| Private items (see above) | always handled here | never sent |
| Image understanding | Ollama vision model | not available |

You can choose a provider per task (Settings → AI → Advanced), for example Gemini for **Ask** and Ollama for everything else.

### Privacy model

- **Your notes live in your own Postgres.** No account with us, no telemetry.
- **Local AI by default.** With Ollama nothing is sent anywhere. A cloud AI (Gemini, OpenAI, Claude, Groq) is used only after you add a key, choose it, and turn on cloud consent, and never in Strict Local Mode.
- **A guard sits in front of every cloud call.** These never leave your machine: vault and password items, anything filed under Passwords or Personal, anything tagged `private`, `no-cloud` or `local-only`, and text that looks like account details (card or account numbers, CVV, Aadhaar, "PIN: ...", a home address). It is a heuristic, not a promise: if something must never leave, tag it `private` or put it in the vault.
- **You can see what happened.** Each item shows which AI classified it ("Classified by Gemini" or "Classified locally") and, when it never goes to the cloud, why. "Re-classify" lets you redo one item with a different AI; if that choice is not allowed (no key, a private item) it says why instead of quietly using another model.
- **The vault is encrypted in your browser.** The server stores ciphertext only; the master password cannot be recovered.
- **Reachable from this computer only** by default (the server and Docker bind to `127.0.0.1`). See [SECURITY.md](SECURITY.md) for what is and is not protected, and how to report a problem.

### Changing the embedding model later

Search, Ask and related items can only compare vectors made by the **same** model, so changing the model means re-embedding your library. In **Settings → AI → Search & embeddings**:

1. **Review change** shows what would happen and sends nothing.
2. **Switch and re-embed** switches and starts a background job you can cancel; it resumes where it left off.
3. Old vectors are kept, so switching back is instant. Until the job finishes, items without a vector from the new model are found by keyword.

Each model has its own similarity thresholds (what counts as a duplicate, or a related note in the graph). Gemini's start as estimates; tune them to your library with `server/src/scripts/calibrateEmbedding.ts` (see the comments at the top of the file). Switching models saves the reference it needs automatically.

### Optional extras

**File ingestion (MarkItDown)** — PDF, Word, PowerPoint, Excel, CSV and image uploads:

```bash
pip install 'markitdown[all]'
```

Restart the server. **Settings → Library** shows the status.

**Voice transcription (Whisper)** — in-browser recording and audio upload (MP3/WAV/M4A/OGG/WebM/FLAC):

```bash
pip install openai-whisper
```

Restart the server. The `WHISPER_MODEL` env var selects the model size (default: `base`).

**Vision AI for images** — auto-detected from installed Ollama models:

```bash
ollama pull llama3.2-vision:11b
# or a lighter alternative:
ollama pull llava:7b
```

---

## Upgrading

Back up first (it is one command), then update.

**Docker**

```bash
npm run backup                                                                 # backup
git pull
docker compose build && docker compose up -d                                  # new image; migrations apply on boot
```

If the new version fails to start, `docker compose logs app` says why (a failed migration rolls back and changes nothing else). To go back, check out the previous version, rebuild, and run `npm run restore -- backups/<file>.sql --yes`.

**From source**

```bash
git pull
npm run install:all
npm run db:migrate          # new migrations are applied only when YOU run this (or use memex.sh / memex.ps1)
```

Then restart. The server warns at startup if migrations are pending. If the page looks unchanged after an upgrade, reload it once or twice: the installed web app updates itself in the background (clearing the site's data forces it). Changing `JWT_SECRET` (or `KEY_ENCRYPTION_SECRET`) makes API keys saved in Settings unreadable: enter them again.

## Backup and restore

```bash
npm run backup                                    # writes backups/memex-backup-<date>.sql (git-ignored)
npm run restore -- backups/<file>.sql --yes       # REPLACES the database with that file
```

The file holds everything in the database: items, categories, tags, entities, settings, the encrypted vault (and its check value) and saved API keys. It is plain SQL and not encrypted as a whole, so keep it as private as your notes. Add `--local` to use `pg_dump`/`psql` on your machine and `DATABASE_URL` instead of the Docker postgres service.

**Two things a backup cannot contain, so keep them yourself:** your **vault master password** (it never leaves your browser; without it vault items stay locked) and **`JWT_SECRET`** from `.env` (saved API keys are encrypted with it; without it you re-enter them).

Restore safeguards: nothing happens without `--yes`; a file that is not a complete Memex dump is refused before anything is dropped; a safety copy of the current database is written first (`--no-safety-copy` skips it); it stops at the first error. Stop the app while restoring and start it afterwards (it applies any newer migrations). To rehearse safely, restore into another database: `npm run restore -- <file> --yes --database scratch --create`.

## Sample data

New and curious? Settings > Library > **Sample data** loads about forty made-up notes, recipes, films, books, places and links so you can look around before adding your own. No AI is called. A "Demo mode" tag shows in the header while they are loaded, and one click clears exactly those items (your own notes are never touched).

---

## Platform notes

| | Windows | macOS | Linux |
|---|---|---|---|
| Docker one-command start | tested by hand (Docker Desktop); fails behind HTTPS-scanning antivirus until its root certificate is added to `certs/` | not tested yet | built and started in CI on every change |
| What you need | Docker Desktop (WSL2 backend), Node 22 for development, PowerShell 7 for `memex.ps1` | Docker Desktop, Node 22 for development | Docker Engine + compose plugin, Node 22 for development |
| Reaching native Ollama from the container | `host.docker.internal` works out of the box | same | works through the `host-gateway` mapping in `docker-compose.yml` (untested) |
| GPU for Ollama | automatic with native Ollama (NVIDIA/AMD) | automatic with native Ollama (Apple silicon); Docker cannot pass the GPU through, so use native Ollama | native Ollama uses the GPU; for Ollama in Docker you need the NVIDIA container toolkit and a GPU reservation (not included) |

Windows was run by hand; Linux is exercised by the CI Docker job (build, start, first-run checks) on every change; macOS has not been tried. Please report anything that does not work.

---

## Using the lifecycle scripts

For a cleaner start/stop experience, use the provided scripts:

**macOS / Linux:**
```bash
./memex.sh dev start          # hot-reload dev (server + client)
./memex.sh dev start --follow # …then tail server log
./memex.sh dev stop           # stop everything
./memex.sh prod start         # build + start production
./memex.sh prod stop
```

**Windows (PowerShell 7+):**
```powershell
.\memex.ps1 dev  start         # hot-reload dev
.\memex.ps1 dev  start -Follow # …then tail server log
.\memex.ps1 dev  stop
.\memex.ps1 prod start         # build + start production
.\memex.ps1 prod stop
```

Both scripts: start Postgres, run migrations, then launch server (and client in dev mode).

---

## Environment Variables

Everything lives in one file at the **project root**: copy `.env.example` to `.env`. It documents every variable; the essentials are:

```env
DATABASE_URL=postgresql://memex:memex@localhost:5436/memex   # host port 5436 (see docker-compose.yml)
PORT=3002
JWT_SECRET=<random 32+ characters>      # signs your login; also encrypts saved API keys unless KEY_ENCRYPTION_SECRET is set

# Local AI (Path A). Not needed for a cloud-only install.
OLLAMA_URL=http://localhost:11434
OLLAMA_CHAT_MODEL=llama3.2
OLLAMA_EMBED_MODEL=nomic-embed-text

# Cloud AI (optional). A key only makes a provider AVAILABLE: it is used only if you also pick it in Settings and
# turn on cloud consent, and never in Strict Local Mode. Keys can also be pasted in Settings instead of here.
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
OPENAI_API_KEY=
GROQ_API_KEY=
```

The AI provider, models, cloud consent and embedding model switch at runtime in **Settings**, with no restart. If `JWT_SECRET` (or `KEY_ENCRYPTION_SECRET`) changes, API keys saved in Settings can no longer be read and must be entered again.

---

## Using Memex from your phone or another computer

Memex listens on `127.0.0.1` only, so nothing else on your network can reach it. To use it from a phone (capture on the go, search, install the web app) you add HTTPS in front of it, on the same machine, and leave the binding alone. Your login protects the app; HTTPS protects the login and your notes in transit. Do not just set `MEMEX_BIND=0.0.0.0`: that serves your library over plain HTTP to everyone on the network.

**Option A: Tailscale Serve (private to your own devices).** Install [Tailscale](https://tailscale.com/) on the computer that runs Memex and on your phone, sign both in to the same account, enable MagicDNS and HTTPS certificates for your tailnet, then on the computer run:

```bash
tailscale serve --bg 3002
```

Tailscale prints an `https://<machine>.<tailnet>.ts.net` address. Open it on the phone and use **Add to Home Screen** / **Install** to get the web app. Only devices in your tailnet can reach it. Stop sharing with `tailscale serve off`. Do not use `tailscale funnel`: that publishes the app to the public internet. Syntax is from the [Tailscale Serve docs](https://tailscale.com/docs/reference/tailscale-cli/serve) (checked 2026-11-20).

**Option B: your own reverse proxy.** Any proxy that terminates HTTPS and forwards to `http://127.0.0.1:3002` on the same machine works (Caddy, nginx, Traefik). For example with Caddy and a domain that points at your machine, a `Caddyfile` of

```
memex.example.com {
    reverse_proxy 127.0.0.1:3002
}
```

gets a certificate automatically. If the proxy runs on a different machine, set `MEMEX_BIND` in `.env` to this machine's private LAN address (not `0.0.0.0`), firewall the port to that proxy, and keep the proxy's own login or IP allow-list in place. Set `MEMEX_CORS_ORIGINS` only if the web app is served from a different address than the API; behind a proxy that serves both it is not needed.

Things to know: use a long, unique account password (10+ characters is enforced, longer is better), because the login is the only gate once the address is reachable; the login endpoints are rate limited; the vault is still locked by its separate master password; and the web app caches only its shell, never your library. Neither option has been run end to end by the maintainer yet; if you try one, please tell us what you find.

### Step by step: an Android phone with Tailscale

Tailscale gives your phone and your computer a private, encrypted network of their own. Memex never goes on the public internet. Tailscale (the company) only sees account and device details, not your notes: the traffic between your devices is end-to-end encrypted.

1. **Computer:** install [Tailscale](https://tailscale.com/download) and sign in (Google, Microsoft, GitHub or Apple login all work). Leave it running.
2. **Phone:** install **Tailscale** from Google Play and sign in with the **same account**. Turn it on (it shows as a VPN key icon in the status bar the first time you accept the prompt).
3. **Tailscale admin page** ([login.tailscale.com/admin/dns](https://login.tailscale.com/admin/dns)), once: make sure **MagicDNS** is on, then under **HTTPS Certificates** press **Enable HTTPS**. Android needs HTTPS to install the web app.
4. **Computer:** start Memex (`docker compose up -d`; after updating Memex use `docker compose up -d --build`), then in a terminal run `tailscale serve --bg 3002`. It prints an address like `https://<computer>.<tailnet>.ts.net`. (`tailscale serve status` shows it again; `tailscale serve off` stops it. Never use `tailscale funnel`: that is the public internet.)
5. **Phone:** with Tailscale on, open that address in Chrome and sign in to Memex.
6. **Phone:** Chrome menu, **Install app** (or **Add to Home screen**). Memex now opens full screen from its own icon, and Android lists it in the **Share** menu.

Things to expect: Tailscale must be connected on the phone for Memex to be reachable; a Memex login lasts about a week before it asks for your password again; and Tailscale device keys expire (180 days by default), after which the phone asks you to sign in to Tailscale again.

### When the computer is off: Saved for later

Memex only lives on your computer, so on a weekend (or with no signal) the phone cannot reach it. Instead of losing the link, use **Save for later** in the capture screen. It keeps the link or note on the phone (in the browser's own storage) and shows an **N waiting** button in the header.

- **It sends by itself** once the computer answers: when you open the app, when the phone's network returns, when you save something new, and on a timer that slows down (30 s, 1, 2, 5, then every 10 min) while Memex stays unreachable. It only tries while the app is open and the phone is online.
- **Each item is handled exactly like one typed in:** the page is read and classified, repo stats, recipes and the places named in a page or note are picked up, and the result lands in **Pending** for you to review. A link or note Memex already has is not saved twice.
- **Nothing is dropped.** An item leaves the phone only after Memex confirms it. If the session ended it waits for you to sign in; a link Memex cannot read is kept with the reason and a **Try again** button. The list (open it from **N waiting**) lets you send now, retry or remove items. Up to 200 items, notes up to 50,000 characters.
- Items saved for later are stored unencrypted in the phone browser's storage until sent; clearing the site's data in Chrome removes them.
- Not yet tried on a real phone by the maintainer: it is covered by tests and a desktop-browser check. If something does not behave, please tell us.

## Importing Google Keep

1. Go to [Google Takeout](https://takeout.google.com) → select **Keep** → export as ZIP
2. In Memex: **Quick Add → Keep Import** → upload the ZIP
3. Notes save immediately; AI enrichment runs in the background (3 concurrent)
4. Watch the sidebar progress bar — it shows live count, rate (notes/min), and ETA
5. Job state is persisted in the DB — progress survives server restarts

## Importing Markdown notes (Obsidian or any folder of `.md` files)

1. Zip the folder (for an Obsidian vault, zip the vault folder). A single `.md` file also works.
2. In Memex: **Add → Markdown** → choose the file → **Preview**. Nothing is saved yet; the preview lists what will be imported and what will be skipped, and why.
3. **Import**. Notes save at once as unreviewed notes; AI classification runs in the background like any other import.

What it does: one note per `.md`, `.markdown` or `.txt` file (up to 500 per import, 20,000 characters each). The title comes from the front matter `title`, else the first `# heading`, else the file name. Front matter `tags` and inline `#tags` become tags, and `created` or `date` sets the note's date. Wikilinks (`[[Other note]]`) and image embeds stay as plain text. Hidden folders (`.obsidian`, `.trash`), images, attachments and other file types are ignored. A note is skipped if it is empty, too long, repeated in the folder, or already in Memex with the same title and text, so importing the same vault twice does not create copies.

Nothing is read from or written to disk beyond the upload, and nothing is sent to an AI service by the import itself; classification afterwards follows your normal provider and privacy settings (a note you tag `private` stays on local AI). The API is `POST /api/ingest/markdown` (multipart `file`, optional `dryRun=true`).

---

## Views

| Route | Description |
|---|---|
| `/` | Dashboard — stats, insights widget, rediscover widget, upcoming reminders |
| `/digest` | Weekly digest — this week's saves, on-this-day memory, AI cross-domain connection |
| `/ask` | RAG chat — ask questions, get cited answers from your notes |
| `/items/table` | Dense table with filters, NL filter ("Ask AI"), bulk review, CSV export |
| `/media` | Movies + books library with ratings and watch/read status |
| `/places` | Restaurants, cafés, hotels, attractions — with Maps links and CSV export |
| `/graph` | Entity relationship graph — semantic connections between items |
| `/categories/review` | Review and remap rogue AI-generated categories to the canonical tree |
| `/items/pending` | Notes awaiting AI enrichment |
| `/items/enriched` | AI-classified notes ready for review |
| `/vault` | Encrypted password vault |
| `/settings` | AI provider and models, API keys, search & embeddings, privacy (Strict Local Mode), library tools, vault, bookmarklet |
| `/share/:token` | Public read-only view of a shared item (no login required) |
| `/welcome` | First-run onboarding flow |

---

## AI Classification

Every item is classified by Ollama with:

- **Type** — note, recipe, media, book, place, spec, stock, link
- **Categories** — fuzzy-mapped to the canonical tree (no rogue AI-invented categories)
- **Tags** — auto-extracted
- **Summary** — 2–3 sentence overview
- **Intent** — `actionable` (todo/want-to-do), `reference` (factual/how-to), or `idea` (brainstorm/concept); shown as a badge on every item
- **Confidence score** — 0–100, visible in Table View and the Category Review staging queue
- **Structured data** — type-specific fields: recipe steps/ingredients, movie director/cast/rating, place city/cuisine/visitStatus, etc.
- **Extraction history** — every AI run is logged; any past extraction can be applied or rolled back from the Item page; re-classify a single item or bulk re-process with the current model from Settings

Multi-entity notes (e.g. "Watched: Inception, Interstellar, Dune") are automatically split into individual items.

Classification uses Ollama JSON mode + temperature 0 + a canonical category list in the prompt for deterministic, reliable output. Failed JSON parses retry once with a stricter prompt; second failure saves as `type=note`.

---

## Ask Your Knowledge (`/ask`)

Local RAG pipeline:

1. The question is embedded with the active embedding model (local `nomic-embed-text` by default)
2. Top 10 relevant notes retrieved via hybrid search (70% semantic + 30% full-text)
3. Your chosen AI (Ollama by default) synthesizes a cited answer from your notes only
4. Sources shown alongside the answer. If semantic search is unavailable (for example Strict Local Mode with cloud embeddings), Ask falls back to keyword matching and says so

---

## Natural Language Filters (`/items/table`)

Click the **Ask AI** sparkle button in Table View and type in plain English:

- "Thai restaurants I haven't visited"
- "movies I want to watch from 2023"
- "recipes with chicken"

Ollama converts the query to a structured filter. Parsed components appear as dismissible badges below the search bar. Click **Reset** to return to normal filter mode.

---

## Weekly Digest (`/digest`)

Auto-shown every Monday (once per day, tracked in localStorage). Contains:

- **This week** — all items saved in the last 7 days with week-over-week comparison
- **On this day** — a random item saved on this date in a prior year
- **AI connection** — one surprising cross-domain link between two random items from your library (click **Regenerate** for a new one)

---

## Bookmarklet

Generate a persistent API key in **Settings → Bookmarklet**. Drag the "Save to Memex" button to your bookmarks bar. Click it on any page to scrape + classify + save in one shot. A floating toast confirms the save and warns if a similar item already exists.

---

## Use Memex from an AI assistant (MCP)

The `mcp/` folder is a small [Model Context Protocol](https://modelcontextprotocol.io) server. An assistant such as Claude Desktop or Cursor launches it on your computer, and it talks to your running Memex. You can then ask the assistant "what did I save about the harbour restaurants?" or "save this recipe to Memex".

**Set up (about two minutes)**

1. Build the server once: `npm run mcp:build` (needs Node 20 or newer).
2. In Memex, open **Settings > Capture > AI assistants (MCP)** and press **Create key**. The key is shown once; Memex stores only a hash of it.
3. Copy the config block Memex shows into your assistant's MCP settings and replace the path with your Memex folder. For Claude Desktop that is `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "memex": {
      "command": "node",
      "args": ["/path/to/memex/mcp/dist/index.js"],
      "env": { "MEMEX_URL": "http://localhost:3002", "MEMEX_MCP_KEY": "mxk_..." }
    }
  }
}
```

Memex must be running (`docker compose up -d`, or `npm run dev` and use `http://localhost:5175` as `MEMEX_URL` if you prefer the dev address).

**What the assistant can do**

| Tool | What it does |
|---|---|
| `search_memex` | Search by meaning and keywords; returns titles, summaries and ids |
| `recent_memex_items` | The newest items |
| `get_memex_item` | The full text of one item |
| `save_note_to_memex` | Save a note; Memex files and tags it, plus a `from-mcp` tag |
| `save_link_to_memex` | Save a web page (fetched and summarised); the same page twice is a no-op |

**What it cannot do, by design.** The key only works on the `/api/mcp` routes. It cannot delete or edit anything, export, read or change settings and API keys, or touch the vault. Items that Memex keeps off cloud AI (the vault, Passwords and Personal, anything tagged `private`, `no-cloud` or `local-only`, and text that looks like account details) are never returned: a search only says how many matches were held back. There is no "ask" tool, so private text is never mixed into an answer that leaves your machine. Strict Local Mode switches the whole thing off. Anything the assistant *does* read goes to the assistant you connected, which may be a cloud service: that is your choice when you create the key, and **Revoke key** locks it out at once.

## Sharing

From any Item page, click **Share** to generate a public link. Links expire after 7 days by default. Revoke at any time from the same page. Encrypted (vault) items cannot be shared.

---

## Entity Graph (`/graph`)

Directors, authors, cast members, cities, and stock exchanges are automatically extracted as relational entities and linked to items. The graph view renders semantic connections. Enables cross-note queries like "everything connected to Bangkok" or "all movies by Christopher Nolan".

---

## Password Vault

- AES-256-GCM encryption, key derived client-side via PBKDF2 (100k iterations, SHA-256)
- Master password never sent to the server — key exists only in memory
- Key cleared on lock or after 15-minute inactivity
- **Verifier-based unlock** — an encrypted sentinel is stored on first setup; wrong password is rejected immediately instead of silently loading garbage
- **Change vault password** — re-encrypts every secret client-side with a new key + salt in one atomic operation; vault stays unlocked afterwards
- **Move to Vault**: encrypt any plain-text note directly from the Item page or Table View

---

## Performance

| Model | CPU | GPU |
|---|---|---|
| llama3.2 (3B) | 3–8 s/item | ~1 s/item |
| gemma3:4b | 5–10 s/item | ~1.5 s/item |
| nomic-embed-text | ~200 ms | ~50 ms |

Bulk Keep imports: notes save instantly; background queue classifies at 3 concurrent items. Sidebar shows live progress and time estimate. Job state persists in the database.

---

## Running Tests

```bash
# Server
cd server && npm test

# Client
cd client && npm test

# Or both from the root
npm test
```

### Coverage reports (with threshold gates)

```bash
cd server && npm run coverage   # threshold: ≥50% lines/functions
cd client && npm run coverage   # threshold: ≥30% lines/functions
```

Coverage is also enforced in CI on every push/PR.

---

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs four jobs on every push and PR:

1. **Server** — `tsc --noEmit`, the full test suite, a retrieval benchmark (a synthetic library and labelled questions scored against a throwaway Postgres, so ranking changes are measured), and coverage with a threshold gate
2. **Client** — `tsc --noEmit` and the full test suite
3. **MCP server** — type-check, tests, build, and `npm audit --omit=dev` (no known advisories in production dependencies)
4. **Docker smoke test** — `scripts/smoke-test.sh` builds the image, starts it, and checks first-run setup, login, sample data, CORS and that the ports are loopback-only (run it yourself with `bash scripts/smoke-test.sh`)

---

## FAQ

**Do I need Ollama?** No. It is the default and keeps everything on your machine, but a cloud-only install works (see [Path B](#path-b-cloud-only-no-ollama)).

**Is my data sent to Google, OpenAI, Anthropic or Groq?** Only if you add that provider's key, choose it in Settings, and turn on cloud consent. Even then the privacy guard keeps private items home, and "Review change" shows what a re-embed would send before it does.

**Can I use it from my phone or another computer?** Yes, but not by opening the port to your network: Memex is bound to this machine on purpose. See [Using Memex from your phone](#using-memex-from-your-phone-or-another-computer) for a private, HTTPS way to do it.

**I forgot my vault master password.** It cannot be recovered; that is what makes the vault private. Vault items stay locked. You can reset the vault (Settings > Vault), which deletes its items.

**I forgot my login password.** There is no email reset (there is no email). Stop the app and create a new account by clearing the `users` table (`docker compose exec postgres psql -U memex -c "DELETE FROM users"`), then sign up again; your notes are kept.

**How do I back up, or move to a new computer?** `npm run backup`, copy the file, then `npm run restore -- <file> --yes` on the new machine. Keep your `.env` `JWT_SECRET` and your vault master password too (see [Backup and restore](#backup-and-restore)).

**Search says "keyword only".** The active embedding model cannot be reached (Ollama is off, or a cloud key is missing), so Memex falls back to matching words. Fix the model in Settings > AI > Search & embeddings.

**Saving a note fails with "Failed to classify text".** The AI is not reachable: start Ollama, or pick a cloud provider and switch embeddings to the cloud first (the order matters; see Path B).

**The page looks old after an update.** Reload once or twice: the installed web app updates itself in the background.

**Does it work on macOS and Linux?** It uses plain Docker features and the compose file has the Linux host mapping, Windows was run by hand and Linux runs in CI on every change; macOS has not been tried. See [Platform notes](#platform-notes) and tell us what you find.

**Can I contribute?** Yes: see [CONTRIBUTING.md](CONTRIBUTING.md). Report security problems privately (see [SECURITY.md](SECURITY.md)).

---

## Keyboard Shortcuts

- `/` — Global search (when you are not typing in a field)
- `N` — Capture something new (when you are not typing in a field)
- `Esc` — Close any modal

---

MIT licensed (see [LICENSE](LICENSE)). *Runs on your machine. No subscriptions. No telemetry. Your notes never leave it unless you turn on a cloud provider; saving a link does contact the page's host (through a free reader service), and Strict Local Mode blocks that too.*
