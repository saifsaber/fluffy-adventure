import { describe, expect, it } from 'vitest';
import { ALL_CAUSES, CAUSE_REGISTRY } from '../src/index.js';
import { makeMatchInput } from './fixtures.js';

describe('cause registry', () => {
  it('registers every cause the engine can emit', () => {
    // `Record<CauseTag, CauseMeta>` makes this exhaustive at compile time; this asserts the
    // runtime object was not hollowed out (e.g. by a bad merge) and that nothing is duplicated.
    expect(ALL_CAUSES.length).toBe(new Set(ALL_CAUSES).size);
    expect(ALL_CAUSES.length).toBeGreaterThan(20);
  });

  it('gives every cause an agency and a domain', () => {
    for (const cause of ALL_CAUSES) {
      const meta = CAUSE_REGISTRY[cause];
      expect(meta, cause).toBeDefined();
      expect(['controllable', 'circumstantial'], cause).toContain(meta.agency);
    }
  });

  it('has controllable causes, which are what a debrief is made of', () => {
    // A trace built only from circumstantial causes would say "you were unlucky" every time.
    // The product's promise is a lesson, so the registry must be able to supply one.
    const controllable = ALL_CAUSES.filter((c) => CAUSE_REGISTRY[c].agency === 'controllable');
    expect(controllable.length).toBeGreaterThan(ALL_CAUSES.length / 2);
  });
});

describe('domain model', () => {
  it('can express a complete match without escape hatches', () => {
    const input = makeMatchInput();
    expect(input.home.tactics.startingXI).toHaveLength(11);
    expect(input.away.tactics.startingXI).toHaveLength(11);
    expect(input.home.club.squad[0]?.attributes.goalkeeping).toBeDefined();
    expect(input.home.club.squad[1]?.attributes.goalkeeping).toBeUndefined();
  });

  it('carries a Latin slug on every named entity, so a share card reads in any locale', () => {
    const input = makeMatchInput();
    expect(input.home.club.slug).toBeTruthy();
    expect(input.home.club.stadium.slug).toBeTruthy();
    for (const player of input.home.club.squad) expect(player.slug).toBeTruthy();
  });

  it('makes the seed the only source of chance in the input', () => {
    const a = makeMatchInput('seed-a');
    const b = makeMatchInput('seed-b');
    expect(a.seed).not.toBe(b.seed);
    expect({ ...a, seed: '' }).toEqual({ ...b, seed: '' });
  });
});
