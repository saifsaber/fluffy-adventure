import { clubSchema, leagueSchema, parseOrThrow, toClub } from '@dakka/content/pure';
import type { ClubData, LeagueData } from '@dakka/content';
import type { Club } from '@dakka/engine';

/**
 * The league, assembled in the browser from the same JSON the harness reads.
 *
 * Pure on purpose: the Vite glob that finds the files lives in `bundle.ts`, so everything with a
 * decision in it can be tested against the real data files without a bundler. Nothing here knows
 * about Egypt — a second country is a league file and its club files, exactly as on the server.
 */
export interface BrowserLeague {
  readonly league: LeagueData;
  readonly clubs: readonly Club[];
  readonly data: readonly ClubData[];
}

export function buildLeague(
  rawLeague: unknown,
  rawClubs: ReadonlyMap<string, unknown>,
): BrowserLeague {
  const league = parseOrThrow(leagueSchema, rawLeague, 'league');
  const data = league.clubs.map((slug) => {
    const raw = rawClubs.get(slug);
    if (raw === undefined) throw new Error(`league names a club with no data file: ${slug}`);
    return parseOrThrow(clubSchema, raw, slug);
  });
  return { league, clubs: data.map(toClub), data };
}

/** The engine-facing club with this slug, or a thrown error — never a silently missing side. */
export function clubBySlug(league: BrowserLeague, slug: string): Club {
  const club = league.clubs.find((c) => c.slug === slug);
  if (club === undefined) throw new Error(`no club in this league with slug ${slug}`);
  return club;
}

export function dataBySlug(league: BrowserLeague, slug: string): ClubData {
  const data = league.data.find((c) => c.slug === slug);
  if (data === undefined) throw new Error(`no club data in this league with slug ${slug}`);
  return data;
}
