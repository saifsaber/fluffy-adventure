import { describe, expect, it } from 'vitest';
import {
  competitionId,
  counterfactual,
  matchId,
  replayCounterfactual,
  runsNeededFor,
  simulate,
  withoutDecision,
  withoutDecisions,
  type InMatchDecision,
  type MatchInput,
} from '../src/index.js';
import { makeClub, makeTactics } from './fixtures.js';

/**
 * The counterfactual runner is the feature determinism was bought for.
 *
 * Two things have to hold or it is worse than useless. The replay must be *the same match* until the
 * decision bites — otherwise "what would have happened" is just another simulation. And a difference
 * smaller than its own noise must never come back as a finding, because a confident number with
 * nothing behind it is exactly the thing this product exists to be better than.
 */

const home = makeClub('home', 56);
const away = makeClub('away', 54);

const DECISION: readonly InMatchDecision[] = [{ kind: 'line_height', minute: 60, to: 'very_high' }];

/** Everything defensive at once, from the first minute — a change big enough to be worth calling. */
const PARK_THE_BUS: readonly InMatchDecision[] = [
  { kind: 'line_height', minute: 1, to: 'deep' },
  { kind: 'mentality', minute: 1, to: 'ultra_defensive' },
  { kind: 'tempo', minute: 1, to: 'slow' },
  { kind: 'width', minute: 1, to: 'narrow' },
];

const input = (decisions: readonly InMatchDecision[] = []): MatchInput => ({
  id: matchId('m1'),
  seed: 'counterfactual',
  home: { club: home, tactics: makeTactics(home), decisions },
  away: { club: away, tactics: makeTactics(away), decisions: [] },
  context: {
    competitionId: competitionId('eg-d4'),
    awayTravelKm: 140,
    attendance: 1100,
    isDerby: false,
  },
});

describe('a replay is the same match until the decision bites', () => {
  it('is byte-identical before the minute the decision lands', () => {
    // The claim no non-deterministic engine can make. Everything before minute 60 is not a model of
    // what might have happened — it is the same match, drawn from the same stream in the same order.
    const variant = input(DECISION);
    const replay = replayCounterfactual(withoutDecisions(variant, 'home'), variant);

    expect(replay.divergedAtMinute).toBeDefined();
    expect(replay.divergedAtMinute ?? 0).toBeGreaterThanOrEqual(60);

    const before = (m: typeof replay.baseline): string =>
      JSON.stringify(m.events.filter((e) => e.minute < 60));
    expect(before(replay.variant)).toBe(before(replay.baseline));
  });

  it('reports no divergence at all when the change changes nothing', () => {
    const same = input();
    const replay = replayCounterfactual(same, same);
    expect(replay.divergedAtMinute).toBeUndefined();
    expect(JSON.stringify(replay.variant)).toBe(JSON.stringify(replay.baseline));
  });

  it('replays the match that actually happened, not a neighbour of it', () => {
    const variant = input(DECISION);
    const baseline = withoutDecisions(variant, 'home');
    expect(JSON.stringify(replayCounterfactual(baseline, variant).baseline)).toBe(
      JSON.stringify(simulate(baseline)),
    );
  });
});

describe('a difference smaller than its own noise is not a finding', () => {
  it('measures a no-op change at exactly zero, and refuses to call it', () => {
    // The single most important property here. Comparing a thing with itself has to produce zero
    // and admit it knows nothing — a runner that manufactures a small delta from identical inputs
    // would put an invented number in front of a player every single time.
    const same = input();
    const result = counterfactual({ baseline: same, variant: same, side: 'home', runs: 30 });
    expect(result.points.mean).toBe(0);
    expect(result.points.standardError).toBe(0);
    expect(result.points.significant).toBe(false);
    expect(result.goalsFor.mean).toBe(0);
    expect(result.winRate.mean).toBe(0);
    expect(result.variant).toEqual(result.baseline);
  });

  it('never calls anything on a single pair, however far apart the two runs land', () => {
    const variant = input(DECISION);
    const result = counterfactual({
      baseline: withoutDecisions(variant, 'home'),
      variant,
      side: 'home',
      runs: 1,
    });
    expect(result.runs).toBe(1);
    expect(result.points.significant).toBe(false);
    expect(result.points.standardError).toBe(Number.POSITIVE_INFINITY);
  });

  it('calls what it can see and refuses what it cannot, in the same study', () => {
    // Parking the bus from the first minute: fewer goals at both ends. Both of those are called at
    // 120 pairs; the points effect is not, because the two nearly cancel. That is the whole design
    // in one result — the runner reports what it can measure and declines what it cannot, rather
    // than quoting a points figure that is really the difference of two larger numbers.
    const variant = input(PARK_THE_BUS);
    const result = counterfactual({
      baseline: withoutDecisions(variant, 'home'),
      variant,
      side: 'home',
      runs: 120,
    });

    expect(result.goalsFor.significant).toBe(true);
    expect(result.goalsFor.mean).toBeLessThan(0);
    expect(result.goalsAgainst.significant).toBe(true);
    expect(result.goalsAgainst.mean).toBeLessThan(0);

    // The paired mean and the difference of the two means are the same number; if they drift, one
    // of them is being computed from the wrong pairing.
    expect(result.points.mean).toBeCloseTo(result.variant.points - result.baseline.points, 9);
    expect(result.goalsFor.mean).toBeCloseTo(result.variant.goalsFor - result.baseline.goalsFor, 9);
  });

  it('never claims significance it has not earned, on any measure of any study', () => {
    // The flag is the only thing a caller is meant to read before showing a number to a player, so
    // it has to agree with the arithmetic underneath it on every measure, every time.
    const variant = input(PARK_THE_BUS);
    const result = counterfactual({
      baseline: withoutDecisions(variant, 'home'),
      variant,
      side: 'home',
      runs: 40,
    });
    for (const [name, measured] of Object.entries({
      points: result.points,
      goalsFor: result.goalsFor,
      goalsAgainst: result.goalsAgainst,
      winRate: result.winRate,
    })) {
      const earned =
        measured.standardError > 0
          ? Math.abs(measured.mean) >= 2 * measured.standardError
          : measured.mean !== 0;
      expect(measured.significant, name).toBe(earned);
    }
  });

  it('says what it would take to call a smaller effect', () => {
    const variant = input(DECISION);
    const result = counterfactual({
      baseline: withoutDecisions(variant, 'home'),
      variant,
      side: 'home',
      runs: 60,
    });
    const forTenth = runsNeededFor(result.points, 60, 0.1);
    const forTwentieth = runsNeededFor(result.points, 60, 0.05);
    expect(forTenth).toBeDefined();
    // Standard error falls as the square root of the count, so halving the effect you want to see
    // quadruples the runs. Checked as a ratio so it pins the arithmetic, not the fixture.
    expect(forTwentieth ?? 0).toBeGreaterThan((forTenth ?? 0) * 3.5);
    expect(forTwentieth ?? 0).toBeLessThan((forTenth ?? 0) * 4.5);
  });

  it('needs no further runs when every pair already agreed', () => {
    const same = input();
    const result = counterfactual({ baseline: same, variant: same, side: 'home', runs: 10 });
    expect(runsNeededFor(result.points, 10, 0.1)).toBeUndefined();
  });
});

describe('the study is reproducible and honestly scoped', () => {
  it('gives the same answer every time it is asked', () => {
    const variant = input(DECISION);
    const baseline = withoutDecisions(variant, 'home');
    const run = () => JSON.stringify(counterfactual({ baseline, variant, side: 'home', runs: 12 }));
    expect(run()).toBe(run());
  });

  it('includes the match that actually happened as its first pair', () => {
    const variant = input(DECISION);
    const baseline = withoutDecisions(variant, 'home');
    const one = counterfactual({ baseline, variant, side: 'home', runs: 1 });
    const actual = simulate(baseline);
    expect(one.baseline.goalsFor).toBe(actual.homeScore);
    expect(one.baseline.goalsAgainst).toBe(actual.awayScore);
  });

  it('reports from the side whose decision it was', () => {
    const variant = input(DECISION);
    const baseline = withoutDecisions(variant, 'home');
    const asHome = counterfactual({ baseline, variant, side: 'home', runs: 8 });
    const asAway = counterfactual({ baseline, variant, side: 'away', runs: 8 });
    expect(asAway.baseline.goalsFor).toBe(asHome.baseline.goalsAgainst);
    expect(asAway.baseline.goalsAgainst).toBe(asHome.baseline.goalsFor);
    expect(asHome.baseline.points + asAway.baseline.points).toBeCloseTo(
      asHome.baseline.winRate * 3 +
        asAway.baseline.winRate * 3 +
        2 * (1 - asHome.baseline.winRate - asAway.baseline.winRate),
      9,
    );
  });

  it('refuses to compare two different fixtures', () => {
    // A number produced from mismatched fixtures means nothing, which is worse than an error,
    // because it looks like an answer.
    const other = makeClub('other', 50);
    const variant: MatchInput = {
      ...input(DECISION),
      away: { club: other, tactics: makeTactics(other), decisions: [] },
    };
    expect(() =>
      counterfactual({ baseline: input(), variant, side: 'home', runs: 2 }),
    ).toThrowError(/same fixture/);
  });
});

describe('building the variant', () => {
  it('strips one side’s decisions and leaves the other side alone', () => {
    const both: MatchInput = {
      ...input(DECISION),
      away: { ...input(DECISION).away, decisions: DECISION },
    };
    const stripped = withoutDecisions(both, 'home');
    expect(stripped.home.decisions).toEqual([]);
    expect(stripped.away.decisions).toEqual(DECISION);
  });

  it('drops only the decision it was asked to drop', () => {
    const many: readonly InMatchDecision[] = [
      { kind: 'line_height', minute: 60, to: 'very_high' },
      { kind: 'mentality', minute: 70, to: 'attacking' },
    ];
    const dropped = withoutDecision(input(many), 'home', (d) => d.minute === 60);
    expect(dropped.home.decisions).toHaveLength(1);
    expect(dropped.home.decisions[0]?.kind).toBe('mentality');
  });

  it('leaves the input it was given untouched', () => {
    const one = input(DECISION);
    const before = JSON.stringify(one);
    withoutDecisions(one, 'home');
    withoutDecision(one, 'home', () => true);
    counterfactual({
      baseline: withoutDecisions(one, 'home'),
      variant: one,
      side: 'home',
      runs: 2,
    });
    expect(JSON.stringify(one)).toBe(before);
  });
});
