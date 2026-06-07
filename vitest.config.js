import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only run Vitest unit tests in tests/*.test.js — the *.mjs files are plain
    // node scripts (Puppeteer UI tests) run via `npm run test:ui`, not Vitest suites.
    include: ['tests/*.test.js'],
  },
});
