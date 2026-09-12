import type { Rng } from './rng.js';
import type { PlayerId } from './types/ids.js';
import type { Player } from './types/player.js';
import type { BodyPart, Shot, ShotSituation } from './types/match.js';
import type { CauseTag } from './types/trace.js';
import type { PassingDirectness, Tempo } from './types/tactics.js';
import {
  FOOTPRINTS,
  ZONES,
  bandOf,
  channelOf,
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
  /** How many possessions got at least as far as each phase. */
  readonly reached: Record<ChainPhase, number>;
}

export interface ChainResult {
  readonly possessions: readonly Possession[];
  readonly shots: readonly ShotContext[];
  readonly home: ChainStats;
  readonly away: ChainStats;
  readonly ticks: number;
}

export interface ChainInput {
  readonly home: SideSetup;
  readonly away: SideSetup;
  /** Regulation minutes. 90 for a league match. */
  readonly minutes: number;
}

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

/** Distance and angle come from where the chain actually got to, and from how much room it found. */
function shotGeometry(zone: Zone, room: number, rng: Rng): { distanceM: number; angleDeg: number } {
  const central = channelOf(zone) === 'centre';
  const space = clamp(room, -2, 3);
  const distanceM = clamp((central ? 13.5 : 18) - space * 1.8 + (rng.next() - 0.5) * 9, 4, 35);
  const angleDeg = clamp((central ? 42 : 20) + space * 4 + (rng.next() - 0.5) * 14, 5, 78);
  return { distanceM, angleDeg };
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

/**
 * Play the match out, possession by possession.
 *
 * Pure and deterministic: the same seed and the same two setups produce the same possessions in the
 * same order, which is the property counterfactual replay is built on.
 */
export function simulateChain(input: ChainInput, rng: Rng): ChainResult {
  const chainRng = rng.fork('chain');
  const totalTicks = Math.round(input.minutes * TICKS_PER_MINUTE);
  const halfway = Math.round(totalTicks / 2);

  const setups: Record<Side, SideSetup> = { home: input.home, away: input.away };
  // Shapes are fixed for the whole match until in-match decisions arrive in 3f, so the two maps are
  // resolved once rather than per possession.
  const maps: Record<Side, SpaceMap> = {
    home: resolveSpace(input.home, input.away),
    away: resolveSpace(input.away, input.home),
  };

  const stats: Record<Side, ChainStats> = { home: emptyStats(), away: emptyStats() };
  const possessions: Possession[] = [];
  const shots: ShotContext[] = [];

  const bump = (side: Side, patch: Partial<Omit<ChainStats, 'reached'>>): void => {
    stats[side] = { ...stats[side], ...patch };
  };

  let tick = 0;
  let side: Side = 'home';
  let entryPhase: EntryPhase = 'BUILD_UP';
  let secondHalfStarted = false;

  while (tick < totalTicks) {
    // The away side kicks off the second half, and the ball is reset rather than carried over.
    if (!secondHalfStarted && tick >= halfway) {
      secondHalfStarted = true;
      side = 'away';
      entryPhase = 'BUILD_UP';
    }

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

      // A final-third attempt that breaks down sometimes goes out for a corner rather than away.
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
      const shooter = pickShooter(attack, zone, chainRng);
      if (shooter !== undefined) {
        const room = map.zones[zone].space;
        const situation: ShotSituation = corner
          ? 'set_piece'
          : startedOnCounter
            ? 'counter'
            : 'open_play';
        const { distanceM, angleDeg } = shotGeometry(zone, room, chainRng);
        const defence = map.zones[zone].defence;
        const attackHere = map.zones[zone].attack;
        const pressure = clamp(
          45 + 12 * (defence - attackHere) - (situation === 'counter' ? 20 : 0),
          5,
          98,
        );
        shot = {
          minute: Math.min(input.minutes, Math.floor(startTick / TICKS_PER_MINUTE) + 1),
          side,
          shooter,
          distanceM,
          angleDeg,
          pressure,
          bodyPart: pickBodyPart(attack.players.get(shooter), zone, situation, chainRng),
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

    /**
     * Where the other side picks the ball up.
     *
     * Losing it in your own final third hands them possession close to your goal, so they start
     * already past the build-up — which is exactly what committing bodies forward buys the
     * opponent, and why an ultra-attacking mentality has to be able to cost you.
     */
    const winner = other(side);
    // Annotated on purpose: without it the inference is circular, because where the next
    // possession starts depends on this, and how far this one got depends on where it started.
    const wonHigh: boolean = ended === 'turnover' && reached === 'FINAL_THIRD';
    const launch =
      COUNTER_LAUNCH[setups[winner].tactics.passingDirectness] *
      COUNTER_TEMPO[setups[winner].tactics.tempo];
    side = winner;
    entryPhase = wonHigh && chainRng.bool(clamp(launch, 0, 0.8)) ? 'PROGRESSION' : 'BUILD_UP';
  }

  return { possessions, shots, home: stats.home, away: stats.away, ticks: tick };
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
