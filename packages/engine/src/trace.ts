import type { ChainEvent, MinuteState } from './chain.js';
import type { PlayerId } from './types/ids.js';
import type { Shot } from './types/match.js';
import { CAUSE_REGISTRY } from './types/causes.js';
import type { CauseTag, MatchTrace, SwingMoment } from './types/trace.js';

/**
 * The decision trace — how a match explains itself.
 *
 * This is the one thing the AI layer is ever allowed to read about a match, so everything in it has
 * to be a measurement rather than a narrative. Two rules shape the whole file:
 *
 * 1. **Win probability is computed from the engine's own state, never estimated afterwards.** At
 *    each minute the chain records the score and how many shots a minute each side is generating
 *    from the space actually in force (`MinuteState`). Turned into a goal rate and run through a
 *    Poisson model of the minutes remaining, that gives the probability the home side wins. Nothing
 *    here looks at the final score to decide what the game looked like at minute 20.
 * 2. **A swing is what an event changed, measured against what was expected of it.** See
 *    `swingOfShot` — a tap-in is a small moment because it was always going in; a twenty-yarder is a
 *    large one. That distinction falls out of the arithmetic instead of being asserted, and it is
 *    the difference between a debrief that knows what was surprising and one that lists goals.
 *
 * What is deliberately **not** here: substitutions and tactical changes. Both plainly move matches,
 * but the honest question — *would this match have gone differently without it?* — is a
 * counterfactual, and answering it by pointing at the win probability either side of the change
 * would credit the substitution with everything else that happened in the same minute. The
 * counterfactual runner can answer it properly by replaying the match without the decision, so the
 * tags `SUBSTITUTION_SWUNG_MOMENTUM`, `MISSED_SUBSTITUTION_WINDOW`, `MENTALITY_SHIFT_PAID_OFF` and
 * `MENTALITY_SHIFT_BACKFIRED` stay unemitted until it exists. A missing moment costs a short
 * debrief; a confidently wrong one costs the claim this product is built on.
 */

/**
 * Goals per shot across the league, measured — not the same thing as xG per shot.
 *
 * 0.1096, from 108,752 shots over 4,560 matches of the real fourth division. The corresponding mean
 * xG per shot is 0.1192; the gap between them is what keepers save, and using the xG figure here
 * would quietly inflate every rate by 9%.
 *
 * It is a league constant rather than a per-side running average on purpose. A side that has taken
 * three shots tells you nothing reliable about its shot quality, and dressing that noise up as
 * knowledge would make the timeline jitter for reasons no one could point at. Finishing skill still
 * reaches the timeline — through the goals it actually produces, which move the score.
 */
export const MEAN_GOALS_PER_SHOT = 0.1096;

/** Goals per side per remainder considered. Ten is far past where the probabilities matter. */
const MAX_GOALS = 10;

/** How much the home side's win probability must move for a moment to be worth naming. */
export const MIN_SWING = 0.02;

/** `dakka-engine-rules` §6: 5–8 in a normal match. The ceiling is enforced; the floor is not. */
export const MAX_SWINGS = 8;

/** A goal from a chance this unlikely was the shooter's doing, not the chance's. */
const CLINICAL_XG = 0.1;

const clamp = (value: number, low: number, high: number): number =>
  value < low ? low : value > high ? high : value;

/** Poisson probabilities for 0..MAX_GOALS, built once per question rather than per term. */
function poissonTable(lambda: number): number[] {
  const table: number[] = [];
  if (lambda <= 0) {
    table.push(1);
    for (let k = 1; k <= MAX_GOALS; k++) table.push(0);
    return table;
  }
  let p = Math.exp(-lambda);
  table.push(p);
  for (let k = 1; k <= MAX_GOALS; k++) {
    p = (p * lambda) / k;
    table.push(p);
  }
  return table;
}

/**
 * The probability the home side wins, from here.
 *
 * Remaining goals are Poisson in each side's current rate — the standard model, and the right one
 * for a process that is exactly "independent chances arriving at a rate". A draw is not a home win,
 * so this is `P(home win)` and not a points expectation; at full time the rates vanish and it
 * collapses to 1 or 0, which is what makes the last entry of the timeline a fact rather than a
 * forecast.
 */
export function homeWinProbability(
  homeGoals: number,
  awayGoals: number,
  homeShotsPerMinute: number,
  awayShotsPerMinute: number,
  minutesLeft: number,
): number {
  const left = Math.max(0, minutesLeft);
  const home = poissonTable(Math.max(0, homeShotsPerMinute) * MEAN_GOALS_PER_SHOT * left);
  const away = poissonTable(Math.max(0, awayShotsPerMinute) * MEAN_GOALS_PER_SHOT * left);

  // Cumulative away goals, so the inner sum is a lookup instead of a second loop.
  const awayAtMost: number[] = [];
  let running = 0;
  for (let j = 0; j <= MAX_GOALS; j++) {
    running += away[j] ?? 0;
    awayAtMost.push(running);
  }

  let win = 0;
  for (let i = 0; i <= MAX_GOALS; i++) {
    // Home wins when the away side finishes on fewer than `homeGoals + i - awayGoals`.
    const ceiling = homeGoals + i - awayGoals - 1;
    if (ceiling < 0) continue;
    win += (home[i] ?? 0) * (awayAtMost[Math.min(ceiling, MAX_GOALS)] ?? 1);
  }
  return clamp(win, 0, 1);
}

/** A shot, plus who was in goal — the chain knows, and a save has two actors. */
export interface ResolvedShot {
  readonly shot: Shot;
  readonly keeper?: PlayerId;
}

export interface TraceInput {
  readonly minuteStates: readonly MinuteState[];
  /** In the order they were struck. */
  readonly shots: readonly ResolvedShot[];
  readonly events: readonly ChainEvent[];
  readonly minutes: number;
}

const stateAt = (states: readonly MinuteState[], minute: number): MinuteState | undefined =>
  states[clamp(minute, 0, states.length - 1)];

/**
 * The strongest cause on this list that cut the way the moment went.
 *
 * `map.causes` is ordered by magnitude and mixes both polarities — `MIDFIELD_OVERLOAD` sits on the
 * same list as `MIDFIELD_OUTNUMBERED`, because both are true of the same pitch. Taking the first
 * entry regardless is how a goal ends up explained by the reason its scorer was being smothered.
 */
function strongestFavouring(
  causes: readonly CauseTag[],
  side: 'attack' | 'defence',
): CauseTag | undefined {
  return causes.find((tag) => CAUSE_REGISTRY[tag].favours === side);
}

/**
 * Why this shot mattered, from the engine's own reading of the pitch when it was taken.
 *
 * Causes are only ever *selected* here, never invented: everything outside the finishing and set
 * piece families comes from `map.causes`, which `space.ts` computed from the numbers that produced
 * the chance. Two rules keep the selection honest:
 *
 * - **A goal cites a reason the attack was helped; a block cites a reason it was stopped.** Anything
 *   else is a fluent lie, and a fluent lie is worse than silence here.
 * - **A direction-blind cause is never cited.** `FORMATION_MISMATCH` is the live example: it fires
 *   on the largest zone mismatch in either direction, so it genuinely does not know whose goal it
 *   opened. It is real, it is just not evidence, so the moment falls through to the individual.
 *   Making it directional would let it back in — a worthwhile change, in `space.ts`, not here.
 */
function shotCause(shot: Shot, state: MinuteState | undefined): CauseTag {
  const mapCauses = state === undefined ? [] : state.causes[shot.side];
  if (shot.outcome === 'goal') {
    if (shot.situation === 'penalty' || shot.situation === 'set_piece') {
      return 'SET_PIECE_ADVANTAGE';
    }
    if (shot.situation === 'counter') return 'COUNTER_ATTACK_EXPOSURE';
    if (shot.xg < CLINICAL_XG) return 'CLINICAL_FINISHING';
    return strongestFavouring(mapCauses, 'attack') ?? 'INDIVIDUAL_BRILLIANCE';
  }
  if (shot.outcome === 'saved') return 'KEEPER_HEROICS';
  // A block is the defence's doing, so the shape that produced it gets named where there is one.
  if (shot.outcome === 'blocked') {
    return strongestFavouring(mapCauses, 'defence') ?? 'WASTEFUL_FINISHING';
  }
  return 'WASTEFUL_FINISHING';
}

/**
 * What a shot was worth, against what was expected of it.
 *
 * Before the ball is struck the win probability is already `xg` of the way to what a goal would make
 * it. Resolving the chance moves it the rest of the way, or all the way back — so the swing is
 * `(1 - xg)` of the gap for a goal and `-xg` of it for a miss, signed by whose goal it was. This is
 * why a penalty converted barely registers and a save from six yards is one of the biggest moments
 * in a match, without either being special-cased.
 */
function swingOfShot(
  entry: ResolvedShot,
  homeGoalsBefore: number,
  awayGoalsBefore: number,
  state: MinuteState | undefined,
  minutes: number,
): SwingMoment {
  const { shot } = entry;
  const left = minutes - shot.minute;
  const homeRate = state?.shotsPerMinute.home ?? 0;
  const awayRate = state?.shotsPerMinute.away ?? 0;

  const scored = homeWinProbability(
    homeGoalsBefore + (shot.side === 'home' ? 1 : 0),
    awayGoalsBefore + (shot.side === 'away' ? 1 : 0),
    homeRate,
    awayRate,
    left,
  );
  const missed = homeWinProbability(homeGoalsBefore, awayGoalsBefore, homeRate, awayRate, left);

  const gap = scored - missed;
  const delta = shot.outcome === 'goal' ? (1 - shot.xg) * gap : -shot.xg * gap;

  const actors: PlayerId[] = [shot.shooter];
  if (shot.outcome === 'saved' && entry.keeper !== undefined) actors.push(entry.keeper);

  return {
    minute: shot.minute,
    cause: shotCause(shot, state),
    deltaWinProbability: delta,
    actors,
    favoured: delta >= 0 ? 'home' : 'away',
  };
}

/**
 * What a red card was worth.
 *
 * Measured at a fixed clock and a fixed score, so the only thing that moves is the pitch: ten men
 * cover less of it, `resolveBoth` says so, and the difference between the two win probabilities is
 * the card. Holding the score fixed is what keeps a goal in the same minute from being credited to
 * the dismissal.
 *
 * The window is a minute either side because a sending-off marks both sides dirty and the space maps
 * are rebuilt on the next possession rather than instantly. Fatigue drifts a little in that window
 * too; over two minutes it is far below `MIN_SWING`.
 */
function swingOfRedCard(
  event: Extract<ChainEvent, { kind: 'card' }>,
  states: readonly MinuteState[],
  minutes: number,
): SwingMoment {
  const before = stateAt(states, event.minute - 1);
  const after = stateAt(states, event.minute + 1);
  const left = minutes - event.minute;
  const score = after?.score ?? before?.score ?? { home: 0, away: 0 };

  const wasBefore = homeWinProbability(
    score.home,
    score.away,
    before?.shotsPerMinute.home ?? 0,
    before?.shotsPerMinute.away ?? 0,
    left,
  );
  const isAfter = homeWinProbability(
    score.home,
    score.away,
    after?.shotsPerMinute.home ?? 0,
    after?.shotsPerMinute.away ?? 0,
    left,
  );
  const delta = isAfter - wasBefore;
  return {
    minute: event.minute,
    cause: 'RED_CARD',
    deltaWinProbability: delta,
    actors: [event.player],
    favoured: delta >= 0 ? 'home' : 'away',
  };
}

/**
 * The trace for one match.
 *
 * The timeline is every minute; the swings are the handful of moments that moved it, strongest
 * first and then put back in match order. There is no floor-filling: if a match produced three
 * moments worth naming, the trace carries three, and `dakka-engine-rules` §6 is explicit that the
 * debrief is then short rather than padded.
 */
export function buildTrace(input: TraceInput): MatchTrace {
  const { minuteStates, minutes } = input;

  const winProbabilityTimeline: number[] = [];
  for (let minute = 0; minute <= minutes; minute++) {
    const state = stateAt(minuteStates, minute);
    if (state === undefined) {
      winProbabilityTimeline.push(0.5);
      continue;
    }
    winProbabilityTimeline.push(
      homeWinProbability(
        state.score.home,
        state.score.away,
        state.shotsPerMinute.home,
        state.shotsPerMinute.away,
        minutes - minute,
      ),
    );
  }

  const candidates: SwingMoment[] = [];

  let homeGoals = 0;
  let awayGoals = 0;
  for (const entry of input.shots) {
    candidates.push(
      swingOfShot(entry, homeGoals, awayGoals, stateAt(minuteStates, entry.shot.minute), minutes),
    );
    if (entry.shot.outcome === 'goal') {
      if (entry.shot.side === 'home') homeGoals += 1;
      else awayGoals += 1;
    }
  }

  for (const event of input.events) {
    if (event.kind === 'card' && event.colour === 'red') {
      candidates.push(swingOfRedCard(event, minuteStates, minutes));
    }
  }

  const swings = candidates
    .filter((moment) => Math.abs(moment.deltaWinProbability) >= MIN_SWING)
    .sort((a, b) => Math.abs(b.deltaWinProbability) - Math.abs(a.deltaWinProbability))
    .slice(0, MAX_SWINGS)
    .sort((a, b) => a.minute - b.minute);

  return { swings, winProbabilityTimeline };
}
