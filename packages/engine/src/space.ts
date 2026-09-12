import type { Player } from './types/player.js';
import type { PlayerId } from './types/ids.js';
import type { PlayerRole } from './types/player.js';
import type {
  Compactness,
  LineHeight,
  Mentality,
  PassingDirectness,
  PressingIntensity,
  PressingTrigger,
  Tactics,
  TeamWidth,
  Tempo,
} from './types/tactics.js';
import type { CauseTag } from './types/trace.js';
import {
  BANDS,
  CHANNELS,
  CONTEST_WEIGHT,
  FOOTPRINTS,
  ZONES,
  bandOf,
  channelOf,
  mirror,
  zoneOf,
  type Band,
  type Channel,
  type Zone,
} from './zones.js';

/**
 * Space and matchup resolution — the heart of the engine.
 *
 * Everything else in the simulation is bookkeeping around one question: **in this zone, right now,
 * who has room?** This module answers it, and it answers it structurally rather than with a
 * multiplier. No function here says `if (mentality === 'attacking') attack *= 1.08`. A tactic moves
 * bodies; where the bodies end up decides who has room; and the same move therefore helps against
 * one opponent and hurts against another. That property is the product.
 *
 * Two guarantees make the claim mechanical rather than rhetorical, and both are asserted in
 * `test/space.test.ts`:
 *
 * 1. **Shape tactics conserve presence.** `lineHeight`, `mentality`, `width` and `compactness` are
 *    implemented exclusively as transfers between zones. Changing any of them redistributes a side's
 *    presence and never adds to its total. A tactic that cannot raise your total cannot be a bonus
 *    in disguise — the only thing it can do is change *where* you are strong, which is what a shape
 *    is.
 * 2. **The line-height effect changes sign with the opponent.** A high line both compresses the
 *    opponent's build-up and leaves grass behind the defence. Which term wins depends on whether
 *    the opponent can reach the grass. Against a slow side that plays short it is a gain; against a
 *    quick side that plays direct it is a loss. Same setting, opposite sign.
 *
 * There is no randomness here. Space is deterministic given two shapes and twenty-two players;
 * chance enters later, when the possession chain (3d) turns space into transition probabilities.
 */

/** A side as the resolver needs it: a shape, and the players filling it. */
export interface SideSetup {
  readonly tactics: Tactics;
  /** Every player named in `tactics.startingXI`, keyed by id. */
  readonly players: ReadonlyMap<PlayerId, Player>;
}

export interface ZoneSpace {
  readonly zone: Zone;
  /** The attacking side's weighted presence here. */
  readonly attack: number;
  /** The defending side's weighted presence in the zone that contests this one. */
  readonly defence: number;
  /**
   * Room for the attacking side, measured in weighted bodies of overload.
   * Positive means they outnumber and outmatch the defence here; negative means they are crowded
   * out. It is not a probability — 3d turns it into one.
   */
  readonly space: number;
}

export interface SpaceMap {
  /** Every zone, in the **attacking** side's frame. */
  readonly zones: Record<Zone, ZoneSpace>;
  /** Grass behind the defending side's line that the attacking side can actually reach. */
  readonly exposure: number;
  /** How hard the defending side's line and press squeeze the attacking side's build-up. */
  readonly compression: number;
  /** Why the map looks like this, strongest first. The only causes 3d and the trace may cite. */
  readonly causes: readonly CauseTag[];
}

type Grid = Record<Zone, number>;

const emptyGrid = (): Grid => Object.fromEntries(ZONES.map((zone) => [zone, 0])) as Grid;

const mean = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

const clamp = (value: number, low: number, high: number): number =>
  value < low ? low : value > high ? high : value;

/** Total weighted presence on the grid. Shape tactics never change this — only its distribution. */
export const gridTotal = (grid: Grid): number => ZONES.reduce((sum, zone) => sum + grid[zone], 0);

// ---------------------------------------------------------------------------------------------
// Competence: what a player is worth in a given band
// ---------------------------------------------------------------------------------------------

/**
 * How much a player is worth in a band, as a multiple of a 50-rated player.
 *
 * Presence is bodies **times** competence, so a zone held by a good player genuinely resists more
 * than the same zone held by a poor one. Each band reads the attributes that actually decide
 * contests there — a centre-back's marking does not help him in the final third, and the resolver
 * should not pretend otherwise.
 */
export function bandCompetence(player: Player, band: Band): number {
  const { technical: t, physical: p, mental: m, goalkeeping: g } = player.attributes;

  if (band === 'defensive') {
    // A keeper resists in his own third with keeping attributes, not with tackling he never uses.
    if (g !== undefined) {
      return mean([m.positioning, m.anticipation, g.handling, g.oneOnOnes, g.aerialReach]) / 50;
    }
    return mean([t.marking, t.tackling, m.positioning, m.anticipation, p.strength, p.jumping]) / 50;
  }
  if (band === 'middle') {
    return mean([t.passing, t.vision, m.decisions, m.workRate, m.teamwork, p.stamina]) / 50;
  }
  return mean([t.dribbling, t.finishing, t.firstTouch, m.composure, p.acceleration, p.pace]) / 50;
}

/**
 * What tiredness costs.
 *
 * Gentle above 65 and steep below it, matching the contract on `PlayerCondition.fitness`. A tired
 * side covers less ground, so its total presence genuinely falls — unlike a tactical change, which
 * only moves presence around. That asymmetry is the point: effort is a resource, shape is a choice.
 */
export function fitnessFactor(fitness: number): number {
  const f = clamp(fitness, 0, 100);
  if (f >= 65) return 0.93 + (0.07 * (f - 65)) / 35;
  return 0.93 * (0.55 + (0.45 * f) / 65);
}

// ---------------------------------------------------------------------------------------------
// Conserved transfers — the only way a tactic is allowed to act
// ---------------------------------------------------------------------------------------------

/** Moves a fraction of one band's weight into another, channel by channel. Sign gives direction. */
function transferBands(grid: Grid, back: Band, forward: Band, signed: number): Grid {
  if (signed === 0) return grid;
  const out = { ...grid };
  const from = signed > 0 ? back : forward;
  const to = signed > 0 ? forward : back;
  const fraction = Math.abs(signed);
  for (const channel of CHANNELS) {
    const moved = out[zoneOf(from, channel)] * fraction;
    out[zoneOf(from, channel)] -= moved;
    out[zoneOf(to, channel)] += moved;
  }
  return out;
}

/** Positive widens (centre → flanks); negative narrows (flanks → centre). */
function transferChannels(grid: Grid, signed: number): Grid {
  if (signed === 0) return grid;
  const out = { ...grid };
  const fraction = Math.abs(signed);
  for (const band of BANDS) {
    const centre = zoneOf(band, 'centre');
    const left = zoneOf(band, 'left');
    const right = zoneOf(band, 'right');
    if (signed > 0) {
      const moved = out[centre] * fraction;
      out[centre] -= moved;
      out[left] += moved / 2;
      out[right] += moved / 2;
    } else {
      const fromLeft = out[left] * fraction;
      const fromRight = out[right] * fraction;
      out[left] -= fromLeft;
      out[right] -= fromRight;
      out[centre] += fromLeft + fromRight;
    }
  }
  return out;
}

/** Positive pulls the other bands into the block's gravity band; negative spreads it back out. */
function condenseBands(grid: Grid, gravity: Band, signed: number): Grid {
  if (signed === 0) return grid;
  const out = { ...grid };
  const others = BANDS.filter((band) => band !== gravity);
  const fraction = Math.abs(signed);
  for (const channel of CHANNELS) {
    const centre = zoneOf(gravity, channel);
    if (signed > 0) {
      for (const band of others) {
        const moved = out[zoneOf(band, channel)] * fraction;
        out[zoneOf(band, channel)] -= moved;
        out[centre] += moved;
      }
    } else {
      const moved = out[centre] * fraction;
      out[centre] -= moved;
      for (const band of others) out[zoneOf(band, channel)] += moved / others.length;
    }
  }
  return out;
}

/** A conserved flow one band forward (positive) or back (negative), used for per-player role drift. */
function flowBands(grid: Grid, signed: number): Grid {
  if (signed === 0) return grid;
  const out = { ...grid };
  const fraction = Math.abs(signed);
  for (const channel of CHANNELS) {
    const def = grid[zoneOf('defensive', channel)];
    const mid = grid[zoneOf('middle', channel)];
    const att = grid[zoneOf('attacking', channel)];
    if (signed > 0) {
      out[zoneOf('defensive', channel)] = def * (1 - fraction);
      out[zoneOf('middle', channel)] = mid * (1 - fraction) + def * fraction;
      out[zoneOf('attacking', channel)] = att + mid * fraction;
    } else {
      out[zoneOf('attacking', channel)] = att * (1 - fraction);
      out[zoneOf('middle', channel)] = mid * (1 - fraction) + att * fraction;
      out[zoneOf('defensive', channel)] = def + mid * fraction;
    }
  }
  return out;
}

/** Positive drifts toward the player's own flank; negative tucks them inside. */
function flowChannels(grid: Grid, signed: number, home: Channel): Grid {
  if (signed === 0 || home === 'centre') return grid;
  const out = { ...grid };
  const fraction = Math.abs(signed);
  for (const band of BANDS) {
    const centre = zoneOf(band, 'centre');
    const flank = zoneOf(band, home);
    const moved = (signed > 0 ? out[centre] : out[flank]) * fraction;
    if (signed > 0) {
      out[centre] -= moved;
      out[flank] += moved;
    } else {
      out[flank] -= moved;
      out[centre] += moved;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Tactical constants
// ---------------------------------------------------------------------------------------------

/** Defensive line ↔ midfield. How far up the back line pushes the whole rear block. */
const LINE_SHIFT: Record<LineHeight, number> = {
  deep: -0.2,
  normal: 0,
  high: 0.15,
  very_high: 0.26,
};

/** Midfield ↔ attack. How many bodies commit forward once the back line has taken its position. */
const MENTALITY_SHIFT: Record<Mentality, number> = {
  ultra_defensive: -0.22,
  defensive: -0.11,
  balanced: 0,
  attacking: 0.12,
  ultra_attacking: 0.24,
};

const WIDTH_SHIFT: Record<TeamWidth, number> = { narrow: -0.18, balanced: 0, wide: 0.16 };

/**
 * Compactness acts on both axes, because a compact block really is short *and* narrow: the lines
 * squeeze toward the ball, and the ball is usually central. Tight therefore concedes the flanks and
 * loose concedes the middle, exactly as `Compactness` is documented.
 */
const COMPACT_BAND: Record<Compactness, number> = { tight: 0.16, balanced: 0, loose: -0.13 };
const COMPACT_CHANNEL: Record<Compactness, number> = { tight: -0.15, balanced: 0, loose: 0.13 };

/** Where the block's weight sits, which is what compactness condenses around. */
const BLOCK_GRAVITY: Record<LineHeight, Band> = {
  deep: 'defensive',
  normal: 'middle',
  high: 'middle',
  very_high: 'attacking',
};

interface RoleDrift {
  /** Fraction of the player's weight moved one band forward (+) or back (−). */
  readonly band: number;
  /** Fraction moved toward their own flank (+) or tucked inside (−). */
  readonly channel: number;
}

/**
 * What a role does to where a player stands.
 *
 * `Record<PlayerRole, RoleDrift>` so a new role without a decided footprint is a build error, the
 * same guard `CauseTag` and `FOOTPRINTS` use. Every entry is a conserved transfer: a role moves a
 * player, it never makes them bigger. The weight carries its band competence with it, which is the
 * honest reading — an attacking full-back brings full-back qualities forward, he does not become a
 * winger on arrival.
 */
const ROLE_DRIFT: Record<PlayerRole, RoleDrift> = {
  sweeper_keeper: { band: 0.1, channel: 0 },
  shot_stopper: { band: 0, channel: 0 },

  ball_playing_defender: { band: 0.08, channel: 0 },
  stopper: { band: 0.05, channel: 0 },
  covering_defender: { band: -0.08, channel: 0 },
  attacking_fullback: { band: 0.22, channel: 0.1 },
  inverted_fullback: { band: 0.1, channel: -0.25 },
  defensive_fullback: { band: -0.08, channel: 0.05 },

  anchor: { band: -0.15, channel: 0 },
  deep_lying_playmaker: { band: -0.12, channel: 0 },
  box_to_box: { band: 0.08, channel: 0 },
  ball_winner: { band: -0.05, channel: 0 },
  advanced_playmaker: { band: 0.12, channel: 0 },

  shadow_striker: { band: 0.18, channel: 0 },
  inside_forward: { band: 0.05, channel: -0.28 },
  touchline_winger: { band: 0, channel: 0.22 },
  target_man: { band: 0.05, channel: -0.1 },
  poacher: { band: 0.15, channel: -0.05 },
  false_nine: { band: -0.2, channel: 0 },
  complete_forward: { band: 0.05, channel: 0 },
};

// ---------------------------------------------------------------------------------------------
// Presence
// ---------------------------------------------------------------------------------------------

/** Index a squad the way `SideSetup` wants it. */
export function indexSquad(players: readonly Player[]): ReadonlyMap<PlayerId, Player> {
  return new Map(players.map((player) => [player.id, player]));
}

/**
 * Where a side's weight actually sits once its shape, its roles and its fitness are applied.
 *
 * The order matters and mirrors how a team is set up: the players take their positions, each role
 * pulls its player off that position a little, then the four team-wide shape settings move the
 * block as a whole.
 */
export function tacticalPresence(side: SideSetup): Grid {
  const { tactics } = side;
  let grid = emptyGrid();

  for (const selection of tactics.startingXI) {
    const player = side.players.get(selection.playerId);
    if (player === undefined) {
      throw new Error(`tacticalPresence: ${selection.playerId} is selected but was not supplied`);
    }
    const footprint = FOOTPRINTS[selection.position];
    const fitness = fitnessFactor(player.condition.fitness);

    let own = emptyGrid();
    for (const zone of footprint.occupies) {
      own[zone] += bandCompetence(player, bandOf(zone)) * fitness;
    }
    for (const zone of footprint.contests) {
      own[zone] += CONTEST_WEIGHT * bandCompetence(player, bandOf(zone)) * fitness;
    }

    const drift = ROLE_DRIFT[selection.role];
    const home = footprint.occupies[0];
    own = flowBands(own, drift.band);
    if (home !== undefined) own = flowChannels(own, drift.channel, channelOf(home));

    for (const zone of ZONES) grid[zone] += own[zone];
  }

  grid = transferBands(grid, 'defensive', 'middle', LINE_SHIFT[tactics.lineHeight]);
  grid = transferBands(grid, 'middle', 'attacking', MENTALITY_SHIFT[tactics.mentality]);
  grid = transferChannels(grid, WIDTH_SHIFT[tactics.width]);
  grid = condenseBands(grid, BLOCK_GRAVITY[tactics.lineHeight], COMPACT_BAND[tactics.compactness]);
  grid = transferChannels(grid, COMPACT_CHANNEL[tactics.compactness]);

  return grid;
}

// ---------------------------------------------------------------------------------------------
// The line: compression and exposure
// ---------------------------------------------------------------------------------------------

/** How much grass a line height leaves behind it, before anyone tries to use it. */
const LINE_RISK: Record<LineHeight, number> = { deep: 0, normal: 0.3, high: 0.65, very_high: 1 };

const PRESS_FORCE: Record<PressingIntensity, number> = {
  contain: 0.25,
  moderate: 0.5,
  high: 0.8,
  gegenpress: 1,
};

/** Which of the attacking side's bands the press actually reaches, from the presser's trigger. */
const TRIGGER_REACH: Record<
  PressingTrigger,
  { readonly defensive: number; readonly middle: number }
> = {
  own_third: { defensive: 0.15, middle: 0.5 },
  middle_third: { defensive: 0.55, middle: 1 },
  final_third: { defensive: 1, middle: 0.6 },
};

/** How readily a side plays the ball past the last line rather than through midfield. */
const DIRECTNESS_VERTICALITY: Record<PassingDirectness, number> = {
  short: 0.45,
  mixed: 0.8,
  direct: 1.15,
  long: 1.3,
};

const TEMPO_VERTICALITY: Record<Tempo, number> = { slow: 0.7, balanced: 1, fast: 1.25 };

const EXPOSURE_SCALE = 1.1;
const COMPRESSION_SCALE = 1;

/** How the grass behind a line is shared out across the attacking third. Sums to one. */
const EXPOSURE_SPREAD: Record<Channel, number> = { left: 0.3, centre: 0.4, right: 0.3 };

function occupantsOf(side: SideSetup, band: Band, includeKeeper: boolean): readonly Player[] {
  const players: Player[] = [];
  for (const selection of side.tactics.startingXI) {
    if (!includeKeeper && selection.position === 'GK') continue;
    const footprint = FOOTPRINTS[selection.position];
    if (!footprint.occupies.some((zone) => bandOf(zone) === band)) continue;
    const player = side.players.get(selection.playerId);
    if (player !== undefined) players.push(player);
  }
  return players;
}

const paceOf = (players: readonly Player[]): number =>
  players.length === 0
    ? 1
    : mean(
        players.map((p) => (p.attributes.physical.pace + p.attributes.physical.acceleration) / 2),
      ) / 50;

/** Composure on the ball under a press — what decides whether compression actually bites. */
const pressResistanceOf = (players: readonly Player[]): number =>
  players.length === 0
    ? 1
    : mean(
        players.map((p) =>
          mean([
            p.attributes.technical.firstTouch,
            p.attributes.technical.passing,
            p.attributes.mental.composure,
            p.attributes.mental.decisions,
          ]),
        ),
      ) / 50;

// ---------------------------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------------------------

/**
 * How much room the attacking side has, zone by zone, against this defending side.
 *
 * Pure and deterministic: same two setups, same map, every time. Zones are in the attacking side's
 * frame, so `attacking_centre` is in front of the defending goal and `defensive_centre` is the
 * attacking side's own build-up area.
 */
export function resolveSpace(attack: SideSetup, defend: SideSetup): SpaceMap {
  const attackGrid = tacticalPresence(attack);
  const defendGrid = tacticalPresence(defend);

  const lineRisk = LINE_RISK[defend.tactics.lineHeight];

  // What the attacking side can do with grass behind the line, against what the defence can recover.
  const threat =
    paceOf(occupantsOf(attack, 'attacking', false)) *
    DIRECTNESS_VERTICALITY[attack.tactics.passingDirectness] *
    TEMPO_VERTICALITY[attack.tactics.tempo];
  const recovery = paceOf(occupantsOf(defend, 'defensive', false));
  // Even limitless pace cannot open more than a finite amount of grass, and a static forward still
  // profits a little from a line on the halfway mark. The clamp keeps both ends honest.
  const reach = clamp(threat / recovery, 0.15, 3);
  const exposure = lineRisk * reach * EXPOSURE_SCALE;

  // The same high line squeezes the attacking side's build-up. Whether the squeeze bites depends on
  // who is receiving the ball under it.
  const resistance = pressResistanceOf([
    ...occupantsOf(attack, 'defensive', false),
    ...occupantsOf(attack, 'middle', false),
  ]);
  const press = PRESS_FORCE[defend.tactics.pressingIntensity];
  const compression = (lineRisk * press * COMPRESSION_SCALE) / Math.max(resistance, 0.2);
  const trigger = TRIGGER_REACH[defend.tactics.pressingTrigger];

  const zones = Object.fromEntries(
    ZONES.map((zone): [Zone, ZoneSpace] => {
      const attackHere = attackGrid[zone];
      const defenceHere = defendGrid[mirror(zone)];
      const band = bandOf(zone);
      const channel = channelOf(zone);

      let adjustment = 0;
      if (band === 'attacking') adjustment += exposure * EXPOSURE_SPREAD[channel];
      if (band === 'defensive') adjustment -= (compression * trigger.defensive) / CHANNELS.length;
      if (band === 'middle') adjustment -= (compression * trigger.middle) / CHANNELS.length;

      return [
        zone,
        {
          zone,
          attack: attackHere,
          defence: defenceHere,
          space: attackHere - defenceHere + adjustment,
        },
      ];
    }),
  ) as Record<Zone, ZoneSpace>;

  const map: SpaceMap = { zones, exposure, compression, causes: [] };
  return { ...map, causes: causesFor(map, attack, defend) };
}

/** Total space across one band. */
export function bandSpace(map: SpaceMap, band: Band): number {
  return ZONES.filter((zone) => bandOf(zone) === band).reduce(
    (sum, zone) => sum + map.zones[zone].space,
    0,
  );
}

/** Total space across one channel. */
export function channelSpace(map: SpaceMap, channel: Channel): number {
  return ZONES.filter((zone) => channelOf(zone) === channel).reduce(
    (sum, zone) => sum + map.zones[zone].space,
    0,
  );
}

/**
 * The best route forward: the attacking-third zone offering the most room.
 *
 * This, not the grid total, is the number a shape tactic moves. The grid total cannot move, because
 * every shape setting is a conserved transfer — which is precisely the guarantee that none of them
 * is a bonus. What a shape buys you is a better *route*, and this is it.
 */
export function bestAttackingZone(map: SpaceMap): ZoneSpace {
  const attacking = ZONES.filter((zone) => bandOf(zone) === 'attacking');
  let best = map.zones[attacking[0] ?? 'attacking_centre'];
  for (const zone of attacking) {
    const candidate = map.zones[zone];
    // Ties break on zone name so the result never depends on iteration order.
    if (
      candidate.space > best.space ||
      (candidate.space === best.space && candidate.zone < best.zone)
    ) {
      best = candidate;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
// Causes
// ---------------------------------------------------------------------------------------------

/** A genuine numerical overload, in weighted bodies. Below this, nothing worth narrating happened. */
const OVERLOAD = 0.6;
const MISMATCH = 1.8;

/**
 * Why the map looks the way it does.
 *
 * Every tag here is already in `CAUSE_REGISTRY`, and each one is attached to the number that caused
 * it — so the trace in Step 5 reads what the resolver computed rather than inventing an explanation
 * afterwards. That ordering is the whole difference between an explanation and a plausible story.
 */
function causesFor(map: SpaceMap, attack: SideSetup, defend: SideSetup): readonly CauseTag[] {
  const found: { tag: CauseTag; magnitude: number }[] = [];
  const add = (tag: CauseTag, magnitude: number): void => {
    found.push({ tag, magnitude });
  };

  const middle = bandSpace(map, 'middle');
  if (middle > OVERLOAD) add('MIDFIELD_OVERLOAD', middle);
  if (middle < -OVERLOAD) add('MIDFIELD_OUTNUMBERED', -middle);

  const flanks = channelSpace(map, 'left') + channelSpace(map, 'right');
  const centre = channelSpace(map, 'centre');
  const wideBias = flanks / 2 - centre;
  if (wideBias > OVERLOAD) {
    add('WIDE_OVERLOAD', wideBias);
    if (defend.tactics.width === 'narrow' || defend.tactics.compactness === 'tight') {
      add('NARROW_SHAPE_CONCEDED_FLANKS', wideBias);
    }
  }

  const high = defend.tactics.lineHeight === 'high' || defend.tactics.lineHeight === 'very_high';
  const behind = map.exposure - map.compression;
  if (high && behind > 0) add('HIGH_LINE_VS_PACE', behind);
  if (defend.tactics.lineHeight === 'deep' && bandSpace(map, 'attacking') < 0) {
    add('DEEP_BLOCK_ABSORBED_PRESSURE', -bandSpace(map, 'attacking'));
  }

  let worst = 0;
  for (const zone of ZONES) worst = Math.max(worst, Math.abs(map.zones[zone].space));
  if (worst > MISMATCH && attack.tactics.formation !== defend.tactics.formation) {
    add('FORMATION_MISMATCH', worst);
  }

  return found
    .sort((a, b) => b.magnitude - a.magnitude || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0))
    .map(({ tag }) => tag);
}
