import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DATA_ROOT, distanceKm, estimatedRoadKm, travelBurden } from '../src/index.js';

/** Real places, so the maths is checked against the world rather than against itself. */
const CAIRO = { lat: 30.0444, lon: 31.2357 };
const ASWAN = { lat: 24.0889, lon: 32.8998 };
const ALEXANDRIA = { lat: 31.2001, lon: 29.9187 };

describe('great-circle distance', () => {
  it('matches known Egyptian distances', () => {
    // Cairo–Aswan is about 680 km as the crow flies.
    expect(distanceKm(CAIRO, ASWAN)).toBeGreaterThan(650);
    expect(distanceKm(CAIRO, ASWAN)).toBeLessThan(710);
    // Cairo–Alexandria is about 180 km.
    expect(distanceKm(CAIRO, ALEXANDRIA)).toBeGreaterThan(160);
    expect(distanceKm(CAIRO, ALEXANDRIA)).toBeLessThan(200);
  });

  it('is zero for a club playing itself and symmetric between any two', () => {
    expect(distanceKm(CAIRO, CAIRO)).toBe(0);
    expect(distanceKm(CAIRO, ASWAN)).toBeCloseTo(distanceKm(ASWAN, CAIRO), 9);
  });

  it('accounts for longitude convergence, which is the whole reason for haversine', () => {
    const naive = (a: typeof CAIRO, b: typeof CAIRO) =>
      Math.hypot(a.lat - b.lat, a.lon - b.lon) * 111;

    // North-south, a flat approximation is nearly right: 682 km vs 686 km. Egypt's league runs
    // mostly along the Nile, so this is the case that actually occurs today.
    expect(Math.abs(naive(CAIRO, ASWAN) - distanceKm(CAIRO, ASWAN))).toBeLessThan(10);

    // East-west it breaks, because a degree of longitude is not 111 km away from the equator.
    // Siwa to Taba spans Egypt: 909 km real against 1041 km naive. That error arrives the moment
    // a league with east-west spread ships, which is why the correct formula is here now.
    const SIWA = { lat: 29.2033, lon: 25.5195 };
    const TABA = { lat: 29.4928, lon: 34.8896 };
    expect(distanceKm(SIWA, TABA)).toBeGreaterThan(880);
    expect(distanceKm(SIWA, TABA)).toBeLessThan(940);
    expect(naive(SIWA, TABA) - distanceKm(SIWA, TABA)).toBeGreaterThan(100);
  });
});

describe('road estimate and burden', () => {
  it('estimates road distance as longer than the straight line', () => {
    expect(estimatedRoadKm(CAIRO, ASWAN)).toBeGreaterThan(distanceKm(CAIRO, ASWAN));
  });

  it('scales burden to the league actually being played, not a hardcoded country', () => {
    expect(travelBurden(0, 900)).toBe(0);
    expect(travelBurden(900, 900)).toBe(1);
    expect(travelBurden(450, 900)).toBeCloseTo(0.5, 6);
    // A trip longer than the league's longest still clamps, rather than exceeding 1.
    expect(travelBurden(2000, 900)).toBe(1);
    // A degenerate league (one club, no trips) must not divide by zero.
    expect(travelBurden(100, 0)).toBe(0);
  });
});

describe('the real fourth division', () => {
  const clubs = readdirSync(join(DATA_ROOT, 'clubs', 'egy')).map((f) =>
    JSON.parse(readFileSync(join(DATA_ROOT, 'clubs', 'egy', f), 'utf8')),
  );

  it('produces a spread of trips, so travel is a real variable and not noise', () => {
    const trips: number[] = [];
    for (const a of clubs) {
      for (const b of clubs) {
        if (a.slug !== b.slug) trips.push(estimatedRoadKm(a.location, b.location));
      }
    }
    const shortest = Math.min(...trips);
    const longest = Math.max(...trips);
    // Neighbouring towns are a short hop; the Delta-to-Aswan trip is most of the country.
    expect(shortest).toBeLessThan(80);
    expect(longest).toBeGreaterThan(700);
    // If every trip were similar, travel would be a constant and worth nothing as an input.
    expect(longest / shortest).toBeGreaterThan(10);
  });

  it('makes the longest trip in this league one a real coach would dread', () => {
    let worst = { km: 0, from: '', to: '' };
    for (const a of clubs) {
      for (const b of clubs) {
        const km = estimatedRoadKm(a.location, b.location);
        if (km > worst.km) worst = { km, from: a.slug, to: b.slug };
      }
    }
    expect(worst.km).toBeGreaterThan(700);
    expect(worst.from).not.toBe(worst.to);
  });
});
