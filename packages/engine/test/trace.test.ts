import { describe, expect, it } from 'vitest';
import {
  CAUSE_REGISTRY,
  MAX_SWINGS,
  MEAN_GOALS_PER_SHOT,
  MIN_SWING,
  competitionId,
  createRng,
  homeWinProbability,
  indexSquad,
  matchId,
  simulate,
  simulateChain,
  type CauseTag,
  type MatchInput,
  type MatchResult,
} from '../src/index.js';
import { makeClub, makeTactics } from './fixtures.js';

/**
 * The trace is the product.
 *
 * Everything else the engine does is in service of being able to say *why* a match went the way it
 * did, so these tests are less about arithmetic than about the two ways a trace can lie: by
 * describing a match the engine did not play, and by explaining a moment backwards.
 */

const home = makeClub('home', 58);
const away = makeClub('away', 52);

const input = (seed: string): MatchInput => ({
  id: matchId('m1'),
  seed,
  home: { club: home, tactics: makeTactics(home), decisions: [] },
  away: { club: away, tactics: makeTactics(away), decisions: [] },
  context: {
    competitionId: competitionId('eg-d4'),
    awayTravelKm: 180,
    attendance: 1200,
    isDerby: false,
  },
});

const season = (n: number): MatchResult[] =>
  Array.from({ length: n }, (_, i) => simulate(input(`trace-${i}`)));

describe('the win probability', () => {
  it('is a probability, every minute of every match', () => {
    for (const match of season(30)) {
      expect(match.trace.winProbabilityTimeline).toHaveLength(91);
      for (const [minute, p] of match.trace.winProbabilityTimeline.entries()) {
        expect(p, `minute ${minute}`).toBeGreaterThanOrEqual(0);
        expect(p, `minute ${minute}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('collapses to the actual result at full time, because no minutes are left', () => {
    // The last entry is not a forecast. With nothing left to play the Poisson rate is zero and the
    // model can only say what happened — which is the cheapest possible check that the timeline is
    // anchored to the match rather than floating alongside it.
    for (const match of season(30)) {
      const final = match.trace.winProbabilityTimeline[90];
      expect(final).toBe(match.homeScore > match.awayScore ? 1 : 0);
    }
  });

  it('rises with a lead, falls with a deficit, and is even when everything is even', () => {
    const behind = homeWinProbability(0, 1, 0.26, 0.26, 45);
    const level = homeWinProbability(0, 0, 0.26, 0.26, 45);
    const ahead = homeWinProbability(1, 0, 0.26, 0.26, 45);
    expect(behind).toBeLessThan(level);
    expect(level).toBeLessThan(ahead);
    // Two identical sides at 0-0: a home win is one of three outcomes, so well under a half.
    expect(level).toBeGreaterThan(0.2);
    expect(level).toBeLessThan(0.45);
  });

  it('holds a lead more securely the less time is left', () => {
    const early = homeWinProbability(1, 0, 0.26, 0.26, 80);
    const late = homeWinProbability(1, 0, 0.26, 0.26, 10);
    expect(late).toBeGreaterThan(early);
    expect(homeWinProbability(1, 0, 0.26, 0.26, 0)).toBe(1);
    expect(homeWinProbability(0, 0, 0.26, 0.26, 0)).toBe(0);
  });

  it('gives the better-supplied side the better of a level game', () => {
    // The only thing separating these two is the rate the engine says each is creating at.
    expect(homeWinProbability(0, 0, 0.4, 0.2, 45)).toBeGreaterThan(
      homeWinProbability(0, 0, 0.2, 0.4, 45),
    );
  });
});

describe('the rate model describes the match the engine actually played', () => {
  /**
   * The load-bearing test in this file.
   *
   * `shotChancePerPossession` is a closed-form reading of a stochastic possession loop, and the
   * whole trace rests on it: if it drifts from what the chain does, the timeline will explain a
   * slightly different match — fluently, and wrongly. So it is checked against the chain's own
   * output rather than asserted, by summing the per-minute rates the chain recorded and comparing
   * them with the shots the chain actually took.
   *
   * It understates by design (the penalty branch is left out, 1.4% of shots) and by nature (the
   * phase probabilities are clamped, so the rate at the mean room is not the mean of the rate). The
   * band below is wide enough for that and far too tight for a model that has come loose — at the
   * time of writing it reads 0.95 home and 0.94 away.
   */
  const play = (seed: string) =>
    simulateChain(
      {
        home: { tactics: makeTactics(home), players: indexSquad(home.squad) },
        away: { tactics: makeTactics(away), players: indexSquad(away.squad) },
        minutes: 90,
        crowd: 0.4,
        resolve: () => 'saved',
      },
      createRng(seed),
    );

  it('predicts the shots each side takes, within a tenth of the chain itself', () => {
    let predictedHome = 0;
    let predictedAway = 0;
    let actualHome = 0;
    let actualAway = 0;

    for (let i = 0; i < 60; i++) {
      const result = play(`rate-${i}`);
      actualHome += result.home.shots;
      actualAway += result.away.shots;
      // minuteStates[0] is kickoff; minutes 1..90 are the ones that were played.
      for (let minute = 1; minute <= 90; minute++) {
        const state = result.minuteStates[minute];
        expect(state, `minute ${minute} was never sampled`).toBeDefined();
        predictedHome += state?.shotsPerMinute.home ?? 0;
        predictedAway += state?.shotsPerMinute.away ?? 0;
      }
    }

    expect(predictedHome / actualHome).toBeGreaterThan(0.88);
    expect(predictedHome / actualHome).toBeLessThan(1.06);
    expect(predictedAway / actualAway).toBeGreaterThan(0.88);
    expect(predictedAway / actualAway).toBeLessThan(1.06);
  });

  it('tracks which side is creating more, not just how much in total', () => {
    // A model that got the total right by luck and the split wrong would produce a win probability
    // that is confidently backwards, which is worse than one that is vague.
    let predictedEdge = 0;
    let actualEdge = 0;
    for (let i = 0; i < 60; i++) {
      const result = play(`edge-${i}`);
      actualEdge += result.home.shots - result.away.shots;
      for (let minute = 1; minute <= 90; minute++) {
        const state = result.minuteStates[minute];
        predictedEdge += (state?.shotsPerMinute.home ?? 0) - (state?.shotsPerMinute.away ?? 0);
      }
    }
    expect(actualEdge).toBeGreaterThan(0);
    expect(predictedEdge).toBeGreaterThan(0);
    expect(predictedEdge / actualEdge).toBeGreaterThan(0.6);
    expect(predictedEdge / actualEdge).toBeLessThan(1.4);
  });

  it('samples every minute, including ones a long possession ran straight through', () => {
    const result = play('sampled');
    expect(result.minuteStates).toHaveLength(91);
    for (const [minute, state] of result.minuteStates.entries()) {
      expect(state.minute).toBe(minute);
      expect(state.shotsPerMinute.home).toBeGreaterThan(0);
      expect(state.shotsPerMinute.away).toBeGreaterThan(0);
    }
  });
});

describe('swing moments', () => {
  const matches = season(80);
  const allSwings = matches.flatMap((m) => m.trace.swings);

  it('never exceeds the rule-6 ceiling, and averages inside its band', () => {
    for (const match of matches) {
      expect(match.trace.swings.length).toBeLessThanOrEqual(MAX_SWINGS);
    }
    const mean = allSwings.length / matches.length;
    expect(mean).toBeGreaterThanOrEqual(5);
    expect(mean).toBeLessThanOrEqual(8);
  });

  it('is ordered by minute and stays inside the match', () => {
    for (const match of matches) {
      const minutes = match.trace.swings.map((s) => s.minute);
      expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
      for (const minute of minutes) {
        expect(minute).toBeGreaterThanOrEqual(1);
        expect(minute).toBeLessThanOrEqual(90);
      }
    }
  });

  it('carries only moments that actually moved the match', () => {
    for (const swing of allSwings) {
      expect(Math.abs(swing.deltaWinProbability)).toBeGreaterThanOrEqual(MIN_SWING);
      expect(swing.deltaWinProbability).toBeGreaterThanOrEqual(-1);
      expect(swing.deltaWinProbability).toBeLessThanOrEqual(1);
    }
  });

  it('agrees with itself about who a moment favoured', () => {
    for (const swing of allSwings) {
      expect(swing.favoured).toBe(swing.deltaWinProbability >= 0 ? 'home' : 'away');
    }
  });

  it('names someone for every moment, and both players for a save', () => {
    for (const match of matches) {
      const ids = new Set(match.players.map((p) => p.playerId));
      for (const swing of match.trace.swings) {
        expect(swing.actors.length).toBeGreaterThan(0);
        for (const actor of swing.actors) expect(ids.has(actor), actor).toBe(true);
      }
      const saves = match.trace.swings.filter((s) => s.cause === 'KEEPER_HEROICS');
      for (const save of saves) expect(save.actors.length).toBe(2);
    }
  });

  it('cites only registered causes', () => {
    for (const swing of allSwings) {
      expect(Object.keys(CAUSE_REGISTRY)).toContain(swing.cause);
    }
  });
});

describe('a cause is never cited backwards', () => {
  const matches = season(120);
  const mismatched = Array.from({ length: 40 }, (_, i) => {
    const one = input(`mismatch-${i}`);
    return simulate({
      ...one,
      away: {
        ...one.away,
        tactics: { ...one.away.tactics, formation: '3-5-2', width: 'narrow', compactness: 'tight' },
      },
    });
  });

  /**
   * The bug this catches was real, not hypothetical.
   *
   * `map.causes` lists both polarities of the same pitch, so taking the strongest entry explained an
   * away goal with `DEEP_BLOCK_ABSORBED_PRESSURE` — the reason the scorer's attack was being
   * smothered. Fluent, specific, and exactly backwards, which is the failure mode this product
   * exists to be better than. `CAUSE_REGISTRY.favours` is what keeps it out.
   */
  it('gives a goal an attacking reason and a stop a defensive one', () => {
    // The invariant, stated the only way that actually bites: whether the cited cause helps the
    // attack has to agree with whether the shooter's side came out of the moment ahead. Testing
    // that the cause is merely *not* direction-blind passes a trace that explains every goal with
    // the reason its scorer was being smothered — which is exactly the bug this replaced.
    let scored = 0;
    let stopped = 0;
    for (const match of matches) {
      for (const swing of match.trace.swings) {
        if (swing.cause === 'RED_CARD') continue;
        const shooter = swing.actors[0];
        const shots = match.shots.filter(
          (shot) => shot.minute === swing.minute && shot.shooter === shooter,
        );
        // One shot by one player in one minute: anything else cannot be attributed and is skipped
        // rather than guessed at. In practice this leaves almost every swing in.
        if (shots.length !== 1) continue;
        const shot = shots[0];
        if (shot === undefined) continue;
        const shooterCameOutAhead = swing.favoured === shot.side;
        if (shooterCameOutAhead) scored += 1;
        else stopped += 1;
        expect(
          CAUSE_REGISTRY[swing.cause].favours,
          `${swing.cause} cited for a ${shot.outcome} that favoured ${swing.favoured}`,
        ).toBe(shooterCameOutAhead ? 'attack' : 'defence');
      }
    }
    expect(scored).toBeGreaterThan(0);
    expect(stopped).toBeGreaterThan(0);
  });

  it('never cites a shape or pressing cause that does not know which way it cut', () => {
    // `FORMATION_MISMATCH` fires on the largest zone mismatch in either direction, so it genuinely
    // does not know whose goal it opened. The two sides here line up differently so the cause is
    // actually being produced — without that this test would pass by never exercising it.
    let mismatchSeen = 0;
    for (const match of mismatched) {
      for (const swing of match.trace.swings) {
        const meta = CAUSE_REGISTRY[swing.cause];
        if (meta.domain !== 'shape' && meta.domain !== 'pressing') continue;
        expect(meta.favours, `${swing.cause} is direction-blind and must not be cited`).not.toBe(
          'neither' as const,
        );
      }
      if (match.trace.swings.length > 0) mismatchSeen += 1;
    }
    expect(mismatchSeen).toBeGreaterThan(0);
  });

  it('cites no cause the engine could not have detected at that moment', () => {
    // Every tag here is either read from `map.causes` or attached to a recorded event. Nothing in
    // the condition or context families is detected yet, so nothing may claim them.
    for (const match of matches) {
      for (const swing of match.trace.swings) {
        expect(['condition', 'context']).not.toContain(CAUSE_REGISTRY[swing.cause].domain);
      }
    }
  });

  it('leaves the decision causes unemitted until something can prove them', () => {
    // Substitutions and mentality changes plainly move matches, but saying *this* one did needs the
    // match replayed without it. Until the counterfactual runner exists, claiming it would be the
    // most confident thing in the trace and the least supported.
    const deferred: readonly CauseTag[] = [
      'SUBSTITUTION_SWUNG_MOMENTUM',
      'MISSED_SUBSTITUTION_WINDOW',
      'MENTALITY_SHIFT_PAID_OFF',
      'MENTALITY_SHIFT_BACKFIRED',
    ];
    for (const match of matches) {
      for (const swing of match.trace.swings) expect(deferred).not.toContain(swing.cause);
    }
  });
});

describe('surprise is what makes a moment big', () => {
  it('rates an unlikely goal above a certain one, at the same score and clock', () => {
    // Not a property of the data — a property of the arithmetic. Before the ball is struck the win
    // probability is already `xg` of the way to what a goal would make it, so converting a penalty
    // barely moves it and a twenty-yarder moves it almost the whole way.
    const level = homeWinProbability(0, 0, 0.26, 0.26, 30);
    const scored = homeWinProbability(1, 0, 0.26, 0.26, 30);
    const gap = scored - level;
    const tapIn = (1 - 0.76) * gap;
    const screamer = (1 - 0.04) * gap;
    expect(screamer).toBeGreaterThan(tapIn * 3);
  });

  it('makes a save worth what the chance was worth', () => {
    const level = homeWinProbability(0, 0, 0.26, 0.26, 30);
    const conceded = homeWinProbability(0, 1, 0.26, 0.26, 30);
    const gap = level - conceded;
    expect(0.7 * gap).toBeGreaterThan(0.05 * gap);
    expect(gap).toBeGreaterThan(0);
  });
});

describe('determinism', () => {
  it('produces the same trace for the same seed', () => {
    expect(JSON.stringify(simulate(input('same')).trace)).toBe(
      JSON.stringify(simulate(input('same')).trace),
    );
  });

  it('keeps the mean goals-per-shot constant the timeline is calibrated on', () => {
    // Pinned so that changing it is a deliberate act with a measurement behind it. 0.1096 came from
    // 108,752 shots over 4,560 matches of the real fourth division.
    expect(MEAN_GOALS_PER_SHOT).toBe(0.1096);
  });
});
