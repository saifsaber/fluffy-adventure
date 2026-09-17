import { pairedDifference, type Measured } from './counterfactual.js';
import { simulate } from './simulate.js';
import { bandCompetence } from './space.js';
import type { Side } from './chain.js';
import type { PlayerId } from './types/ids.js';
import type { Player, PlayerRole, Position } from './types/player.js';
import type { MatchInput, MatchResult } from './types/match.js';
import type { Selection, Tactics } from './types/tactics.js';
import type { Band } from './zones.js';

/**
 * **+MGR — how many points your decisions were worth.**
 *
 * Replay the same fixtures, the same seeds and the same squad with a manager who makes no decisions,
 * and subtract. What is left is you, with squad quality divided out — which is the one football
 * argument everybody already has (*is he a good manager, or are they good players?*) answered with a
 * number instead of an opinion.
 *
 * It exists because the engine is deterministic, and it is the reason that rule is not merely tidy:
 * 38-0 has no simulation to re-run, a random engine makes the baseline noise rather than a control,
 * and Football Manager has no shared seed. See `docs/01-product/05-global-strategy.md` §4.
 *
 * **The honest part is the last field.** A season's `points` is an exact fact about *that season* —
 * these fixtures, these seeds, this counterfactual. It is not by itself a claim about skill, because
 * one season is one sample and the two arms diverge after the first decision. `skill` carries the
 * per-match difference with the standard error of its own mean, so a caller can tell "+11, and that
 * is more than the noise" from "+11, and a coin could have done it". Showing the first number
 * without reading the second is how a headline becomes a lie.
 */

/**
 * What the baseline manager plays, always.
 *
 * A flat 4-4-2 with neutral everything: the most ordinary arrangement in football, chosen precisely
 * because it is unremarkable. It is deliberately **not** the 4-3-3 the fixtures and most real
 * managers reach for, so the baseline never coincides with a player's choice by accident.
 */
const BASELINE_SHAPE: readonly (readonly [Position, PlayerRole])[] = [
  ['GK', 'shot_stopper'],
  ['RB', 'defensive_fullback'],
  ['CB', 'stopper'],
  ['CB', 'covering_defender'],
  ['LB', 'defensive_fullback'],
  ['RM', 'touchline_winger'],
  ['CM', 'box_to_box'],
  ['CM', 'ball_winner'],
  ['LM', 'touchline_winger'],
  ['ST', 'poacher'],
  ['ST', 'target_man'],
];

/** Which third of the pitch a position lives in — how the baseline judges a player for a slot. */
const BAND_OF_POSITION: Record<Position, Band> = {
  GK: 'defensive',
  RB: 'defensive',
  LB: 'defensive',
  CB: 'defensive',
  RWB: 'defensive',
  LWB: 'defensive',
  CDM: 'middle',
  CM: 'middle',
  CAM: 'middle',
  RM: 'middle',
  LM: 'middle',
  RW: 'attacking',
  LW: 'attacking',
  ST: 'attacking',
  CF: 'attacking',
};

/** A player is natural in a position when it is one they cover without penalty. */
const naturalIn = (player: Player, position: Position): boolean =>
  player.positions.includes(position);

/**
 * The baseline's team sheet.
 *
 * Competent and unremarkable, which is the whole specification: for each slot in order it takes the
 * best available player who is natural there, and falls back to the best available player otherwise.
 * It does not optimise across slots, it does not rotate, and it does not rest anyone.
 *
 * "Best" is `bandCompetence` — the engine's own reading of a player in that third of the pitch.
 * Inventing a second rating here would mean the baseline was judged by a standard the match never
 * uses, and the difference between the two would end up inside +MGR.
 */
export function baselineTactics(squad: readonly Player[]): Tactics {
  const taken = new Set<PlayerId>();
  const startingXI: Selection[] = [];

  for (const [position, role] of BASELINE_SHAPE) {
    const band = BAND_OF_POSITION[position];
    const available = squad.filter((player) => !taken.has(player.id));
    if (available.length === 0) break;

    const natural = available.filter((player) => naturalIn(player, position));
    const pool = natural.length > 0 ? natural : available;
    let best = pool[0] as Player;
    for (const player of pool) {
      if (bandCompetence(player, band) > bandCompetence(best, band)) best = player;
    }
    taken.add(best.id);
    startingXI.push({ playerId: best.id, position, role });
  }

  const bench = squad.filter((player) => !taken.has(player.id)).map((player) => player.id);
  const keeper = startingXI[0]?.playerId ?? (squad[0]?.id as PlayerId);
  // The most attacking player on the sheet takes everything. A baseline manager does not hold
  // set-piece auditions.
  const taker = startingXI[startingXI.length - 1]?.playerId ?? keeper;

  return {
    formation: '4-4-2',
    startingXI,
    bench,
    captain: keeper,
    mentality: 'balanced',
    lineHeight: 'normal',
    pressingIntensity: 'moderate',
    pressingTrigger: 'middle_third',
    tempo: 'balanced',
    passingDirectness: 'mixed',
    width: 'balanced',
    compactness: 'balanced',
    setPieceTakers: { corners: taker, freeKicks: taker, penalties: taker },
  };
}

/**
 * The same fixture with one side's manager removed.
 *
 * Everything else is untouched — the opponent, the seed, the crowd, the travel — so the only thing
 * that differs between the two arms is the decisions being priced.
 */
export function neutralise(input: MatchInput, side: Side): MatchInput {
  const managed = input[side];
  return {
    ...input,
    [side]: {
      ...managed,
      tactics: baselineTactics(managed.club.squad),
      decisions: [],
    },
  };
}

/** A fixture as the player set it up, and which side they were managing. */
export interface ManagedMatch {
  readonly input: MatchInput;
  readonly side: Side;
}

export interface SeasonPoints {
  readonly points: number;
  readonly won: number;
  readonly drawn: number;
  readonly lost: number;
  readonly goalsFor: number;
  readonly goalsAgainst: number;
}

const POINTS_FOR_A_WIN = 3;
const POINTS_FOR_A_DRAW = 1;

function pointsOf(result: MatchResult, side: Side): number {
  const scored = side === 'home' ? result.homeScore : result.awayScore;
  const conceded = side === 'home' ? result.awayScore : result.homeScore;
  return scored > conceded ? POINTS_FOR_A_WIN : scored === conceded ? POINTS_FOR_A_DRAW : 0;
}

function tally(results: readonly { result: MatchResult; side: Side }[]): SeasonPoints {
  let points = 0;
  let won = 0;
  let drawn = 0;
  let lost = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  for (const { result, side } of results) {
    const scored = side === 'home' ? result.homeScore : result.awayScore;
    const conceded = side === 'home' ? result.awayScore : result.homeScore;
    goalsFor += scored;
    goalsAgainst += conceded;
    if (scored > conceded) won += 1;
    else if (scored === conceded) drawn += 1;
    else lost += 1;
    points += pointsOf(result, side);
  }
  return { points, won, drawn, lost, goalsFor, goalsAgainst };
}

export interface PlusMgr {
  readonly matches: number;
  /** The season as the player actually managed it. */
  readonly managed: SeasonPoints;
  /** The same fixtures and seeds, with a manager who makes no decisions. */
  readonly baseline: SeasonPoints;
  /**
   * **The headline.** Points gained over the baseline across these fixtures.
   *
   * Exact for this season, and only for this season.
   */
  readonly points: number;
  /** Point difference per fixture, in order — what `skill` is computed from. */
  readonly perMatch: readonly number[];
  /**
   * Whether the season is evidence of skill or of a good seed.
   *
   * `mean` is points per match; `significant` says the run is bigger than the spread within it. A
   * caller that shows `points` without reading this is publishing luck as achievement.
   */
  readonly skill: Measured;
}

/**
 * +MGR over a set of fixtures.
 *
 * Every fixture is simulated twice from the same `MatchInput`: once as given, once with
 * `neutralise` applied to the managed side. Because `simulate` is a pure function of its input, the
 * baseline is a control rather than another sample.
 */
export function plusMgr(matches: readonly ManagedMatch[]): PlusMgr {
  const managed: { result: MatchResult; side: Side }[] = [];
  const baseline: { result: MatchResult; side: Side }[] = [];
  const perMatch: number[] = [];

  for (const fixture of matches) {
    const withManager = simulate(fixture.input);
    const without = simulate(neutralise(fixture.input, fixture.side));
    managed.push({ result: withManager, side: fixture.side });
    baseline.push({ result: without, side: fixture.side });
    perMatch.push(pointsOf(withManager, fixture.side) - pointsOf(without, fixture.side));
  }

  const managedTotal = tally(managed);
  const baselineTotal = tally(baseline);
  return {
    matches: matches.length,
    managed: managedTotal,
    baseline: baselineTotal,
    points: managedTotal.points - baselineTotal.points,
    perMatch,
    skill: pairedDifference(perMatch),
  };
}
