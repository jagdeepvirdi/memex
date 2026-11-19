# Security

Memex is a single-user app that runs on your own machine. This page says what it protects, what it does not, and how to report a problem.

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Use GitHub's private reporting instead: on the repository page choose **Security > Report a vulnerability**. Include what you found, how to reproduce it, and what it lets an attacker do. You will get an answer as soon as it can be read; there is no bounty, but you will be credited if you want to be.

## What Memex does

- **Local by default.** Notes, the database and the AI (Ollama) stay on your machine. A cloud AI (Claude, Gemini, OpenAI, Groq) is used only if you add a key, pick it, and turn on cloud consent in Settings, and never in Strict Local Mode.
- **A privacy guard on every cloud call.** Encrypted and password items, items filed under Passwords or Personal, items tagged `private` / `no-cloud` / `local-only`, and text that looks like account details never leave your machine. Each item shows which AI classified it and whether it stays local.
- **The vault is encrypted in your browser** (AES-256-GCM, key from your master password via PBKDF2). The server stores only ciphertext. The master password never leaves the browser and cannot be recovered.
- **Network exposure.** The server listens on `127.0.0.1` and Docker publishes the app and the database on loopback only. To reach it from other devices, put a reverse proxy with HTTPS in front (or set `MEMEX_BIND=0.0.0.0` knowing the risk), and list the page's origin in `MEMEX_CORS_ORIGINS`.
- **CORS.** Only the bookmarklet's single route accepts requests from any website; everything else answers cross-origin only to localhost and `MEMEX_CORS_ORIGINS`.
- **Login.** Passwords are hashed with bcrypt (cost 12), at least 10 characters. Sessions are signed JWTs that expire; sign-in and setup are rate limited. A production start refuses a weak or example `JWT_SECRET`.
- **Saved API keys** are encrypted (AES-256-GCM) with a key derived from `KEY_ENCRYPTION_SECRET` or `JWT_SECRET`, are write-only in the API, and are never returned or logged.
- **The bookmarklet key** can do exactly one thing: save the current page. Reading notes, settings or keys needs a real login.

## The MCP key

An AI assistant connects through the MCP server (`mcp/`) with its own key (created in Settings > Capture). It is a scoped credential: through the auth middleware it can reach only the `/api/mcp` routes (search, recent, read one item, save a note, save a link), so it cannot delete, edit, export, or read settings, API keys or the vault. The key is shown once; only its SHA-256 hash is stored, so a settings dump or backup does not hand out a working key. Items that `cloudSafe()` keeps off cloud AI are never returned to it, and Strict Local Mode disables the routes. Anything it does read is sent to the assistant you connected. Revoking the key (Settings) locks it out at once.

## What Memex does not do

- **No encryption of the database or of backup files.** Notes other than vault items are stored as plain text in Postgres, and `npm run backup` writes plain SQL. Use disk encryption and keep backups private.
- **No multi-user separation.** There is one account. Do not expose a Memex instance to people you would not give your notes to.
- **A cloud AI you enable sees what you send it.** The guard above reduces that; it is a heuristic, not a guarantee. If something must never leave your machine, tag it `private`, put it in the vault, or turn on Strict Local Mode.
- **Saving a link contacts other services, even with local AI.** To read a web page Memex sends its address to the free reader at `r.jina.ai`, which fetches the page; YouTube and Instagram links use those sites' public oEmbed endpoints; a link to a GitHub repo makes one unauthenticated request to `api.github.com` carrying only `owner/repo`. No note text is sent. Strict Local Mode blocks all of these, and pasting text instead of a link avoids them.
- **No automatic updates.** Pull and rebuild yourself, and run `npm audit` now and then.

## Keep these safe yourself

Your vault master password and `JWT_SECRET` (in `.env`) are not in any backup. Without the password the vault stays locked; without the secret saved API keys must be entered again.

## Known dependency advisories

`npm audit --omit=dev` is checked before each release. At the time of writing (2026-11-18) both the server and the web app report 0 advisories: `zod` was moved to v4 (it had a memory-exhaustion advisory for oversized constrained collections), `react-router-dom` to v7, and `qs` was updated.
