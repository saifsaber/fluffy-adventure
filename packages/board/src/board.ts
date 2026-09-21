import { roundsIn, standings, status, type Season, type TableRow } from '@dakka/season';
import type { ClubId } from '@dakka/engine';

/**
 * What the board asked for, and where you stand against it.
 *
 * **There is no confidence bar here, and that is the point.** The box names the failure exactly —
 * *a bar that moves by a hand-tuned amount per result* — and the reason a bar is so tempting is
 * that it looks like knowledge while being a constant somebody picked. A percentage that goes down
 * four points after a defeat is the same species as the competitor's invented shot count: a number
 * with no derivation behind it.
 *
 * So the outlook has three values and two of them are **proofs**:
 *
 *  - `certain` — the club on the objective line cannot catch you even if they win every remaining
 *    match and you win none.
 *  - `impossible` — you cannot reach them even winning every remaining match while they win none.
 *  - `undecided` — arithmetic alone does not settle it, and neither do we. What is reported instead
 *    is the gap in points, the points still available, and the rate the gap implies: *you need 2.1
 *    a game and you are getting 1.2* is a fact, where *confidence 43%* is a decoration.
 *
 * Sack risk is the same idea. A board's patience is not something to model from the outside — it is
 * a **rule the board states**, authored alongside the objective, and what this module does is
 * evaluate that rule against the table. The answer carries the condition it was judged against, so
 * a player can always ask what would have to change.
 */

export type Objective =
  /** Finish at or above this position. 1 is the title. */
  | { readonly kind: 'finish_at_or_above'; readonly position: number }
  /** Finish above the relegation places, whatever the competition says those are. */
  | { readonly kind: 'avoid_relegation' };

export type Patience =
  /** The board acts the moment the objective becomes arithmetically impossible. */
  | { readonly kind: 'until_impossible' }
  /** The board acts once you are this far adrift of the line, and not before this many games. */
  | { readonly kind: 'adrift_by'; readonly points: number; readonly afterGames: number };

export interface BoardBrief {
  readonly objective: Objective;
  readonly patience: Patience;
}

export type Outlook = 'certain' | 'undecided' | 'impossible';
export type Standing = 'safe' | 'warned' | 'at_risk';

export interface Assessment {
  readonly club: ClubId;
  readonly objective: Objective;
  /** Where the objective line sits in this competition, 1-based. */
  readonly line: number;
  readonly position: number;
  readonly points: number;
  /**
   * The points of the club this actually turns on — which is not always the one on the line.
   *
   * Above the line, the club that can take your place is the **best one below it**; measuring
   * against yourself gives a margin of zero and a certainty that never arrives. Below the line, it
   * is the club holding it.
   */
  readonly rival: ClubId | undefined;
  readonly linePoints: number;
  /** Positive when you are clear of the rival, negative when you are chasing. */
  readonly margin: number;
  readonly gamesRemaining: number;
  /** The most you can still win. `points.win` per game, from the competition. */
  readonly available: number;
  /**
   * Points per game you need from here to reach the line, assuming the club on it takes nothing
   * more. `undefined` when there is nothing to chase or no games left to chase it in.
   */
  readonly neededPerGame: number | undefined;
  /** Points per game you have actually taken over the recent window. Counted, never smoothed. */
  readonly recentPerGame: number | undefined;
  readonly outlook: Outlook;
  readonly standing: Standing;
  /** The condition the board's verdict was judged against, in words a player can act on. */
  readonly condition: string;
}

/** How many of the most recent matches `recentPerGame` reads. A window, not a decay curve. */
export const FORM_WINDOW = 5;

const lineFor = (season: Season, objective: Objective): number =>
  objective.kind === 'finish_at_or_above'
    ? objective.position
    : season.clubs.length - season.competition.relegation.automatic;

/** Every result this club has played, oldest first. */
function matchesOf(season: Season, club: ClubId) {
  return season.results.filter((result) => result.home === club || result.away === club);
}

function pointsFrom(season: Season, club: ClubId, take: number): number | undefined {
  const played = matchesOf(season, club);
  if (played.length === 0) return undefined;
  const window = played.slice(-take);
  const { win, draw, loss } = season.competition.points;
  return (
    window.reduce((total, result) => {
      const mine = result.home === club ? result.homeGoals : result.awayGoals;
      const theirs = result.home === club ? result.awayGoals : result.homeGoals;
      return total + (mine === theirs ? draw : mine > theirs ? win : loss);
    }, 0) / window.length
  );
}

/**
 * Where a club stands against what it was asked for.
 *
 * Everything below is counted from the table and the competition's own rules. The two certainties
 * are the only places this module says anything definite, and both are arithmetic: the rival
 * winning everything, or you winning everything.
 */
export function assess(season: Season, club: ClubId, brief: BoardBrief): Assessment {
  const table = standings(season);
  const line = Math.min(Math.max(1, lineFor(season, brief.objective)), table.length);
  const mine = table.find((row) => row.club === club) as TableRow;
  const aboveTheLine = mine.position <= line;

  // Who decides this. Holding the line, the danger is the best club below it — comparing yourself
  // with yourself gives a margin of nought and a certainty that never arrives, which is the bug a
  // test caught here. Chasing, the target is whoever holds the line.
  const rival = aboveTheLine
    ? table.find((row) => row.position > line && row.club !== club)
    : table[line - 1];

  const perGame = season.competition.points.win;
  const total = roundsIn(season);
  const gamesRemaining = total - mine.played;
  const available = gamesRemaining * perGame;
  const rivalRemaining = rival === undefined ? 0 : (total - rival.played) * perGame;

  const margin = mine.points - (rival?.points ?? mine.points);

  // Two proofs, and nothing in between pretends to be one.
  const outlook: Outlook = aboveTheLine
    ? margin > rivalRemaining
      ? 'certain'
      : 'undecided'
    : margin + available < 0
      ? 'impossible'
      : 'undecided';

  const chasing = aboveTheLine ? 0 : -margin;
  const neededPerGame = aboveTheLine || gamesRemaining === 0 ? undefined : chasing / gamesRemaining;

  const { standing, condition } = judge(brief.patience, {
    outlook,
    chasing,
    played: mine.played,
    perGame,
  });

  return {
    club,
    objective: brief.objective,
    line,
    position: mine.position,
    points: mine.points,
    rival: rival?.club,
    linePoints: rival?.points ?? mine.points,
    margin,
    gamesRemaining,
    available,
    neededPerGame,
    recentPerGame: pointsFrom(season, club, FORM_WINDOW),
    outlook,
    standing,
    condition,
  };
}

function judge(
  patience: Patience,
  state: { outlook: Outlook; chasing: number; played: number; perGame: number },
): { standing: Standing; condition: string } {
  if (patience.kind === 'until_impossible') {
    return {
      standing: state.outlook === 'impossible' ? 'at_risk' : 'safe',
      condition: 'the board acts when the objective becomes impossible',
    };
  }

  const condition = `the board acts at ${patience.points} points adrift, from game ${patience.afterGames}`;
  if (state.played < patience.afterGames) return { standing: 'safe', condition };
  if (state.chasing >= patience.points) return { standing: 'at_risk', condition };
  // One win from the threshold. Named rather than shaded, so it is a fact and not a colour.
  if (state.chasing > 0 && patience.points - state.chasing <= state.perGame) {
    return { standing: 'warned', condition };
  }
  return { standing: 'safe', condition };
}

/** Nothing is final until the season is. Mirrors `seasonEnd`. */
export function objectiveMet(season: Season, club: ClubId, brief: BoardBrief): boolean | undefined {
  if (status(season) !== 'complete') return undefined;
  const table = standings(season);
  const row = table.find((entry) => entry.club === club);
  return row === undefined ? undefined : row.position <= lineFor(season, brief.objective);
}
