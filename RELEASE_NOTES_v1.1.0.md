# Memex v1.1.0

Memex stays local-first: your notes are organized on your own machine, and nothing goes to a cloud AI unless you turn it on. This release makes it easier to install, lets you choose your AI provider, and tightens security.

## Highlights

- **One-command install.** `docker compose up -d` starts the database and the app. First run walks you through choosing local AI or pasting a cloud key. Startup problems now come with a readable explanation, and `GET /api/health/status` reports what is wrong.
- **Five AI providers.** Ollama (local, still the default), Claude, Gemini, OpenAI and Groq. Cloud providers are strictly opt-in: a key, a provider choice and your consent. Per-task overrides are supported, and saved keys are encrypted and write-only.
- **No Ollama required.** Login, first run and search all work with a cloud-only setup.
- **Choose your embedding model** (Ollama, Gemini or OpenAI). Switching shows a read-only estimate first, then runs a resumable, cancellable re-embed, with similarity thresholds tuned per model.
- **Privacy you can see.** Every item shows which AI classified it and a "Stays on this machine" chip when it never leaves your computer. The privacy guard now also reads the text, so content that looks like account details stays local.
- **Sample data.** About 40 made-up items to look around with, cleared in one click without touching your own notes.
- **Backup and restore.** `npm run backup` and `npm run restore -- <file> --yes`, with a safety copy taken first.

## Security changes (read before upgrading)

- The server and Postgres now listen on `127.0.0.1` only. Set `MEMEX_BIND` if you need network access. Previously Postgres was reachable from the network with a default password.
- CORS is restricted to localhost, `MEMEX_CORS_ORIGINS` and the bookmarklet's single route.
- New accounts need a password of 10 or more characters and a valid email. Existing accounts are unaffected.
- Dependency fixes: one critical and five high server advisories, plus a Tiptap/ProseMirror paste XSS on the client. `zod` and `react-router-dom` still need major upgrades (see `SECURITY.md`).
- Report vulnerabilities privately through the repository's Security tab.

## Upgrading from 1.0.0

1. Pull the new code.
2. Apply the new migrations: `npm run migrate` in `server/`. Docker installs apply them on start.
3. Back up first if you like: `npm run backup`.
4. If you changed `JWT_SECRET` or `KEY_ENCRYPTION_SECRET`, re-enter any saved API keys.

## Fixes

- Saving a note no longer fails when the embedding service is unreachable.
- Creating the first account lands on the welcome flow.
- The public health endpoint no longer shows the database address.

Full list: [CHANGELOG.md](CHANGELOG.md).
