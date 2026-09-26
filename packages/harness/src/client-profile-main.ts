/* eslint-disable no-console */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { profiled, report, type CpuProfile } from './client-profile.js';

/**
 * Runs the season walk under `--cpu-prof` and reports where the time went.
 *
 * The workload is `apps/web/test/season.test.tsx` — thirty-eight rounds through the real screens —
 * rather than a benchmark written for the occasion. A benchmark measures what its author already
 * suspected; the walk is what a player does.
 *
 * `--cpu-prof` has to be on the process doing the work, and vitest does that work in a fork, so the
 * flag is handed to the fork through `CPU_PROF_DIR` in `vitest.config.ts`. Several profiles come
 * back (the runner, its workers); the biggest is the one that did the walking.
 */

const TEST = 'apps/web/test/season.test.tsx';

/** The workspace root. `pnpm --filter` runs this from the package, where neither the test path nor
 *  the shared vitest config resolves. */
const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

function main(argv: readonly string[]): number {
  const dir = mkdtempSync(join(tmpdir(), 'dakka-client-prof-'));
  try {
    const run = spawnSync(
      'npx',
      ['vitest', 'run', TEST, '--pool=forks', ...argv.filter((arg) => arg !== '--')],
      {
        // The fork reads `CPU_PROF_DIR`; the parent is idle while the walk happens and profiling it
        // would produce the "98% idle" profile the engine profiler's header warns about.
        cwd: ROOT,
        stdio: 'inherit',
        env: { ...process.env, CPU_PROF_DIR: dir },
      },
    );

    const files = readdirSync(dir)
      .filter((name) => name.endsWith('.cpuprofile'))
      .map((name) => ({ name, size: statSync(join(dir, name)).size }))
      .sort((a, b) => b.size - a.size);

    const biggest = files[0];
    if (biggest === undefined) {
      console.error(
        run.status === 0
          ? 'No .cpuprofile was written.'
          : `The walk exited ${String(run.status)} before a profile was written.`,
      );
      return 1;
    }

    console.log('');
    for (const line of report(
      profiled(JSON.parse(readFileSync(join(dir, biggest.name), 'utf8')) as CpuProfile),
    )) {
      console.log(line);
    }
    return 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

process.exitCode = main(process.argv.slice(2));
