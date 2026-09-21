import { describe, expect, it } from 'vitest';
import { DATA_ROOT, loadLeague } from '@dakka/content';
import type { ClubId } from '@dakka/engine';
import { record, standings, startSeason, type Season } from '@dakka/season';
import { FORM_WINDOW, assess, objectiveMet, type BoardBrief } from '../src/index.js';

/**
 * The board, with no confidence bar anywhere in it.
 *
 * The tests that carry this are the two certainties, because they are the only claims the module
 * makes without hedging and both are arithmetic: a lead the club on the line cannot close even
 * winning out, and a gap you cannot close even winning out. Everything between them is reported as
 * numbers — the gap, the games left, the rate it implies — and never as a percentage, which would
 * be a constant somebody picked wearing the clothes of a measurement.
 */

const league = loadLeague(DATA_ROOT, 'egy-d4');
const clubs = league.clubs.map((club) => club.id);
const [a, b] = clubs as [ClubId, ClubId];

const brief: BoardBrief = {
  objective: { kind: 'finish_at_or_above', position: 1 },
  patience: { kind: 'until_impossible' },
};

/** Plays rounds up to `through`, scoring by a rule the test controls. */
function play(through: number, goals: (home: ClubId, away: ClubId) => [number, number]): Season {
  let season = startSeason(league.league, clubs);
  for (const fixture of season.fixtures.filter((f) => f.round <= through)) {
    const [homeGoals, awayGoals] = goals(fixture.home, fixture.away);
    const next = record(season, {
      round: fixture.round,
      home: fixture.home,
      away: fixture.away,
      homeGoals,
      awayGoals,
      seed: `${fixture.round}`,
    });
    if (!next.ok) throw new Error(next.problem);
    season = next.season;
  }
  return season;
}

/** A always wins, B always loses, everyone else draws. */
const oneRunaway = (home: ClubId, away: ClubId): [number, number] => {
  if (home === a) return [1, 0];
  if (away === a) return [0, 1];
  if (home === b) return [0, 1];
  if (away === b) return [1, 0];
  return [0, 0];
};

describe('the two things the board can say for certain', () => {
  it('calls it certain only when the chaser cannot catch up winning every game', () => {
    const whole = play(38, oneRunaway);
    const done = assess(whole, a, brief);
    expect(done.gamesRemaining).toBe(0);
    expect(done.outlook).toBe('certain');
    expect(done.margin).toBeGreaterThan(0);

    // Early on, with everything still to play for, the same lead is not a certainty.
    const early = assess(play(3, oneRunaway), a, brief);
    expect(early.position).toBe(1);
    expect(early.outlook).toBe('undecided');
    expect(early.margin).toBeGreaterThan(0);
  });

  it('calls it impossible only when winning out would not be enough', () => {
    const whole = play(38, oneRunaway);
    const hopeless = assess(whole, b, brief);
    expect(hopeless.outlook).toBe('impossible');
    expect(hopeless.margin + hopeless.available).toBeLessThan(0);

    const early = assess(play(3, oneRunaway), b, brief);
    expect(early.outlook).toBe('undecided');
  });

  it('never claims a certainty the arithmetic does not give it', () => {
    // The property behind both: `certain` requires the lead to exceed everything the club on the
    // line can still win, and `impossible` requires the gap to exceed everything you can.
    for (const through of [1, 5, 12, 20, 30, 38]) {
      const season = play(through, oneRunaway);
      for (const club of [a, b, clubs[7] as ClubId]) {
        const view = assess(season, club, brief);
        const rivalRow = standings(season).find((r) => r.club === view.rival);
        const rivalRemaining = (38 - (rivalRow?.played ?? 0)) * league.league.points.win;
        if (view.outlook === 'certain') expect(view.margin).toBeGreaterThan(rivalRemaining);
        if (view.outlook === 'impossible') {
          expect(view.margin + view.available).toBeLessThan(0);
        }
      }
    }
  });
});

describe('what it reports instead of a percentage', () => {
  it('gives the gap, the games left and the rate the gap implies', () => {
    const season = play(10, oneRunaway);
    const chasing = assess(season, b, brief);
    expect(chasing.margin).toBeLessThan(0);
    expect(chasing.gamesRemaining).toBe(28);
    expect(chasing.available).toBe(28 * league.league.points.win);
    // Needed rate is the gap divided by the games left. Nothing smoothed, nothing tuned.
    expect(chasing.neededPerGame).toBeCloseTo(-chasing.margin / chasing.gamesRemaining, 10);
  });

  it('counts recent form over a window rather than decaying it', () => {
    const season = play(10, oneRunaway);
    // A always wins, so its rate over the window is exactly the win value.
    expect(assess(season, a, brief).recentPerGame).toBe(league.league.points.win);
    expect(assess(season, b, brief).recentPerGame).toBe(league.league.points.loss);
    expect(FORM_WINDOW).toBeGreaterThan(0);
  });

  it('says nothing about a rate before a ball is kicked', () => {
    const fresh = startSeason(league.league, clubs);
    const view = assess(fresh, a, brief);
    expect(view.recentPerGame).toBeUndefined();
    expect(view.outlook).toBe('undecided');
  });

  it('uses the competition\u2019s points values, not a constant', () => {
    // The Egyptian file is 3-1-0, so a hardcoded 3 agrees with it and nothing over this league
    // could tell. A competition worth two for a win changes what is still winnable.
    const season = play(10, oneRunaway);
    const twoForAWin = {
      ...season,
      competition: { ...season.competition, points: { win: 2, draw: 1, loss: 0 } },
    };
    const view = assess(twoForAWin, b, brief);
    expect(view.available).toBe(view.gamesRemaining * 2);
  });

  it('has no confidence field to hand-tune', () => {
    // The box names the failure: a bar that moves by a constant per result. There is nowhere in
    // this shape to put one.
    const view = assess(play(5, oneRunaway), a, brief);
    expect(Object.keys(view)).not.toContain('confidence');
    expect(Object.keys(view)).not.toContain('sackRisk');
  });
});

describe('the board states its rule, and the rule is evaluated', () => {
  it('acts when the objective becomes impossible, and not before', () => {
    expect(assess(play(3, oneRunaway), b, brief).standing).toBe('safe');
    expect(assess(play(38, oneRunaway), b, brief).standing).toBe('at_risk');
  });

  it('holds its patience until the game it named', () => {
    const impatient: BoardBrief = {
      objective: { kind: 'finish_at_or_above', position: 1 },
      patience: { kind: 'adrift_by', points: 6, afterGames: 10 },
    };
    // Adrift by plenty after three games, but the board said it would wait until ten.
    const early = assess(play(3, oneRunaway), b, impatient);
    expect(early.standing).toBe('safe');
    expect(early.condition).toMatch(/from game 10/);

    const later = assess(play(12, oneRunaway), b, impatient);
    expect(later.standing).toBe('at_risk');
  });

  it('warns within one win of the threshold, rather than shading a colour', () => {
    // A warning is a fact about distance, not a hue. B is exactly one win short of the line the
    // board drew, so it is warned and not yet at risk.
    const season = play(12, oneRunaway);
    const gap = -assess(season, b, brief).margin;
    const patience: BoardBrief = {
      objective: { kind: 'finish_at_or_above', position: 1 },
      patience: { kind: 'adrift_by', points: gap + 1, afterGames: 1 },
    };
    const view = assess(season, b, patience);
    expect(view.standing).toBe('warned');
    expect(view.condition).toContain(`${gap + 1} points adrift`);
  });

  it('carries the condition it was judged against', () => {
    const view = assess(play(5, oneRunaway), a, brief);
    expect(view.condition).toBe('the board acts when the objective becomes impossible');
  });
});

describe('survival is the same machinery with a different line', () => {
  it('puts the line where the competition puts relegation', () => {
    const season = play(10, oneRunaway);
    const survival: BoardBrief = {
      objective: { kind: 'avoid_relegation' },
      patience: { kind: 'until_impossible' },
    };
    const view = assess(season, b, survival);
    expect(view.line).toBe(clubs.length - league.league.relegation.automatic);
    // And the club leading the league is clear of whoever would replace it.
    expect(assess(season, a, survival).margin).toBeGreaterThan(0);
    // Above the line, the rival is somebody below it — never the club itself.
    expect(assess(season, a, survival).rival).not.toBe(a);
  });
});

describe('nothing is final until the season is', () => {
  it('refuses to say whether the objective was met while games remain', () => {
    expect(objectiveMet(play(20, oneRunaway), a, brief)).toBeUndefined();
  });

  it('answers once every game has been played', () => {
    const whole = play(38, oneRunaway);
    expect(objectiveMet(whole, a, brief)).toBe(true);
    expect(objectiveMet(whole, b, brief)).toBe(false);
  });
});
