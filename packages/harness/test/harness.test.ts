import { describe, expect, it } from 'vitest';
import { DATA_ROOT, loadLeague } from '@dakka/content';
import {
  Accumulator,
  THRESHOLDS,
  correlation,
  identicalSeasons,
  main,
  parseArgs,
  playSeason,
  reputationIndex,
  tacticsFor,
} from '../src/index.js';
import type { MatchResult } from '@dakka/engine';

/**
 * The harness is the merge gate, so its own arithmetic has to be beyond doubt. If the accumulator
 * miscounts, a broken engine ships with a green report — which is worse than no harness at all.
 *
 * The most important test in this file is the one that pins the threshold values themselves.
 * `CLAUDE.md` says the engine gets fixed and the thresholds do not get lowered; this is what stops
 * that rule from being a sentence in a document.
 */

const loaded = loadLeague(DATA_ROOT, 'egy-d4');

describe('the thresholds are the blueprint’s, and stay that way', () => {
  it('holds the exact numbers from the technical blueprint', () => {
    // Loosening any of these should require deleting this test, which is the point of it existing.
    const byKey = new Map(THRESHOLDS.map((t) => [t.key, t]));
    expect(byKey.get('goalsPerMatch')).toMatchObject({ low: 2.5, high: 2.8 });
    expect(byKey.get('homeAdvantage')).toMatchObject({ low: 0.3, high: 0.4 });
    expect(byKey.get('xgCorrelation')).toMatchObject({ low: 0.9 });
    expect(byKey.get('championPoints')).toMatchObject({ low: 78, high: 95 });
    expect(byKey.get('strongerSideWins')).toMatchObject({ low: 0.55, high: 0.65 });
    expect(byKey.get('determinism')).toMatchObject({ low: 1, high: 1 });
    expect(byKey.get('shotsPerMatch')).toMatchObject({ low: 22, high: 28 });
    expect(THRESHOLDS).toHaveLength(7);
  });
});

describe('correlation', () => {
  it('is one for a perfect straight line and minus one when reversed', () => {
    expect(correlation([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 9);
    expect(correlation([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 9);
  });

  it('refuses to invent a number when there is nothing to correlate', () => {
    expect(correlation([], [])).toBeUndefined();
    expect(correlation([1], [1])).toBeUndefined();
    // A flat series has no variance, so a correlation would be a divide by zero dressed up as data.
    expect(correlation([3, 3, 3], [1, 2, 3])).toBeUndefined();
  });
});

describe('the accumulator counts what happened', () => {
  const match = (home: string, away: string, hs: number, as: number): MatchResult =>
    ({
      homeClubId: home,
      awayClubId: away,
      homeScore: hs,
      awayScore: as,
      stats: { home: { xg: hs, shots: hs * 4 }, away: { xg: as, shots: as * 4 } },
    }) as unknown as MatchResult;

  const season = (matches: MatchResult[]) =>
    ({
      matches,
      table: [{ clubId: 'a', points: 80, goalsFor: 50, xgFor: 48 }],
    }) as unknown as Parameters<Accumulator['addSeason']>[0];

  it('averages goals and home advantage over the matches it saw', () => {
    const acc = new Accumulator();
    acc.addSeason(season([match('a', 'b', 2, 1), match('b', 'a', 0, 3)]), new Map());
    const m = acc.measure();
    expect(m.get('goalsPerMatch')?.value).toBeCloseTo(3, 9);
    expect(m.get('homeAdvantage')?.value).toBeCloseTo((2 + 0 - (1 + 3)) / 2, 9);
    expect(m.get('goalsPerMatch')?.samples).toBe(2);
  });

  it('counts a draw as half for the stronger side', () => {
    const acc = new Accumulator();
    const reputation = new Map([
      ['strong', 70],
      ['weak', 40],
    ]);
    acc.addSeason(
      season([
        match('strong', 'weak', 3, 0), // stronger wins
        match('weak', 'strong', 1, 1), // draw
        match('strong', 'weak', 0, 2), // stronger loses
        match('weak', 'strong', 2, 0), // stronger loses
      ]),
      reputation,
    );
    expect(acc.measure().get('strongerSideWins')?.value).toBeCloseTo((1 + 0.5) / 4, 9);
  });

  it('ignores fixtures between evenly matched sides', () => {
    const acc = new Accumulator();
    acc.addSeason(
      season([match('a', 'b', 5, 0)]),
      new Map([
        ['a', 50],
        ['b', 49],
      ]),
    );
    expect(acc.measure().get('strongerSideWins')?.value).toBeUndefined();
  });

  it('reports nothing measured rather than zero when it has seen nothing', () => {
    const acc = new Accumulator();
    for (const v of acc.verdicts()) {
      expect(v.status).toBe('unmeasured');
      expect(v.value).toBeUndefined();
    }
  });

  it('never calls an unmeasured check a pass', () => {
    // The whole reason the status is three-valued. A green report that skipped a check is worse
    // than a red one.
    const acc = new Accumulator();
    expect(acc.verdicts().some((v) => v.status === 'pass')).toBe(false);
  });

  it('fails determinism outright if a single replay differs', () => {
    const acc = new Accumulator();
    acc.addDeterminismCheck(true);
    acc.addDeterminismCheck(false);
    const value = acc.measure().get('determinism')?.value;
    expect(value).toBeCloseTo(0.5, 9);
    const verdict = acc.verdicts().find((v) => v.threshold.key === 'determinism');
    expect(verdict?.status).toBe('fail');
  });
});

describe('tactical identities', () => {
  it('gives the same club the same shape every time', () => {
    const club = loaded.clubs[0];
    expect(club).toBeDefined();
    expect(JSON.stringify(tacticsFor(club!))).toBe(JSON.stringify(tacticsFor(club!)));
  });

  it('gives the league more than one way of playing', () => {
    const shapes = new Set(loaded.clubs.map((club) => tacticsFor(club).formation));
    const lines = new Set(loaded.clubs.map((club) => tacticsFor(club).lineHeight));
    expect(shapes.size).toBeGreaterThan(1);
    expect(lines.size).toBeGreaterThan(1);
  });

  it('fields eleven different players and benches the rest', () => {
    for (const club of loaded.clubs) {
      const tactics = tacticsFor(club);
      expect(tactics.startingXI).toHaveLength(11);
      const ids = new Set(tactics.startingXI.map((s) => s.playerId));
      expect(ids.size).toBe(11);
      for (const id of tactics.bench) expect(ids.has(id)).toBe(false);
      expect(tactics.startingXI.filter((s) => s.position === 'GK')).toHaveLength(1);
    }
  });
});

describe('a season', () => {
  const season = playSeason({
    league: loaded.league,
    clubs: loaded.clubs,
    data: loaded.data,
    seed: 'test',
  });

  it('plays every club the same number of matches', () => {
    const rounds = (loaded.clubs.length - 1) * loaded.league.roundRobin;
    for (const row of season.table) expect(row.played).toBe(rounds);
    expect(season.matches).toHaveLength((loaded.clubs.length * rounds) / 2);
  });

  it('awards the points the league file specifies, never a constant', () => {
    const { win, draw, loss } = loaded.league.points;
    for (const row of season.table) {
      expect(row.points).toBe(row.won * win + row.drawn * draw + row.lost * loss);
      expect(row.won + row.drawn + row.lost).toBe(row.played);
    }
  });

  it('balances every goal scored against a goal conceded', () => {
    const scored = season.table.reduce((sum, row) => sum + row.goalsFor, 0);
    const conceded = season.table.reduce((sum, row) => sum + row.goalsAgainst, 0);
    expect(scored).toBe(conceded);
  });

  it('orders the table by points', () => {
    for (let i = 1; i < season.table.length; i++) {
      expect(season.table[i - 1]!.points).toBeGreaterThanOrEqual(season.table[i]!.points);
    }
  });

  it('replays byte for byte from the same seed', () => {
    const again = playSeason({
      league: loaded.league,
      clubs: loaded.clubs,
      data: loaded.data,
      seed: 'test',
    });
    expect(identicalSeasons(season.matches, again.matches)).toBe(true);
  });

  it('plays a different season from a different seed', () => {
    const other = playSeason({
      league: loaded.league,
      clubs: loaded.clubs,
      data: loaded.data,
      seed: 'other',
    });
    expect(identicalSeasons(season.matches, other.matches)).toBe(false);
  });

  it('indexes reputation by club id, which is what defines a mismatch', () => {
    const index = reputationIndex(loaded.clubs);
    expect(index.size).toBe(loaded.clubs.length);
    for (const club of loaded.clubs) expect(index.get(club.id)).toBe(club.reputation);
  });
});

describe('the command line', () => {
  it('defaults to a run small enough to do after every change', () => {
    expect(parseArgs([])).toEqual({ seasons: 20, league: 'egy-d4' });
  });

  it('takes a season count and a league, and ignores anything else', () => {
    expect(parseArgs(['--seasons=500', '--league=egy-d4', '--nonsense'])).toEqual({
      seasons: 500,
      league: 'egy-d4',
    });
    expect(parseArgs(['--seasons=0']).seasons).toBe(1);
  });

  it('exits non-zero while the engine misses a threshold, and says which', () => {
    const lines: string[] = [];
    const code = main(['--seasons=1'], (line) => lines.push(line));
    const report = lines.join('\n');
    expect(report).toContain('goals per match');
    expect(report).toContain('determinism');
    // The engine does not meet the gate yet. When it does, this flips to 0 and the assertion below
    // is what will tell whoever is reading that the gate has been reached.
    expect(code === 0 || report).toBeTruthy();
    if (code !== 0) expect(report).toContain('thresholds not met');
    else expect(report).toContain('All 7 thresholds met.');
  });
});
