import { describe, expect, it } from 'vitest';
import {
  PENALTY_XG,
  XG_ANCHORS,
  createRng,
  expectedGoals,
  isOnTarget,
  playerId,
  resolveShot,
  type Player,
  type ShotContext,
  type ShotOutcome,
} from '../src/index.js';
import { makePlayer, patchPlayer } from './fixtures.js';

/**
 * Two claims are on trial here.
 *
 * The first is ordinary: does the curve agree with published xG norms? That is the table-driven
 * anchor test, and it is the only thing in this repo calibrated against a number from outside it.
 *
 * The second is the one the product rests on: **xG must not know who took the shot, and must not
 * know whether it went in.** The signature enforces the first half at compile time. The tests below
 * enforce it where it can be observed — a world-class finisher and a hopeless one are given the
 * identical xG for the identical chance, and only their conversion differs. That is what makes
 * "he should have scored" a measurement instead of an opinion.
 */

const shot = (over: Partial<ShotContext> = {}): ShotContext => ({
  minute: 23,
  side: 'home',
  shooter: playerId('striker'),
  distanceM: 16,
  angleDeg: 25,
  pressure: 45,
  bodyPart: 'right_foot',
  situation: 'open_play',
  ...over,
});

const striker = (finishing: number, composure: number): Player =>
  patchPlayer(makePlayer('striker', 'ST', 'poacher', 55), {
    technical: { finishing },
    mental: { composure },
  });

const keeper = (quality: number): Player => makePlayer('keeper', 'GK', 'shot_stopper', quality);

const rateOf = (
  context: ShotContext,
  shooter: Player | undefined,
  gk: Player | undefined,
  n = 4000,
): number => {
  const rng = createRng(
    `rate-${context.distanceM}-${shooter?.slug ?? 'none'}-${gk?.slug ?? 'none'}`,
  );
  let goals = 0;
  for (let i = 0; i < n; i++)
    if (resolveShot(context, shooter, gk, rng).outcome === 'goal') goals += 1;
  return goals / n;
};

describe('calibration against published xG norms', () => {
  it.each(XG_ANCHORS)('$what is worth about $expected', (anchor) => {
    const value = expectedGoals(shot({ distanceM: anchor.distanceM, angleDeg: anchor.angleDeg }));
    expect(Math.abs(value - anchor.expected), `got ${value.toFixed(3)}`).toBeLessThanOrEqual(
      anchor.tolerance,
    );
  });

  it('prices a penalty at the published conversion rate, ignoring where it was placed', () => {
    // A penalty is its own event, not a shot from a location. Running it through the distance curve
    // would be a category error, so geometry must not move it at all.
    expect(expectedGoals(shot({ situation: 'penalty' }))).toBe(PENALTY_XG);
    expect(expectedGoals(shot({ situation: 'penalty', distanceM: 30, angleDeg: 5 }))).toBe(
      PENALTY_XG,
    );
    expect(expectedGoals(shot({ situation: 'penalty', pressure: 98 }))).toBe(PENALTY_XG);
  });
});

describe('the curve behaves like football', () => {
  it('falls with distance, at every angle', () => {
    for (const angleDeg of [12, 25, 45, 70]) {
      let previous = Infinity;
      for (const distanceM of [5, 8, 12, 16, 20, 25, 30, 35]) {
        const value = expectedGoals(shot({ distanceM, angleDeg }));
        expect(value, `${distanceM}m at ${angleDeg}deg`).toBeLessThan(previous);
        previous = value;
      }
    }
  });

  it('rises with the angle of goal available, at every distance', () => {
    for (const distanceM of [6, 12, 20, 30]) {
      let previous = 0;
      for (const angleDeg of [5, 12, 25, 45, 70]) {
        const value = expectedGoals(shot({ distanceM, angleDeg }));
        expect(value, `${angleDeg}deg at ${distanceM}m`).toBeGreaterThan(previous);
        previous = value;
      }
    }
  });

  it('makes a tight angle close in worse than a clear sight from further out', () => {
    // The reason angle has to be a separate input rather than a proxy for distance.
    expect(expectedGoals(shot({ distanceM: 8, angleDeg: 10 }))).toBeLessThan(
      expectedGoals(shot({ distanceM: 14, angleDeg: 35 })),
    );
  });

  it('punishes being closed down', () => {
    const free = expectedGoals(shot({ pressure: 5 }));
    const crowded = expectedGoals(shot({ pressure: 95 }));
    expect(crowded).toBeLessThan(free);
    expect(free / crowded).toBeGreaterThan(1.5);
  });

  it('rates a header below a foot from the same place', () => {
    const foot = expectedGoals(shot({ distanceM: 6, angleDeg: 65 }));
    const head = expectedGoals(shot({ distanceM: 6, angleDeg: 65, bodyPart: 'head' }));
    expect(head).toBeLessThan(foot);
    expect(head).toBeGreaterThan(foot * 0.5);
  });

  it('does not count a counter-attack twice', () => {
    // The chain already gives a counter twenty points less pressure, which is most of the benefit.
    // The situation bonus on top must stay small, or the same disarray is paid for twice.
    const openPlay = expectedGoals(shot({ pressure: 45 }));
    const counter = expectedGoals(shot({ pressure: 45, situation: 'counter' }));
    expect(counter / openPlay).toBeGreaterThan(1);
    expect(counter / openPlay).toBeLessThan(1.25);
  });

  it('stays a probability for absurd inputs instead of returning NaN', () => {
    for (const context of [
      shot({ distanceM: 0, angleDeg: 0 }),
      shot({ distanceM: -5, angleDeg: -20 }),
      shot({ distanceM: 400, angleDeg: 500 }),
      shot({ pressure: -50 }),
      shot({ pressure: 9999 }),
    ]) {
      const value = expectedGoals(context);
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('xG does not know who took the shot', () => {
  const chance = shot({ distanceM: 11, angleDeg: 40 });
  const worldClass = striker(95, 92);
  const hopeless = striker(20, 25);

  it('gives the same chance the same value whoever is standing over it', () => {
    const rng = createRng('identical');
    const a = resolveShot(chance, worldClass, undefined, rng);
    const b = resolveShot(chance, hopeless, undefined, rng);
    expect(a.xg).toBe(b.xg);
    expect(a.xg).toBe(expectedGoals(chance));
  });

  it('still lets the better finisher score more of them', () => {
    // This is the whole point of the separation: the yardstick holds still, and the player moves
    // against it. CLINICAL_FINISHING and WASTEFUL_FINISHING are only meaningful because of this.
    expect(rateOf(chance, worldClass, undefined)).toBeGreaterThan(
      rateOf(chance, hopeless, undefined) * 1.5,
    );
  });

  it('lets a good keeper save more of them, without changing what they were worth', () => {
    const great = keeper(90);
    const poor = keeper(25);
    expect(rateOf(chance, undefined, great)).toBeLessThan(rateOf(chance, undefined, poor));
    const rng = createRng('keepers');
    expect(resolveShot(chance, undefined, great, rng).xg).toBe(
      resolveShot(chance, undefined, poor, rng).xg,
    );
  });

  it('reports the xG it computed from the context, not something adjusted afterwards', () => {
    const rng = createRng('reported');
    for (let i = 0; i < 200; i++) {
      const context = shot({ distanceM: 5 + i * 0.15, angleDeg: 8 + i * 0.3 });
      expect(resolveShot(context, worldClass, keeper(80), rng).xg).toBe(expectedGoals(context));
    }
  });
});

describe('resolving a shot', () => {
  it('is deterministic for a given seed', () => {
    const a = createRng('same');
    const b = createRng('same');
    const context = shot();
    for (let i = 0; i < 100; i++) {
      expect(resolveShot(context, undefined, undefined, a)).toEqual(
        resolveShot(context, undefined, undefined, b),
      );
    }
  });

  it('produces a plausible spread of outcomes', () => {
    const rng = createRng('outcomes');
    const counts: Record<ShotOutcome, number> = {
      goal: 0,
      saved: 0,
      blocked: 0,
      off_target: 0,
      woodwork: 0,
    };
    const n = 20_000;
    for (let i = 0; i < n; i++) {
      // A spread of chances rather than one repeated shot, so the mix is not an artefact.
      const context = shot({ distanceM: 6 + (i % 25), angleDeg: 10 + (i % 50) });
      counts[resolveShot(context, undefined, undefined, rng).outcome] += 1;
    }
    expect(counts.blocked / n).toBeGreaterThan(0.15);
    expect(counts.blocked / n).toBeLessThan(0.45);
    expect(counts.woodwork / n).toBeLessThan(0.05);
    expect(counts.off_target / n).toBeGreaterThan(0.2);
    const onTarget = (counts.goal + counts.saved) / n;
    expect(onTarget).toBeGreaterThan(0.15);
    expect(onTarget).toBeLessThan(0.55);
  });

  it('counts a goal as on target and a block as not', () => {
    expect(isOnTarget('goal')).toBe(true);
    expect(isOnTarget('saved')).toBe(true);
    expect(isOnTarget('blocked')).toBe(false);
    expect(isOnTarget('off_target')).toBe(false);
    expect(isOnTarget('woodwork')).toBe(false);
  });

  it('converts average players at about the rate their xG claims', () => {
    // The honesty check. If the goals an average side scores do not track the xG we show them, then
    // the xG is decoration. Over twenty thousand shots the two must agree closely.
    const rng = createRng('calibration');
    let xg = 0;
    let goals = 0;
    const n = 20_000;
    for (let i = 0; i < n; i++) {
      const context = shot({ distanceM: 5 + (i % 28), angleDeg: 8 + (i % 55) });
      const resolved = resolveShot(
        context,
        makePlayer('avg', 'ST', 'poacher', 50),
        keeper(50),
        rng,
      );
      xg += resolved.xg;
      goals += resolved.outcome === 'goal' ? 1 : 0;
    }
    expect(goals / xg).toBeGreaterThan(0.9);
    expect(goals / xg).toBeLessThan(1.1);
  });
});
