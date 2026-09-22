import { describe, expect, it } from 'vitest';
import { MAX_EFFECTS, MORALE_FOR, applyEffects, parseEffects } from '../src/index.js';
import { player } from './fixtures.js';

/**
 * What a model is allowed to make happen.
 *
 * The tests that matter most are the refusals. A validator that accepts good input is easy; this
 * one earns its place by what it turns away, and above all by having nowhere for a model to write a
 * number.
 */

const squad = [player('one', 60), player('two', 60), player('three', 98)];

const accepted = (raw: unknown) => {
  const parse = parseEffects(raw);
  if (!parse.ok) throw new Error(`expected accepted, got: ${parse.problems.join(' | ')}`);
  return parse.batch;
};

describe('what the schema turns away', () => {
  it('refuses an effect carrying a magnitude', () => {
    // The single most important refusal here. The blueprint puts morale in the deterministic
    // column, so a model that can write `delta: 50` has been handed the thing code is supposed to
    // own. Stripping the field silently would be worse than rejecting: nobody would learn it tried.
    const parse = parseEffects([{ kind: 'player_backed', playerId: 'one', delta: 50 }]);
    expect(parse.ok).toBe(false);
  });

  it('refuses an extra field on every kind, not just the ones with a target', () => {
    // The next test only inspects what came back from valid input, so it cannot see a member that
    // quietly accepts junk. Sabotaging `.strict()` on the squad-wide members proved exactly that:
    // the schema was broken and every test still passed.
    const kinds = [
      { kind: 'player_backed', playerId: 'one' },
      { kind: 'player_criticised', playerId: 'one' },
      { kind: 'squad_praised' },
      { kind: 'squad_criticised' },
      { kind: 'nothing_said' },
    ];
    for (const clean of kinds) {
      expect(parseEffects([clean]).ok, `${clean.kind} clean`).toBe(true);
      expect(parseEffects([{ ...clean, delta: 50 }]).ok, `${clean.kind} + delta`).toBe(false);
    }
  });

  it('has no numeric field anywhere in the accepted shape', () => {
    // The structural version of the same claim, so a future effect kind cannot quietly add one.
    const batch = accepted([
      { kind: 'player_backed', playerId: 'one' },
      { kind: 'squad_criticised' },
      { kind: 'nothing_said' },
    ]);
    for (const effect of batch.effects) {
      for (const [key, value] of Object.entries(effect)) {
        expect(typeof value, `${effect.kind}.${key}`).not.toBe('number');
      }
    }
  });

  it('refuses a kind nobody registered', () => {
    expect(parseEffects([{ kind: 'sack_the_board' }]).ok).toBe(false);
    expect(parseEffects([{ kind: 'player_backed' }]).ok).toBe(false);
  });

  it('refuses anything that is not a list of effects', () => {
    for (const raw of [null, undefined, 'player_backed', 7, { kind: 'squad_praised' }]) {
      expect(parseEffects(raw).ok, JSON.stringify(raw ?? null)).toBe(false);
    }
  });

  it('refuses a batch longer than one exchange could be', () => {
    const many = Array.from({ length: MAX_EFFECTS + 1 }, () => ({ kind: 'nothing_said' }));
    expect(parseEffects(many).ok).toBe(false);
    expect(parseEffects(many.slice(1)).ok).toBe(true);
  });

  it('refuses the same player named twice, so repetition is not an exploit', () => {
    const parse = parseEffects([
      { kind: 'player_backed', playerId: 'one' },
      { kind: 'player_backed', playerId: 'one' },
    ]);
    expect(parse.ok).toBe(false);
    if (!parse.ok) expect(parse.problems.join(' ')).toMatch(/more than once/);
  });

  it('refuses two squad-wide effects in one exchange', () => {
    expect(parseEffects([{ kind: 'squad_praised' }, { kind: 'squad_criticised' }]).ok).toBe(false);
  });

  it('reports problems rather than throwing, because a bad reply is expected', () => {
    const parse = parseEffects([{ kind: 'nonsense' }]);
    expect(parse.ok).toBe(false);
    if (!parse.ok) expect(parse.problems.length).toBeGreaterThan(0);
  });
});

describe('what applying does', () => {
  it('moves morale by the table in this file, not by anything the model said', () => {
    const { squad: after, changes } = applyEffects(
      squad,
      accepted([{ kind: 'player_backed', playerId: 'one' }]),
    );
    expect(after[0]?.condition.morale).toBe(60 + MORALE_FOR.player_backed);
    expect(after[1]?.condition.morale).toBe(60);
    expect(changes).toEqual([
      {
        playerId: 'one',
        from: 60,
        to: 60 + MORALE_FOR.player_backed,
        because: 'player_backed',
        // These fixtures have no personality, so what it was worth to him is what the table says.
        worth: MORALE_FOR.player_backed,
      },
    ]);
  });

  it('attaches a cause to every change it reports', () => {
    // A morale move the player cannot trace to a moment is the kind of number this product refuses
    // to show, so the applier hands back the reason with the number rather than leaving the caller
    // to remember it.
    const { changes } = applyEffects(squad, accepted([{ kind: 'squad_criticised' }]));
    expect(changes).toHaveLength(3);
    for (const change of changes) expect(change.because).toBe('squad_criticised');
  });

  it('lets a word to one player override what was said to the room', () => {
    const { squad: after } = applyEffects(
      squad,
      accepted([{ kind: 'squad_criticised' }, { kind: 'player_backed', playerId: 'one' }]),
    );
    expect(after[0]?.condition.morale).toBe(60 + MORALE_FOR.player_backed);
    expect(after[1]?.condition.morale).toBe(60 + MORALE_FOR.squad_criticised);
  });

  it('keeps morale inside its range and reports no change when it is already there', () => {
    const { squad: after, changes } = applyEffects(squad, accepted([{ kind: 'squad_praised' }]));
    expect(after[2]?.condition.morale).toBe(100);
    expect(changes.find((c) => c.playerId === 'three')?.to).toBe(100);

    const { changes: none } = applyEffects(
      [player('capped', 100)],
      accepted([{ kind: 'squad_praised' }]),
    );
    expect(none).toEqual([]);
  });

  it('does nothing at all when nothing was said', () => {
    const { squad: after, changes } = applyEffects(squad, accepted([{ kind: 'nothing_said' }]));
    expect(changes).toEqual([]);
    expect(after).toEqual(squad);
  });

  it('leaves the squad it was given untouched', () => {
    const before = JSON.stringify(squad);
    applyEffects(squad, accepted([{ kind: 'squad_criticised' }]));
    expect(JSON.stringify(squad)).toBe(before);
  });

  it('gives the same answer every time', () => {
    const run = () => JSON.stringify(applyEffects(squad, accepted([{ kind: 'squad_praised' }])));
    expect(run()).toBe(run());
  });
});
