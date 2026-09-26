import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const CPU_PROF_DIR = process.env['CPU_PROF_DIR'];

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
    poolOptions: {
      // `pnpm profile:client` sets this. `--cpu-prof` has to be on the process doing the work, and
      // the work happens in a fork, so the flag is handed down rather than passed on the command
      // line — where it would profile an idle parent. Unset in every ordinary run.
      forks: {
        execArgv:
          CPU_PROF_DIR === undefined ? [] : ['--cpu-prof', `--cpu-prof-dir=${CPU_PROF_DIR}`],
      },
    },
  },
});
