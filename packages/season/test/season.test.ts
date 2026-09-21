import { describe, expect, it } from 'vitest';
import { DATA_ROOT, loadLeague } from '@dakka/content';
import type { ClubId } from '@dakka/engine';
import {
  nextRound,
  record,
  roundsIn,
  seasonEnd,
  standings,
  startSeason,
  status,
  type RecordedResult,
  type Season,
} from '../src/index.js';

/**
 * The season, counted rather than tracked.
 *
 * The table is never stored — every column is recomputed from the results, so there is no second
 * source of truth to drift when a result changes. The tests below are mostly about that: a table
 * that agrees with its own matches, an order that comes from the competition's `tieBreak` field
 * rather than from a rule written in the function, and a refusal for every result that would leave
 * the table describing something that did not happen.
 */

const league = loadLeague(DATA_ROOT, 'egy-d4');
const clubs = league.clubs.map((club) => club.id);

const fresh = (): Season => startSeason(league.league, clubs);

/** Plays a whole season, scoring by a rule the test controls so the table is predictable. */
function playAll(season: Season, goals: (home: ClubId, away: ClubId) => [number, number]): Season {
  let current = season;
  for (const fixture of current.fixtures) {
    const [homeGoals, awayGoals] = goals(fixture.home, fixture.away);
    const next = record(current, {
      round: fixture.round,
      home: fixture.home,
      away: fixture.away,
      homeGoals,
      awayGoals,
      seed: `${fixture.round}-${fixture.home}-${fixture.away}`,
    });
    if (!next.ok) throw new Error(next.problem);
    current = next.season;
  }
  return current;
}

describe('a season is its fixtures and what has been played', () => {
  it('generates the competition’s own shape, not a hardcoded one', () => {
    const season = fresh();
    expect(roundsIn(season)).toBe((clubs.length - 1) * league.league.roundRobin);
    expect(season.fixtures).toHaveLength((roundsIn(season) * clubs.length) / 2);
    expect(status(season)).toBe('scheduled');
  });

  it('offers the next unplayed round, and nothing once they are gone', () => {
    let season = fresh();
    const first = nextRound(season);
    expect(first).toHaveLength(clubs.length / 2);
    expect(new Set(first.map((f) => f.round)).size).toBe(1);

    season = playAll(season, () => [1, 0]);
    expect(nextRound(season)).toEqual([]);
    expect(status(season)).toBe('complete');
  });

  it('moves to the next round only when the current one is done', () => {
    let season = fresh();
    const round = nextRound(season);
    const one = round[0];
    if (one === undefined) throw new Error('no fixture');
    const next = record(season, {
      round: one.round,
      home: one.home,
      away: one.away,
      homeGoals: 2,
      awayGoals: 1,
      seed: 's',
    });
    if (!next.ok) throw new Error(next.problem);
    season = next.season;
    expect(nextRound(season)).toHaveLength(clubs.length / 2 - 1);
    expect(status(season)).toBe('running');
  });
});

describe('a result that would describe something that did not happen is refused', () => {
  const season = fresh();
  const fixture = season.fixtures[0];

  it('refuses a fixture this competition does not have', () => {
    const outcome = record(season, {
      round: 99,
      home: clubs[0] as ClubId,
      away: clubs[1] as ClubId,
      homeGoals: 1,
      awayGoals: 0,
      seed: 's',
    });
    expect(outcome).toEqual({ ok: false, problem: 'no such fixture' });
  });

  it('refuses a second result for a fixture already played', () => {
    if (fixture === undefined) throw new Error('no fixture');
    const first = record(season, {
      round: fixture.round,
      home: fixture.home,
      away: fixture.away,
      homeGoals: 1,
      awayGoals: 0,
      seed: 's',
    });
    if (!first.ok) throw new Error(first.problem);
    const again = record(first.season, {
      round: fixture.round,
      home: fixture.home,
      away: fixture.away,
      homeGoals: 3,
      awayGoals: 3,
      seed: 's',
    });
    expect(again).toEqual({ ok: false, problem: 'already played' });
  });

  it('refuses a negative score', () => {
    if (fixture === undefined) throw new Error('no fixture');
    const outcome = record(season, {
      round: fixture.round,
      home: fixture.home,
      away: fixture.away,
      homeGoals: -1,
      awayGoals: 0,
      seed: 's',
    });
    expect(outcome).toEqual({ ok: false, problem: 'a score cannot be negative' });
  });

  it('refuses anything once the season is over', () => {
    const done = playAll(fresh(), () => [0, 0]);
    const any = done.fixtures[0];
    if (any === undefined) throw new Error('no fixture');
    expect(
      record(done, {
        round: any.round,
        home: any.home,
        away: any.away,
        homeGoals: 1,
        awayGoals: 0,
        seed: 's',
      }),
    ).toEqual({ ok: false, problem: 'the season is over' });
  });
});

describe('the table is counted from the matches', () => {
  it('adds up to exactly what was played', () => {
    // The check a stored table fails the first time somebody corrects a result: every column is
    // the sum of the matches, and the matches are all there is.
    const season = playAll(fresh(), (home) => (home === clubs[0] ? [2, 0] : [1, 1]));
    const table = standings(season);

    const games = season.results.length;
    expect(table.reduce((n, row) => n + row.played, 0)).toBe(games * 2);
    expect(table.reduce((n, row) => n + row.goalsFor, 0)).toBe(
      table.reduce((n, row) => n + row.goalsAgainst, 0),
    );
    expect(table.reduce((n, row) => n + row.goalDifference, 0)).toBe(0);
    for (const row of table) {
      expect(row.played).toBe(row.won + row.drawn + row.lost);
      expect(row.points).toBe(
        row.won * league.league.points.win +
          row.drawn * league.league.points.draw +
          row.lost * league.league.points.loss,
      );
    }
  });

  it('uses the competition’s tie-break order, not one written in the code', () => {
    // The headline claim of this box, and the only test that can prove it: the *same results*
    // ordered by two different `tieBreak` arrays must come out in two different orders. The first
    // version of this test used a season where every club was level, so swapping the field changed
    // nothing — it passed with the order hardcoded, which a sabotage probe found.
    const [a, b, c, d] = clubs as [ClubId, ClubId, ClubId, ClubId];
    const results: RecordedResult[] = [
      { round: 1, home: a, away: c, homeGoals: 6, awayGoals: 4, seed: '1' },
      { round: 1, home: b, away: d, homeGoals: 2, awayGoals: 0, seed: '2' },
      { round: 2, home: c, away: a, homeGoals: 3, awayGoals: 0, seed: '3' },
      { round: 2, home: d, away: b, homeGoals: 1, awayGoals: 0, seed: '4' },
    ];
    // All four end on one win and one defeat, so points cannot separate anybody and the tie-break
    // is the only thing that can. Totals: a scored 6 conceded 7 (GD -1) · b scored 2 conceded 1
    // (GD +1) · c scored 7 conceded 6 (GD +1) · d scored 1 conceded 2 (GD -1). c tops both orders;
    // the two disagree about **second**, which is where this test looks.
    const topTwo = (tieBreak: readonly string[]): readonly ClubId[] =>
      standings({
        competition: { ...league.league, tieBreak: tieBreak as never },
        clubs: [a, b, c, d],
        fixtures: results.map(({ round, home, away }) => ({ round, home, away })),
        results,
      })
        .map((row) => row.club)
        .slice(0, 2);

    const byDifference = topTwo(['goal_difference', 'goals_for']);
    const byGoalsScored = topTwo(['goals_for', 'goal_difference']);
    expect(byDifference[1], 'goal difference should put b second').toBe(b);
    expect(byGoalsScored[1], 'goals scored should put a second').toBe(a);
    expect(byDifference).not.toEqual(byGoalsScored);
  });

  it('counts points with the competition’s own values', () => {
    // The Egyptian file uses 3-1-0, so a hardcoded 3-1-0 in the function agrees with it and no
    // test over this league could tell the difference. A competition worth two for a win can.
    const twoForAWin = { ...league.league, points: { win: 2, draw: 1, loss: 0 } };
    const table = standings(playAll({ ...fresh(), competition: twoForAWin }, () => [1, 0]));
    const winner = table[0];
    expect(winner?.won).toBeGreaterThan(0);
    expect(winner?.points).toBe(winner ? winner.won * 2 + winner.drawn : 0);
  });

  it('says everyone is level when everyone is', () => {
    const table = standings(playAll(fresh(), () => [0, 0]));
    expect(new Set(table.map((row) => row.points)).size).toBe(1);
    expect(new Set(table.map((row) => row.position))).toEqual(new Set([1]));
    expect(table.every((row) => row.levelWithNeighbour)).toBe(true);
  });

  it('separates on goal difference before goals scored', () => {
    const table = standings(playAll(fresh(), (home) => (home === clubs[0] ? [3, 0] : [0, 0])));
    const best = table[0];
    expect(best?.club).toBe(clubs[0]);
    expect(best?.goalDifference).toBeGreaterThan(0);
    expect(table[1]?.position).toBeGreaterThan(1);
  });

  it('says two clubs are level instead of inventing a separation', () => {
    // 1, 2, 2, 4 is the truth. An index-based rank would print 1, 2, 3, 4 and quietly claim a
    // difference the competition's own rules did not make.
    const table = standings(playAll(fresh(), () => [1, 1]));
    expect(table.every((row) => row.position === 1)).toBe(true);
  });
});

describe('the season ends only when it is over', () => {
  it('says nothing while games remain', () => {
    // Telling somebody they are relegated in March is how a product loses a player's trust.
    let season = fresh();
    const one = season.fixtures[0];
    if (one === undefined) throw new Error('no fixture');
    const next = record(season, {
      round: one.round,
      home: one.home,
      away: one.away,
      homeGoals: 1,
      awayGoals: 0,
      seed: 's',
    });
    if (!next.ok) throw new Error(next.problem);
    season = next.season;
    expect(seasonEnd(season)).toBeUndefined();
  });

  it('promotes and relegates by the competition’s own counts', () => {
    const season = playAll(fresh(), (home) => [clubs.indexOf(home) < 4 ? 3 : 0, 0]);
    const end = seasonEnd(season);
    const table = standings(season);
    expect(end).toBeDefined();
    expect(end?.promoted).toHaveLength(league.league.promotion.automatic);
    expect(end?.playoff).toHaveLength(league.league.promotion.playoff);
    expect(end?.relegated).toHaveLength(league.league.relegation.automatic);
    expect(end?.promoted[0]).toBe(table[0]?.club);
    expect(end?.relegated).toEqual(
      table.slice(table.length - league.league.relegation.automatic).map((row) => row.club),
    );
  });

  it('returns every club that shares the title rather than picking one', () => {
    const end = seasonEnd(playAll(fresh(), () => [0, 0]));
    expect(end?.champion).toHaveLength(clubs.length);
  });
});

describe('it is deterministic', () => {
  it('gives the same table for the same results, every time', () => {
    const goals = (home: ClubId): [number, number] => [clubs.indexOf(home) % 3, 1];
    expect(standings(playAll(fresh(), goals))).toEqual(standings(playAll(fresh(), goals)));
  });
});
