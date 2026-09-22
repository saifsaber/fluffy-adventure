import type { Player, PlayerRole } from './types/player.js';
import { traitEffect } from './traits.js';
import type { Mentality, PressingIntensity, Tempo } from './types/tactics.js';

/**
 * What ninety minutes costs, and what it provokes.
 *
 * Everything here is a rate applied per tick or a probability applied to an event that actually
 * happened. Nothing is a post-hoc total: a side does not "end the match on 72 fitness" because a
 * number was assigned, it ends there because 540 ticks of a particular intensity were subtracted one
 * at a time. That is the same rule the statistics live under, applied to the players.
 *
 * Fitness matters because `tacticalPresence` already reads it. A tired side genuinely covers less
 * ground — the one thing no tactical setting can do, since every shape is a conserved transfer. So
 * effort is the resource and shape is the choice, and this module is where the resource is spent.
 */

/** How hard a side is being asked to work, independent of who is playing. */
export interface Intensity {
  readonly pressing: PressingIntensity;
  readonly tempo: Tempo;
  readonly mentality: Mentality;
}

/**
 * Baseline fitness lost per tick.
 *
 * 540 ticks at this rate costs an average player about sixteen points over a match, which leaves a
 * fresh starter in the low eighties at full time — the right neighbourhood, and well above the 65
 * where `fitnessFactor` starts biting hard.
 */
const BASE_DRAIN_PER_TICK = 0.03;

const PRESS_EFFORT: Record<PressingIntensity, number> = {
  contain: 0.82,
  moderate: 1,
  high: 1.2,
  gegenpress: 1.45,
};

const TEMPO_EFFORT: Record<Tempo, number> = { slow: 0.88, balanced: 1, fast: 1.18 };

const MENTALITY_EFFORT: Record<Mentality, number> = {
  ultra_defensive: 0.9,
  defensive: 0.95,
  balanced: 1,
  attacking: 1.06,
  ultra_attacking: 1.12,
};

/**
 * What the job itself costs.
 *
 * `Record<PlayerRole, number>` so a new role without a decided workload is a build error, the same
 * guard `FOOTPRINTS` and `ROLE_DRIFT` use. A box-to-box midfielder covering two thirds of the pitch
 * empties faster than an anchor screening in front of the back four, and that difference is why
 * asking one player to do the other's job has a price.
 */
const ROLE_EFFORT: Record<PlayerRole, number> = {
  sweeper_keeper: 0.4,
  shot_stopper: 0.32,

  ball_playing_defender: 0.85,
  stopper: 0.9,
  covering_defender: 0.85,
  attacking_fullback: 1.3,
  inverted_fullback: 1.1,
  defensive_fullback: 0.95,

  anchor: 0.9,
  deep_lying_playmaker: 0.9,
  box_to_box: 1.35,
  ball_winner: 1.25,
  advanced_playmaker: 1.05,

  shadow_striker: 1.1,
  inside_forward: 1.15,
  touchline_winger: 1.25,
  target_man: 0.95,
  poacher: 0.9,
  false_nine: 1.1,
  complete_forward: 1.15,
};

const clamp = (value: number, low: number, high: number): number =>
  value < low ? low : value > high ? high : value;

/**
 * Fitness a player loses in one tick.
 *
 * Stamina slows it, work rate speeds it up — a player who covers more ground pays for the ground he
 * covers, which is the honest reading rather than treating high work rate as free.
 */
export function drainPerTick(
  player: Player,
  role: PlayerRole,
  intensity: Intensity,
  travelBurden: number,
  crowd = 0,
): number {
  const stamina = clamp(player.attributes.physical.stamina, 1, 99);
  const workRate = clamp(player.attributes.mental.workRate, 1, 99);

  const enduranceFactor = 2 / (1 + stamina / 50);
  const workFactor = 0.85 + (0.3 * workRate) / 100;

  return (
    BASE_DRAIN_PER_TICK *
    ROLE_EFFORT[role] *
    // What he does on top of what he was asked to do. Running in behind all afternoon is work, and
    // the player who does it is the one who fades for it.
    traitEffect(player.traits).effort *
    PRESS_EFFORT[intensity.pressing] *
    TEMPO_EFFORT[intensity.tempo] *
    MENTALITY_EFFORT[intensity.mentality] *
    enduranceFactor *
    workFactor *
    (1 + clamp(travelBurden, 0, 1) * 0.12) *
    // A crowd is adrenaline. This is why home advantage grows through a match rather than being
    // present from the first whistle.
    (1 - clamp(crowd, 0, 1) * CROWD_STAMINA_RELIEF)
  );
}

/** A long coach trip is a real lower-league fatigue input. Normalised against a very long haul. */
export function travelBurden(kilometres: number): number {
  return clamp(kilometres / 800, 0, 1);
}

/**
 * How much the ground is behind the home side, 0 to 1.
 *
 * Driven mostly by how **full** the ground is rather than how big it is: a packed village ground is
 * worth more than a quarter-empty stadium, which is exactly the situation the Egyptian fourth
 * division is played in. Size still counts for something, so a full big ground beats a full small
 * one, but only by a quarter of the total.
 *
 * A derby adds to it. Nothing here reads a club's reputation or its league position — a crowd is a
 * crowd, and treating a big club's support as intrinsically worth more would be the multiplier this
 * engine refuses everywhere else.
 */
export function crowdIntensity(attendance: number, capacity: number, isDerby: boolean): number {
  if (capacity <= 0) return 0;
  const fill = clamp(attendance / capacity, 0, 1);
  const scale = 0.75 + 0.25 * clamp(attendance / 20_000, 0, 1);
  return clamp(fill * scale * (isDerby ? 1.15 : 1), 0, 1);
}

/**
 * What a crowd is worth, and what it deliberately is not.
 *
 * Home advantage is real and large — around a third of a goal a match — and it has to come from
 * somewhere nameable. These are the three channels it comes from here, each an existing mechanism
 * rather than a new bonus:
 *
 * 1. **Effort.** A crowd is adrenaline: the home side drains slower, so it is stronger late. That is
 *    why home advantage grows through a match in the real game, and it falls out of this rather
 *    than being scripted.
 * 2. **Shape.** The home side plays on the front foot, as a conserved band transfer like momentum
 *    and urgency. This one **can be punished** — pushing up against a quick counter-attacking side
 *    is a worse idea at home than at a graveyard.
 * 3. **The referee.** The best-evidenced component of home advantage in the literature: the away
 *    side gives away more fouls and the home side fewer. It is `circumstantial` in the cause
 *    registry for exactly that reason — nobody chose it.
 *
 * The distinction that keeps this honest: a **choice** must be able to hurt you, but a
 * **circumstance** may simply be good or bad luck. `HOME_CROWD_LIFT` is registered circumstantial.
 */
export const CROWD_STAMINA_RELIEF = 0.14;
export const CROWD_REFEREE_BIAS = 0.17;

/**
 * What a full house is worth in fitness points, felt as if the legs were fresher.
 *
 * Home sides are measured covering a few per cent more high-intensity distance than away sides, and
 * this is that, routed through the channel fatigue already uses rather than added as a new bonus on
 * top of ratings. Ten points is about two per cent of a side's presence — the conservative end of
 * the published range, and deliberately so: a crowd should be worth something and not much.
 */
export const CROWD_FITNESS_LIFT = 10;

/** Fouls given against a side, relative to neutral, once the referee has heard the ground. */
export function refereeLeniency(crowd: number, atHome: boolean): number {
  const bias = clamp(crowd, 0, 1) * CROWD_REFEREE_BIAS;
  return atHome ? 1 - bias : 1 + bias;
}

/**
 * How much of the surface an away side has to work out as it goes.
 *
 * Scaled by how poor the pitch is: on a good surface the ball behaves as everyone expects and
 * familiarity is worth little; on a rutted one the side that trains there every week knows where it
 * will sit up and the visitors do not. Fourth-division pitches in this league run 40–62, so this
 * lands between five and eight per cent.
 */
export const PITCH_UNFAMILIARITY_MAX = 0.14;

export function pitchUnfamiliarity(pitchQuality: number): number {
  return clamp((1 - clamp(pitchQuality, 0, 100) / 100) * PITCH_UNFAMILIARITY_MAX, 0, 0.5);
}

/** A derby is fiercer, and both sides give more away in one. */
export const DERBY_AGGRESSION = 1.18;

/** Roughly twenty-two fouls a match across both sides, before aggression and pressing move it. */
const BASE_FOUL_CHANCE = 0.17;

const PRESS_FOULS: Record<PressingIntensity, number> = {
  contain: 0.8,
  moderate: 1,
  high: 1.15,
  gegenpress: 1.35,
};

/**
 * How likely a turnover was actually a foul.
 *
 * Aggression buys turnovers and costs cards — the trade a manager is really making when he picks a
 * ball-winner, and the reason `aggression` has to sit on the same axis as `tackling` rather than
 * being decoration.
 */
export function foulChance(
  aggression: number,
  pressing: PressingIntensity,
  leniency = 1,
  derby = false,
): number {
  const aggressionFactor = 0.7 + (0.6 * clamp(aggression, 1, 99)) / 100;
  return clamp(
    BASE_FOUL_CHANCE *
      aggressionFactor *
      PRESS_FOULS[pressing] *
      leniency *
      (derby ? DERBY_AGGRESSION : 1),
    0,
    0.6,
  );
}

/** About one foul in six is booked. Straight reds are rarer than that by two orders of magnitude. */
export const YELLOW_PER_FOUL = 0.16;
export const STRAIGHT_RED_PER_FOUL = 0.0025;
/** A foul in the box. Rare, and the most expensive thing a defender can do. */
export const PENALTY_PER_BOX_FOUL = 0.16;

/**
 * Momentum: the recent balance of chances, decayed.
 *
 * Deliberately **not** driven by goals. The chain does not know the score — it emits shot contexts
 * and never resolves them — and keeping that true is what makes xG impossible to reverse-engineer
 * from a result. Territory and chances are what a side can feel while the ball is still in play,
 * and they are what this measures. Score-driven urgency belongs in 3g, where the score exists.
 */
export const MOMENTUM_DECAY = 0.96;
export const MOMENTUM_PER_CHANCE = 0.22;
export const MOMENTUM_PER_FINAL_THIRD = 0.05;

/** What momentum *does* lives in `space.ts`, as a conserved transfer like every other shape change. */
export const MOMENTUM_LIMIT = 1.5;

export function decayMomentum(momentum: number): number {
  return clamp(momentum * MOMENTUM_DECAY, -MOMENTUM_LIMIT, MOMENTUM_LIMIT);
}
