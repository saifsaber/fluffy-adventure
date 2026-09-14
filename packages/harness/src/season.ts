import { generateFixtures, distanceKm, type ClubData } from '@dakka/content';
import {
  competitionId,
  matchId,
  simulate,
  type Club,
  type ClubId,
  type MatchResult,
  type Tactics,
} from '@dakka/engine';
import type { LeagueData } from '@dakka/content';
import { tacticsFor } from './tactics.js';

/**
 * One season, played out match by match.
 *
 * Nothing here decides a result. It builds each fixture's `MatchInput` from the league's own data —
 * the real ground, the real crowd, the real distance between two Egyptian towns — hands it to
 * `simulate`, and adds up what comes back. Everything the report measures is a tally of match
 * results, which is the only way the harness can be a check on the engine rather than a second
 * opinion about it.
 */

export interface TableRow {
  readonly clubId: ClubId;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  xgFor: number;
  points: number;
}

export interface SeasonResult {
  readonly table: readonly TableRow[];
  readonly matches: readonly MatchResult[];
}

export interface SeasonInput {
  readonly league: LeagueData;
  readonly clubs: readonly Club[];
  readonly data: readonly ClubData[];
  readonly seed: string;
}

/**
 * How full a ground is.
 *
 * Derived from the club's standing rather than invented per match: a better-supported club fills
 * more of its ground. Bounded well below capacity because this is the fourth division, where a
 * sell-out is rare and the grounds are small to begin with.
 */
export function expectedAttendance(club: Club): number {
  const pull = 0.3 + (0.5 * club.reputation) / 100;
  return Math.round(club.stadium.capacity * pull);
}

export function playSeason(input: SeasonInput): SeasonResult {
  const byId = new Map(input.clubs.map((club) => [club.id, club]));
  const dataBySlug = new Map(input.data.map((club) => [club.slug, club]));
  const tactics = new Map<ClubId, Tactics>(
    input.clubs.map((club) => [club.id, tacticsFor(club)] as const),
  );

  const table = new Map<ClubId, TableRow>(
    input.clubs.map((club) => [
      club.id,
      {
        clubId: club.id,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        xgFor: 0,
        points: 0,
      },
    ]),
  );

  const matches: MatchResult[] = [];
  const competition = competitionId(input.league.slug);

  const fixtures = generateFixtures(
    input.league,
    input.clubs.map((club) => club.id),
  );

  for (const fixture of fixtures) {
    const home = byId.get(fixture.home);
    const away = byId.get(fixture.away);
    /* c8 ignore next */
    if (home === undefined || away === undefined) continue;
    const homeTactics = tactics.get(fixture.home);
    const awayTactics = tactics.get(fixture.away);
    /* c8 ignore next */
    if (homeTactics === undefined || awayTactics === undefined) continue;

    const homeData = dataBySlug.get(home.slug);
    const awayData = dataBySlug.get(away.slug);
    const travelKm =
      homeData === undefined || awayData === undefined
        ? 0
        : distanceKm(homeData.location, awayData.location);

    const result = simulate({
      id: matchId(`${input.seed}-r${fixture.round}-${home.slug}-${away.slug}`),
      seed: `${input.seed} ${fixture.round} ${home.slug} ${away.slug}`,
      home: { club: home, tactics: homeTactics, decisions: [] },
      away: { club: away, tactics: awayTactics, decisions: [] },
      context: {
        competitionId: competition,
        awayTravelKm: travelKm,
        attendance: expectedAttendance(home),
        isDerby: home.region === away.region,
      },
    });
    matches.push(result);

    const homeRow = table.get(fixture.home);
    const awayRow = table.get(fixture.away);
    /* c8 ignore next */
    if (homeRow === undefined || awayRow === undefined) continue;

    homeRow.played += 1;
    awayRow.played += 1;
    homeRow.goalsFor += result.homeScore;
    homeRow.goalsAgainst += result.awayScore;
    awayRow.goalsFor += result.awayScore;
    awayRow.goalsAgainst += result.homeScore;
    homeRow.xgFor += result.stats.home.xg;
    awayRow.xgFor += result.stats.away.xg;

    // Points come from the league file, never from a constant: three for a win is a convention, not
    // a law, and a country that scores it differently must be a data change.
    if (result.homeScore > result.awayScore) {
      homeRow.won += 1;
      awayRow.lost += 1;
      homeRow.points += input.league.points.win;
      awayRow.points += input.league.points.loss;
    } else if (result.homeScore < result.awayScore) {
      awayRow.won += 1;
      homeRow.lost += 1;
      awayRow.points += input.league.points.win;
      homeRow.points += input.league.points.loss;
    } else {
      homeRow.drawn += 1;
      awayRow.drawn += 1;
      homeRow.points += input.league.points.draw;
      awayRow.points += input.league.points.draw;
    }
  }

  const sorted = [...table.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) ||
      b.goalsFor - a.goalsFor ||
      (a.clubId < b.clubId ? -1 : 1),
  );
  return { table: sorted, matches };
}
