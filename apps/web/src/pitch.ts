import { BANDS, CHANNELS, FOOTPRINTS, bandOf, channelOf } from '@dakka/engine';
import type { PlayerId, Position, Selection } from '@dakka/engine';

/**
 * Where the eleven stand, taken from the engine rather than drawn by hand.
 *
 * Each player sits at the centroid of the zones their position **occupies** — the same
 * `FOOTPRINTS` table the simulation reads to work out who contests what. That is the whole point:
 * the diagram is a picture of the model, not an illustration beside it. A full-back drawn wide is
 * drawn wide because the engine puts him in `defensive_right`, so if the footprint were wrong the
 * shape on screen would look wrong too, which is a far better guard than a comment.
 *
 * `contests` is deliberately ignored. A player influences four zones and stands in one; averaging
 * the influence would put a CM in the middle of nothing in particular.
 */

export interface Mark {
  readonly playerId: PlayerId;
  readonly position: Position;
  /** Across the pitch, 0 at the diagram's left touchline, 100 at its right. */
  readonly x: number;
  /** Up the pitch, 0 at the goal you are attacking, 100 at your own. */
  readonly y: number;
}

const BAND_INDEX = new Map(BANDS.map((band, index) => [band, index]));
const CHANNEL_INDEX = new Map(CHANNELS.map((channel, index) => [channel, index]));

/** How far apart two players sharing one zone are fanned, in pitch units. */
const FAN = 19;
const EDGE = 9;

/**
 * How deep the keeper stands. Behind the defensive band, which no zone in the model is.
 *
 * The gap to the back line is not decoration: at anything closer his disc lands on top of the
 * centre-backs' names, because he shares their channel exactly.
 */
const KEEPER_Y = 100;

/**
 * The keeper, identified by the shape of his footprint rather than by his name.
 *
 * He is the only position in the table that occupies exactly one zone and contests nothing — every
 * outfielder influences somewhere he does not stand. Reading that property instead of testing for
 * `'GK'` keeps the diagram derived: if the engine ever gave the keeper a sweeping role, his
 * footprint would gain a contested zone and he would come out of goal here without an edit.
 *
 * It is the one place the drawing knows something the zone model does not, and it is worth the
 * exception: the model's finest resolution is `defensive_centre`, which a keeper shares with both
 * centre-backs, so a faithful centroid draws him standing in the middle of his own defence.
 */
function isKeeper(position: Position): boolean {
  const footprint = FOOTPRINTS[position];
  return footprint.contests.length === 0 && footprint.occupies.length === 1;
}

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

const mean = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0) / values.length;

/** The centre of a position's occupied zones, in band/channel space. */
function cell(position: Position): { band: number; channel: number } {
  const zones = FOOTPRINTS[position].occupies;
  return {
    band: mean(zones.map((zone) => BAND_INDEX.get(bandOf(zone)) ?? 0)),
    channel: mean(zones.map((zone) => CHANNEL_INDEX.get(channelOf(zone)) ?? 1)),
  };
}

export function placeXI(startingXI: readonly Selection[]): readonly Mark[] {
  const placed = startingXI.map((selection) => {
    const { band, channel } = cell(selection.position);
    return {
      selection,
      // `defensive` is your own end, so it is the bottom of the diagram and you attack upwards.
      y: isKeeper(selection.position) ? KEEPER_Y : 80 - band * 30,
      x: 20 + channel * 30,
    };
  });

  // Two centre-backs occupy the same zone and would be drawn on top of each other. Fan anyone
  // sharing a spot symmetrically about it, in team-sheet order so the same eleven always draws
  // the same way.
  const groups = new Map<string, typeof placed>();
  for (const mark of placed) {
    const key = `${mark.x}:${mark.y}`;
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [mark]);
    else group.push(mark);
  }

  const marks: Mark[] = [];
  for (const group of groups.values()) {
    const first = (group.length - 1) / 2;
    group.forEach((mark, index) => {
      marks.push({
        playerId: mark.selection.playerId,
        position: mark.selection.position,
        x: clamp(mark.x + (index - first) * FAN, EDGE, 100 - EDGE),
        y: mark.y,
      });
    });
  }
  return marks;
}
