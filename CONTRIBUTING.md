# Contributing to Memex

We love your contributions! Whether it's fixing a bug, adding a new AI classifier, or improving the UI, here's how you can help.

## Development Setup

1. **Clone the repo:**
   ```bash
   git clone https://github.com/yourusername/memex.git
   cd memex
   ```
2. **Follow the Quick Start** in [README.md](README.md) to get Docker, Ollama, and the dev servers running.
3. **Project structure:**
   ```
   client/   React + Vite frontend
   server/   Node.js + Express backend
   shared/   TypeScript types shared between both
   ```

---

## Coding Standards

- **TypeScript strict mode** — no `any`. The codebase must stay at zero `tsc --noEmit` errors.
- **Tailwind CSS** — use design tokens from `tailwind.config.ts`; don't add raw hex colors.
- **No `console.*` calls** — use the pino logger: `import logger from '../lib/logger.js'`. `console.*` in server code will be caught in code review. The logger is automatically silenced in tests (`NODE_ENV=test`).
- **No inline secrets** — use the `apiFetch` wrapper in the client (handles auth headers automatically).
- **Zod validation** on all server route inputs — parse at the boundary, trust internally.
- **Security** — never log sensitive data or credentials; vault encryption logic (`client/src/lib/crypto.ts`) must not be weakened.

### Adding a new item type

1. Add the type to `shared/types.ts` (`ItemType` union + structured data interface).
2. Update `server/src/services/classifier.ts` — add extraction logic and `mapToCategories` mapping.
3. Add a card component in `client/src/components/cards/`.
4. Add a corresponding migration if the schema changes.

---

## Testing

All changes must keep the test suite green. Run before submitting:

```bash
# From the repo root
cd server && npm test   # 232 server tests
cd client && npm test   # 57 client tests
```

Check coverage (with threshold gates):

```bash
cd server && npm run coverage   # ≥50% lines/functions
cd client && npm run coverage   # ≥30% lines/functions
```

### What to test

- **New routes** — mock `pool`/`pool.connect`, test the happy path and error cases.
- **New services** — unit-test pure logic; mock Ollama calls with `vi.mock('../services/ollama.js', ...)`.
- **New client utilities** — pure functions go in `lib/*.test.ts`; React components go in `*.test.tsx` with `@testing-library/react`.
- **Schema changes** — update `server/src/db/schema.sql` to match (the `schema.test.ts` drift guard will fail otherwise).

CI (`.github/workflows/ci.yml`) runs `tsc --noEmit`, `npm test`, and `npm run coverage` on every push and PR.

---

## Pull Request Process

1. Create a branch: `feature/your-feature-name` or `fix/issue-description`.
2. Keep changes focused — one feature or fix per PR.
3. Ensure `tsc --noEmit` passes in both `server/` and `client/`.
4. Ensure `npm test` passes in both packages.
5. Update `server/src/db/schema.sql` if you add migrations.
6. Submit with a clear description. Include a screenshot for UI changes.

---

## Migrations

- Add a new file in `server/src/db/migrations/` with the next sequential number (e.g. `015_your_change.sql`).
- Migrations run automatically on server start (`npm run migrate`) — they are idempotent.
- After adding a migration, update `server/src/db/schema.sql` and its header comment (`reflects all N migrations`) to keep the drift guard passing.

---

## Security

If you find a security vulnerability, please do **not** open a public issue. Email security@example.com instead.

---

*Thank you for making personal knowledge more private and powerful!*
