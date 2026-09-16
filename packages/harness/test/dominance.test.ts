import { describe, expect, it } from 'vitest';
import { DIALS, goalDifference, verdictOf, type Cell } from '../src/dominance.js';

/**
 * The verdict logic, tested on matrices written by hand.
 *
 * Kept separate from the measuring so this runs in milliseconds instead of several thousand
 * simulated matches — and so the case that actually matters can be constructed rather than waited
 * for: **a difference the size of the noise must not come back as dominance.** "Beaten in every
 * column" is a conjunction of several comparisons, and at a small sample enough of them line up by
 * luck that the probe will indict a healthy dial. It did, before this: at 48 matches a cell it
 * reported `compactness` dominance in the opposite direction to the one it found at 480.
 */

const SETTINGS = ['a', 'b'] as const;

/** A cell whose per-match goal differences follow `values`, repeated to `matches` entries. */
function cell(own: string, against: string, values: readonly number[], matches: number): Cell {
  const perMatch = Array.from({ length: matches }, (_, i) => values[i % values.length] ?? 0);
  const total = perMatch.reduce((sum, v) => sum + v, 0);
  return {
    own,
    against,
    // Only the difference matters here, so the split is arbitrary but consistent with it.
    goalsFor: total / matches,
    goalsAgainst: 0,
    matches,
    perMatch,
  };
}

describe('a real gap is dominance', () => {
  it('names the setting that is beaten everywhere, and by whom', () => {
    const cells = [
      cell('a', 'a', [0], 60),
      cell('a', 'b', [0], 60),
      cell('b', 'a', [1], 60),
      cell('b', 'b', [1], 60),
    ];
    const verdict = verdictOf(SETTINGS, cells);
    expect(verdict.healthy).toBe(false);
    expect(verdict.dominated).toEqual([{ setting: 'a', by: 'b' }]);
    expect(verdict.neverBest).toEqual(['a']);
    expect(verdict.bestResponses.get('a')).toBe('b');
  });
});

describe('noise is not dominance', () => {
  it('refuses to call a gap it cannot distinguish from luck', () => {
    // `b` is ahead by 0.05 a match on average, but match by match the gap swings between -2 and
    // +2.1. Over 120 matches the standard error of that difference is about 0.27, so the effect is a
    // fifth of one error. A verdict that called this would be reporting the sample, not the engine.
    //
    // Note what the *difference* has to do: nudging both arms by the same amount leaves a constant
    // gap, and a constant gap is certainty, not noise. Pairing is only forgiving when the pairs
    // disagree with each other.
    const level = [0, 0];
    const noisy = [-2, 2.1];
    const cells = [
      cell('a', 'a', level, 120),
      cell('a', 'b', level, 120),
      cell('b', 'a', noisy, 120),
      cell('b', 'b', noisy, 120),
    ];
    const verdict = verdictOf(SETTINGS, cells);
    expect(verdict.dominated).toEqual([]);
    expect(verdict.healthy).toBe(true);
    // It still reports who is nominally ahead — that is a different, weaker claim, and the report
    // marks it with a star rather than calling it a finding.
    expect(verdict.bestResponses.get('a')).toBe('b');
  });

  it('calls the same gap once the sample can carry it', () => {
    // The identical effect with no spread at all: every pair agrees, so there is nothing to average
    // away and the verdict is earned rather than assumed.
    const cells = [
      cell('a', 'a', [0], 120),
      cell('a', 'b', [0], 120),
      cell('b', 'a', [0.05], 120),
      cell('b', 'b', [0.05], 120),
    ];
    expect(verdictOf(SETTINGS, cells).dominated).toEqual([{ setting: 'a', by: 'b' }]);
  });
});

describe('being ahead somewhere is enough to escape', () => {
  it('does not convict a setting that wins a column, even by less than the noise', () => {
    // The bug this replaced. `b` is hugely better in one column and slightly worse in the other;
    // because "slightly" was not significant, the old rule read it as beaten everywhere and
    // convicted. But a setting that is ahead anywhere has a context where it is worth choosing,
    // whether or not this many matches can prove it — that is what the matrix is for.
    //
    // The gap in the `b` column has to be *noisy* for this to test anything: a clean 0.04 every
    // match is a certainty, not a tie, and the old rule would have escaped it for the right reason
    // by accident. Here the pairs swing between -2 and +1.92, so the tie is genuine.
    const cells = [
      cell('a', 'a', [0], 200),
      cell('a', 'b', [0], 200),
      cell('b', 'a', [1], 200),
      cell('b', 'b', [-2, 1.92], 200),
    ];
    const verdict = verdictOf(SETTINGS, cells);
    expect(verdict.dominated).toEqual([]);
    expect(verdict.bestResponses.get('b')).toBe('a');
  });
});

describe('a healthy dial', () => {
  it('finds no dominance when each setting answers something best', () => {
    // Rock, paper, scissors: every setting beats one and loses to another.
    const settings = ['rock', 'paper', 'scissors'];
    const beats: Record<string, string> = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
    const cells: Cell[] = [];
    for (const own of settings) {
      for (const against of settings) {
        const value = beats[own] === against ? 1 : beats[against] === own ? -1 : 0;
        cells.push(cell(own, against, [value], 60));
      }
    }
    const verdict = verdictOf(settings, cells);
    expect(verdict.healthy).toBe(true);
    expect(verdict.dominated).toEqual([]);
    expect(verdict.neverBest).toEqual([]);
  });
});

describe('it refuses to compare what it cannot pair', () => {
  it('skips cells measured over different numbers of matches', () => {
    // Different lengths mean the two cells did not see the same fixtures, so pairing them would turn
    // a methodology mistake into a finding.
    const cells = [
      cell('a', 'a', [0], 60),
      cell('a', 'b', [0], 60),
      cell('b', 'a', [1], 40),
      cell('b', 'b', [1], 40),
    ];
    expect(verdictOf(SETTINGS, cells).dominated).toEqual([]);
  });

  it('survives an empty matrix without inventing a verdict', () => {
    const verdict = verdictOf(SETTINGS, []);
    expect(verdict.dominated).toEqual([]);
    expect(verdict.bestResponses.size).toBe(0);
    expect(verdict.healthy).toBe(true);
  });
});

describe('the dials it knows about', () => {
  it('lists every setting of every tactical dial', () => {
    // A dial with a missing setting would be probed incompletely and silently pass.
    expect(DIALS.lineHeight).toEqual(['deep', 'normal', 'high', 'very_high']);
    expect(DIALS.mentality).toHaveLength(5);
    expect(DIALS.pressingIntensity).toHaveLength(4);
    for (const settings of Object.values(DIALS)) {
      expect(new Set(settings).size).toBe(settings.length);
    }
  });

  it('reads goal difference as scored minus conceded', () => {
    expect(
      goalDifference({
        own: 'a',
        against: 'b',
        goalsFor: 2.5,
        goalsAgainst: 1.25,
        matches: 1,
        perMatch: [1.25],
      }),
    ).toBeCloseTo(1.25, 9);
  });
});
