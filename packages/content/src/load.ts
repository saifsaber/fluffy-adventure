import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Club } from '@dakka/engine';
import { ContentError, parseOrThrow, toClub } from './pure.js';
import { clubSchema, leagueSchema, type ClubData, type LeagueData } from './schema.js';

/**
 * Reads content from disk, then hands typed domain objects to the engine.
 *
 * All I/O lives here. The validation and the data-to-domain transforms live in `pure.ts`, which
 * imports nothing from Node — that is what lets the browser load the same league files through the
 * same schema rather than a second, generated copy of the data.
 */

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (cause) {
    throw new ContentError(file, `is not valid JSON — ${(cause as Error).message}`);
  }
}

export interface LoadedLeague {
  readonly league: LeagueData;
  readonly clubs: readonly Club[];
  /**
   * The clubs as they sit on disk, in the same order.
   *
   * `toClub` deliberately drops `location`: the engine takes travel as a pre-computed
   * `awayTravelKm` and knows no geography at all, which is what keeps it pure and what lets a new
   * country be a data file. Anything that has to *compute* that distance — the season harness, the
   * fixture scheduler — needs the coordinates, so they stay available here rather than being
   * smuggled into the engine's `Club`.
   */
  readonly data: readonly ClubData[];
}

/** The club exactly as it sits on disk, validated. */
export function loadClubData(file: string): ClubData {
  const data = parseOrThrow(clubSchema, readJson(file), file);
  const seen = new Set<string>();
  for (const player of data.squad) {
    if (seen.has(player.slug))
      throw new ContentError(file, `duplicate player slug "${player.slug}"`);
    seen.add(player.slug);
  }
  return data;
}

export function loadClub(file: string): Club {
  return toClub(loadClubData(file));
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

  const data = league.clubs.map((slug) =>
    loadClubData(join(dataRoot, 'clubs', league.country.toLowerCase(), `${slug}.json`)),
  );
  const clubs = data.map(toClub);

  const duplicates = league.clubs.filter((slug, i) => league.clubs.indexOf(slug) !== i);
  if (duplicates.length > 0) {
    throw new ContentError(leagueFile, `club listed more than once: ${duplicates.join(', ')}`);
  }
  return { league, clubs, data };
}

export function listLeagues(dataRoot: string): readonly string[] {
  return readdirSync(join(dataRoot, 'leagues'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
}
