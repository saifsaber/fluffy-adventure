import { describe, expect, it } from 'vitest';
import {
  CAUSE_REGISTRY,
  FOOTPRINTS,
  TICKS_PER_MINUTE,
  bandOf,
  createRng,
  possessionShare,
  simulateChain,
  type ChainResult,
  type Possession,
  type Side,
  type SideSetup,
} from '../src/index.js';
import { makeClub, makeSide } from './fixtures.js';

/**
 * The chain is where space becomes events, and therefore where a fabricated statistic would first
 * become possible. Most of these tests are not about football being plausible — they are accounting
 * checks that make fabrication structurally impossible: every shot must be traceable to a possession
 * that actually reached the final third, every counter must sum, and the shooter must have been
 * standing in the zone the ball was in.
 */

const base = makeClub('base', 55);
const evenMatch = (seed: string): ChainResult =>
  simulateChain({ home: makeSide(base), away: makeSide(base), minutes: 90 }, createRng(seed));

const sample = (n: number, make: (i: number) => ChainResult): ChainResult[] =>
  Array.from({ length: n }, (_, i) => make(i));

const mean = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

describe('determinism', () => {
  it('replays byte-identically from the same seed', () => {
    for (const seed of ['a', 'match-17', 'الأهلي-الزمالك']) {
      const first = evenMatch(seed);
      const second = evenMatch(seed);
      expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    }
  });

  it('gives different matches to different seeds', () => {
    expect(JSON.stringify(evenMatch('one'))).not.toBe(JSON.stringify(evenMatch('two')));
  });
});

describe('the accounting closes', () => {
  const result = evenMatch('accounting');

  it('spends every tick of the match on exactly one possession', () => {
    const spent = result.possessions.reduce((sum, p) => sum + p.ticks, 0);
    expect(spent).toBe(result.ticks);
    expect(result.home.possessionTicks + result.away.possessionTicks).toBe(result.ticks);
  });

  it('plays roughly the ninety minutes it was asked for', () => {
    expect(result.ticks).toBeGreaterThanOrEqual(90 * TICKS_PER_MINUTE);
    expect(result.ticks).toBeLessThan(90 * TICKS_PER_MINUTE + 12);
  });

  it('counts each side its own possessions', () => {
    for (const side of ['home', 'away'] as const) {
      const mine = result.possessions.filter((p) => p.side === side);
      expect(result[side].possessions).toBe(mine.length);
      expect(result[side].possessionTicks).toBe(mine.reduce((s, p) => s + p.ticks, 0));
    }
  });

  it('records a shot count that equals the shots it actually emitted', () => {
    for (const side of ['home', 'away'] as const) {
      const emitted = result.shots.filter((shot) => shot.side === side);
      expect(result[side].shots).toBe(emitted.length);
      expect(
        result.possessions.filter((p) => p.side === side && p.shot !== undefined),
      ).toHaveLength(emitted.length);
    }
  });

  it('narrows monotonically through the phases, like a funnel', () => {
    for (const side of ['home', 'away'] as const) {
      const { reached } = result[side];
      expect(reached.BUILD_UP).toBeGreaterThanOrEqual(reached.PROGRESSION);
      expect(reached.PROGRESSION).toBeGreaterThanOrEqual(reached.FINAL_THIRD);
      expect(reached.FINAL_THIRD).toBeGreaterThanOrEqual(reached.SHOT);
      expect(reached.SHOT).toBe(result[side].shots);
    }
  });
});

describe('no shot exists without a chain that produced it', () => {
  it('never records more shots than possessions that reached the final third', () => {
    // This is the whole product in one assertion. The competitor computes
    // `shots = max(shots, goals + random())`; here a shot is physically unreachable unless a
    // possession got through build-up and progression first.
    for (const result of sample(60, (i) => evenMatch(`funnel-${i}`))) {
      for (const side of ['home', 'away'] as const) {
        expect(result[side].shots).toBeLessThanOrEqual(result[side].reached.FINAL_THIRD);
      }
    }
  });

  it('ends every shooting possession in the final third, having walked there', () => {
    const result = evenMatch('route');
    const shooting = result.possessions.filter((p) => p.shot !== undefined);
    expect(shooting.length).toBeGreaterThan(0);
    for (const possession of shooting) {
      expect(possession.reached).toBe('SHOT');
      expect(possession.ended).toBe('shot');
      const last = possession.route[possession.route.length - 1];
      expect(last).toBeDefined();
      expect(bandOf(last!)).toBe('attacking');
      // A possession that started in build-up must have visited all three bands to get here.
      if (possession.route.length >= 3) {
        expect(bandOf(possession.route[0]!)).toBe('defensive');
      }
    }
  });

  it('only lets a player shoot from a zone he was actually standing in', () => {
    const home = makeSide(base);
    const away = makeSide(base);
    const result = simulateChain({ home, away, minutes: 90 }, createRng('shooters'));
    const setups: Record<Side, SideSetup> = { home, away };

    for (const possession of result.possessions) {
      const shot = possession.shot;
      if (shot === undefined) continue;
      const zone = possession.route[possession.route.length - 1]!;
      const selection = setups[possession.side].tactics.startingXI.find(
        (s) => s.playerId === shot.shooter,
      );
      expect(selection, `${shot.shooter} is not in the eleven`).toBeDefined();
      const footprint = FOOTPRINTS[selection!.position];
      expect(
        footprint.occupies.includes(zone) || footprint.contests.includes(zone),
        `${selection!.position} shot from ${zone}, which is not in its footprint`,
      ).toBe(true);
      expect(selection!.position).not.toBe('GK');
    }
  });

  it('emits shot context without an outcome or an xG, because it cannot know either', () => {
    const shot = evenMatch('context').shots[0];
    expect(shot).toBeDefined();
    expect(Object.keys(shot!)).not.toContain('xg');
    expect(Object.keys(shot!)).not.toContain('outcome');
    expect(shot!.distanceM).toBeGreaterThan(0);
    expect(shot!.angleDeg).toBeGreaterThan(0);
    expect(shot!.pressure).toBeGreaterThanOrEqual(5);
    expect(shot!.pressure).toBeLessThanOrEqual(98);
  });

  it('keeps every minute inside the match and in order', () => {
    const result = evenMatch('clock');
    let previous = 0;
    for (const possession of result.possessions) {
      expect(possession.startMinute).toBeGreaterThanOrEqual(1);
      expect(possession.startMinute).toBeLessThanOrEqual(90);
      expect(possession.startMinute).toBeGreaterThanOrEqual(previous);
      previous = possession.startMinute;
      if (possession.shot !== undefined) {
        expect(possession.shot.minute).toBe(possession.startMinute);
      }
    }
  });

  it('names only registered causes when a breakdown had one', () => {
    for (const result of sample(20, (i) => evenMatch(`causes-${i}`))) {
      for (const possession of result.possessions) {
        if (possession.turnoverCause === undefined) continue;
        expect(CAUSE_REGISTRY[possession.turnoverCause]).toBeDefined();
        expect(possession.ended).toBe('turnover');
      }
    }
  });
});

describe('a match is football-shaped', () => {
  const results = sample(120, (i) => evenMatch(`shape-${i}`));
  const per = (pick: (r: ChainResult) => number): number => mean(results.map(pick));

  it('produces a plausible number of shots, possessions and corners', () => {
    const shots = per((r) => r.home.shots + r.away.shots);
    const possessions = per((r) => r.home.possessions + r.away.possessions);
    const corners = per((r) => r.home.corners + r.away.corners);

    // Real league football: roughly 24-26 shots and 10 corners across both sides. These are the
    // starting point the Step 4 harness will judge, not a result it has already accepted.
    expect(shots).toBeGreaterThan(18);
    expect(shots).toBeLessThan(30);
    expect(possessions).toBeGreaterThan(100);
    expect(possessions).toBeLessThan(220);
    expect(corners).toBeGreaterThan(4);
    expect(corners).toBeLessThan(14);
  });

  it('splits possession evenly between two identical sides', () => {
    expect(per((r) => possessionShare(r).home)).toBeCloseTo(0.5, 1);
  });

  it('takes most shots from around eighteen metres, not from everywhere', () => {
    const distances = results.flatMap((r) => r.shots.map((s) => s.distanceM));
    expect(mean(distances)).toBeGreaterThan(14);
    expect(mean(distances)).toBeLessThan(22);
    expect(Math.min(...distances.slice(0, 500))).toBeGreaterThanOrEqual(4);
  });
});

describe('tactics reach the scoreboard through the chain, not around it', () => {
  it('gives a slow, patient side more of the ball than a fast, direct one', () => {
    const slow = makeSide(base, { tempo: 'slow', passingDirectness: 'short' });
    const fast = makeSide(base, { tempo: 'fast', passingDirectness: 'long' });
    const share = mean(
      sample(40, (i) =>
        simulateChain({ home: slow, away: fast, minutes: 90 }, createRng(`tempo-${i}`)),
      ).map((r) => possessionShare(r).home),
    );
    expect(share).toBeGreaterThan(0.58);
    // And not absurdly so — the most extreme pairing in the game should not reach three quarters.
    expect(share).toBeLessThan(0.75);
  });

  it('lets a much better side work far more openings', () => {
    const strong = makeSide(makeClub('strong', 75));
    const weak = makeSide(makeClub('weak', 40));
    const results = sample(40, (i) =>
      simulateChain({ home: strong, away: weak, minutes: 90 }, createRng(`gap-${i}`)),
    );
    expect(mean(results.map((r) => r.home.shots))).toBeGreaterThan(
      mean(results.map((r) => r.away.shots)) * 2,
    );
  });

  it('punishes a high turnover harder when the side that wins it plays direct', () => {
    // The same event — losing the ball in the opponent's final third — becomes a counter far more
    // often against a side built to break. Directness earns its keep twice: it decides how a side
    // attacks a high line, and whether it can punish one.
    const patient = makeSide(base, { passingDirectness: 'short', tempo: 'slow' });
    const breaking = makeSide(base, { passingDirectness: 'long', tempo: 'fast' });

    const countersFor = (defender: SideSetup, label: string): number =>
      mean(
        sample(40, (i) =>
          simulateChain(
            { home: makeSide(base), away: defender, minutes: 90 },
            createRng(`${label}-${i}`),
          ),
        ).map((r) => r.shots.filter((s) => s.side === 'away' && s.situation === 'counter').length),
      );

    expect(countersFor(breaking, 'break')).toBeGreaterThan(countersFor(patient, 'patient'));
  });

  it('shows a counter for what it is — a shot taken against a defence still getting back', () => {
    const results = sample(60, (i) => evenMatch(`pressure-${i}`));
    const shots = results.flatMap((r) => r.shots);
    const counters = shots.filter((s) => s.situation === 'counter');
    const openPlay = shots.filter((s) => s.situation === 'open_play');
    expect(counters.length).toBeGreaterThan(0);
    expect(mean(counters.map((s) => s.pressure))).toBeLessThan(
      mean(openPlay.map((s) => s.pressure)),
    );
  });

  it('turns corners into set-piece shots, and counts both', () => {
    const results = sample(60, (i) => evenMatch(`corners-${i}`));
    const setPieces = results.flatMap((r) => r.shots.filter((s) => s.situation === 'set_piece'));
    const corners = results.reduce((sum, r) => sum + r.home.corners + r.away.corners, 0);
    expect(corners).toBeGreaterThan(0);
    expect(setPieces.length).toBeGreaterThan(0);
    // A corner is not a free shot. Most of them come to nothing, as they do in football.
    expect(setPieces.length).toBeLessThan(corners * 0.6);
  });
});

describe('possession share', () => {
  it('is computed from counted ticks, never assigned', () => {
    const result = evenMatch('share');
    const share = possessionShare(result);
    expect(share.home + share.away).toBeCloseTo(1, 9);
    expect(share.home).toBeCloseTo(
      result.home.possessionTicks / (result.home.possessionTicks + result.away.possessionTicks),
      9,
    );
  });

  it('splits an empty match down the middle rather than dividing by zero', () => {
    const empty: ChainResult = {
      possessions: [] as readonly Possession[],
      shots: [],
      home: {
        possessions: 0,
        possessionTicks: 0,
        shots: 0,
        corners: 0,
        turnovers: 0,
        reached: { BUILD_UP: 0, PROGRESSION: 0, FINAL_THIRD: 0, SHOT: 0 },
      },
      away: {
        possessions: 0,
        possessionTicks: 0,
        shots: 0,
        corners: 0,
        turnovers: 0,
        reached: { BUILD_UP: 0, PROGRESSION: 0, FINAL_THIRD: 0, SHOT: 0 },
      },
      ticks: 0,
    };
    expect(possessionShare(empty)).toEqual({ home: 0.5, away: 0.5 });
  });
});
