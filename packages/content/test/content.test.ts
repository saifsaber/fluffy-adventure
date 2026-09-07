import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DATA_ROOT, listLeagues, loadLeague, ContentError, clubSchema } from '../src/index.js';

describe('the Egyptian fourth division loads', () => {
  const { league, clubs } = loadLeague(DATA_ROOT, 'egy-d4');

  it('is discoverable without naming it in code', () => {
    expect(listLeagues(DATA_ROOT)).toContain('egy-d4');
  });

  it('has twenty clubs, each resolved from its own file', () => {
    expect(league.clubs).toHaveLength(20);
    expect(clubs).toHaveLength(20);
    expect(new Set(clubs.map((c) => c.slug)).size).toBe(20);
  });

  it('produces a 38-round season from the round-robin field, not from hardcoded logic', () => {
    const rounds = (league.clubs.length - 1) * league.roundRobin;
    expect(rounds).toBe(38);
  });

  it('gives every club a fieldable squad with at least one keeper', () => {
    for (const club of clubs) {
      expect(club.squad.length, club.slug).toBeGreaterThanOrEqual(11);
      const keepers = club.squad.filter((p) => p.attributes.goalkeeping !== undefined);
      expect(keepers.length, club.slug).toBeGreaterThanOrEqual(1);
      for (const keeper of keepers) expect(keeper.positions[0], keeper.slug).toBe('GK');
    }
  });

  it('gives every outfield player no goalkeeping attributes', () => {
    for (const club of clubs) {
      for (const player of club.squad) {
        if (player.positions[0] !== 'GK') {
          expect(player.attributes.goalkeeping, player.slug).toBeUndefined();
        }
      }
    }
  });

  it('carries real geography, which the engine uses for travel fatigue', () => {
    const raw = readdirSync(join(DATA_ROOT, 'clubs', 'egy')).map((f) =>
      JSON.parse(readFileSync(join(DATA_ROOT, 'clubs', 'egy', f), 'utf8')),
    );
    for (const club of raw) {
      // Egypt spans roughly 22–32°N, 25–36°E. A club outside that is a data entry error.
      expect(club.location.lat, club.slug).toBeGreaterThan(22);
      expect(club.location.lat, club.slug).toBeLessThan(32);
      expect(club.location.lon, club.slug).toBeGreaterThan(24);
      expect(club.location.lon, club.slug).toBeLessThan(36);
    }
    expect(new Set(raw.map((c) => c.region)).size).toBeGreaterThan(10);
  });

  it('spreads club strength, so the league is a table and not a coin flip', () => {
    const reputations = clubs.map((c) => c.reputation);
    expect(Math.max(...reputations) - Math.min(...reputations)).toBeGreaterThan(10);
  });
});

describe('the schema rejects bad contributions with a usable message', () => {
  it('names the offending field', () => {
    const file = join(DATA_ROOT, 'clubs', 'egy', 'tokh-union.json');
    const broken = { ...JSON.parse(readFileSync(file, 'utf8')), reputation: 500 };
    const result = clubSchema.safeParse(broken);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain('reputation');
    }
  });

  it('rejects a slug that would break a share card in another locale', () => {
    const file = join(DATA_ROOT, 'clubs', 'egy', 'tokh-union.json');
    const broken = { ...JSON.parse(readFileSync(file, 'utf8')), slug: 'طوخ' };
    expect(clubSchema.safeParse(broken).success).toBe(false);
  });

  it('throws a ContentError naming the file when a league is missing', () => {
    expect(() => loadLeague(DATA_ROOT, 'does-not-exist')).toThrow(ContentError);
  });
});

describe('the squad generator is deterministic', () => {
  it('regenerates byte-identical data, so the committed content is reviewable', () => {
    const file = join(DATA_ROOT, 'clubs', 'egy', 'sohag-railway.json');
    const before = readFileSync(file, 'utf8');
    execFileSync('node', [join(DATA_ROOT, '..', 'scripts', 'generate-squads.mjs')]);
    expect(readFileSync(file, 'utf8')).toBe(before);
  });
});
