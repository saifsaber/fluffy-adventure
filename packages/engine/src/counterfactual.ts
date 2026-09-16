import { simulate } from './simulate.js';
import type { Side } from './chain.js';
import type { MatchEvent, MatchInput, MatchResult } from './types/match.js';
import type { InMatchDecision } from './types/tactics.js';

/**
 * Counterfactual replay — what a decision was actually worth.
 *
 * This is the feature determinism was bought for. `simulate()` is a pure function of its input, so
 * changing one decision and keeping the seed is a real experiment rather than an estimate: the two
 * matches are byte-identical until the moment the decision bites, and everything after is a
 * consequence of it.
 *
 * The hard part is not running it twice. It is **refusing to report a difference that is smaller
 * than its own noise.** One replay says a substitution was worth a goal; the next says it cost one.
 * Quoting either at a player would be exactly the thing this product exists to be better than — a
 * number with no cause behind it, presented as insight. So nothing here returns a bare delta:
 * every measurement carries the standard error of its own mean and a flag saying whether it
 * survived it, and a caller that ignores `significant` is choosing to publish noise.
 */

/** A single match from one side's point of view. Points are league points: 3, 1 or 0. */
interface Outcome {
  readonly points: number;
  readonly goalsFor: number;
  readonly goalsAgainst: number;
  readonly xgFor: number;
  readonly xgAgainst: number;
  readonly won: number;
}

function outcomeOf(result: MatchResult, side: Side): Outcome {
  const goalsFor = side === 'home' ? result.homeScore : result.awayScore;
  const goalsAgainst = side === 'home' ? result.awayScore : result.homeScore;
  const mine = side === 'home' ? result.stats.home : result.stats.away;
  const theirs = side === 'home' ? result.stats.away : result.stats.home;
  return {
    points: goalsFor > goalsAgainst ? 3 : goalsFor === goalsAgainst ? 1 : 0,
    goalsFor,
    goalsAgainst,
    xgFor: mine.xg,
    xgAgainst: theirs.xg,
    won: goalsFor > goalsAgainst ? 1 : 0,
  };
}

/** What a run of matches came to, averaged. Every field is a mean over `runs`. */
export interface Distribution {
  readonly runs: number;
  readonly points: number;
  readonly goalsFor: number;
  readonly goalsAgainst: number;
  readonly xgFor: number;
  readonly xgAgainst: number;
  readonly winRate: number;
}

function distributionOf(outcomes: readonly Outcome[]): Distribution {
  const runs = outcomes.length;
  const mean = (pick: (o: Outcome) => number): number =>
    runs === 0 ? 0 : outcomes.reduce((sum, o) => sum + pick(o), 0) / runs;
  return {
    runs,
    points: mean((o) => o.points),
    goalsFor: mean((o) => o.goalsFor),
    goalsAgainst: mean((o) => o.goalsAgainst),
    xgFor: mean((o) => o.xgFor),
    xgAgainst: mean((o) => o.xgAgainst),
    winRate: mean((o) => o.won),
  };
}

/**
 * A difference, and whether it is bigger than the uncertainty in it.
 *
 * `mean` is the average paired difference — variant minus baseline, on the same seed — and
 * `standardError` is the standard error of that mean, computed from the spread of the pairs rather
 * than assumed. Pairing matters: the two matches share every draw up to the decision, so the
 * differences are far tighter than two independent runs would be, and the same claim needs
 * dramatically fewer simulations.
 */
export interface Measured {
  readonly mean: number;
  readonly standardError: number;
  /**
   * `mean` is at least twice its own standard error — roughly 95% confidence.
   *
   * **A false here is a real answer, not a failure.** It says the decision's effect, if any, is
   * smaller than this many runs can see. The honest thing to show a player is "too close to call",
   * and `runsNeededFor` says what it would take to call it.
   */
  readonly significant: boolean;
}

/** Two standard errors either side is the convention this file commits to. */
export const CONFIDENCE_SIGMA = 2;

/**
 * The mean of a set of paired differences, with the standard error of that mean.
 *
 * Exported because this arithmetic is the honesty gate, and anything that compares two arrangements
 * of the engine needs it — the counterfactual runner and the harness's dominance probe both do.
 * Duplicating it would let the two drift into disagreeing about what counts as a finding.
 *
 * `differences` must be *paired*: entry `i` of each arm has to come from the same seed, or the
 * spread being measured is the spread of football rather than the spread of the difference, and the
 * error bars come out several times too wide.
 */
export function pairedDifference(differences: readonly number[]): Measured {
  const runs = differences.length;
  if (runs === 0) return { mean: 0, standardError: Number.POSITIVE_INFINITY, significant: false };
  const mean = differences.reduce((sum, d) => sum + d, 0) / runs;
  if (runs < 2) {
    // One pair is an anecdote. It has no spread to measure, so it can never be significant.
    return { mean, standardError: Number.POSITIVE_INFINITY, significant: false };
  }
  const variance = differences.reduce((sum, d) => sum + (d - mean) ** 2, 0) / (runs - 1);
  const standardError = Math.sqrt(variance / runs);
  // Every pair agreeing exactly is the one case where zero spread means certainty, not a divide.
  const significant =
    standardError > 0 ? Math.abs(mean) >= CONFIDENCE_SIGMA * standardError : mean !== 0;
  return { mean, standardError, significant };
}

/**
 * How many paired runs it would take to call an effect of this size.
 *
 * Derived from the spread already observed, so it is an answer rather than a rule of thumb: the
 * standard error falls as the square root of the count, so reaching `CONFIDENCE_SIGMA` errors takes
 * `runs * (sigma * se / effect)^2`. Returns `undefined` when the spread is zero — every pair already
 * agreed, and no further runs are needed.
 */
export function runsNeededFor(
  observed: Measured,
  runs: number,
  effect: number,
): number | undefined {
  if (!Number.isFinite(observed.standardError) || observed.standardError <= 0) return undefined;
  if (effect === 0) return undefined;
  const scale = (CONFIDENCE_SIGMA * observed.standardError) / Math.abs(effect);
  return Math.ceil(runs * scale * scale);
}

export interface CounterfactualInput {
  /** What actually happened. Its `seed` is the stem every run is derived from. */
  readonly baseline: MatchInput;
  /** The same fixture with one thing changed. Its own `seed` is ignored — pairing needs one seed. */
  readonly variant: MatchInput;
  /** Whose decision it was. Every outcome is reported from this side's point of view. */
  readonly side: Side;
  /** Paired runs. See `runsNeededFor` — a marginal decision needs hundreds to call. */
  readonly runs: number;
}

export interface CounterfactualResult {
  readonly runs: number;
  readonly baseline: Distribution;
  readonly variant: Distribution;
  /** Variant minus baseline, paired by seed. */
  readonly points: Measured;
  readonly goalsFor: Measured;
  readonly goalsAgainst: Measured;
  readonly winRate: Measured;
}

/**
 * Seeds for run `i`, shared by both arms.
 *
 * Run 0 is the match's own seed, so the study always contains the match that actually happened
 * rather than a set of neighbours to it.
 */
const seedFor = (stem: string, run: number): string => (run === 0 ? stem : `${stem}#cf${run}`);

export function counterfactual(input: CounterfactualInput): CounterfactualResult {
  const { baseline, variant, side } = input;
  if (
    baseline.home.club.id !== variant.home.club.id ||
    baseline.away.club.id !== variant.away.club.id
  ) {
    // Comparing two different fixtures produces a number with no meaning at all, which is worse
    // than an error, because it looks like an answer.
    throw new Error('a counterfactual must be the same fixture with something changed');
  }
  const runs = Math.max(1, Math.floor(input.runs));

  const baselineOutcomes: Outcome[] = [];
  const variantOutcomes: Outcome[] = [];
  const points: number[] = [];
  const goalsFor: number[] = [];
  const goalsAgainst: number[] = [];
  const wins: number[] = [];

  for (let run = 0; run < runs; run++) {
    const seed = seedFor(baseline.seed, run);
    const was = outcomeOf(simulate({ ...baseline, seed }), side);
    const now = outcomeOf(simulate({ ...variant, seed }), side);
    baselineOutcomes.push(was);
    variantOutcomes.push(now);
    points.push(now.points - was.points);
    goalsFor.push(now.goalsFor - was.goalsFor);
    goalsAgainst.push(now.goalsAgainst - was.goalsAgainst);
    wins.push(now.won - was.won);
  }

  return {
    runs,
    baseline: distributionOf(baselineOutcomes),
    variant: distributionOf(variantOutcomes),
    points: pairedDifference(points),
    goalsFor: pairedDifference(goalsFor),
    goalsAgainst: pairedDifference(goalsAgainst),
    winRate: pairedDifference(wins),
  };
}

export interface Replay {
  readonly baseline: MatchResult;
  readonly variant: MatchResult;
  /**
   * The first minute the two matches stopped being the same match.
   *
   * Absent when they never diverged — a decision that changed nothing at all. Before this minute the
   * counterfactual is not a model of what might have happened, it is literally the same match, which
   * is the part of this that no non-deterministic engine can offer.
   */
  readonly divergedAtMinute?: number;
}

const sameEvent = (a: MatchEvent | undefined, b: MatchEvent | undefined): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * One pair at the match's own seed: what happened, and what would have happened instead.
 *
 * This is the illustration, not the evidence. A single pair is one draw from the distribution
 * `counterfactual()` measures, so it shows a player what a decision did *that day* — and the number
 * quoted alongside it should come from the study, not from here.
 */
export function replayCounterfactual(baseline: MatchInput, variant: MatchInput): Replay {
  const was = simulate(baseline);
  const now = simulate({ ...variant, seed: baseline.seed });

  let divergedAtMinute: number | undefined;
  const longest = Math.max(was.events.length, now.events.length);
  for (let i = 0; i < longest; i++) {
    const left = was.events[i];
    const right = now.events[i];
    if (sameEvent(left, right)) continue;
    divergedAtMinute = (left ?? right)?.minute;
    break;
  }

  return {
    baseline: was,
    variant: now,
    ...(divergedAtMinute === undefined ? {} : { divergedAtMinute }),
  };
}

/**
 * The same fixture with one side's in-match decisions removed.
 *
 * The commonest counterfactual a manager wants — *what if I had left it alone?* — and the one +MGR
 * is built on. Anything more elaborate is the caller's to construct; this exists so the ordinary
 * case cannot be got subtly wrong.
 */
export function withoutDecisions(input: MatchInput, side: Side): MatchInput {
  return { ...input, [side]: { ...input[side], decisions: [] } };
}

/** The same fixture with one decision dropped, chosen by the caller. */
export function withoutDecision(
  input: MatchInput,
  side: Side,
  drop: (decision: InMatchDecision) => boolean,
): MatchInput {
  return {
    ...input,
    [side]: { ...input[side], decisions: input[side].decisions.filter((d) => !drop(d)) },
  };
}
