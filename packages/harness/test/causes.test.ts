import { describe, expect, it } from 'vitest';
import { ALL_CAUSES, type CauseTag } from '@dakka/engine';
import { DATA_ROOT, loadLeague } from '@dakka/content';
import { reportCauses, surveyCauses } from '../src/causes.js';

/**
 * A guard on what the trace can actually say.
 *
 * The survey found that 14 of 27 registered causes never fire — the whole `decision` domain among
 * them, which is the product's central claim. That is recorded as a blocker rather than fixed here.
 * What these tests do is stop it getting quietly worse: a cause that fires today and stops firing
 * after an engine change fails the run, instead of being noticed months later by a debrief that
 * went vague.
 */

const league = loadLeague(DATA_ROOT, 'egy-d4');
const survey = surveyCauses(league.clubs, { matches: 200, seed: 'test-survey' });

/** Everything above ~15% of matches in the 600-match run. Cheap to hit, loud when lost. */
const EXPECTED: readonly CauseTag[] = [
  'WASTEFUL_FINISHING',
  'KEEPER_HEROICS',
  'MIDFIELD_OUTNUMBERED',
  'CLINICAL_FINISHING',
  'HIGH_LINE_VS_PACE',
  'SET_PIECE_ADVANTAGE',
  'NARROW_SHAPE_CONCEDED_FLANKS',
  'DEEP_BLOCK_ABSORBED_PRESSURE',
  'COUNTER_ATTACK_EXPOSURE',
  'MIDFIELD_OVERLOAD',
];

describe('the survey itself', () => {
  it('gives the same answer every time it is asked', () => {
    const again = surveyCauses(league.clubs, { matches: 200, seed: 'test-survey' });
    expect(JSON.stringify(again)).toBe(JSON.stringify(survey));
  });

  it('accounts for every registered cause exactly once', () => {
    const seen = survey.seen.map((row) => row.cause);
    expect([...seen, ...survey.never].sort()).toEqual([...ALL_CAUSES].sort());
    expect(seen.filter((cause) => survey.never.includes(cause))).toEqual([]);
  });

  it('counts a cause it saw', () => {
    for (const row of survey.seen) {
      expect(row.matches, row.cause).toBeGreaterThan(0);
      expect(row.occurrences, row.cause).toBeGreaterThanOrEqual(row.matches);
      expect(row.maxPerMatch, row.cause).toBeGreaterThanOrEqual(1);
    }
  });

  it('refuses a league it cannot make a fixture from', () => {
    expect(() => surveyCauses(league.clubs.slice(0, 1), { matches: 1, seed: 'x' })).toThrow(
      /two clubs/,
    );
  });

  it('names the missing causes in its report rather than only the found ones', () => {
    const text = reportCauses(survey).join('\n');
    expect(text).toContain('NEVER EMITTED');
    for (const cause of survey.never) expect(text).toContain(cause);
  });
});

describe('what the engine can still explain', () => {
  it('keeps emitting the causes it emits today', () => {
    // Not a claim that these are the right causes — a guard that the set does not shrink. Every
    // one lost here is a match the debrief can no longer explain.
    const seen = new Set(survey.seen.map((row) => row.cause));
    const lost = EXPECTED.filter((cause) => !seen.has(cause));
    expect(lost, 'causes that used to fire and no longer do').toEqual([]);
  });

  it('produces a trace worth narrating at all', () => {
    expect(survey.swingsPerMatch).toBeGreaterThan(4);
    expect(survey.swingsPerMatch).toBeLessThan(9);
  });
});
