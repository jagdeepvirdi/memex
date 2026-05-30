import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // setupFiles run before each test file is imported, so env vars are set
    // before modules like auth.ts/index.ts evaluate their top-level guards.
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/test/**', 'src/scripts/**', 'src/db/migrate.ts'],
      thresholds: {
        lines: 50,
        functions: 50,
        branches: 40,
        statements: 50,
      },
    },
  },
})
