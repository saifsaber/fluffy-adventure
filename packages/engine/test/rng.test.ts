import { describe, expect, it } from 'vitest';
import { createRng } from '../src/index.js';

/**
 * These tests are not about randomness being "random enough" in the abstract. They check the four
 * properties the product actually depends on: reproducibility, independence between seeds,
 * uniformity, and substream stability. If any one fails, the counterfactual runner and the daily
 * challenge are both quietly broken.
 */

const draws = (seed: string, n: number): number[] => {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => rng.next());
};

describe('reproducibility', () => {
  it('gives an identical sequence for the same seed', () => {
    expect(draws('match-1', 100_000)).toEqual(draws('match-1', 100_000));
  });

  it('keeps two generators on the same seed independent of each other', () => {
    // Interleaving must not matter — no shared or global state anywhere.
    const a = createRng('shared');
    const b = createRng('shared');
    const interleaved: number[] = [];
    for (let i = 0; i < 500; i++) {
      interleaved.push(a.next());
      b.next();
    }
    expect(interleaved).toEqual(draws('shared', 500));
  });
});

describe('independence between seeds', () => {
  it('diverges immediately for seeds differing by one character', () => {
    // Consecutive rounds in a season are seeded from adjacent strings. If these correlated,
    // round 13 would inherit round 12's luck.
    const a = draws('round-12', 200);
    const b = draws('round-13', 200);
    expect(a[0]).not.toBe(b[0]);
    const agreeing = a.filter((v, i) => Math.abs(v - (b[i] ?? 0)) < 1e-9).length;
    expect(agreeing).toBe(0);
  });

  it('produces no linear correlation between two nearby seeds', () => {
    const n = 20_000;
    const a = draws('seed-a', n);
    const b = draws('seed-b', n);
    const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    const ma = mean(a);
    const mb = mean(b);
    let cov = 0;
    let va = 0;
    let vb = 0;
    for (let i = 0; i < n; i++) {
      const da = (a[i] ?? 0) - ma;
      const db = (b[i] ?? 0) - mb;
      cov += da * db;
      va += da * da;
      vb += db * db;
    }
    expect(Math.abs(cov / Math.sqrt(va * vb))).toBeLessThan(0.03);
  });
});

describe('distribution', () => {
  const sample = draws('uniformity', 200_000);

  it('stays inside [0, 1)', () => {
    // Reduced rather than spread: 200k arguments overflows the call stack.
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of sample) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThan(1);
  });

  it('is uniform across ten buckets', () => {
    const buckets = new Array<number>(10).fill(0);
    for (const v of sample) buckets[Math.floor(v * 10)]! += 1;
    const expected = sample.length / 10;
    const chiSquare = buckets.reduce((s, o) => s + (o - expected) ** 2 / expected, 0);
    // 9 degrees of freedom: the 99.9% critical value is 27.9.
    expect(chiSquare).toBeLessThan(27.9);
  });

  it('has a mean near one half', () => {
    const mean = sample.reduce((s, x) => s + x, 0) / sample.length;
    expect(mean).toBeGreaterThan(0.495);
    expect(mean).toBeLessThan(0.505);
  });
});

describe('int', () => {
  it('covers both bounds inclusively and nothing outside them', () => {
    const rng = createRng('dice');
    const seen = new Set<number>();
    for (let i = 0; i < 60_000; i++) {
      const v = rng.int(1, 6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect(seen.size).toBe(6);
  });

  it('is uniform across the range', () => {
    const rng = createRng('dice-uniformity');
    const counts = new Array<number>(6).fill(0);
    const n = 120_000;
    for (let i = 0; i < n; i++) counts[rng.int(0, 5)]! += 1;
    for (const c of counts) expect(Math.abs(c - n / 6) / (n / 6)).toBeLessThan(0.03);
  });

  it('handles a single-value range and rejects a reversed or fractional one', () => {
    const rng = createRng('edges');
    expect(rng.int(7, 7)).toBe(7);
    expect(() => rng.int(5, 1)).toThrow(RangeError);
    expect(() => rng.int(0.5, 3)).toThrow(RangeError);
  });
});

describe('bool and pick', () => {
  it('respects the given probability', () => {
    const rng = createRng('coin');
    let heads = 0;
    const n = 100_000;
    for (let i = 0; i < n; i++) if (rng.bool(0.3)) heads += 1;
    expect(Math.abs(heads / n - 0.3)).toBeLessThan(0.01);
  });

  it('never returns undefined and eventually returns every element', () => {
    const rng = createRng('picker');
    const items = ['a', 'b', 'c', 'd'] as const;
    const seen = new Set<string>();
    for (let i = 0; i < 5_000; i++) seen.add(rng.pick(items));
    expect(seen.size).toBe(items.length);
  });
});

describe('fork', () => {
  it('gives each label its own stream', () => {
    const parent = createRng('match');
    const injuries = parent.fork('injuries');
    const shots = parent.fork('shots');
    const a = Array.from({ length: 100 }, () => injuries.next());
    const b = Array.from({ length: 100 }, () => shots.next());
    expect(a).not.toEqual(b);
  });

  it('is reproducible, so a forked substream replays identically', () => {
    const one = createRng('match').fork('shots');
    const two = createRng('match').fork('shots');
    expect(Array.from({ length: 1_000 }, () => one.next())).toEqual(
      Array.from({ length: 1_000 }, () => two.next()),
    );
  });
});
