import type { Rng } from './rng.js';
import type { Player } from './types/player.js';
import type { Shot, ShotOutcome } from './types/match.js';
import type { ShotContext } from './chain.js';

/**
 * Expected goals, from the shot and nothing else.
 *
 * Read the signature of `expectedGoals` before anything else in this file:
 *
 * ```ts
 * export function expectedGoals(shot: ShotContext): number
 * ```
 *
 * It takes the shot's **context** and nothing more. It cannot see the outcome, because
 * `ShotContext` does not carry one and the chain that produced it never computed one. It cannot see
 * the shooter either, and that second omission is deliberate rather than incidental:
 *
 * **xG measures the chance, not the finisher.** If a striker's finishing raised his xG, then
 * "he scored more than his chances were worth" would be unsayable — the yardstick would move with
 * the man being measured. Finishing enters at `resolveShot`, where it belongs, and the gap between
 * goals and xG is exactly what `CLINICAL_FINISHING` and `WASTEFUL_FINISHING` are for. Those two
 * causes are only meaningful because this function refuses to look.
 *
 * The curve is a logistic on distance and the angle of goal available, fitted to published xG norms
 * at five reference shots and then asserted against them in `test/xg.test.ts`. Public models are
 * fitted the same way, on the same two dominant features.
 */

/** Where the curve came from. Each of these is asserted in the tests, not just quoted here. */
export interface XgAnchor {
  readonly what: string;
  readonly distanceM: number;
  readonly angleDeg: number;
  readonly expected: number;
  /** How far the model may sit from the published norm before the test fails. */
  readonly tolerance: number;
}

/**
 * Public xG norms for open-play, moderately pressed shots.
 *
 * These are the reference points the coefficients below were solved for. They are league-average
 * figures of the kind every public xG model reproduces — a six-yard chance is worth a bit under a
 * half, the penalty spot about a sixth, the edge of the box under a tenth, and thirty yards almost
 * nothing. The tight-angle entry is the one that stops distance alone explaining everything: eight
 * metres out by the byline is a worse chance than eighteen metres out in the middle.
 */
export const XG_ANCHORS: readonly XgAnchor[] = [
  { what: 'six-yard box, central', distanceM: 6, angleDeg: 65, expected: 0.42, tolerance: 0.06 },
  { what: 'penalty spot, open play', distanceM: 11, angleDeg: 40, expected: 0.17, tolerance: 0.05 },
  {
    what: 'edge of the box, central',
    distanceM: 18,
    angleDeg: 25,
    expected: 0.06,
    tolerance: 0.03,
  },
  { what: 'thirty yards', distanceM: 30, angleDeg: 14, expected: 0.015, tolerance: 0.02 },
  { what: 'close in, tight angle', distanceM: 8, angleDeg: 12, expected: 0.08, tolerance: 0.04 },
];

/**
 * Solved from the six-yard, edge-of-box and tight-angle anchors, then checked against the other two.
 * Distance costs log-odds linearly; the angle of goal available pays back logarithmically, which is
 * what keeps a close shot from the byline correctly worse than a longer one from in front.
 */
const INTERCEPT = -4.3211;
const PER_METRE = -0.11319;
const PER_LOG_ANGLE = 1.1205;

/**
 * A penalty is not a shot from a location, it is its own event: no defenders, a stationary ball, a
 * keeper who may not move early. Modelling it through the distance curve would be a category error,
 * so it is the published conversion rate outright.
 */
export const PENALTY_XG = 0.76;

/**
 * Pressure, as a shift in log-odds around the value an even match produces.
 *
 * `ShotContext.pressure` is 0–100 and a chain between two even sides centres near 45, so that is
 * the zero point. Being closed down hard costs roughly half a unit of log-odds.
 */
const PRESSURE_NEUTRAL = 45;
const PER_PRESSURE = -1.2;

/** A header beats a foot for reach and loses to it for everything else. */
const BODY_PART_LOGIT = {
  right_foot: 0,
  left_foot: 0,
  head: -0.55,
  other: -0.4,
} as const;

/**
 * Situation, after pressure has already had its say.
 *
 * A counter is worth less here than its reputation suggests, and on purpose: the chain already
 * hands counters a pressure twenty points lower, which is most of the benefit. Adding the full
 * effect again would be counting the same defensive disarray twice — the commonest way a model
 * quietly doubles an advantage it already applied.
 */
const SITUATION_LOGIT = {
  open_play: 0,
  counter: 0.15,
  set_piece: -0.25,
  penalty: 0,
  rebound: 0.35,
} as const;

const logistic = (x: number): number => 1 / (1 + Math.exp(-x));

const clamp = (value: number, low: number, high: number): number =>
  value < low ? low : value > high ? high : value;

/**
 * What this chance was worth.
 *
 * Pure, deterministic, and blind to both the shooter and the result by construction.
 */
export function expectedGoals(shot: ShotContext): number {
  if (shot.situation === 'penalty') return PENALTY_XG;

  // Guard the log: a shot with no goal visible is not a chance, and 0° would be negative infinity.
  const angle = clamp(shot.angleDeg, 1, 90);
  const distance = clamp(shot.distanceM, 0.5, 60);

  const logit =
    INTERCEPT +
    PER_METRE * distance +
    PER_LOG_ANGLE * Math.log(angle) +
    PER_PRESSURE * ((clamp(shot.pressure, 0, 100) - PRESSURE_NEUTRAL) / 100) +
    BODY_PART_LOGIT[shot.bodyPart] +
    SITUATION_LOGIT[shot.situation];

  // Nothing in open play is a certainty, and nothing is impossible once the ball is struck.
  return clamp(logistic(logit), 0.002, 0.95);
}

/** How much a finisher moves the odds away from what the chance was worth. */
const PER_FINISHING = 0.9;
/** And how much a keeper moves them back. */
const PER_KEEPER = 0.75;

/**
 * The finisher's contribution — and the only place in this file that is allowed to know who shot.
 *
 * Composure carries as much weight as technique because the difference between finishers at this
 * level is mostly what happens in the half second before contact.
 */
function finishingEdge(shooter: Player | undefined): number {
  if (shooter === undefined) return 0;
  const { technical, mental } = shooter.attributes;
  return ((technical.finishing + mental.composure) / 2 - 50) / 50;
}

function keeperEdge(keeper: Player | undefined): number {
  const gk = keeper?.attributes.goalkeeping;
  if (keeper === undefined || gk === undefined) return 0;
  const skill = (gk.reflexes + gk.handling + gk.oneOnOnes) / 3;
  return (skill - 50) / 50;
}

/** Blocks come from bodies in the way, so they track pressure directly. */
const blockChance = (pressure: number): number => clamp(0.12 + 0.32 * (pressure / 100), 0.08, 0.5);
const WOODWORK_CHANCE = 0.025;
/** A better chance is also a better-struck one, so it finds the target more often. */
const onTargetChance = (xg: number): number => clamp(0.3 + 1.2 * xg, 0.2, 0.72);

/**
 * Whether it went in, and what happened if it did not.
 *
 * Takes the xG the context was worth and moves it for the two people involved. The returned `Shot`
 * carries both numbers: `xg` is what the chance was worth to anybody, `outcome` is what this
 * particular striker did with it against this particular keeper. Keeping them separate is what
 * makes "he should have scored" a measurement rather than an opinion.
 */
export function resolveShot(
  context: ShotContext,
  shooter: Player | undefined,
  keeper: Player | undefined,
  rng: Rng,
): Shot {
  const xg = expectedGoals(context);

  // Work in log-odds so a given edge matters more on a fifty-fifty than on a half-chance, which is
  // how finishing actually behaves.
  const base = Math.log(xg / (1 - xg));
  const pGoal = clamp(
    logistic(base + PER_FINISHING * finishingEdge(shooter) - PER_KEEPER * keeperEdge(keeper)),
    0.001,
    0.97,
  );

  let outcome: ShotOutcome;
  if (rng.bool(pGoal)) {
    outcome = 'goal';
  } else if (rng.bool(blockChance(context.pressure))) {
    outcome = 'blocked';
  } else if (rng.bool(WOODWORK_CHANCE)) {
    outcome = 'woodwork';
  } else if (rng.bool(onTargetChance(xg))) {
    outcome = 'saved';
  } else {
    outcome = 'off_target';
  }

  return { ...context, xg, outcome };
}

/** A shot the keeper had to deal with. A goal is on target; a block never reached him. */
export function isOnTarget(outcome: ShotOutcome): boolean {
  return outcome === 'goal' || outcome === 'saved';
}
