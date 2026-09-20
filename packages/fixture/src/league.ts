import { clubSchema, leagueSchema, parseOrThrow, toClub } from '@dakka/content/pure';
import type { ClubData, LeagueData } from '@dakka/content';
import type { Club } from '@dakka/engine';

/**
 * A league, however it was loaded.
 *
 * The server reads it off disk and the browser assembles it from a bundler glob, and this is the
 * shape both arrive at. Keeping it structural rather than tied to either loader is what lets one
 * `buildFixture` serve both — which is the only way "the same seed resolves identically on client
 * and server" is a property of the code rather than a coincidence two copies happen to share.
 */
export interface LeagueView {
  readonly league: LeagueData;
  /** The engine-facing clubs, in the league file's order. */
  readonly clubs: readonly Club[];
  /** The same clubs as they sit on disk — kit colours, coordinates, everything the engine drops. */
  readonly data: readonly ClubData[];
}

/**
 * Validates raw league and club JSON into a league.
 *
 * Pure: the caller finds the files. Every club named by the league must be present, and a club
 * that fails its schema throws here rather than becoming a half-built side later — including one
 * whose kit is missing or unreadable, which is the check `clubSchema` gained with the kit box.
 */
export function buildLeague(
  rawLeague: unknown,
  rawClubs: ReadonlyMap<string, unknown>,
): LeagueView {
  const league = parseOrThrow(leagueSchema, rawLeague, 'league');
  const data = league.clubs.map((slug) => {
    const raw = rawClubs.get(slug);
    if (raw === undefined) throw new Error(`league names a club with no data file: ${slug}`);
    return parseOrThrow(clubSchema, raw, slug);
  });
  return { league, clubs: data.map(toClub), data };
}

/** The engine-facing club with this slug, or a thrown error — never a silently missing side. */
export function clubBySlug(league: LeagueView, slug: string): Club {
  const club = league.clubs.find((c) => c.slug === slug);
  if (club === undefined) throw new Error(`no club in this league with slug ${slug}`);
  return club;
}

export function dataBySlug(league: LeagueView, slug: string): ClubData {
  const data = league.data.find((c) => c.slug === slug);
  if (data === undefined) throw new Error(`no club data in this league with slug ${slug}`);
  return data;
}
