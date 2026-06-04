# Memex — Runbook

Quick reference for starting, stopping, and managing local Memex services.

---

## Prerequisites

- **Docker Desktop** running (Postgres container)
- **Ollama** running natively on port `11434`
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

## One-time model setup (after first `docker compose up`)

```powershell
docker exec -it memex-ollama-1 ollama pull llama3.2
docker exec -it memex-ollama-1 ollama pull nomic-embed-text

# Optional: vision AI
docker exec -it memex-ollama-1 ollama pull llama3.2-vision:11b
```

---

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
