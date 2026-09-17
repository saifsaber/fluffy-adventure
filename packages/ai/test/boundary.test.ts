import { describe, expect, it } from 'vitest';
import { compiles } from './compile.js';

/**
 * The two rules this package exists to make mechanical, checked the only way they can be.
 *
 * Both are compile-time guarantees, so both are tested by asking the compiler. A test that merely
 * called the functions correctly would pass whether or not the guarantee held.
 */

const PRELUDE = `
import { applyEffects, evidenceFromTrace, parseEffects } from '../../src/index.js';
import { playerId, type MatchResult, type Player } from '@dakka/engine';
declare const squad: readonly Player[];
declare const result: MatchResult;
`;

describe('an effect the schema rejects cannot reach the game', () => {
  it('refuses to apply an effect that did not come from the parser', () => {
    const attempt = compiles(
      'unvalidated-effect',
      `${PRELUDE}
       applyEffects(squad, { effects: [{ kind: 'player_backed', playerId: playerId('x') }] });`,
    );
    expect(attempt.ok, attempt.messages.join(' | ')).toBe(false);
  });

  it('refuses a bare array of effects', () => {
    const attempt = compiles(
      'bare-array',
      `${PRELUDE}
       applyEffects(squad, [{ kind: 'squad_praised' }]);`,
    );
    expect(attempt.ok, attempt.messages.join(' | ')).toBe(false);
  });

  it('accepts exactly one thing: what the parser returned', () => {
    // The mirror of the two above. Without it, a signature that rejected *everything* would pass
    // them both and the boundary would be a wall with no door.
    const attempt = compiles(
      'parsed-effect',
      `${PRELUDE}
       const parse = parseEffects([{ kind: 'squad_praised' }]);
       if (parse.ok) applyEffects(squad, parse.batch);`,
    );
    expect(attempt.ok, attempt.messages.join(' | ')).toBe(true);
  });
});

describe('a prompt may read the trace and nothing else', () => {
  it('refuses a MatchResult where evidence is built', () => {
    // A model handed the full result can discuss possession, shot counts and xG — numbers it was
    // never given a cause for. That is the competitor's failure mode with better prose.
    const attempt = compiles(
      'result-as-trace',
      `${PRELUDE}
       evidenceFromTrace(result, 'home', 'en');`,
    );
    expect(attempt.ok, attempt.messages.join(' | ')).toBe(false);
    expect(attempt.messages.join(' ')).toMatch(/MatchResult|not assignable/);
  });

  it('accepts the trace off that same result', () => {
    const attempt = compiles(
      'trace-off-result',
      `${PRELUDE}
       evidenceFromTrace(result.trace, 'home', 'en');`,
    );
    expect(attempt.ok, attempt.messages.join(' | ')).toBe(true);
  });

  it('refuses a locale that is not one of the two', () => {
    const attempt = compiles(
      'unknown-locale',
      `${PRELUDE}
       evidenceFromTrace(result.trace, 'home', 'fr');`,
    );
    expect(attempt.ok, attempt.messages.join(' | ')).toBe(false);
  });
});
