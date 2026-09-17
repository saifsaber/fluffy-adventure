import { describe, expect, it } from 'vitest';
import { DATA_ROOT, loadLeague } from '@dakka/content';
import { simulate } from '@dakka/engine';
import { buildMatch, seedOf, yourSide, type Setup } from '../src/match.js';

/**
 * The fixture the screen hands the engine.
 *
 * Two things matter here and nothing else does. The two arms of the counterfactual must differ by
 * the decision and by *nothing* else, or the number the product is built on measures the wrong
 * thing. And the seed must come from the choices rather than a clock, because that is what makes a
 * match reproducible on another machine.
 */

const league = loadLeague(DATA_ROOT, 'egy-d4');
const [first, second] = league.clubs;
if (first === undefined || second === undefined) throw new Error('fixture league too small');

/**
 * Every dial deliberately off its neutral value.
 *
 * With `balanced`/`normal`/`moderate` here, an arm that silently reset the tactics would compare
 * equal to one that did not, and "the two arms differ only by the decision" would assert nothing —
 * the same way +MGR's baseline once passed fourteen tests while keeping the player's decisions,
 * because every fixture had none to keep.
 */
const base: Setup = {
  yourSlug: first.slug,
  opponentSlug: second.slug,
  venue: 'home',
  approach: 'attacking',
  line: 'high',
  press: 'high',
  call: { kind: 'mentality', minute: 60, to: 'defensive' },
};

describe('the two arms of the counterfactual', () => {
  it('differ by the decision and by nothing else', () => {
    // If this ever compares equal for the wrong reason, the counterfactual stops measuring the
    // decision and starts measuring whatever else drifted between the arms — while still printing
    // a confident number with error bars on it.
    expect(base.approach).not.toBe('balanced');
    const played = buildMatch(league, base, true);
    const without = buildMatch(league, base, false);
    expect(played.seed).toBe(without.seed);
    expect(played.context).toEqual(without.context);
    expect(played.away).toEqual(without.away);
    expect(played.home.club).toEqual(without.home.club);
    expect(played.home.tactics).toEqual(without.home.tactics);
    expect(played.home.decisions).toEqual([base.call]);
    expect(without.home.decisions).toEqual([]);
  });

  it('puts the player on the side the venue says', () => {
    expect(yourSide(base)).toBe('home');
    const away = buildMatch(league, { ...base, venue: 'away' }, true);
    expect(away.away.club.slug).toBe(first.slug);
    expect(away.away.decisions).toHaveLength(1);
    expect(away.home.decisions).toEqual([]);
  });

  it('leaves the opponent on the neutral baseline, with no decisions of its own', () => {
    // An opponent with invented instructions would make every result a comparison against fiction.
    const played = buildMatch(league, base, true);
    expect(played.away.decisions).toEqual([]);
    expect(played.away.tactics.mentality).toBe('balanced');
    expect(played.away.tactics.lineHeight).toBe('normal');
  });
});

describe('the seed', () => {
  it('comes from the choices, so the same setup is the same match', () => {
    expect(seedOf(base)).toBe(seedOf({ ...base }));
    const a = simulate(buildMatch(league, base));
    const b = simulate(buildMatch(league, base));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('changes when any choice changes', () => {
    const seeds = new Set([
      seedOf(base),
      seedOf({ ...base, approach: 'defensive' }),
      seedOf({ ...base, line: 'deep' }),
      seedOf({ ...base, press: 'contain' }),
      seedOf({ ...base, venue: 'away' }),
      seedOf({ ...base, call: null }),
      seedOf({ ...base, call: { kind: 'mentality', minute: 61, to: 'defensive' } }),
    ]);
    expect(seeds.size).toBe(7);
  });
});

describe('the match context', () => {
  it("takes travel from the two clubs' real locations", () => {
    const near = buildMatch(league, base).context.awayTravelKm;
    expect(near).toBeGreaterThan(0);
    expect(Number.isInteger(near)).toBe(true);
  });

  it('takes attendance from the home ground, not from a guess', () => {
    const home = buildMatch(league, base);
    expect(home.context.attendance).toBe(first.stadium.capacity);
    const away = buildMatch(league, { ...base, venue: 'away' });
    expect(away.context.attendance).toBe(second.stadium.capacity);
  });

  it('calls a derby a derby only when the regions match', () => {
    const played = buildMatch(league, base);
    const sameRegion = league.data[0]?.region === league.data[1]?.region;
    expect(played.context.isDerby).toBe(sameRegion);
  });
});
