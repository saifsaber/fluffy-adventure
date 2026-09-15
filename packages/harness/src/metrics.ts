import type { MatchResult } from '@dakka/engine';
import type { SeasonResult, TableRow } from './season.js';

/**
 * The gate.
 *
 * `docs/01-product/03-technical-blueprint.md` sets these, and `CLAUDE.md` is explicit about which
 * way the repair goes: **failing the harness blocks the merge, the engine gets fixed, and the
 * thresholds do not get lowered.** So they live here as data, with their source written next to
 * them, and a run that misses one says so and exits non-zero.
 *
 * A measurement that has not been implemented is reported as **unmeasured**, never as a pass. The
 * difference matters more here than anywhere else in the codebase: a green report that quietly
 * skipped a check is worse than a red one.
 */

export interface Threshold {
  readonly key: string;
  readonly what: string;
  readonly low: number;
  readonly high: number;
  /** How to read the number, for the report. */
  readonly unit: string;
}

export const THRESHOLDS: readonly Threshold[] = [
  { key: 'goalsPerMatch', what: 'goals per match', low: 2.5, high: 2.8, unit: '' },
  // Added after the first re-fit hit the goal rate with far too few shots, each worth far too much.
  // Goals are shots times conversion, so a gate that checks only the product can be satisfied by a
  // league of eight shots a side — which no one watching would recognise as football.
  { key: 'shotsPerMatch', what: 'shots per match', low: 22, high: 28, unit: '' },
  { key: 'homeAdvantage', what: 'home advantage', low: 0.3, high: 0.4, unit: ' goals' },
  { key: 'xgCorrelation', what: 'xG ↔ goals correlation', low: 0.9, high: 1, unit: '' },
  { key: 'championPoints', what: 'champion points', low: 78, high: 95, unit: '' },
  { key: 'strongerSideWins', what: 'stronger side wins', low: 0.55, high: 0.65, unit: '' },
  { key: 'determinism', what: 'determinism', low: 1, high: 1, unit: '' },
];

export interface Measurement {
  readonly key: string;
  readonly value: number | undefined;
  readonly samples: number;
}

export interface Verdict {
  readonly threshold: Threshold;
  readonly value: number | undefined;
  readonly samples: number;
  readonly status: 'pass' | 'fail' | 'unmeasured';
}

/** Pearson correlation. Returns undefined rather than NaN when there is nothing to correlate. */
export function correlation(xs: readonly number[], ys: readonly number[]): number | undefined {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return undefined;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i] ?? 0;
    sy += ys[i] ?? 0;
  }
  const mx = sx / n;
  const my = sy / n;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i++) {
    const dx = (xs[i] ?? 0) - mx;
    const dy = (ys[i] ?? 0) - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  if (vx === 0 || vy === 0) return undefined;
  return cov / Math.sqrt(vx * vy);
}

/** Everything the report needs, accumulated across however many seasons were run. */
export class Accumulator {
  private matches = 0;
  private goals = 0;
  private shots = 0;
  private homeGoals = 0;
  private awayGoals = 0;
  private championPoints: number[] = [];
  private clubXg: number[] = [];
  private clubGoals: number[] = [];
  private mismatches = 0;
  private strongerWon = 0;
  private strongerDrew = 0;
  private determinismChecks = 0;
  private determinismFailures = 0;

  /** How far apart two reputations must be before a match counts as a mismatch at all. */
  static readonly MISMATCH_GAP = 8;

  addSeason(season: SeasonResult, reputation: ReadonlyMap<string, number>): void {
    for (const match of season.matches) {
      this.matches += 1;
      this.goals += match.homeScore + match.awayScore;
      this.shots += match.stats.home.shots + match.stats.away.shots;
      this.homeGoals += match.homeScore;
      this.awayGoals += match.awayScore;

      const home = reputation.get(match.homeClubId) ?? 0;
      const away = reputation.get(match.awayClubId) ?? 0;
      const gap = home - away;
      if (Math.abs(gap) >= Accumulator.MISMATCH_GAP) {
        this.mismatches += 1;
        const strongerIsHome = gap > 0;
        const strongerScore = strongerIsHome ? match.homeScore : match.awayScore;
        const weakerScore = strongerIsHome ? match.awayScore : match.homeScore;
        if (strongerScore > weakerScore) this.strongerWon += 1;
        else if (strongerScore === weakerScore) this.strongerDrew += 1;
      }
    }

    const champion: TableRow | undefined = season.table[0];
    if (champion !== undefined) this.championPoints.push(champion.points);
    for (const row of season.table) {
      this.clubXg.push(row.xgFor);
      this.clubGoals.push(row.goalsFor);
    }
  }

  addDeterminismCheck(identical: boolean): void {
    this.determinismChecks += 1;
    if (!identical) this.determinismFailures += 1;
  }

  measure(): ReadonlyMap<string, Measurement> {
    const mean = (xs: readonly number[]): number | undefined =>
      xs.length === 0 ? undefined : xs.reduce((a, b) => a + b, 0) / xs.length;

    const out = new Map<string, Measurement>();
    const put = (key: string, value: number | undefined, samples: number): void => {
      out.set(key, { key, value, samples });
    };

    put('goalsPerMatch', this.matches === 0 ? undefined : this.goals / this.matches, this.matches);
    put('shotsPerMatch', this.matches === 0 ? undefined : this.shots / this.matches, this.matches);
    put(
      'homeAdvantage',
      this.matches === 0 ? undefined : (this.homeGoals - this.awayGoals) / this.matches,
      this.matches,
    );
    put('xgCorrelation', correlation(this.clubXg, this.clubGoals), this.clubXg.length);
    put('championPoints', mean(this.championPoints), this.championPoints.length);
    put(
      'strongerSideWins',
      // Draws count as half. A threshold of 55–65% over a whole league only makes sense as a share
      // of the points on offer, not as a share of decisive matches.
      this.mismatches === 0
        ? undefined
        : (this.strongerWon + this.strongerDrew / 2) / this.mismatches,
      this.mismatches,
    );
    put(
      'determinism',
      this.determinismChecks === 0
        ? undefined
        : (this.determinismChecks - this.determinismFailures) / this.determinismChecks,
      this.determinismChecks,
    );
    return out;
  }

  verdicts(): readonly Verdict[] {
    const measured = this.measure();
    return THRESHOLDS.map((threshold): Verdict => {
      const m = measured.get(threshold.key);
      if (m === undefined || m.value === undefined) {
        return { threshold, value: undefined, samples: m?.samples ?? 0, status: 'unmeasured' };
      }
      const inside = m.value >= threshold.low && m.value <= threshold.high;
      return {
        threshold,
        value: m.value,
        samples: m.samples,
        status: inside ? 'pass' : 'fail',
      };
    });
  }
}

/** Reputation by club id, which is what decides whether a fixture is a mismatch. */
export function reputationIndex(
  clubs: readonly { id: string; reputation: number }[],
): ReadonlyMap<string, number> {
  return new Map(clubs.map((club) => [club.id, club.reputation]));
}

/** Two runs of the same season must be identical, byte for byte. */
export function identicalSeasons(a: readonly MatchResult[], b: readonly MatchResult[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
