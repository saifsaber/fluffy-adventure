import { DATA_ROOT, loadLeague } from '@dakka/content';
import { Accumulator, identicalSeasons, reputationIndex } from './metrics.js';
import { playSeason } from './season.js';

/**
 * `pnpm harness` — the merge gate.
 *
 * Runs whole seasons of the real Egyptian fourth division through `simulate()` and checks what comes
 * out against the thresholds in the blueprint. It exits non-zero when a threshold is missed, and
 * also when one could not be measured at all: a green report that skipped a check is worse than a
 * red one.
 *
 * The blueprint's gate is 10,000 seasons. That is 3.8 million matches, so the default here is small
 * enough to run after every engine change and `--seasons` takes it up to the full number when a
 * balance decision actually rests on it. The report prints the count it used, because a threshold
 * met over twenty seasons and one met over ten thousand are not the same claim.
 *
 * **The default was twenty and had to be raised, because twenty was measuring the seeds rather than
 * the engine.** Nothing here is random — the seasons are `season-0` onwards — so a run gives the
 * same answer every time, and the answer moves only with the *count*. On the tightest threshold,
 * xG↔goals against a floor of 0.900, it converges:
 *
 * ```
 * 20 seasons  0.896   ← fails, and the engine is not the reason
 * 50 seasons  0.902
 * 100 seasons 0.904
 * 200 seasons 0.904
 * ```
 *
 * The first twenty seeds simply happen to be a below-average sample of the engine's own behaviour,
 * and CLAUDE.md says a failing harness blocks the merge — so the default was blocking merges over
 * a sampling artefact, which is a gate reporting something other than what it claims to measure.
 * Fifty seasons costs eighty seconds and lands on the converged answer. **The threshold was not
 * moved; the measurement was made honest.**
 */

interface Options {
  readonly seasons: number;
  readonly league: string;
}

export function parseArgs(argv: readonly string[]): Options {
  let seasons = 50;
  let league = 'egy-d4';
  for (const arg of argv) {
    const seasonsMatch = /^--seasons=(\d+)$/.exec(arg);
    if (seasonsMatch?.[1] !== undefined) seasons = Number(seasonsMatch[1]);
    const leagueMatch = /^--league=([\w-]+)$/.exec(arg);
    if (leagueMatch?.[1] !== undefined) league = leagueMatch[1];
  }
  return { seasons: Math.max(1, seasons), league };
}

const fmt = (value: number | undefined, unit: string): string =>
  value === undefined ? '—' : `${value.toFixed(3)}${unit}`;

export function main(argv: readonly string[], log: (line: string) => void): number {
  const options = parseArgs(argv);
  const loaded = loadLeague(DATA_ROOT, options.league);
  const reputation = reputationIndex(loaded.clubs);
  const accumulator = new Accumulator();

  const started = Date.now();
  let matches = 0;
  for (let i = 0; i < options.seasons; i++) {
    const season = playSeason({
      league: loaded.league,
      clubs: loaded.clubs,
      data: loaded.data,
      seed: `season-${i}`,
    });
    accumulator.addSeason(season, reputation);
    matches += season.matches.length;

    // One season in every batch is replayed and compared byte for byte. Determinism is not a
    // property to assume — it is the property everything else in this product is built on.
    if (i === 0) {
      const replay = playSeason({
        league: loaded.league,
        clubs: loaded.clubs,
        data: loaded.data,
        seed: `season-${i}`,
      });
      accumulator.addDeterminismCheck(identicalSeasons(season.matches, replay.matches));
    }
  }
  const seconds = (Date.now() - started) / 1000;

  const verdicts = accumulator.verdicts();
  const failed = verdicts.filter((v) => v.status !== 'pass');

  log(`Dakka balance harness — ${options.league}`);
  log(
    `${options.seasons} season(s), ${matches} matches, ${seconds.toFixed(1)}s ` +
      `(${(matches / Math.max(seconds, 0.001)).toFixed(0)} matches/s)`,
  );
  log('');
  for (const v of verdicts) {
    const mark = v.status === 'pass' ? 'PASS' : v.status === 'fail' ? 'FAIL' : ' ?? ';
    const range = `${v.threshold.low}–${v.threshold.high}${v.threshold.unit}`;
    log(
      `  [${mark}] ${v.threshold.what.padEnd(24)} ${fmt(v.value, v.threshold.unit).padStart(10)}` +
        `   want ${range.padEnd(16)} n=${v.samples}`,
    );
  }
  log('');

  if (failed.length === 0) {
    log(`All ${verdicts.length} thresholds met.`);
    return 0;
  }
  log(`${failed.length} of ${verdicts.length} thresholds not met:`);
  for (const v of failed) {
    log(
      v.status === 'unmeasured'
        ? `  - ${v.threshold.what}: not measured. An unmeasured check is not a pass.`
        : `  - ${v.threshold.what}: ${fmt(v.value, v.threshold.unit)}, want ${v.threshold.low}–${v.threshold.high}`,
    );
  }
  log('');
  log('The engine gets fixed; the thresholds do not get lowered. See CLAUDE.md.');
  return 1;
}
