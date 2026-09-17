import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // `.tsx` tests render React components, so the JSX transform is on for the whole workspace. The
  // packages have no JSX in them and are unaffected.
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@content': fileURLToPath(new URL('./packages/content/data', import.meta.url)),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.{ts,tsx}'],
  },
});
