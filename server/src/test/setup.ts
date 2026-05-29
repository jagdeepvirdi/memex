// Vitest setup — runs before each test file's imports are evaluated.
// Provides env vars that production code requires at module-load time
// (e.g. auth.ts / index.ts throw if JWT_SECRET is unset). This keeps the
// production fail-fast guard intact while letting tests run.
process.env.JWT_SECRET ??= 'test-jwt-secret-not-for-production'
process.env.DATABASE_URL ??= 'postgresql://memex:memex@localhost:5436/memex'
