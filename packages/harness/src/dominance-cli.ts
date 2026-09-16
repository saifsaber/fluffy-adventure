import { DATA_ROOT, loadLeague } from '@dakka/content';
import { DIALS, measure, report, verdictOf, type Dial } from './dominance.js';

/**
 * `pnpm dominance` — is any tactical dial a single correct answer?
 *
 * Defaults are small because the matrix is quadratic in the dial's settings: `lineHeight` at the
 * default is 16 cells of 6 fixtures × 20 seeds, about two thousand matches. Raise both when a
 * balance decision rests on the result; the report prints what it used, because a verdict from
 * twenty seeds and one from two hundred are not the same claim.
 */

interface Options {
  readonly dials: readonly Dial[];
  readonly pairs: number;
  readonly seeds: number;
  readonly league: string;
}

export function parseArgs(argv: readonly string[]): Options {
  let dials: Dial[] = ['lineHeight'];
  let pairs = 6;
  let seeds = 20;
  let league = 'egy-d4';
  for (const arg of argv) {
    const dial = /^--dial=([\w,]+)$/.exec(arg);
    if (dial?.[1] !== undefined) {
      dials =
        dial[1] === 'all'
          ? (Object.keys(DIALS) as Dial[])
          : dial[1].split(',').filter((name): name is Dial => name in DIALS);
    }
    const p = /^--pairs=(\d+)$/.exec(arg);
    if (p?.[1] !== undefined) pairs = Number(p[1]);
    const s = /^--seeds=(\d+)$/.exec(arg);
    if (s?.[1] !== undefined) seeds = Number(s[1]);
    const l = /^--league=([\w-]+)$/.exec(arg);
    if (l?.[1] !== undefined) league = l[1];
  }
  return { dials, pairs: Math.max(1, pairs), seeds: Math.max(1, seeds), league };
}

export function main(argv: readonly string[], log: (line: string) => void): number {
  const options = parseArgs(argv);
  if (options.dials.length === 0) {
    log(`No such dial. Known dials: ${Object.keys(DIALS).join(', ')}`);
    return 1;
  }
  const loaded = loadLeague(DATA_ROOT, options.league);

  log(`Dakka tactical dominance probe — ${options.league}`);
  log(`${options.pairs} fixture(s) x ${options.seeds} seed(s) per cell`);
  log('');
  let unhealthy = 0;
  for (const dial of options.dials) {
    const cells = measure({
      dial,
      clubs: loaded.clubs,
      pairs: options.pairs,
      seeds: options.seeds,
    });
    const verdict = verdictOf(DIALS[dial], cells);
    if (!verdict.healthy) unhealthy += 1;
    report(dial, cells, verdict, log);
    log('');
  }

  // A probe, not a gate: it always exits zero. See the note at the top of `dominance.ts` — a check
  // that is permanently red is a check everyone learns to ignore, and the dials it indicts today
  // are a known open box rather than a regression someone just introduced.
  log(
    unhealthy === 0
      ? 'Every dial probed offers a real choice.'
      : `${unhealthy} dial(s) have a dominated setting. See docs/WORKLOG.md.`,
  );
  return 0;
}
