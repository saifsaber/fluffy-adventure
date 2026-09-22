import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_TRAITS } from '@dakka/engine';
import {
  DATA_ROOT,
  ContentError,
  clubSchema,
  leagueSchema,
  listLeagues,
  loadLeague,
  personalitySchema,
  traitSchema,
} from '../src/index.js';

describe('a competition carries its own rules', () => {
  it('refuses a league that does not say how a tie is broken', () => {
    // Without the field a standings function has to pick, and picking is a rule in code where the
    // schema promised data. England and Germany go to goal difference; Italy and Spain settle it
    // head-to-head first.
    const { tieBreak, ...without } = loadLeague(DATA_ROOT, 'egy-d4').league;
    expect(tieBreak.length).toBeGreaterThan(0);
    expect(leagueSchema.safeParse(without).success).toBe(false);
  });

  it('refuses the same tie-break twice', () => {
    const league = loadLeague(DATA_ROOT, 'egy-d4').league;
    const result = leagueSchema.safeParse({
      ...league,
      tieBreak: ['goal_difference', 'goal_difference'],
    });
    expect(result.success).toBe(false);
  });
});

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

describe('traits are one list, held by both sides of the boundary', () => {
  it('validates exactly the traits the engine has decided the effect of', () => {
    // Two lists that must agree and cannot be compared are two lists that will drift. The engine
    // refuses a trait with no entry in `TRAIT_REGISTRY` at build time; this is the other half —
    // content that validated a trait the engine had never heard of would reach `toClub` and then
    // the chain, where it would silently do nothing at all.
    expect([...traitSchema.options].sort()).toEqual([...ALL_TRAITS].sort());
  });

  it('gives a trait only to a player the attributes agree with', () => {
    // The lesson from `preferredRoles`, applied before the same mistake could be made twice: a
    // label the generator writes beside a player, rather than out of him, describes nothing. Each
    // trait is a facet of his own attributes standing clear of his own level, so the engine can
    // read it — measured here on the shipped data rather than trusted from the script.
    const league = loadLeague(DATA_ROOT, 'egy-d4');
    const FACETS: Record<string, readonly string[]> = {
      gets_into_the_box: ['finishing', 'anticipation', 'positioning'],
      runs_the_channels: ['pace', 'acceleration', 'stamina'],
      attacks_the_cross: ['heading', 'jumping', 'strength'],
    };
    const players = league.clubs.flatMap((club) => club.squad);
    const traited = players.filter((player) => player.traits.length > 0);
    expect(traited.length).toBeGreaterThan(30);
    // And most of the league has none: a trait is a thing that stands out.
    expect(traited.length).toBeLessThan(players.length / 2);

    for (const player of traited) {
      const { technical, physical, mental } = player.attributes;
      const flat: Record<string, number> = { ...technical, ...physical, ...mental };
      const level =
        Object.values(flat).reduce((sum, value) => sum + value, 0) / Object.values(flat).length;
      for (const trait of player.traits) {
        const names = FACETS[trait] as readonly string[];
        const facet = names.reduce((sum, name) => sum + (flat[name] ?? 0), 0) / names.length;
        expect(facet - level, `${player.slug} / ${trait}`).toBeGreaterThanOrEqual(5);
      }
    }
  });
});

describe('personality is authored, and it is true of the man it is on', () => {
  it('validates exactly the personalities the dressing room has decided the meaning of', () => {
    // The engine declares the union and refuses an unregistered one at build time; `@dakka/ai`
    // holds what each means. This is the third corner: content that validated a personality nobody
    // had a meaning for would reach `toClub` and then `applyEffects`, where it would do nothing.
    expect([...personalitySchema.options].sort()).toEqual(['proud', 'steady', 'volatile']);
  });

  it('gives one only where the attributes say so, and leaves most of the league without', () => {
    // Each personality is one attribute running ahead of another by six — a difference, so it is
    // scale-free and a good player is no likelier to be a character than a poor one. Measured on
    // the shipped data rather than trusted from the script.
    const GAPS: Record<string, readonly [string, string]> = {
      volatile: ['aggression', 'composure'],
      steady: ['composure', 'aggression'],
      proud: ['leadership', 'teamwork'],
    };
    const players = loadLeague(DATA_ROOT, 'egy-d4').clubs.flatMap((club) => club.squad);
    const characters = players.filter((player) => player.personality !== undefined);

    expect(characters.length).toBeGreaterThan(50);
    // Two thirds of a dressing room are professionals. A room where everybody is a character has
    // no characters in it.
    expect(characters.length).toBeLessThan(players.length / 2);

    for (const player of characters) {
      const flat: Record<string, number> = {
        ...player.attributes.technical,
        ...player.attributes.physical,
        ...player.attributes.mental,
      };
      const [over, under] = GAPS[player.personality as string] as readonly [string, string];
      expect(
        (flat[over] ?? 0) - (flat[under] ?? 0),
        `${player.slug} / ${player.personality}`,
      ).toBeGreaterThanOrEqual(6);
    }
  });
});
