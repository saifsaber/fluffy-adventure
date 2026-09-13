import { describe, expect, it } from 'vitest';
import {
  BANDS,
  CAUSE_REGISTRY,
  FOOTPRINTS,
  goalAngle,
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

const emptyChainStats = (): ChainResult['home'] => ({
  possessions: 0,
  possessionTicks: 0,
  shots: 0,
  corners: 0,
  turnovers: 0,
  fouls: 0,
  yellowCards: 0,
  redCards: 0,
  penaltiesAwarded: 0,
  reached: { BUILD_UP: 0, PROGRESSION: 0, FINAL_THIRD: 0, SHOT: 0 },
});
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
      // The route only ever goes forward. Asserting "three zones means it started in defence" was
      // the wrong shape for this: a possession won high starts in midfield, and one that wins a
      // corner revisits the final third, so length says nothing about where it began.
      const order = possession.route.map((zone) => BANDS.indexOf(bandOf(zone)));
      for (let i = 1; i < order.length; i++) {
        expect(
          order[i],
          `route went backwards: ${possession.route.join(' → ')}`,
        ).toBeGreaterThanOrEqual(order[i - 1]!);
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
        // Not `toBe('turnover')`: the ball can be lost and the whistle go before the next one
        // starts, which marks the possession `full_time`. What a named cause rules out is a shot.
        expect(possession.ended).not.toBe('shot');
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

  it('takes most shots from around fifteen metres, not from everywhere', () => {
    const distances = results.flatMap((r) => r.shots.map((s) => s.distanceM));
    expect(mean(distances)).toBeGreaterThan(13);
    expect(mean(distances)).toBeLessThan(18);
    expect(Math.min(...distances.slice(0, 500))).toBeGreaterThanOrEqual(3);
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
      events: [],
      home: emptyChainStats(),
      away: emptyChainStats(),
      ticks: 0,
      score: { home: 0, away: 0 },
      conditionAfter: { home: new Map(), away: new Map() },
    };
    expect(possessionShare(empty)).toEqual({ home: 0.5, away: 0.5 });
  });
});

/**
 * The shot-quality distribution, fixed after 3e measured it and found it wrong.
 *
 * The first version produced every shot from a seven-metre band around eighteen metres: the mean
 * was right and the spread was missing, and since xG is sharply convex in distance, that gave 1.15
 * goals a match against a real 2.5–2.8. These tests pin the distribution itself, against published
 * figures for top-flight football, so it cannot silently narrow again.
 */
describe('shots come from where football takes them', () => {
  const distances = sample(200, (i) => evenMatch(`bands-${i}`)).flatMap((r) =>
    r.shots.map((s) => s.distanceM),
  );
  const share = (lo: number, hi: number): number =>
    distances.filter((d) => d >= lo && d < hi).length / distances.length;

  // Published shares for top-flight football. The tolerances are wide enough to survive a rebalance
  // that keeps the shape, and narrow enough to fail if the spread collapses again.
  it.each([
    { band: 'inside six metres', lo: 0, hi: 6, expected: 0.08, tolerance: 0.05 },
    { band: 'six to eleven', lo: 6, hi: 11, expected: 0.22, tolerance: 0.07 },
    { band: 'eleven to the box edge', lo: 11, hi: 16.5, expected: 0.32, tolerance: 0.07 },
    { band: 'the box edge to twenty-two', lo: 16.5, hi: 22, expected: 0.22, tolerance: 0.07 },
    { band: 'twenty-two to thirty', lo: 22, hi: 30, expected: 0.13, tolerance: 0.06 },
  ])('puts about $expected of shots $band', ({ lo, hi, expected, tolerance }) => {
    const got = share(lo, hi);
    expect(Math.abs(got - expected), `got ${got.toFixed(3)}`).toBeLessThanOrEqual(tolerance);
  });

  it('takes about three shots in five from inside the box', () => {
    const inside = distances.filter((d) => d <= 16.5).length / distances.length;
    expect(inside).toBeGreaterThan(0.5);
    expect(inside).toBeLessThan(0.72);
  });

  it('reaches both ends of the range, which is the whole point', () => {
    expect(share(0, 8)).toBeGreaterThan(0.08);
    expect(distances.filter((d) => d >= 25).length / distances.length).toBeGreaterThan(0.02);
  });
});

describe('the angle of a shot is geometry, not a constant', () => {
  it('matches the goalmouth actually visible from the spot', () => {
    // A goal is 7.32m wide, so from directly in front the angle is 2·atan(3.66/depth).
    expect(goalAngle(0, 6)).toBeCloseTo(62.8, 0);
    expect(goalAngle(0, 11)).toBeCloseTo(36.8, 0);
    expect(goalAngle(0, 16.5)).toBeCloseTo(25.0, 0);
    expect(goalAngle(0, 25)).toBeCloseTo(16.7, 0);
  });

  it('closes up as the shooter moves toward the byline', () => {
    let previous = Infinity;
    for (const lateral of [0, 4, 8, 12, 18]) {
      const angle = goalAngle(lateral, 6);
      expect(angle).toBeLessThan(previous);
      previous = angle;
    }
    // Eight metres out by the touchline sees less of the goal than eighteen metres out in front.
    expect(goalAngle(18, 6)).toBeLessThan(goalAngle(0, 18));
  });

  it('is symmetric, and never negative', () => {
    for (const lateral of [1, 5, 14, 30]) {
      expect(goalAngle(lateral, 9)).toBeCloseTo(goalAngle(-lateral, 9), 9);
      expect(goalAngle(lateral, 9)).toBeGreaterThan(0);
    }
    expect(goalAngle(0, 0)).toBeGreaterThan(0);
  });
});

describe('penetration responds to the match, not to a die alone', () => {
  it('works closer chances when it is the far better side', () => {
    // Space has to change chance *quality*, not just chance count — otherwise ability and tactics
    // would only ever move the shot tally, and every shot would be worth the same.
    //
    // Deliberately not asserted here: whether a deep compact block concedes closer chances than a
    // loose high line. Measured, it does — 14.8 m against 15.3 m — which is arguable football, since
    // a low block concedes territory but not space. I could not justify either direction from first
    // principles, and pinning one would be encoding a guess as a test. Left to the Step 4 harness,
    // which is the second signal pointing at this same pairing (see the 3d log).
    const strong = mean(
      sample(50, (i) =>
        simulateChain(
          {
            home: makeSide(makeClub('strong', 78)),
            away: makeSide(makeClub('weak', 38)),
            minutes: 90,
          },
          createRng(`quality-${i}`),
        ),
      ).flatMap((r) => r.shots.filter((s) => s.side === 'home').map((s) => s.distanceM)),
    );
    const even = mean(
      sample(50, (i) => evenMatch(`quality-even-${i}`)).flatMap((r) =>
        r.shots.filter((s) => s.side === 'home').map((s) => s.distanceM),
      ),
    );
    expect(strong).toBeLessThan(even);
  });

  it('gets closer on the break than in a settled attack', () => {
    const shots = sample(120, (i) => evenMatch(`break-${i}`)).flatMap((r) => r.shots);
    const counters = shots.filter((s) => s.situation === 'counter').map((s) => s.distanceM);
    const settled = shots.filter((s) => s.situation === 'open_play').map((s) => s.distanceM);
    expect(counters.length).toBeGreaterThan(20);
    expect(mean(counters)).toBeLessThan(mean(settled));
  });

  it('keeps set-piece shots close and in a crowd, as corners are', () => {
    const setPieces = sample(120, (i) => evenMatch(`sp-${i}`)).flatMap((r) =>
      r.shots.filter((s) => s.situation === 'set_piece'),
    );
    expect(setPieces.length).toBeGreaterThan(20);
    expect(mean(setPieces.map((s) => s.distanceM))).toBeLessThan(14);
  });
});
