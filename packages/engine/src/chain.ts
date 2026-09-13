import type { Rng } from './rng.js';
import type { PlayerId } from './types/ids.js';
import type { Player, PlayerCondition } from './types/player.js';
import type { InMatchDecision, Selection, Tactics } from './types/tactics.js';
import {
  decayMomentum,
  drainPerTick,
  foulChance,
  travelBurden,
  MOMENTUM_PER_CHANCE,
  MOMENTUM_PER_FINAL_THIRD,
  PENALTY_PER_BOX_FOUL,
  STRAIGHT_RED_PER_FOUL,
  YELLOW_PER_FOUL,
  type Intensity,
} from './condition.js';
import type { BodyPart, Shot, ShotSituation } from './types/match.js';
import type { CauseTag } from './types/trace.js';
import type { PassingDirectness, Tempo } from './types/tactics.js';
import {
  FOOTPRINTS,
  ZONES,
  bandOf,
  channelOf,
  mirror,
  type Band,
  type Channel,
  type Zone,
} from './zones.js';
import { bandCompetence, resolveSpace, type SideSetup, type SpaceMap } from './space.js';

/**
 * The possession chain — how space becomes events.
 *
 * A match is a sequence of possessions, and each possession walks
 * `BUILD_UP → PROGRESSION → FINAL_THIRD → SHOT`, failing out to a turnover at any step. Every
 * transition probability comes from the space map for the zone the ball is actually in, so a shot
 * exists because a side got through three specific zones against a specific opponent — not because
 * a shot count was drawn from a distribution and decorated afterwards.
 *
 * What this module deliberately does **not** do:
 *
 * - **It does not resolve shots.** A chain emits a `ShotContext` — where the shot was taken from,
 *   how closely it was pressed, off which body part, out of which situation — and stops. Whether it
 *   goes in is 3e's job, from that context. Turning the outcome and the xG over to a later stage is
 *   what makes "xG is never reverse-engineered from the result" structurally true rather than a
 *   promise: this file has no way to know the result.
 * - **It does not count passes.** The chain models a phase of play, not individual passes, so there
 *   is no honest moment at which to increment a pass counter. `SideStats.passesAttempted` therefore
 *   stays unset until something actually simulates passes, and must not be displayed before then.
 *   Under-reporting is recoverable; a plausible invented number is the competitor's entire design.
 */

export type ChainPhase = 'BUILD_UP' | 'PROGRESSION' | 'FINAL_THIRD' | 'SHOT';

/** The phases played out on the pitch. `SHOT` is where a chain ends, never where it works. */
export type FieldPhase = Exclude<ChainPhase, 'SHOT'>;

/**
 * Where a possession can begin.
 *
 * Never `FINAL_THIRD` or `SHOT`: winning the ball high starts you past the build-up, but it does
 * not hand you a shot. Stating that in the type is what keeps the counter mechanic from quietly
 * becoming free chances.
 */
export type EntryPhase = 'BUILD_UP' | 'PROGRESSION';
export type ChainEnd = 'shot' | 'turnover' | 'full_time';
export type Side = 'home' | 'away';

/** A shot as the chain knows it: everything except whether it went in, and what it was worth. */
export type ShotContext = Omit<Shot, 'xg' | 'outcome'>;

export interface Possession {
  readonly side: Side;
  readonly startMinute: number;
  readonly ticks: number;
  /** The furthest phase this possession reached. */
  readonly reached: ChainPhase;
  readonly ended: ChainEnd;
  /** The zones the ball actually travelled through, in order. */
  readonly route: readonly Zone[];
  readonly shot?: ShotContext;
  /** Why it broke down, when the breakdown had a cause worth naming. */
  readonly turnoverCause?: CauseTag;
}

/**
 * Counters, every one incremented at the moment the thing happened.
 *
 * Nothing here is derived from anything else, and nothing is back-filled. See
 * `dakka-engine-rules` §3.
 */
export interface ChainStats {
  readonly possessions: number;
  readonly possessionTicks: number;
  readonly shots: number;
  readonly corners: number;
  readonly turnovers: number;
  readonly fouls: number;
  readonly yellowCards: number;
  readonly redCards: number;
  readonly penaltiesAwarded: number;
  /** How many possessions got at least as far as each phase. */
  readonly reached: Record<ChainPhase, number>;
}

export interface ChainResult {
  readonly possessions: readonly Possession[];
  readonly shots: readonly ShotContext[];
  readonly events: readonly ChainEvent[];
  readonly home: ChainStats;
  readonly away: ChainStats;
  readonly ticks: number;
  /**
   * Every player's condition at full time, counted down tick by tick rather than assigned. This is
   * what feeds the next match, and what `tacticalPresence` was already reading.
   *
   * Kept per side rather than merged into one map: two squads can legitimately field the same player
   * id in a test fixture or a friendly against a reserve side, and a merged map silently lets one
   * side's fatigue overwrite the other's. That bug hid the entire intensity model for one probe run.
   */
  readonly conditionAfter: {
    readonly home: ReadonlyMap<PlayerId, PlayerCondition>;
    readonly away: ReadonlyMap<PlayerId, PlayerCondition>;
  };
}

/** A side, plus whatever the manager does to it while the match is running. */
export interface ChainSide extends SideSetup {
  /** Ordered by minute. Anything the manager changes mid-match. */
  readonly decisions?: readonly InMatchDecision[];
}

export interface ChainInput {
  readonly home: ChainSide;
  readonly away: ChainSide;
  /** Regulation minutes. 90 for a league match. */
  readonly minutes: number;
  /** Kilometres the away side travelled. A real lower-league fatigue input. */
  readonly awayTravelKm?: number;
}

/** Something that happened, recorded when it happened. */
export type ChainEvent =
  | {
      readonly kind: 'foul';
      readonly minute: number;
      readonly side: Side;
      readonly player: PlayerId;
    }
  | {
      readonly kind: 'card';
      readonly minute: number;
      readonly side: Side;
      readonly player: PlayerId;
      readonly colour: 'yellow' | 'red';
      /** True when the red came from a second booking rather than a straight dismissal. */
      readonly second: boolean;
    }
  | {
      readonly kind: 'substitution';
      readonly minute: number;
      readonly side: Side;
      readonly off: PlayerId;
      readonly on: PlayerId;
    }
  | {
      readonly kind: 'tactical_change';
      readonly minute: number;
      readonly side: Side;
      readonly what: InMatchDecision['kind'];
    }
  | { readonly kind: 'penalty_awarded'; readonly minute: number; readonly side: Side };

/** One tick is ten seconds. Fine enough for possession share, coarse enough to stay cheap. */
export const TICKS_PER_MINUTE = 6;

const PHASE_BAND: Record<FieldPhase, Band> = {
  BUILD_UP: 'defensive',
  PROGRESSION: 'middle',
  FINAL_THIRD: 'attacking',
};

const NEXT_PHASE: Record<FieldPhase, ChainPhase> = {
  BUILD_UP: 'PROGRESSION',
  PROGRESSION: 'FINAL_THIRD',
  FINAL_THIRD: 'SHOT',
};

/**
 * The chance of getting through each phase when the zone offers exactly as much room as it does in
 * an even match. Space moves these; it does not create them.
 *
 * Chosen so that `0.80 × 0.55 × 0.33 ≈ 0.145` of possessions produce a shot, which against roughly
 * 80 possessions a side is about twelve shots — the right neighbourhood for a real league match.
 * Step 4's harness is the authority on whether that holds across 10,000 seasons; these are the
 * starting point it will judge, not a result.
 */
const PHASE_BASE: Record<FieldPhase, number> = {
  BUILD_UP: 0.8,
  PROGRESSION: 0.55,
  FINAL_THIRD: 0.33,
};

/**
 * The room a zone offers when neither side has an edge, measured from two identical elevens.
 * Subtracting it is what makes `PHASE_BASE` mean "an even match" rather than "an empty pitch".
 */
const PHASE_REFERENCE: Record<FieldPhase, number> = {
  BUILD_UP: 0.75,
  PROGRESSION: 0.0,
  FINAL_THIRD: -0.4,
};

/** How much one weighted body of overload is worth, per phase. */
const PHASE_SLOPE: Record<FieldPhase, number> = {
  BUILD_UP: 0.09,
  PROGRESSION: 0.11,
  FINAL_THIRD: 0.1,
};

const PHASE_FLOOR: Record<FieldPhase, number> = {
  BUILD_UP: 0.35,
  PROGRESSION: 0.15,
  FINAL_THIRD: 0.05,
};

const PHASE_CEILING: Record<FieldPhase, number> = {
  BUILD_UP: 0.97,
  PROGRESSION: 0.88,
  FINAL_THIRD: 0.7,
};

/** Ticks a phase consumes before tempo is applied. */
const PHASE_TICKS: Record<FieldPhase, number> = {
  BUILD_UP: 2,
  PROGRESSION: 1.5,
  FINAL_THIRD: 1.5,
};

/**
 * Tempo buys the ball or spends it.
 *
 * A slow side holds each possession longer and therefore finishes with more of the ball; a fast one
 * has shorter possessions and more of them. Possession share is an **outcome** of that trade, never
 * a number chosen for the scoreline.
 */
const TEMPO_TICKS: Record<Tempo, number> = { slow: 1.25, balanced: 1, fast: 0.82 };

/** A short passing side works the ball patiently; a long one sends it and lives with the result. */
const DIRECTNESS_TICKS: Record<PassingDirectness, number> = {
  short: 1.12,
  mixed: 1,
  direct: 0.9,
  long: 0.82,
};

/**
 * How readily a side turns a high turnover into a counter rather than resetting.
 *
 * Winning the ball near the opponent's goal is an opportunity, not an automatic break: a patient
 * side takes the ball back and builds, a direct one goes. This is why `passingDirectness` earns
 * its place twice — it already decides how a side attacks a high line in `space.ts`, and here it
 * decides whether they can punish one.
 */
const COUNTER_LAUNCH: Record<PassingDirectness, number> = {
  short: 0.18,
  mixed: 0.3,
  direct: 0.45,
  long: 0.5,
};

const COUNTER_TEMPO: Record<Tempo, number> = { slow: 0.7, balanced: 1, fast: 1.25 };

const clamp = (value: number, low: number, high: number): number =>
  value < low ? low : value > high ? high : value;

const other = (side: Side): Side => (side === 'home' ? 'away' : 'home');

function emptyStats(): ChainStats {
  return {
    possessions: 0,
    possessionTicks: 0,
    shots: 0,
    corners: 0,
    turnovers: 0,
    fouls: 0,
    yellowCards: 0,
    redCards: 0,
    penaltiesAwarded: 0,
    reached: { BUILD_UP: 0, PROGRESSION: 0, FINAL_THIRD: 0, SHOT: 0 },
  };
}

/** Picks one of the three channels of a band, favouring the one with more room. */
function pickZone(map: SpaceMap, band: Band, rng: Rng): Zone {
  const candidates = ZONES.filter((zone) => bandOf(zone) === band);
  let lowest = Infinity;
  for (const zone of candidates) lowest = Math.min(lowest, map.zones[zone].space);
  // Shifted so every channel keeps some chance: a side does not always attack down its best side,
  // and a route that is never taken can never be punished.
  const weights = candidates.map((zone) => map.zones[zone].space - lowest + 0.4);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = rng.next() * total;
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i] ?? 0;
    if (roll <= 0) return candidates[i] as Zone;
  }
  return candidates[candidates.length - 1] as Zone;
}

/** Who takes the shot: someone actually standing in the zone it came from. */
function pickShooter(side: SideSetup, zone: Zone, rng: Rng): PlayerId | undefined {
  const present: { id: PlayerId; weight: number }[] = [];
  for (const selection of side.tactics.startingXI) {
    if (selection.position === 'GK') continue;
    const footprint = FOOTPRINTS[selection.position];
    const occupies = footprint.occupies.includes(zone);
    const contests = footprint.contests.includes(zone);
    if (!occupies && !contests) continue;
    const player = side.players.get(selection.playerId);
    if (player === undefined) continue;
    present.push({
      id: selection.playerId,
      weight: (occupies ? 1 : 0.45) * bandCompetence(player, 'attacking'),
    });
  }
  if (present.length === 0) return undefined;
  const total = present.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng.next() * total;
  for (const entry of present) {
    roll -= entry.weight;
    if (roll <= 0) return entry.id;
  }
  return present[present.length - 1]?.id;
}

/**
 * How far a chance got into the block, and what that leaves the shooter looking at.
 *
 * The first version of this treated "reached the final third" as one event and produced every shot
 * from a seven-metre band around eighteen metres. The mean was right and the distribution was not,
 * and because xG is sharply convex in distance, a spread that narrow cannot produce goals: the
 * six-yard chances that score most of football's goals simply did not exist. 3e found it by
 * measurement — 0.5% of shots inside 11 m against a real 30%, and 1.15 goals a match.
 *
 * The fix is to model the quantity that actually varies. Most attacks that reach the final third
 * produce a half-chance from range; a few are worked right through. `penetration` is that spectrum,
 * and everything else here is geometry:
 *
 * - `penetration = U^k` — a right-skewed draw, because breaking a block down is hard. `k` falls
 *   when the attacking side has room in the zone, and falls further on a counter, so a side that
 *   has genuinely opened the defence gets closer chances rather than more of the same ones.
 * - **Depth** comes from penetration; **lateral offset** comes from the channel the chain was in.
 * - **Distance and angle are then derived**, not chosen. The angle is the goalmouth actually
 *   subtended from that point, which is why a shot from eight metres by the byline correctly rates
 *   below one from fourteen metres in front.
 *
 * `PENETRATION_SKEW` and `PENETRATION_DEPTH` were fitted to the published distribution of shot
 * distances in top-flight football — 8% inside six metres, 62% inside the box, 3% beyond thirty —
 * and `test/chain.test.ts` asserts those bands directly.
 */
const PENETRATION_SKEW = 0.45;
const PENETRATION_DEPTH = 0.8;
/** Perpendicular distance from the goal line: a tap-in at one end, a speculative effort at the other. */
const DEPTH_NEAR = 3;
const DEPTH_FAR = 32;
/** Room in the zone makes the block easier to get into. */
const PENETRATION_PER_SPACE = 0.09;
/** And a defence still running back is easier still. */
const COUNTER_PENETRATION = 0.12;
/** Half the width of a goal, in metres. The only reason any of this geometry works. */
const GOAL_HALF_WIDTH = 3.66;
/** How far off centre a shot strays, by the channel the attack came down. Both peak at the middle. */
const SPREAD_CENTRAL = 10;
const SPREAD_WIDE = 15;

/** The goalmouth actually visible from a point on the pitch, in degrees. */
export function goalAngle(lateralM: number, depthM: number): number {
  const lateral = Math.abs(lateralM);
  const depth = Math.max(depthM, 0.5);
  const near = Math.atan((lateral + GOAL_HALF_WIDTH) / depth);
  const far = Math.atan((lateral - GOAL_HALF_WIDTH) / depth);
  return ((near - far) * 180) / Math.PI;
}

interface ShotGeometry {
  readonly distanceM: number;
  readonly angleDeg: number;
  /** 0 = a hopeful effort from range, 1 = worked right through to the six-yard box. */
  readonly penetration: number;
}

function shotGeometry(zone: Zone, room: number, situation: ShotSituation, rng: Rng): ShotGeometry {
  const central = channelOf(zone) === 'centre';

  if (situation === 'set_piece') {
    // A corner is its own geometry: the ball arrives in the air into a crowded six-yard area, so
    // the spread is tight and close rather than drawn from open-play penetration.
    const depth = 4 + rng.next() * 10;
    const lateral = (rng.next() - 0.5) * 12;
    return {
      distanceM: Math.hypot(lateral, depth),
      angleDeg: goalAngle(lateral, depth),
      penetration: 0.7,
    };
  }

  const skew = clamp(
    PENETRATION_SKEW -
      PENETRATION_PER_SPACE * clamp(room, -3, 4) -
      (situation === 'counter' ? COUNTER_PENETRATION : 0),
    0.25,
    1.6,
  );
  const penetration = Math.pow(rng.next(), skew);
  const depth =
    DEPTH_NEAR + (DEPTH_FAR - DEPTH_NEAR) * Math.pow(1 - penetration, PENETRATION_DEPTH);

  // Peaked at the middle whichever channel the attack came down, because players attack the goal
  // rather than the corner flag: a chance worked down the left is still usually finished in front.
  // The channel widens the spread, it does not move the mode — reading it the other way round put
  // only 15% of shots in central positions and was most of why this engine could not score.
  const spread = rng.next();
  const lateral = (central ? SPREAD_CENTRAL : SPREAD_WIDE) * spread * spread;

  return {
    distanceM: Math.hypot(lateral, depth),
    angleDeg: goalAngle(lateral, depth),
    penetration,
  };
}

/**
 * Which part of the body.
 *
 * Headers come from the wide channels, where the ball arrives in the air, and depend on the
 * shooter's heading. Footedness is **not modelled** — there is no `preferredFoot` attribute yet —
 * so which foot is drawn rather than derived, and is documented as such. It is a weak input to xG
 * and will be replaced the moment the data layer carries a preferred foot.
 */
function pickBodyPart(
  shooter: Player | undefined,
  zone: Zone,
  situation: ShotSituation,
  rng: Rng,
): BodyPart {
  const heading = (shooter?.attributes.technical.heading ?? 50) / 100;
  const aerial = situation === 'set_piece' ? 0.55 : channelOf(zone) === 'centre' ? 0.08 : 0.22;
  if (rng.bool(aerial * (0.6 + heading))) return 'head';
  return rng.bool() ? 'right_foot' : 'left_foot';
}

/** Why a possession broke down, when the reason is one the trace is allowed to name. */
function turnoverCause(phase: FieldPhase, map: SpaceMap, defend: SideSetup): CauseTag | undefined {
  if (phase === 'BUILD_UP' && map.compression > 0.4) return 'PRESS_FORCED_TURNOVER';
  if (phase === 'PROGRESSION' && map.zones.middle_centre.space < -0.5)
    return 'MIDFIELD_OUTNUMBERED';
  if (phase === 'FINAL_THIRD' && defend.tactics.lineHeight === 'deep') {
    return 'DEEP_BLOCK_ABSORBED_PRESSURE';
  }
  return undefined;
}

/** How often the space maps are rebuilt when nothing discrete has happened. */
const RECOMPUTE_EVERY_TICKS = 30;

/** One side's mutable state for the duration of a match. */
interface LiveSide {
  readonly base: ReadonlyMap<PlayerId, Player>;
  readonly decisions: readonly InMatchDecision[];
  tactics: Tactics;
  /** Live fitness by player id, drained tick by tick. */
  readonly fitness: Map<PlayerId, number>;
  readonly yellows: Map<PlayerId, number>;
  readonly sentOff: Set<PlayerId>;
  readonly used: Set<PlayerId>;
  momentum: number;
  travel: number;
  applied: number;
  dirty: boolean;
}

function liveSide(side: ChainSide, travel: number): LiveSide {
  const fitness = new Map<PlayerId, number>();
  for (const [id, player] of side.players) fitness.set(id, player.condition.fitness);
  return {
    base: side.players,
    decisions: [...(side.decisions ?? [])].sort((x, y) => x.minute - y.minute),
    tactics: side.tactics,
    fitness,
    yellows: new Map(),
    sentOff: new Set(),
    used: new Set(),
    momentum: 0,
    travel,
    applied: 0,
    dirty: true,
  };
}

/** The side as the resolver should see it right now: live fitness, current shape, eleven or fewer. */
function snapshot(live: LiveSide): SideSetup {
  const players = new Map<PlayerId, Player>();
  for (const [id, player] of live.base) {
    const current = live.fitness.get(id);
    players.set(
      id,
      current === undefined || current === player.condition.fitness
        ? player
        : { ...player, condition: { ...player.condition, fitness: current } },
    );
  }
  const startingXI = live.tactics.startingXI.filter((s) => !live.sentOff.has(s.playerId));
  return {
    tactics:
      startingXI.length === live.tactics.startingXI.length
        ? live.tactics
        : { ...live.tactics, startingXI },
    players,
    momentum: live.momentum,
  };
}

const intensityOf = (tactics: Tactics): Intensity => ({
  pressing: tactics.pressingIntensity,
  tempo: tactics.tempo,
  mentality: tactics.mentality,
});

function applyShapeChange(tactics: Tactics, decision: InMatchDecision): Tactics {
  switch (decision.kind) {
    case 'mentality':
      return { ...tactics, mentality: decision.to };
    case 'line_height':
      return { ...tactics, lineHeight: decision.to };
    case 'pressing':
      return { ...tactics, pressingIntensity: decision.to };
    case 'tempo':
      return { ...tactics, tempo: decision.to };
    case 'width':
      return { ...tactics, width: decision.to };
    case 'compactness':
      return { ...tactics, compactness: decision.to };
    case 'role_change':
      return {
        ...tactics,
        startingXI: tactics.startingXI.map((s): Selection =>
          s.playerId === decision.playerId ? { ...s, role: decision.to } : s,
        ),
      };
    /* c8 ignore next 2 */
    default:
      return tactics;
  }
}

/**
 * Apply everything the manager asked for up to this minute.
 *
 * Substitutions and shape changes both mark the side dirty, so the very next possession is resolved
 * against the new shape rather than the old one. That is the whole point of 3f: before it the space
 * map was computed once for the match, which made every in-match decision decoration.
 */
function applyDecisions(live: LiveSide, minute: number, side: Side, events: ChainEvent[]): void {
  while (live.applied < live.decisions.length) {
    const decision = live.decisions[live.applied];
    if (decision === undefined || decision.minute > minute) break;
    live.applied += 1;

    if (decision.kind === 'substitution') {
      // Someone already off, sent off, or not on the bench cannot come on. Silently skipping an
      // impossible substitution beats recording one that did not happen.
      const onField = live.tactics.startingXI.some((s) => s.playerId === decision.off);
      if (!onField || live.used.has(decision.on) || !live.base.has(decision.on)) continue;
      live.used.add(decision.on);
      live.tactics = {
        ...live.tactics,
        startingXI: live.tactics.startingXI.map((s): Selection =>
          s.playerId === decision.off
            ? { playerId: decision.on, position: decision.position, role: decision.role }
            : s,
        ),
      };
      events.push({ kind: 'substitution', minute, side, off: decision.off, on: decision.on });
      live.dirty = true;
      continue;
    }

    live.tactics = applyShapeChange(live.tactics, decision);
    events.push({ kind: 'tactical_change', minute, side, what: decision.kind });
    live.dirty = true;
  }
}

/**
 * Subtract this possession's effort from everyone on the pitch.
 *
 * Fitness moves continuously and slowly, so the space maps are not rebuilt on every point lost —
 * they are rebuilt on the schedule below, which keeps a 10,000-season harness affordable while still
 * letting accumulated fatigue reach the resolver.
 */
function spendFitness(live: LiveSide, ticks: number): void {
  const intensity = intensityOf(live.tactics);
  for (const selection of live.tactics.startingXI) {
    if (live.sentOff.has(selection.playerId)) continue;
    const player = live.base.get(selection.playerId);
    const current = live.fitness.get(selection.playerId);
    if (player === undefined || current === undefined) continue;
    const spent = drainPerTick(player, selection.role, intensity, live.travel) * ticks;
    live.fitness.set(selection.playerId, Math.max(0, current - spent));
  }
}

/** How much less readily a player already on a yellow goes into a challenge. */
const BOOKED_CAUTION = 0.3;

/**
 * Who committed the foul: someone defending the zone the ball was in.
 *
 * A player already on a yellow is far less likely to be the one — he pulls out of the challenge,
 * and his manager is watching. That is ordinary football, and it is also what keeps second bookings
 * as rare as they actually are: without it this engine sent someone off nearly twice as often as
 * the real game does.
 */
function pickFouler(
  defence: SideSetup,
  zone: Zone,
  booked: ReadonlyMap<PlayerId, number>,
  rng: Rng,
): PlayerId | undefined {
  const there = mirror(zone);
  const contesting = defence.tactics.startingXI.filter((s) => {
    const footprint = FOOTPRINTS[s.position];
    return footprint.occupies.includes(there) || footprint.contests.includes(there);
  });
  if (contesting.length === 0) return undefined;
  // Weighted by aggression: the players who give fouls away are the ones sent to win the ball.
  const weights = contesting.map((s) => {
    const player = defence.players.get(s.playerId);
    const appetite = player === undefined ? 1 : 0.4 + player.attributes.mental.aggression / 100;
    return (booked.get(s.playerId) ?? 0) > 0 ? appetite * BOOKED_CAUTION : appetite;
  });
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = rng.next() * total;
  for (let i = 0; i < contesting.length; i++) {
    roll -= weights[i] ?? 0;
    if (roll <= 0) return contesting[i]?.playerId;
  }
  return contesting[contesting.length - 1]?.playerId;
}

/** Mean aggression of the eleven — what decides how often a challenge becomes a foul. */
function averageAggression(side: SideSetup): number {
  let total = 0;
  let count = 0;
  for (const selection of side.tactics.startingXI) {
    const player = side.players.get(selection.playerId);
    if (player === undefined) continue;
    total += player.attributes.mental.aggression;
    count += 1;
  }
  return count === 0 ? 50 : total / count;
}

/**
 * Play the match out, possession by possession.
 *
 * Pure and deterministic: the same seed and the same two setups produce the same possessions in the
 * same order, which is the property counterfactual replay is built on.
 *
 * Since 3f the two space maps are **live**. They are rebuilt whenever something discrete happens — a
 * substitution, a sending-off, a shape change — and otherwise every `RECOMPUTE_EVERY_TICKS`, so
 * accumulated fatigue reaches the resolver without paying for a rebuild on every possession.
 */
export function simulateChain(input: ChainInput, rng: Rng): ChainResult {
  const chainRng = rng.fork('chain');
  const totalTicks = Math.round(input.minutes * TICKS_PER_MINUTE);
  const halfway = Math.round(totalTicks / 2);

  const live: Record<Side, LiveSide> = {
    home: liveSide(input.home, 0),
    away: liveSide(input.away, travelBurden(input.awayTravelKm ?? 0)),
  };

  const stats: Record<Side, ChainStats> = { home: emptyStats(), away: emptyStats() };
  const possessions: Possession[] = [];
  const shots: ShotContext[] = [];
  const events: ChainEvent[] = [];

  const setups: Record<Side, SideSetup> = { home: snapshot(live.home), away: snapshot(live.away) };
  const maps: Record<Side, SpaceMap> = {
    home: resolveSpace(setups.home, setups.away),
    away: resolveSpace(setups.away, setups.home),
  };
  let lastResolved = 0;
  live.home.dirty = false;
  live.away.dirty = false;

  const refresh = (at: number): void => {
    if (at - lastResolved < RECOMPUTE_EVERY_TICKS && !live.home.dirty && !live.away.dirty) return;
    setups.home = snapshot(live.home);
    setups.away = snapshot(live.away);
    maps.home = resolveSpace(setups.home, setups.away);
    maps.away = resolveSpace(setups.away, setups.home);
    live.home.dirty = false;
    live.away.dirty = false;
    lastResolved = at;
  };

  const bump = (side: Side, patch: Partial<Omit<ChainStats, 'reached'>>): void => {
    stats[side] = { ...stats[side], ...patch };
  };

  let tick = 0;
  let side: Side = 'home';
  let entryPhase: EntryPhase = 'BUILD_UP';
  let secondHalfStarted = false;

  while (tick < totalTicks) {
    if (!secondHalfStarted && tick >= halfway) {
      secondHalfStarted = true;
      side = 'away';
      entryPhase = 'BUILD_UP';
    }

    const minute = Math.min(input.minutes, Math.floor(tick / TICKS_PER_MINUTE) + 1);
    applyDecisions(live.home, minute, 'home', events);
    applyDecisions(live.away, minute, 'away', events);
    refresh(tick);

    const attack = setups[side];
    const defend = setups[other(side)];
    const map = maps[side];
    const startTick = tick;
    const route: Zone[] = [];

    let phase: ChainPhase = entryPhase;
    const startedOnCounter = entryPhase !== 'BUILD_UP';
    let reached: ChainPhase = phase;
    let ended: ChainEnd = 'turnover';
    let shot: ShotContext | undefined;
    let cause: CauseTag | undefined;
    let corner = false;
    let penalty = false;

    const tempo =
      TEMPO_TICKS[attack.tactics.tempo] * DIRECTNESS_TICKS[attack.tactics.passingDirectness];

    while (phase !== 'SHOT') {
      const step = phase as FieldPhase;
      const zone = pickZone(map, PHASE_BAND[step], chainRng);
      route.push(zone);
      reached = step;
      stats[side] = {
        ...stats[side],
        reached: { ...stats[side].reached, [step]: stats[side].reached[step] + 1 },
      };

      tick += Math.max(1, Math.round(PHASE_TICKS[step] * tempo + (chainRng.next() - 0.5)));

      const room = map.zones[zone].space;
      const success = clamp(
        PHASE_BASE[step] + PHASE_SLOPE[step] * (room - PHASE_REFERENCE[step]),
        PHASE_FLOOR[step],
        PHASE_CEILING[step],
      );

      if (chainRng.bool(success)) {
        phase = NEXT_PHASE[step];
        continue;
      }

      // The ball was lost. Sometimes it was taken; sometimes it was a foul.
      const defending = other(side);
      if (chainRng.bool(foulChance(averageAggression(defend), defend.tactics.pressingIntensity))) {
        const fouler = pickFouler(defend, zone, live[defending].yellows, chainRng);
        if (fouler !== undefined) {
          const defenceLive = live[defending];
          bump(defending, { fouls: stats[defending].fouls + 1 });
          events.push({ kind: 'foul', minute, side: defending, player: fouler });

          const straightRed = chainRng.bool(STRAIGHT_RED_PER_FOUL);
          if (straightRed || chainRng.bool(YELLOW_PER_FOUL)) {
            const priors = defenceLive.yellows.get(fouler) ?? 0;
            const second = !straightRed && priors >= 1;
            if (straightRed || second) {
              defenceLive.sentOff.add(fouler);
              defenceLive.dirty = true;
              bump(defending, { redCards: stats[defending].redCards + 1 });
              events.push({
                kind: 'card',
                minute,
                side: defending,
                player: fouler,
                colour: 'red',
                second,
              });
            } else {
              defenceLive.yellows.set(fouler, priors + 1);
              bump(defending, { yellowCards: stats[defending].yellowCards + 1 });
              events.push({
                kind: 'card',
                minute,
                side: defending,
                player: fouler,
                colour: 'yellow',
                second: false,
              });
            }
          }

          // A foul in the box is the most expensive thing a defender can do.
          if (
            step === 'FINAL_THIRD' &&
            channelOf(zone) === 'centre' &&
            chainRng.bool(PENALTY_PER_BOX_FOUL)
          ) {
            penalty = true;
            bump(side, { penaltiesAwarded: stats[side].penaltiesAwarded + 1 });
            events.push({ kind: 'penalty_awarded', minute, side });
            phase = 'SHOT';
            continue;
          }
        }
      }

      if (step === 'FINAL_THIRD' && chainRng.bool(0.18)) {
        corner = true;
        bump(side, { corners: stats[side].corners + 1 });
        tick += 1;
        if (chainRng.bool(0.26)) {
          phase = 'SHOT';
          route.push(zone);
          continue;
        }
      }
      cause = turnoverCause(step, map, defend);
      break;
    }

    if (phase === 'SHOT') {
      const zone = route[route.length - 1] as Zone;
      const situation: ShotSituation = penalty
        ? 'penalty'
        : corner
          ? 'set_piece'
          : startedOnCounter
            ? 'counter'
            : 'open_play';
      const shooter = penalty
        ? attack.tactics.setPieceTakers.penalties
        : pickShooter(attack, zone, chainRng);
      if (shooter !== undefined) {
        const room = map.zones[zone].space;
        const geometry = penalty
          ? { distanceM: 11, angleDeg: goalAngle(0, 11), penetration: 1 }
          : shotGeometry(zone, room, situation, chainRng);
        const defence = map.zones[zone].defence;
        const attackHere = map.zones[zone].attack;
        const pressure = penalty
          ? 5
          : clamp(
              45 +
                12 * (defence - attackHere) +
                8 * (geometry.penetration - 0.5) -
                (situation === 'counter' ? 20 : 0),
              5,
              98,
            );
        shot = {
          minute: Math.min(input.minutes, Math.floor(startTick / TICKS_PER_MINUTE) + 1),
          side,
          shooter,
          distanceM: geometry.distanceM,
          angleDeg: geometry.angleDeg,
          pressure,
          bodyPart: penalty
            ? 'right_foot'
            : pickBodyPart(attack.players.get(shooter), zone, situation, chainRng),
          situation,
        };
        shots.push(shot);
        reached = 'SHOT';
        ended = 'shot';
        stats[side] = {
          ...stats[side],
          shots: stats[side].shots + 1,
          reached: { ...stats[side].reached, SHOT: stats[side].reached.SHOT + 1 },
        };
      }
    }

    if (tick >= totalTicks && ended !== 'shot') ended = 'full_time';
    if (ended === 'turnover') bump(side, { turnovers: stats[side].turnovers + 1 });

    const spent = Math.max(1, tick - startTick);
    bump(side, {
      possessions: stats[side].possessions + 1,
      possessionTicks: stats[side].possessionTicks + spent,
    });

    spendFitness(live.home, spent);
    spendFitness(live.away, spent);

    // Momentum is chances and territory, decayed — never goals. The chain does not know the score,
    // and keeping it that way is what makes xG impossible to reverse-engineer from a result.
    const gained =
      (ended === 'shot' ? MOMENTUM_PER_CHANCE : 0) +
      (reached === 'FINAL_THIRD' || reached === 'SHOT' ? MOMENTUM_PER_FINAL_THIRD : 0);
    live[side].momentum = decayMomentum(live[side].momentum + gained);
    live[other(side)].momentum = decayMomentum(live[other(side)].momentum - gained * 0.6);

    possessions.push({
      side,
      startMinute: Math.min(input.minutes, Math.floor(startTick / TICKS_PER_MINUTE) + 1),
      ticks: spent,
      reached,
      ended,
      route,
      ...(shot === undefined ? {} : { shot }),
      ...(cause === undefined ? {} : { turnoverCause: cause }),
    });

    const winner = other(side);
    const wonHigh: boolean = ended === 'turnover' && reached === 'FINAL_THIRD';
    const launch =
      COUNTER_LAUNCH[live[winner].tactics.passingDirectness] *
      COUNTER_TEMPO[live[winner].tactics.tempo];
    side = winner;
    entryPhase = wonHigh && chainRng.bool(clamp(launch, 0, 0.8)) ? 'PROGRESSION' : 'BUILD_UP';
  }

  const finalCondition = (one: LiveSide): ReadonlyMap<PlayerId, PlayerCondition> => {
    const out = new Map<PlayerId, PlayerCondition>();
    for (const [id, player] of one.base) {
      out.set(id, {
        ...player.condition,
        fitness: one.fitness.get(id) ?? player.condition.fitness,
      });
    }
    return out;
  };

  return {
    possessions,
    shots,
    events,
    home: stats.home,
    away: stats.away,
    ticks: tick,
    conditionAfter: { home: finalCondition(live.home), away: finalCondition(live.away) },
  };
}

/** Possession share, computed from counted ticks at the moment it is asked for. */
export function possessionShare(result: ChainResult): { home: number; away: number } {
  const total = result.home.possessionTicks + result.away.possessionTicks;
  if (total === 0) return { home: 0.5, away: 0.5 };
  return { home: result.home.possessionTicks / total, away: result.away.possessionTicks / total };
}

/** The zone a shot's route ended in, for anything that needs to re-read the chain. */
export function shotZones(result: ChainResult): ReadonlyMap<Side, readonly Channel[]> {
  const byside = new Map<Side, Channel[]>([
    ['home', []],
    ['away', []],
  ]);
  for (const possession of result.possessions) {
    if (possession.shot === undefined) continue;
    const zone = possession.route[possession.route.length - 1];
    if (zone === undefined) continue;
    byside.get(possession.side)?.push(channelOf(zone));
  }
  return byside;
}
