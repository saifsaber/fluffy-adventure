import { describe, expect, it } from 'vitest';
import {
  DATA_ROOT,
  MIN_CLUB_SEPARATION,
  MIN_NUMBER_ON_SHIRT,
  MIN_TRIM_ON_PRIMARY,
  SHIRT_NUMBER_INK,
  clubSchema,
  contrast,
  deltaE76,
  kitClashes,
  kitProblems,
  loadLeague,
  readableOn,
} from '../src/index.js';

/**
 * Club colours, and the one thing colour arithmetic is for here.
 *
 * The interesting tests are not the ratios. They are the two that stop a kit being invented: the
 * schema refusing a club that has no colours at all — so a missing fact cannot ship as a blank
 * swatch — and the separation check, which is the only place in this codebase where a contrast
 * ratio is the *wrong* measure and says so.
 */

const { data } = loadLeague(DATA_ROOT, 'egy-d4');
const kitted = data.map((club) => ({ slug: club.slug, kit: club.kit }));

const valid = {
  name: 'نادي',
  shortName: 'نادي',
  slug: 'test-club',
  kit: { primary: '#1f5134', secondary: '#f2ede0' },
  country: 'EGY',
  region: 'كفر الشيخ',
  location: { lat: 31, lon: 30 },
  reputation: 40,
  stadium: { name: 'س', shortName: 'س', slug: 'test-ground', capacity: 1000, pitchQuality: 50 },
  squad: (data[0] as { squad: unknown[] }).squad,
};

describe('every club in the shipped league is printable', () => {
  it('has colours at all', () => {
    expect(kitted).toHaveLength(20);
    for (const club of kitted) expect(kitProblems(club.kit), club.slug).toEqual([]);
  });

  it('carries a paper-coloured shirt number at full text contrast', () => {
    // One rule, two guarantees: the number's ink and the page are the same colour, so a shirt that
    // takes a number is also a swatch you can see on the page.
    for (const club of kitted) {
      expect(contrast(club.kit.primary, SHIRT_NUMBER_INK), club.slug).toBeGreaterThanOrEqual(
        MIN_NUMBER_ON_SHIRT,
      );
    }
  });

  it('has a trim that separates from its own shirt', () => {
    for (const club of kitted) {
      expect(contrast(club.kit.secondary, club.kit.primary), club.slug).toBeGreaterThanOrEqual(
        MIN_TRIM_ON_PRIMARY,
      );
    }
  });

  it('has no two clubs printing alike', () => {
    expect(kitClashes(kitted)).toEqual([]);
  });

  it('would say so if two did', () => {
    // A guard only ever asserted to find nothing is a guard that can be switched off without
    // anyone noticing. Plant a clash and make it name both clubs, closest pair first.
    const planted = [
      ...kitted,
      { slug: 'impostor-one', kit: { primary: '#1f5136', secondary: '#f2ede0' } },
      { slug: 'impostor-two', kit: { primary: '#a41f25', secondary: '#f2ede0' } },
    ];
    const found = kitClashes(planted);
    expect(found.map((clash) => [clash.a, clash.b].sort().join(' × '))).toEqual([
      'impostor-one × matoubas-sporting',
      'ashmoun-youth × impostor-two',
    ]);
    expect(found[0]?.distance).toBeLessThan(found[1]?.distance ?? Infinity);
  });

  it('keeps real margin over the separation gate', () => {
    // The gate is 22 because a search over every plausible legible kit colour put the ceiling for
    // twenty clubs at ΔE 24.8. If this margin ever vanishes the palette has drifted, not the rule.
    const distances = [];
    for (let i = 0; i < kitted.length; i++) {
      for (let j = i + 1; j < kitted.length; j++) {
        const a = kitted[i] as { kit: { primary: string } };
        const b = kitted[j] as { kit: { primary: string } };
        distances.push(deltaE76(a.kit.primary, b.kit.primary));
      }
    }
    expect(Math.min(...distances)).toBeGreaterThan(MIN_CLUB_SEPARATION + 2);
  });
});

describe('the schema refuses a club it cannot print', () => {
  it('refuses one with no colours, rather than defaulting them', () => {
    const { kit, ...noKit } = valid;
    expect(kit).toBeDefined();
    const result = clubSchema.safeParse(noKit);
    expect(result.success).toBe(false);
  });

  it('refuses a shirt too light to take a number', () => {
    const result = clubSchema.safeParse({
      ...valid,
      kit: { primary: '#d8d0bd', secondary: '#17140f' },
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0]?.message).toMatch(/shirt number reaches only/);
  });

  it('refuses a trim that does not separate from the shirt', () => {
    const result = clubSchema.safeParse({
      ...valid,
      kit: { primary: '#1f5134', secondary: '#215536' },
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toMatch(/to read as trim/);
  });

  it('refuses anything that is not a lowercase #rrggbb colour', () => {
    for (const primary of ['green', '#1F5134', '#1f513', 'rgb(31,81,52)', '#1f51344']) {
      const result = clubSchema.safeParse({ ...valid, kit: { primary, secondary: '#f2ede0' } });
      expect(result.success, primary).toBe(false);
    }
  });
});

describe('colour arithmetic', () => {
  it('measures contrast the way WCAG does', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 6);
    expect(contrast('#1f5134', '#1f5134')).toBeCloseTo(1, 6);
  });

  it('is the reason the separation check does not use contrast', () => {
    // A red and a green of the same darkness have a contrast ratio of about 1 — by that measure
    // they are the same colour. They are the one pair a fixture bar must never print together, and
    // ΔE is the measure that can see it.
    const red = '#9c1d1d';
    const green = '#1f5134';
    expect(contrast(red, green)).toBeLessThan(1.2);
    expect(deltaE76(red, green)).toBeGreaterThan(40);
  });

  it('gives zero distance to a colour and itself', () => {
    expect(deltaE76('#332a7a', '#332a7a')).toBeCloseTo(0, 9);
  });

  it('picks the readable ink rather than leaving it to a call site', () => {
    const inks = ['#17140f', '#efe7d6'];
    expect(readableOn('#0f0028', inks)).toBe('#efe7d6');
    expect(readableOn('#efe7d6', inks)).toBe('#17140f');
    for (const club of kitted) {
      const ink = readableOn(club.kit.primary, inks);
      expect(contrast(club.kit.primary, ink), club.slug).toBeGreaterThanOrEqual(
        MIN_NUMBER_ON_SHIRT,
      );
    }
  });
});
