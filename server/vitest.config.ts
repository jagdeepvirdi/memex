import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // setupFiles run before each test file is imported, so env vars are set
    // before modules like auth.ts/index.ts evaluate their top-level guards.
    setupFiles: ['./src/test/setup.ts'],
  },
})
