import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * `@content` points at the content package's `data/` directory.
 *
 * The league reaches the browser as the same JSON files the harness and the API read, validated by
 * the same schema — not as a generated bundle and not as a second copy. That is what keeps
 * "a league is data, not code" true on the client as well: adding a country stays a data change.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@content': fileURLToPath(new URL('../../packages/content/data', import.meta.url)),
    },
  },
});
