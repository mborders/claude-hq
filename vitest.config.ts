import { defineConfig } from 'vitest/config';

// Backend + shared tests run in Node. Web tests (jsdom) are configured
// separately in web/vitest.config.ts if/when added.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts', 'shared/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    passWithNoTests: true,
    pool: 'forks',
  },
});
