import { describe, expect, it } from 'vitest';
import { DATA_ROOT, loadLeague } from '@dakka/content';
import { ALL_CAUSES } from '@dakka/engine';
import type { CauseTag, ClubId, MatchTrace, Side } from '@dakka/engine';
import { record, startSeason, type Season } from '@dakka/season';
import type { BoardBrief } from '@dakka/board';
import { QUESTIONS, dashboard, seen, tiles, type Career, type PlayedMatch } from '../src/index.js';

/**
 * The dashboard, and the one rule that shapes all of it: **no tile exists to fill space.**
 *
 * So the tests that carry this file are the *silences*. It is easy to write a dashboard where
 * every question always has something to say — and that dashboard will, on the first quiet week,
 * say something nobody counted. Here a question with no answer is a named value, it is left out of
 * `tiles()`, and the reason is asserted: a first visit is not "nothing changed", and a manager
 * meeting his objective with nothing going wrong is told nothing rather than told a risk.
 */

const league = loadLeague(DATA_ROOT, 'egy-d4');
const clubs = league.clubs.map((club) => club.id);
const [a, b, c] = clubs as [ClubId, ClubId, ClubId];

const title: BoardBrief = {
  objective: { kind: 'finish_at_or_above', position: 1 },
  patience: { kind: 'until_impossible' },
};

type Goals = (round: number, home: ClubId, away: ClubId) => readonly [number, number];

function play(through: number, goals: Goals): Season {
  let season = startSeason(league.league, clubs);
  for (const fixture of season.fixtures.filter((f) => f.round <= through)) {
    const [homeGoals, awayGoals] = goals(fixture.round, fixture.home, fixture.away);
    const next = record(season, {
      round: fixture.round,
      home: fixture.home,
      away: fixture.away,
      homeGoals,
      awayGoals,
      seed: `${fixture.round}/${fixture.home}`,
    });
    if (!next.ok) throw new Error(next.problem);
    season = next.season;
  }
  return season;
}

/** `a` wins everything, `b` loses everything, everyone else draws. */
const runaway: Goals = (_round, home, away) => {
  if (home === a || away === b) return [1, 0];
  if (away === a || home === b) return [0, 1];
  return [0, 0];
};

/** `a` runs away with it and then stops: ten wins, then five defeats. `c` does the opposite. */
const fading: Goals = (round, home, away) => {
  const [winner, loser] = round <= 10 ? [a, c] : [c, a];
  if (home === winner || away === loser) return [1, 0];
  if (away === winner || home === loser) return [0, 1];
  return [0, 0];
};

const career = (season: Season, club: ClubId, over: Partial<Career> = {}): Career => ({
  season,
  club,
  brief: title,
  played: [],
  lastVisit: undefined,
  ...over,
});

/* ------------------------------------------------------------------------------------------ */

describe('the five questions, and the tiles they earn', () => {
  it('asks exactly the five blueprint §6 names, in that order', () => {
    const view = dashboard(career(startSeason(league.league, clubs), a));
    expect(QUESTIONS).toEqual(['decision', 'since', 'onTrack', 'risk', 'assistant']);
    expect([...QUESTIONS].sort()).toEqual(Object.keys(view).sort());
  });

  it('draws nothing but the decision on the first day of a career', () => {
    // Nothing has been played, nobody has visited before, and there is no trace to read. Four of
    // the five questions have no answer, so four of the five tiles do not exist.
    const view = dashboard(career(startSeason(league.league, clubs), a));
    expect(tiles(view)).toEqual(['decision']);
    expect(view.since).toEqual({ answered: false, silent: 'first_visit' });
    expect(view.onTrack).toEqual({ answered: false, silent: 'nothing_played' });
    expect(view.assistant).toEqual({ answered: false, silent: 'nothing_played' });
  });

  it('never lists a question it could not answer', () => {
    const view = dashboard(career(play(38, runaway), a));
    for (const question of tiles(view)) expect(view[question].answered).toBe(true);
    for (const question of QUESTIONS) {
      if (!view[question].answered) expect(tiles(view)).not.toContain(question);
    }
  });
});

describe('1. what needs my decision today', () => {
  it('is the next fixture this club is actually in, from the season and not from a screen', () => {
    const season = play(4, runaway);
    const fifth = season.fixtures.filter((f) => f.round === 5);
    // Deliberately not the round's first fixture. A club that happens to sit at the head of the
    // list cannot tell "the fixture this club is in" apart from "the first fixture of the round".
    const mine = fifth[3] as (typeof fifth)[number];
    const club = mine.home;
    expect(fifth[0]?.home).not.toBe(club);
    expect(fifth[0]?.away).not.toBe(club);

    const view = dashboard(career(season, club));
    if (!view.decision.answered) throw new Error('expected a fixture');
    expect(view.decision.value.round).toBe(5);
    expect(view.decision.value.opponent).toBe(mine.away);
    expect(view.decision.value.venue).toBe('home');
  });

  it('prints no table position before a ball has been kicked', () => {
    // Every club shares position 1 over an unplayed season. True, and a statement about the sort
    // order rather than about the season — so it is withheld rather than printed.
    const fresh = dashboard(career(startSeason(league.league, clubs), a));
    if (!fresh.decision.answered) throw new Error('expected a fixture');
    expect(fresh.decision.value.standing).toBeUndefined();

    const running = dashboard(career(play(4, runaway), a));
    if (!running.decision.answered) throw new Error('expected a fixture');
    expect(running.decision.value.standing?.you.position).toBe(1);
    expect(running.decision.value.standing?.you.played).toBe(4);
  });

  it('has nothing to ask once the season is over', () => {
    expect(dashboard(career(play(38, runaway), a)).decision).toEqual({
      answered: false,
      silent: 'season_complete',
    });
  });
});

describe('2. what changed since I last played', () => {
  it('says nothing at all on a first visit, and says it differently from "nothing changed"', () => {
    // The distinction is the whole discipline. A first visit has no *before*; reporting one would
    // mean inventing the table the manager did not see.
    const first = dashboard(career(play(4, runaway), a));
    expect(first.since).toEqual({ answered: false, silent: 'first_visit' });

    const marked = seen(career(play(4, runaway), a));
    expect(dashboard(marked).since).toEqual({ answered: false, silent: 'nothing_changed' });
  });

  it('counts what happened, and re-derives the table it was compared against', () => {
    // `c` loses the first ten and wins the next five, so both the points and the position have to
    // move between the two looks. A club whose numbers never change — the bottom club of a runaway
    // season — cannot tell a re-derived *before* from the table as it stands now, which is the
    // anti-pattern this codebase has been bitten by twice: a constant that matches the only case
    // under test is invisible to it.
    const marked = seen(career(play(10, fading), c));
    const after: Career = { ...marked, season: play(15, fading) };

    const view = dashboard(after);
    if (!view.since.answered) throw new Error('expected a change');
    const since = view.since.value;

    // Five whole rounds of a twenty-club league.
    expect(since.matchesPlayed).toBe(50);
    expect(since.yours).toHaveLength(5);
    expect(since.yours.every((r) => r.home === c || r.away === c)).toBe(true);
    expect(since.pointsBefore).toBe(0);
    expect(since.pointsNow).toBe(15);
    expect(since.positionBefore).toBe(20);
    expect(since.positionNow).toBeLessThan(since.positionBefore);
  });

  it('remembers a count and nothing else, so the comparison cannot drift', () => {
    // `seen` stores how many results had been recorded, not the table at that moment. The proof is
    // that the marker survives being carried onto a season object built from scratch: the same
    // results in the same order give the same *before*, because it is recomputed both times.
    const marked = seen(career(play(4, runaway), a));
    expect(marked.lastVisit).toEqual({ resultsSeen: play(4, runaway).results.length });

    const rebuilt: Career = { ...marked, season: play(6, runaway) };
    const fresh: Career = { ...career(play(6, runaway), a), lastVisit: { resultsSeen: 40 } };
    expect(dashboard(rebuilt).since).toEqual(dashboard(fresh).since);
  });

  it('refuses a marker from some other season rather than reporting a change', () => {
    const impossible: Career = {
      ...career(play(2, runaway), a),
      lastVisit: { resultsSeen: 999 },
    };
    expect(() => dashboard(impossible)).toThrow(/ahead of/);
  });
});

describe('3. am I on track', () => {
  it('waits for a match to be played before saying where anyone stands', () => {
    expect(dashboard(career(startSeason(league.league, clubs), a)).onTrack).toEqual({
      answered: false,
      silent: 'nothing_played',
    });
  });

  it('is the board assessment, with the proof it carries and no percentage', () => {
    const view = dashboard(career(play(38, runaway), a));
    if (!view.onTrack.answered) throw new Error('expected an assessment');
    expect(view.onTrack.value.outlook).toBe('certain');
    expect(view.onTrack.value.position).toBe(1);
    expect(Object.keys(view.onTrack.value)).not.toContain('confidence');
  });
});

describe('4. what is my biggest risk', () => {
  it('says nothing when nothing is going wrong', () => {
    // `a` wins every week and is top. There is no risk in the numbers, so there is no tile — the
    // alternative is a permanent card that must be filled, which is where invention starts.
    const view = dashboard(career(play(15, runaway), a));
    expect(view.risk).toEqual({ answered: false, silent: 'no_live_risk' });
  });

  it('measures a chasing club against the counted rate of the club it is chasing', () => {
    const season = play(10, runaway);
    const view = dashboard(career(season, b));
    if (!view.risk.answered) throw new Error('expected a risk');
    const risk = view.risk.value;
    if (risk.kind !== 'pace') throw new Error(`expected pace, got ${risk.kind}`);

    expect(risk.yours).toBe(0);
    expect(risk.against.kind).toBe('chasing');
    expect(risk.against.club).toBe(a);
    expect(risk.against.perGame).toBe(3);
    expect(risk.behindBy).toBe(3);

    // Not the rate `assess` calls `neededPerGame`. Over a bunched division that number is tiny —
    // it assumes the club on the line takes nothing more — and using it here once told a club in
    // nineteenth that it needed 0.2 a game and had no problem.
    if (!view.onTrack.answered) throw new Error('expected an assessment');
    expect(view.onTrack.value.neededPerGame).not.toBe(risk.against.perGame);
  });

  it('measures a leader against the club that would take his place', () => {
    // The same comparison from the other end: somebody behind you going faster. Both rates are
    // counted over the same window, and which club it is comes from the objective, not the table.
    const view = dashboard(career(play(15, fading), a));
    if (!view.risk.answered) throw new Error('expected a risk');
    const risk = view.risk.value;
    if (risk.kind !== 'pace') throw new Error(`expected pace, got ${risk.kind}`);

    expect(risk.window).toBe(5);
    expect(risk.yours).toBe(0);
    expect(risk.against.kind).toBe('chased');
    expect(risk.against.perGame).toBeGreaterThan(0);
    expect(risk.behindBy).toBeCloseTo(risk.against.perGame - risk.yours, 10);
  });

  it('puts the board ahead of the rate, because one of them ends the career', () => {
    const impatient: BoardBrief = {
      objective: { kind: 'finish_at_or_above', position: 1 },
      patience: { kind: 'adrift_by', points: 5, afterGames: 3 },
    };
    const season = play(10, runaway);
    const view = dashboard(career(season, b, { brief: impatient }));
    if (!view.risk.answered) throw new Error('expected a risk');
    const risk = view.risk.value;
    if (risk.kind !== 'sack') throw new Error(`expected sack, got ${risk.kind}`);

    expect(risk.standing).toBe('at_risk');
    expect(risk.patience).toEqual(impatient.patience);
    expect(risk.adrift).toBe(30);
    // Thirty adrift against a rule that acts at five: twenty-five past the point of no return.
    expect(risk.slack).toBe(-25);
    expect(risk.gamesBeforeWindow).toBe(0);

    // The rate is live too — it is simply not the biggest thing happening to this manager.
    const patient = dashboard(career(season, b));
    if (!patient.risk.answered) throw new Error('expected a risk');
    expect(patient.risk.value.kind).toBe('pace');
  });

  it('counts the games left before an unpatient rule even applies', () => {
    const later: BoardBrief = {
      objective: { kind: 'finish_at_or_above', position: 1 },
      patience: { kind: 'adrift_by', points: 1, afterGames: 12 },
    };
    const view = dashboard(career(play(4, runaway), b, { brief: later }));
    // Four games played against a rule that starts at twelve: the board is not watching yet, so
    // the standing is safe and the risk on the screen is the rate instead.
    if (!view.risk.answered) throw new Error('expected a risk');
    expect(view.risk.value.kind).toBe('pace');
  });
});

/* ------------------------------------------------------------------------------------------ */

const swing = (
  minute: number,
  cause: CauseTag,
  deltaWinProbability: number,
): MatchTrace['swings'][number] => ({
  minute,
  cause,
  deltaWinProbability,
  actors: [],
  favoured: deltaWinProbability >= 0 ? 'home' : 'away',
});

const match = (round: number, side: Side, swings: MatchTrace['swings']): PlayedMatch => ({
  round,
  seed: `${round}`,
  side,
  trace: { swings, winProbabilityTimeline: [0.5, 0.5] },
});

describe('5. what does my assistant think, and why', () => {
  it('raises the controllable cause that cost the most, and ignores the one nobody chose', () => {
    // `WASTEFUL_FINISHING` is the larger number by far and is the wrong answer: a manager cannot
    // change a miss. Advice attached to something outside his control implies a control that does
    // not exist, which is the same lie as an invented statistic told in a friendlier voice.
    const played = [
      match(1, 'home', [swing(20, 'WASTEFUL_FINISHING', -0.5), swing(30, 'PRESS_BYPASSED', -0.1)]),
      match(2, 'home', [swing(55, 'PRESS_BYPASSED', -0.12), swing(70, 'HIGH_LINE_VS_PACE', -0.05)]),
    ];
    const view = dashboard(career(play(2, runaway), a, { played }));
    if (!view.assistant.answered) throw new Error('expected a reading');

    expect(view.assistant.value.cause).toBe('PRESS_BYPASSED');
    expect(view.assistant.value.matches).toBe(2);
    expect(view.assistant.value.cost).toBeCloseTo(-0.22, 10);
    expect(view.assistant.value.matchesRead).toBe(2);
    // Most recent match first — the evidence reads the way a coach would give it.
    expect(view.assistant.value.occurrences.map((o) => o.round)).toEqual([2, 1]);
  });

  it('re-signs an away trace before reading it', () => {
    // The engine signs every swing for the home side. Read unflipped, an away manager is handed an
    // explanation that is confident, specific and exactly backwards.
    const played = [match(1, 'away', [swing(40, 'PRESS_BYPASSED', +0.3)])];
    const view = dashboard(career(play(1, runaway), a, { played }));
    if (!view.assistant.answered) throw new Error('expected a reading');
    expect(view.assistant.value.cause).toBe('PRESS_BYPASSED');
    expect(view.assistant.value.cost).toBeCloseTo(-0.3, 10);

    // The same trace from the home dugout is a moment that *helped*, so there is nothing to raise.
    const home = dashboard(
      career(play(1, runaway), a, { played: [match(1, 'home', played[0]!.trace.swings)] }),
    );
    expect(home.assistant).toEqual({ answered: false, silent: 'no_controllable_cause' });
  });

  it('reads the recent window and not the whole career', () => {
    const old = match(1, 'home', [swing(10, 'HIGH_LINE_VS_PACE', -0.9)]);
    const recent = Array.from({ length: 5 }, (_, i) =>
      match(i + 2, 'home', [swing(60, 'PRESS_BYPASSED', -0.02)]),
    );
    const view = dashboard(career(play(6, runaway), a, { played: [old, ...recent] }));
    if (!view.assistant.answered) throw new Error('expected a reading');
    expect(view.assistant.value.cause).toBe('PRESS_BYPASSED');
    expect(view.assistant.value.matchesRead).toBe(5);
  });

  it('has nothing to say before a match, and nothing to say when nothing was controllable', () => {
    expect(dashboard(career(play(2, runaway), a)).assistant).toEqual({
      answered: false,
      silent: 'nothing_played',
    });

    const luckless = [match(1, 'home', [swing(20, 'WASTEFUL_FINISHING', -0.4)])];
    expect(dashboard(career(play(1, runaway), a, { played: luckless })).assistant).toEqual({
      answered: false,
      silent: 'no_controllable_cause',
    });
  });

  it('settles a dead-heat by a declared order rather than by whichever was seen first', () => {
    // Two causes costing exactly the same is rare and will happen. Falling back on map insertion
    // order would make the assistant's opinion depend on the minute the two moments occurred in,
    // which is not a reason for anything — so the tie goes to the registry's own order.
    const first = [
      match(1, 'home', [swing(20, 'PRESS_BYPASSED', -0.1), swing(21, 'HIGH_LINE_VS_PACE', -0.1)]),
    ];
    const reversed = [
      match(1, 'home', [swing(20, 'HIGH_LINE_VS_PACE', -0.1), swing(21, 'PRESS_BYPASSED', -0.1)]),
    ];
    const one = dashboard(career(play(1, runaway), a, { played: first })).assistant;
    const other = dashboard(career(play(1, runaway), a, { played: reversed })).assistant;
    if (!one.answered || !other.answered) throw new Error('expected a reading');
    expect(one.value.cause).toBe(other.value.cause);
    expect(one.value.cause).toBe(ALL_CAUSES.find((c) => c === 'HIGH_LINE_VS_PACE'));
  });
});
