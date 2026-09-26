// The calendar comes in through a subpath, not the barrel. The barrel re-exports `load.ts`, which
// reads the content files with `node:fs` — perfectly correct on a server and unbundlable in a
// browser, and this package is on the client's import path. See the 2026-09-26 log entry.
import { generateFixtures, type Fixture } from '@dakka/content/fixtures';
import type { LeagueData } from '@dakka/content';
import type { ClubId } from '@dakka/engine';

/**
 * A season: fixtures, the results recorded so far, and nothing else.
 *
 * **Standings are not in here.** A table is derived from results the way every other number in this
 * product is derived from the thing that caused it — store it and it becomes a second source of
 * truth that drifts the first time a result is corrected. `standings()` recomputes; there is no
 * cache to invalidate because there is nothing cached.
 *
 * Pure and deterministic: no clock, no randomness, no I/O. The same results in the same order give
 * the same table, which is what lets a season be replayed from its matches and lets a server and a
 * client agree about where a career stands.
 */

export interface RecordedResult {
  readonly round: number;
  readonly home: ClubId;
  readonly away: ClubId;
  readonly homeGoals: number;
  readonly awayGoals: number;
  /** The seed that produced it, so any row of the table can be traced back to a match. */
  readonly seed: string;
}

export interface Season {
  readonly competition: LeagueData;
  readonly clubs: readonly ClubId[];
  readonly fixtures: readonly Fixture[];
  /** Append-only, in the order they were played. */
  readonly results: readonly RecordedResult[];
}

export type SeasonStatus = 'scheduled' | 'running' | 'complete';

/** Fixtures from the competition's own round-robin count. No branch on which country this is. */
export function startSeason(competition: LeagueData, clubs: readonly ClubId[]): Season {
  return {
    competition,
    clubs,
    fixtures: generateFixtures(competition, clubs),
    results: [],
  };
}

export const roundsIn = (season: Season): number =>
  season.fixtures.reduce((most, fixture) => Math.max(most, fixture.round), 0);

export function status(season: Season): SeasonStatus {
  if (season.results.length === 0) return 'scheduled';
  return season.results.length === season.fixtures.length ? 'complete' : 'running';
}

const key = (fixture: { home: ClubId; away: ClubId; round: number }): string =>
  `${fixture.round}/${fixture.home}/${fixture.away}`;

/** The fixtures of the next round with anything left to play, or nothing at season end. */
export function nextRound(season: Season): readonly Fixture[] {
  const played = new Set(season.results.map(key));
  const remaining = season.fixtures.filter((fixture) => !played.has(key(fixture)));
  if (remaining.length === 0) return [];
  const round = Math.min(...remaining.map((fixture) => fixture.round));
  return remaining.filter((fixture) => fixture.round === round);
}

export type RecordProblem =
  'no such fixture' | 'already played' | 'a score cannot be negative' | 'the season is over';

export type Recorded =
  | { readonly ok: true; readonly season: Season }
  | { readonly ok: false; readonly problem: RecordProblem };

/**
 * Records a result, or says why it cannot.
 *
 * Refusing is the point. A result for a fixture the season does not have, or for one already
 * played, is a table that no longer describes a competition — and it would be silent, because a
 * league table looks equally plausible either way.
 */
export function record(season: Season, result: RecordedResult): Recorded {
  if (status(season) === 'complete') return { ok: false, problem: 'the season is over' };
  if (result.homeGoals < 0 || result.awayGoals < 0) {
    return { ok: false, problem: 'a score cannot be negative' };
  }
  const known = season.fixtures.some((fixture) => key(fixture) === key(result));
  if (!known) return { ok: false, problem: 'no such fixture' };
  if (season.results.some((played) => key(played) === key(result))) {
    return { ok: false, problem: 'already played' };
  }
  return { ok: true, season: { ...season, results: [...season.results, result] } };
}

/* ------------------------------------------------------------------------------------------ */

export interface TableRow {
  readonly club: ClubId;
  readonly played: number;
  readonly won: number;
  readonly drawn: number;
  readonly lost: number;
  readonly goalsFor: number;
  readonly goalsAgainst: number;
  readonly goalDifference: number;
  readonly points: number;
  /** 1-based. Clubs that could not be separated share a position. */
  readonly position: number;
  /**
   * True when this club and the one beside it are level on every tie-break the competition names.
   * The table says so rather than inventing a separator — which is what an index-based rank does.
   */
  readonly levelWithNeighbour: boolean;
}

const blank = (club: ClubId): TableRow => ({
  club,
  played: 0,
  won: 0,
  drawn: 0,
  lost: 0,
  goalsFor: 0,
  goalsAgainst: 0,
  goalDifference: 0,
  points: 0,
  position: 0,
  levelWithNeighbour: false,
});

/** Head-to-head between exactly these clubs, used only when the competition asks for it. */
function headToHead(season: Season, clubs: readonly ClubId[]): Map<ClubId, number> {
  const inside = new Set(clubs);
  const points = new Map<ClubId, number>(clubs.map((club) => [club, 0]));
  const { win, draw, loss } = season.competition.points;
  for (const result of season.results) {
    if (!inside.has(result.home) || !inside.has(result.away)) continue;
    const homeWon = result.homeGoals > result.awayGoals;
    const level = result.homeGoals === result.awayGoals;
    points.set(result.home, (points.get(result.home) ?? 0) + (level ? draw : homeWon ? win : loss));
    points.set(result.away, (points.get(result.away) ?? 0) + (level ? draw : homeWon ? loss : win));
  }
  return points;
}

/**
 * The table, counted from the results and the competition's own points rules.
 *
 * Every column is a count of something that happened. Nothing is assigned, nothing is carried over,
 * and the order comes from `competition.tieBreak` rather than from a rule written in here — which
 * is what keeps a second country a data file.
 */
export function standings(season: Season): readonly TableRow[] {
  const rows = new Map<ClubId, TableRow>(season.clubs.map((club) => [club, blank(club)]));
  const { win, draw, loss } = season.competition.points;

  const add = (club: ClubId, scored: number, conceded: number): void => {
    const row = rows.get(club);
    if (row === undefined) return;
    const won = scored > conceded ? 1 : 0;
    const drawn = scored === conceded ? 1 : 0;
    const goalsFor = row.goalsFor + scored;
    const goalsAgainst = row.goalsAgainst + conceded;
    rows.set(club, {
      ...row,
      played: row.played + 1,
      won: row.won + won,
      drawn: row.drawn + drawn,
      lost: row.lost + (won === 0 && drawn === 0 ? 1 : 0),
      goalsFor,
      goalsAgainst,
      goalDifference: goalsFor - goalsAgainst,
      points: row.points + (drawn === 1 ? draw : won === 1 ? win : loss),
    });
  };

  for (const result of season.results) {
    add(result.home, result.homeGoals, result.awayGoals);
    add(result.away, result.awayGoals, result.homeGoals);
  }

  const ordered = [...rows.values()].sort((a, b) => compare(season, a, b));

  // One pass. A club level with the one above **shares its position** rather than being pushed
  // below it by an accident of sort order — 1, 2, 2, 4 is the truth; 1, 2, 3, 4 invents a
  // separation the competition's own rules did not make.
  const table: TableRow[] = [];
  ordered.forEach((row, index) => {
    const previous = ordered[index - 1];
    const next = ordered[index + 1];
    const tiedAbove = previous !== undefined && compare(season, previous, row) === 0;
    const tiedBelow = next !== undefined && compare(season, row, next) === 0;
    table.push({
      ...row,
      position: tiedAbove ? (table[index - 1] as TableRow).position : index + 1,
      levelWithNeighbour: tiedAbove || tiedBelow,
    });
  });
  return table;
}

/** Negative when `a` is above `b`. Zero means genuinely level, which the table reports. */
function compare(season: Season, a: TableRow, b: TableRow): number {
  if (a.points !== b.points) return b.points - a.points;
  for (const rule of season.competition.tieBreak) {
    if (rule === 'goal_difference' && a.goalDifference !== b.goalDifference) {
      return b.goalDifference - a.goalDifference;
    }
    if (rule === 'goals_for' && a.goalsFor !== b.goalsFor) return b.goalsFor - a.goalsFor;
    if (rule === 'wins' && a.won !== b.won) return b.won - a.won;
    if (rule === 'head_to_head') {
      const between = headToHead(season, [a.club, b.club]);
      const mine = between.get(a.club) ?? 0;
      const theirs = between.get(b.club) ?? 0;
      if (mine !== theirs) return theirs - mine;
    }
  }
  return 0;
}

export interface SeasonEnd {
  readonly champion: readonly ClubId[];
  readonly promoted: readonly ClubId[];
  readonly playoff: readonly ClubId[];
  readonly relegated: readonly ClubId[];
}

/**
 * Who went up and who went down, from the competition's own counts.
 *
 * Only at the end: a table with games left says nothing final, and answering anyway is how a
 * product ends up telling somebody they are relegated in March. Clubs level on the line are all
 * returned, because the competition has not said how to separate them and neither will we.
 */
export function seasonEnd(season: Season): SeasonEnd | undefined {
  if (status(season) !== 'complete') return undefined;
  const table = standings(season);
  const at = (from: number, count: number): readonly ClubId[] =>
    table.slice(from, from + count).map((row) => row.club);

  const { automatic, playoff } = season.competition.promotion;
  const top = table.filter((row) => row.position === 1).map((row) => row.club);
  return {
    champion: top,
    promoted: at(0, automatic),
    playoff: at(automatic, playoff),
    relegated: at(
      Math.max(0, table.length - season.competition.relegation.automatic),
      season.competition.relegation.automatic,
    ),
  };
}
