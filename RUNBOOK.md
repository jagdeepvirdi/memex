# Memex — Runbook

Quick reference for starting, stopping, and managing local Memex services.

---

## Prerequisites

- **Docker Desktop** running (Postgres container; also the whole app if you use `docker compose up -d`, see the README)
- **Ollama** running natively on port `11434` (only for local AI; a cloud-only install does not need it, see the README)
- **Node.js 22+** and **npm 10+** installed
- Run from the **project root** (`D:\Project\Memex`)

---

## Windows (PowerShell 7+)

### Dev mode — hot-reload, instant feedback

```powershell
# Start server (port 3002) + client (port 5175)
.\memex.ps1 dev start

# Start and tail the server log (Ctrl+C stops tailing, servers keep running)
.\memex.ps1 dev start -Follow

# Stop everything (server, client, Postgres)
.\memex.ps1 dev stop
```

### Prod mode — compiled build

```powershell
# Build (tsc + vite) then start
.\memex.ps1 prod start

# Restart without rebuilding (e.g. after a config change)
.\memex.ps1 prod start -SkipBuild

# Start and tail the server log
.\memex.ps1 prod start -Follow

# Stop
.\memex.ps1 prod stop
```

---

## macOS / Linux

### Dev mode

```bash
./memex.sh dev start
./memex.sh dev start --follow
./memex.sh dev stop
```

### Prod mode

```bash
./memex.sh prod start
./memex.sh prod start --skip-build
./memex.sh prod start --follow
./memex.sh prod stop
```

---

## What the scripts do (in order)

| Step | Dev | Prod |
|---|---|---|
| Start Postgres (Docker) | ✅ | ✅ |
| Run DB migrations | ✅ | ✅ |
| Compile server (`tsc`) | — | ✅ (skippable) |
| Bundle client (`vite build`) | — | ✅ (skippable) |
| Launch server (background) | `npm run dev` | `npm start` |
| Launch client (background) | `npm run dev` | — (static files served by server) |

PID files are written to `.memex/*.pid`. Logs go to `.memex/logs/`.

---

## URLs

| Service | URL |
|---|---|
| Frontend (dev) | http://localhost:5175 |
| API / health | http://localhost:3002/api/health |
| Ollama | http://localhost:11434 |

---

## Tailing logs manually

```powershell
# Windows
Get-Content .memex\logs\server.log -Wait
Get-Content .memex\logs\client.log -Wait
```

```bash
# macOS / Linux
tail -f .memex/logs/server.log
tail -f .memex/logs/client.log
```

---

## Manual startup (without the scripts)

If you prefer to run processes directly in separate terminals:

```powershell
# Terminal 1 — Postgres
docker compose up -d postgres

# Terminal 2 — Server
cd server
npm run migrate
npm run dev        # dev
# npm start        # prod (after npm run build)

# Terminal 3 — Client (dev only)
cd client
npm run dev
```

---

## One-time model setup (local AI only)

Ollama runs natively (it is not in `docker-compose.yml`):

```powershell
ollama pull llama3.2
ollama pull nomic-embed-text

# Optional: vision AI
ollama pull llama3.2-vision:11b
```

Cloud-only install: skip this section and follow "Path B" in the README.

---

## MCP server (`mcp/`)
```bash
npm run mcp:build           # install + compile to mcp/dist (the host runs: node mcp/dist/index.js)
cd mcp && npm test          # 32 tests, including a real MCP round trip over an in-memory pipe
```
The server needs `MEMEX_MCP_KEY` (Settings > Capture > AI assistants) and `MEMEX_URL` (default `http://localhost:3002`) in its environment; the host passes them from its config. It writes only to stderr (stdout is the protocol). Problems the assistant reports, and what they mean: "Cannot reach Memex" = Memex is not running or `MEMEX_URL` is wrong; "rejected the key" = revoked or replaced, create a new one; "Strict Local Mode is on" = turn it off in Settings > Keys & Privacy; "private in Memex" = by design. Server side: `routes/mcp.ts`, `lib/mcpScope.ts`, `services/quickSave.ts`; the key is stored as `settings.mcp_key_hash`.

## Landing page (`site/`)
```bash
cd site
vercel deploy --prod      # redeploy https://memex.jagdeepsinghvirdi.com
python -m http.server 4173   # local preview
```
Project `memex-site` on Vercel, **connected to the GitHub repo with Root Directory `site`**: every push to `main` deploys the landing page, so a push publishes it. (On 2026-11-18 the root directory was empty, so each push deployed the repo root, which has no `index.html`, and the domain answered 404; fixed by setting it with `vercel api /v9/projects/<id> -X PATCH -F rootDirectory=site`.) To deploy by hand run `vercel deploy --prod` from the repo root (it is linked via `.vercel`, git-ignored; `vercel link` also writes a `.env.local` with a token: delete it). The domain is a CNAME at the DNS provider; if HTTPS fails after the record is live, run `vercel certs issue memex.jagdeepsinghvirdi.com`. In Git Bash prefix `vercel api` paths with `MSYS_NO_PATHCONV=1` (or use PowerShell).

## Live provider checks (synthetic text only)
```bash
cd server
npx tsx src/scripts/verifyGroq.ts [model]
npx tsx src/scripts/verifyEmbeddingProvider.ts gemini|openai [model]
```
They need a saved key and cloud consent, write nothing and never start Ollama.

## Running tests

```powershell
# All tests (from project root)
npm test

# Server only
cd server && npm test

# Client only
cd client && npm test

# With coverage report
cd server && npm run coverage
cd client && npm run coverage
```
