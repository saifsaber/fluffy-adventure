import { describe, expect, it } from 'vitest';
import { LOCALES, evidenceFromTrace, numbersIn } from '../src/index.js';
import { trace } from './fixtures.js';

/**
 * What the model is shown about a match.
 *
 * Two claims: it contains nothing the trace did not produce, and it is already oriented to the
 * manager being spoken to. The second is not a convenience. A model that has to remember to flip a
 * home-signed number for an away manager will eventually forget, and the debrief it writes will be
 * fluent, specific and exactly backwards.
 */

describe('nothing the trace did not produce', () => {
  it('carries a fixed set of fields, so nothing can be added by accident', () => {
    const evidence = evidenceFromTrace(trace, 'home', 'en');
    expect(Object.keys(evidence).sort()).toEqual(
      ['final', 'kickoff', 'locale', 'moments', 'side'].sort(),
    );
    for (const moment of evidence.moments) {
      expect(Object.keys(moment).sort()).toEqual(
        ['actors', 'cause', 'delta', 'favoured', 'minute'].sort(),
      );
    }
  });

  it('has a moment for each swing and no more', () => {
    const evidence = evidenceFromTrace(trace, 'home', 'en');
    expect(evidence.moments.map((m) => m.minute)).toEqual(trace.swings.map((s) => s.minute));
    expect(evidence.moments.map((m) => m.cause)).toEqual(trace.swings.map((s) => s.cause));
  });

  it('lists every number in it, for the prompt test that comes next', () => {
    const evidence = evidenceFromTrace(trace, 'home', 'en');
    const numbers = numbersIn(evidence);
    expect(numbers).toContain(23);
    expect(numbers).toContain(-0.14);
    expect(numbers).toHaveLength(2 + trace.swings.length * 2);
    for (const value of numbers) expect(Number.isFinite(value)).toBe(true);
  });

  it('says nothing about a quiet match rather than padding it', () => {
    const quiet = evidenceFromTrace(
      { swings: [], winProbabilityTimeline: [0.5, 0.5] },
      'home',
      'en',
    );
    expect(quiet.moments).toEqual([]);
  });
});

describe('oriented to the manager being spoken to', () => {
  it('flips the sign of every swing for the away manager', () => {
    const home = evidenceFromTrace(trace, 'home', 'en');
    const away = evidenceFromTrace(trace, 'away', 'en');
    expect(home.moments.map((m) => m.delta)).toEqual([-0.14, 0.31]);
    expect(away.moments.map((m) => m.delta)).toEqual([0.14, -0.31]);
  });

  it('says who each moment helped, in the second person', () => {
    expect(evidenceFromTrace(trace, 'home', 'en').moments.map((m) => m.favoured)).toEqual([
      'them',
      'you',
    ]);
    expect(evidenceFromTrace(trace, 'away', 'en').moments.map((m) => m.favoured)).toEqual([
      'you',
      'them',
    ]);
  });

  it('keeps the sign and the side in agreement', () => {
    // The two are derived separately — one from the delta, one from the engine's `favoured` — so
    // they can disagree, and a debrief reading one while quoting the other is the polarity bug in
    // its most convincing form.
    for (const side of ['home', 'away'] as const) {
      for (const moment of evidenceFromTrace(trace, side, 'en').moments) {
        expect(moment.favoured, `${side} @${moment.minute}`).toBe(
          moment.delta >= 0 ? 'you' : 'them',
        );
      }
    }
  });

  it('turns the win-probability timeline around too', () => {
    const home = evidenceFromTrace(trace, 'home', 'en');
    const away = evidenceFromTrace(trace, 'away', 'en');
    expect(home.final).toBe(1);
    expect(away.final).toBe(0);
    expect(home.kickoff + away.kickoff).toBeCloseTo(1, 9);
  });

  it('carries the locale it was asked for, and only the two that exist', () => {
    for (const locale of LOCALES) {
      expect(evidenceFromTrace(trace, 'home', locale).locale).toBe(locale);
    }
  });
});
