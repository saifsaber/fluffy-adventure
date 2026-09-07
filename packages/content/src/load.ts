import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { clubId, playerId, type Club, type Player } from '@dakka/engine';
import { clubSchema, leagueSchema, type ClubData, type LeagueData } from './schema.js';

/**
 * Reads and validates content, then hands typed domain objects to the engine.
 *
 * All I/O lives here so `@dakka/engine` can stay pure and run unchanged in a browser, on the
 * server, and inside the balance harness.
 */

export class ContentError extends Error {
  constructor(
    public readonly file: string,
    message: string,
  ) {
    super(`${file}: ${message}`);
    this.name = 'ContentError';
  }
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (cause) {
    throw new ContentError(file, `is not valid JSON — ${(cause as Error).message}`);
  }
}

/** Turns a Zod failure into something a community contributor can actually act on. */
function parseOrThrow<T>(
  schema: {
    safeParse: (v: unknown) =>
      | { success: true; data: T }
      | {
          success: false;
          error: { issues: readonly { path: readonly (string | number)[]; message: string }[] };
        };
  },
  raw: unknown,
  file: string,
): T {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  const details = result.error.issues
    .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  throw new ContentError(file, `failed validation\n${details}`);
}

function toPlayer(data: ClubData['squad'][number], club: ClubData): Player {
  const [first, ...rest] = data.positions;
  /* c8 ignore next */
  if (first === undefined)
    throw new ContentError(club.slug, `player ${data.slug} has no positions`);
  return {
    id: playerId(`${club.slug}:${data.slug}`),
    clubId: club.slug,
    name: data.name,
    shortName: data.shortName,
    slug: data.slug,
    age: data.age,
    nationality: data.nationality,
    positions: [first, ...rest],
    preferredRoles: data.preferredRoles,
    attributes: {
      technical: data.technical,
      physical: data.physical,
      mental: data.mental,
      ...(data.goalkeeping ? { goalkeeping: data.goalkeeping } : {}),
    },
    // Everyone starts a season fresh; condition is match state, not content.
    condition: { fitness: 100, morale: 75, form: 70 },
    ...(data.nickname ? { nickname: data.nickname } : {}),
  };
}

export function toClub(data: ClubData): Club {
  return {
    id: clubId(data.slug),
    name: data.name,
    shortName: data.shortName,
    slug: data.slug,
    country: data.country,
    region: data.region,
    reputation: data.reputation,
    stadium: data.stadium,
    squad: data.squad.map((player) => toPlayer(player, data)),
  };
}

export interface LoadedLeague {
  readonly league: LeagueData;
  readonly clubs: readonly Club[];
}

export function loadClub(file: string): Club {
  const data = parseOrThrow(clubSchema, readJson(file), file);
  const seen = new Set<string>();
  for (const player of data.squad) {
    if (seen.has(player.slug))
      throw new ContentError(file, `duplicate player slug "${player.slug}"`);
    seen.add(player.slug);
  }
  return toClub(data);
}

/**
 * Loads a league and every club it names.
 *
 * Note what this function does *not* contain: any knowledge of a specific country. Adding Vietnam
 * is a data change — a league file and its club files — and nothing here changes.
 */
export function loadLeague(dataRoot: string, leagueSlug: string): LoadedLeague {
  const leagueFile = join(dataRoot, 'leagues', `${leagueSlug}.json`);
  const league = parseOrThrow(leagueSchema, readJson(leagueFile), leagueFile);

  const clubs = league.clubs.map((slug) =>
    loadClub(join(dataRoot, 'clubs', league.country.toLowerCase(), `${slug}.json`)),
  );

  const duplicates = league.clubs.filter((slug, i) => league.clubs.indexOf(slug) !== i);
  if (duplicates.length > 0) {
    throw new ContentError(leagueFile, `club listed more than once: ${duplicates.join(', ')}`);
  }
  return { league, clubs };
}

export function listLeagues(dataRoot: string): readonly string[] {
  return readdirSync(join(dataRoot, 'leagues'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
}
