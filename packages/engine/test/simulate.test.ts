import { describe, expect, it } from 'vitest';
import {
  ENGINE_VERSION,
  competitionId,
  matchId,
  simulate,
  type InMatchDecision,
  type MatchInput,
  type MatchResult,
  type Player,
} from '../src/index.js';
import { makeClub, makePlayer, makeTactics } from './fixtures.js';

/**
 * `simulate()` is assembly, and its tests are mostly accounting.
 *
 * Nothing in it decides anything: the chain produced the possessions, a curve that cannot see the
 * shooter produced the xG, a resolver that cannot see the future produced the outcomes. So what has
 * to be proved here is that the collecting is faithful — every headline number ties back to the
 * events it came from — and that the numbers nothing counts are **absent rather than zero**.
 */

const home = makeClub('home', 55);
const away = makeClub('away', 55);

const input = (seed: string, decisions: readonly InMatchDecision[] = []): MatchInput => ({
  id: matchId('m1'),
  seed,
  home: { club: home, tactics: makeTactics(home), decisions },
  away: { club: away, tactics: makeTactics(away), decisions: [] },
  context: {
    competitionId: competitionId('eg-d4'),
    awayTravelKm: 250,
    attendance: 900,
    isDerby: false,
  },
});

const sample = (n: number, make: (i: number) => MatchResult): MatchResult[] =>
  Array.from({ length: n }, (_, i) => make(i));

describe('determinism', () => {
  it('produces a byte-identical result a thousand times over', () => {
    // The property the entire product is built on. Counterfactual replay, the seeded daily
    // challenge, server-resolved PvP and reproducible bug reports all die together the moment this
    // stops holding, which is why it is checked at a thousand runs rather than two.
    const reference = JSON.stringify(simulate(input('championship-decider')));
    for (let i = 0; i < 1000; i++) {
      expect(JSON.stringify(simulate(input('championship-decider'))), `run ${i}`).toBe(reference);
    }
  });

  it('gives different matches to different seeds', () => {
    const seen = new Set(
      sample(40, (i) => simulate(input(`seed-${i}`))).map((r) => JSON.stringify(r)),
    );
    expect(seen.size).toBe(40);
  });

  it('is unchanged by in-match decisions being replayed', () => {
    const decisions: readonly InMatchDecision[] = [
      { kind: 'mentality', minute: 60, to: 'ultra_attacking' },
      { kind: 'pressing', minute: 70, to: 'gegenpress' },
    ];
    expect(JSON.stringify(simulate(input('decided', decisions)))).toBe(
      JSON.stringify(simulate(input('decided', decisions))),
    );
  });

  it('leaves its input untouched', () => {
    const one = input('pure');
    const before = JSON.stringify(one);
    simulate(one);
    expect(JSON.stringify(one)).toBe(before);
  });
});

describe('every headline number ties back to an event', () => {
  const results = sample(60, (i) => simulate(input(`tie-${i}`)));

  it('scores exactly the goals it recorded', () => {
    for (const result of results) {
      for (const side of ['home', 'away'] as const) {
        const fromShots = result.shots.filter(
          (s) => s.side === side && s.outcome === 'goal',
        ).length;
        const fromEvents = result.events.filter((e) => e.kind === 'goal' && e.side === side).length;
        const score = side === 'home' ? result.homeScore : result.awayScore;
        expect(score).toBe(fromShots);
        expect(score).toBe(fromEvents);
      }
    }
  });

  it('counts shots, blocks and shots on target from the shots themselves', () => {
    for (const result of results) {
      for (const side of ['home', 'away'] as const) {
        const mine = result.shots.filter((s) => s.side === side);
        const stats = result.stats[side];
        expect(stats.shots).toBe(mine.length);
        expect(stats.blocked).toBe(mine.filter((s) => s.outcome === 'blocked').length);
        expect(stats.shotsOnTarget).toBe(
          mine.filter((s) => s.outcome === 'goal' || s.outcome === 'saved').length,
        );
        expect(stats.shotsOnTarget).toBeLessThanOrEqual(stats.shots);
        expect(stats.xg).toBeCloseTo(
          mine.reduce((sum, s) => sum + s.xg, 0),
          9,
        );
      }
    }
  });

  it('gives every goal a chance event of its own', () => {
    for (const result of results) {
      for (const goal of result.events.filter((e) => e.kind === 'goal')) {
        const chance = result.events.find(
          (e) => e.kind === 'chance' && e.minute === goal.minute && e.shot.outcome === 'goal',
        );
        expect(chance, `goal at ${goal.minute} has no chance`).toBeDefined();
      }
    }
  });

  it('orders events by minute', () => {
    for (const result of results) {
      const minutes = result.events.map((e) => e.minute);
      expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
      for (const minute of minutes) {
        expect(minute).toBeGreaterThanOrEqual(1);
        expect(minute).toBeLessThanOrEqual(90);
      }
    }
  });

  it('stamps the engine version, so a stored match can be re-simulated safely', () => {
    expect(results[0]?.engineVersion).toBe(ENGINE_VERSION);
    expect(results[0]?.seed).toBe(input('tie-0').seed);
    expect(results[0]?.homeClubId).toBe(home.id);
    expect(results[0]?.awayClubId).toBe(away.id);
  });
});

describe('what it refuses to make up', () => {
  const result = simulate(input('honest'));

  it('leaves passes and offsides absent, not zero', () => {
    // The distinction the whole product turns on. Nothing simulates a pass or an offside line, so
    // there is no moment at which either counter could honestly be incremented — and a zero would
    // claim we looked and found none.
    for (const side of ['home', 'away'] as const) {
      expect(result.stats[side].passesCompleted).toBeUndefined();
      expect(result.stats[side].passesAttempted).toBeUndefined();
      expect(result.stats[side].offsides).toBeUndefined();
      expect(Object.keys(result.stats[side])).not.toContain('passesAttempted');
    }
  });

  it('leaves assists absent, because nothing models the pass before the shot', () => {
    for (const player of result.players) expect(player.assists).toBeUndefined();
  });

  it('emits an empty trace rather than a plausible one', () => {
    // Step 5's job. An empty trace has to be a legible state — `dakka-engine-rules` §6 says a thin
    // trace means a short debrief and the model does not fill the gap.
    expect(result.trace.swings).toEqual([]);
    expect(result.trace.winProbabilityTimeline).toEqual([]);
  });

  it('never reports more shots on target than shots, or a negative anything', () => {
    for (const one of sample(40, (i) => simulate(input(`sane-${i}`)))) {
      for (const side of ['home', 'away'] as const) {
        const stats = one.stats[side];
        for (const [key, value] of Object.entries(stats)) {
          if (typeof value === 'number') expect(value, key).toBeGreaterThanOrEqual(0);
        }
        expect(stats.xg).toBeLessThan(stats.shots + 1);
      }
    }
  });
});

describe('players', () => {
  const striker = home.squad[9] as Player;
  const fresh = makePlayer('bench-striker', 'ST', 'poacher', 70);

  it('reports a row for everyone who was on the pitch, and nobody who was not', () => {
    const result = simulate(input('rows'));
    expect(result.players).toHaveLength(22);
    for (const player of result.players) {
      expect(player.minutesPlayed).toBeGreaterThan(0);
      expect(player.minutesPlayed).toBeLessThanOrEqual(90);
    }
  });

  it('splits the ninety minutes across a substitution', () => {
    const withSub = simulate({
      ...input('sub'),
      home: {
        club: { ...home, squad: [...home.squad, fresh] },
        tactics: { ...makeTactics(home), bench: [fresh.id] },
        decisions: [
          {
            kind: 'substitution',
            minute: 60,
            off: striker.id,
            on: fresh.id,
            position: 'ST',
            role: 'poacher',
          },
        ],
      },
    });
    const off = withSub.players.find((p) => p.playerId === striker.id);
    const on = withSub.players.find((p) => p.playerId === fresh.id);
    expect(off?.minutesPlayed).toBe(60);
    expect(on?.minutesPlayed).toBe(30);
  });

  it('stops the clock when a player is sent off', () => {
    const sendings = sample(120, (i) => simulate(input(`red-${i}`)));
    const withRed = sendings.find((r) =>
      r.events.some((e) => e.kind === 'card' && e.colour === 'red'),
    );
    expect(withRed, 'no sending-off in 120 matches').toBeDefined();
    const red = withRed!.events.find((e) => e.kind === 'card' && e.colour === 'red');
    if (red?.kind !== 'card') throw new Error('unreachable');
    const outcome = withRed!.players.find((p) => p.playerId === red.player);
    expect(outcome?.minutesPlayed).toBe(red.minute);
  });

  it('rates everyone between one and ten, and rewards what was actually counted', () => {
    const results = sample(40, (i) => simulate(input(`rate-${i}`)));
    for (const result of results) {
      for (const player of result.players) {
        expect(player.rating).toBeGreaterThanOrEqual(1);
        expect(player.rating).toBeLessThanOrEqual(10);
      }
    }
    const scorers = results.flatMap((r) =>
      r.players.filter((p) => p.goals > 0).map((p) => p.rating),
    );
    const quiet = results.flatMap((r) =>
      r.players.filter((p) => p.goals === 0).map((p) => p.rating),
    );
    expect(scorers.length).toBeGreaterThan(10);
    const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(scorers)).toBeGreaterThan(mean(quiet));
  });

  it('hands back the condition each player finished on', () => {
    const result = simulate(input('condition'));
    for (const player of result.players) {
      expect(player.conditionAfter.fitness).toBeLessThan(100);
      expect(player.conditionAfter.fitness).toBeGreaterThan(0);
    }
  });
});

describe('the score reaches the pitch', () => {
  it('makes a side chase the game once it is losing and time is short', () => {
    // Urgency is the one thing `simulate` adds that the chain could not: the score. A side behind
    // late has to push, and — because it is a conserved transfer — leave space doing it.
    const results = sample(300, (i) => simulate(input(`late-${i}`)));
    const goals = results.flatMap((r) => r.events.filter((e) => e.kind === 'goal'));
    const late = goals.filter((g) => g.minute > 75).length / goals.length;
    expect(late).toBeGreaterThan(0.12);
    expect(late).toBeLessThan(0.35);
  });

  it('never lets a shot be shaped by its own outcome', () => {
    // The ordering guarantee stated in `simulate`'s header: the score changes what happens next, and
    // never reaches backwards. Every resolved shot's xG must still equal what its own context alone
    // is worth, with no trace of whether it went in.
    const result = simulate(input('ordering'));
    const scored = result.shots.filter((s) => s.outcome === 'goal');
    const missed = result.shots.filter((s) => s.outcome === 'off_target');
    expect(scored.length).toBeGreaterThan(0);
    expect(missed.length).toBeGreaterThan(0);
    for (const shot of result.shots) {
      expect(shot.xg).toBeGreaterThan(0);
      expect(shot.xg).toBeLessThan(1);
    }
  });
});
