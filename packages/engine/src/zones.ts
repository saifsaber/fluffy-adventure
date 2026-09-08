import type { Position } from './types/player.js';
import type { PlayerId } from './types/ids.js';
import type { Selection } from './types/tactics.js';

/**
 * Where the pitch is contested.
 *
 * The engine never asks "which team is stronger". It asks, zone by zone, who is there and how much
 * room they have. This module is the map that question is asked against: pure data and lookups, no
 * probabilities. Those arrive in 3c.
 *
 * Zones are **team-relative**: `attacking_left` means the left of the pitch as *this* team attacks
 * it. Use `mirror()` to find the opponent zone that contests it — your left winger meets their
 * right-back, which is why the mirror swaps the channel as well as the band.
 */

export type Band = 'defensive' | 'middle' | 'attacking';
export type Channel = 'left' | 'centre' | 'right';
export type Zone = `${Band}_${Channel}`;

export const BANDS: readonly Band[] = ['defensive', 'middle', 'attacking'];
export const CHANNELS: readonly Channel[] = ['left', 'centre', 'right'];

export const ZONES: readonly Zone[] = BANDS.flatMap((band) =>
  CHANNELS.map((channel): Zone => `${band}_${channel}`),
);

export const zoneOf = (band: Band, channel: Channel): Zone => `${band}_${channel}`;
export const bandOf = (zone: Zone): Band => zone.split('_')[0] as Band;
export const channelOf = (zone: Zone): Channel => zone.split('_')[1] as Channel;

/**
 * The opponent zone that contests this one.
 *
 * Both axes flip. The band flips because their defensive third is your attacking third. The channel
 * flips because the sides face each other: attacking down your left puts you against their right.
 * Getting only one of the two right is a bug that would still look plausible in a test, so both are
 * asserted.
 */
export function mirror(zone: Zone): Zone {
  const band = bandOf(zone);
  const channel = channelOf(zone);
  const flippedBand: Band =
    band === 'defensive' ? 'attacking' : band === 'attacking' ? 'defensive' : 'middle';
  const flippedChannel: Channel =
    channel === 'left' ? 'right' : channel === 'right' ? 'left' : 'centre';
  return zoneOf(flippedBand, flippedChannel);
}

export interface ZoneFootprint {
  /** Where the player is by default — their share of these zones is full. */
  readonly occupies: readonly Zone[];
  /** Zones they also influence, at reduced weight. A full-back helps in midfield without living there. */
  readonly contests: readonly Zone[];
}

/**
 * Each position's footprint.
 *
 * `Record<Position, ZoneFootprint>` so adding a position without placing it on the pitch is a build
 * error — the same guard used for `CauseTag`. A position the engine cannot locate would silently
 * contribute nothing to any matchup.
 */
export const FOOTPRINTS: Record<Position, ZoneFootprint> = {
  GK: { occupies: ['defensive_centre'], contests: [] },

  RB: {
    occupies: ['defensive_right'],
    contests: ['middle_right', 'defensive_centre'],
  },
  LB: {
    occupies: ['defensive_left'],
    contests: ['middle_left', 'defensive_centre'],
  },
  CB: {
    occupies: ['defensive_centre'],
    contests: ['defensive_left', 'defensive_right'],
  },
  RWB: {
    occupies: ['defensive_right', 'middle_right'],
    contests: ['attacking_right'],
  },
  LWB: {
    occupies: ['defensive_left', 'middle_left'],
    contests: ['attacking_left'],
  },

  CDM: {
    occupies: ['middle_centre'],
    contests: ['defensive_centre', 'middle_left', 'middle_right'],
  },
  CM: {
    occupies: ['middle_centre'],
    contests: ['defensive_centre', 'attacking_centre', 'middle_left', 'middle_right'],
  },
  CAM: {
    occupies: ['attacking_centre'],
    contests: ['middle_centre'],
  },
  RM: {
    occupies: ['middle_right'],
    contests: ['defensive_right', 'attacking_right'],
  },
  LM: {
    occupies: ['middle_left'],
    contests: ['defensive_left', 'attacking_left'],
  },

  RW: {
    occupies: ['attacking_right'],
    contests: ['middle_right', 'attacking_centre'],
  },
  LW: {
    occupies: ['attacking_left'],
    contests: ['middle_left', 'attacking_centre'],
  },
  ST: {
    occupies: ['attacking_centre'],
    contests: ['attacking_left', 'attacking_right'],
  },
  CF: {
    occupies: ['attacking_centre'],
    contests: ['middle_centre'],
  },
};

/** How much a player counts in a zone they contest rather than occupy. */
export const CONTEST_WEIGHT = 0.45;

export interface ZonePresence {
  readonly playerId: PlayerId;
  /** 1 for a zone the player occupies, `CONTEST_WEIGHT` for one they merely contest. */
  readonly weight: number;
}

/**
 * Who is present in each zone, and how strongly.
 *
 * This is what 3c will resolve matchups against. Every zone appears in the result, including empty
 * ones — an unoccupied zone is a fact about the shape, not a gap to be skipped, and a side that has
 * left its right flank empty is exactly what the opponent should be able to exploit.
 */
export function zoneOccupancy(
  selections: readonly Selection[],
): Record<Zone, readonly ZonePresence[]> {
  const occupancy = Object.fromEntries(ZONES.map((zone) => [zone, [] as ZonePresence[]])) as Record<
    Zone,
    ZonePresence[]
  >;

  for (const selection of selections) {
    const footprint = FOOTPRINTS[selection.position];
    for (const zone of footprint.occupies) {
      occupancy[zone].push({ playerId: selection.playerId, weight: 1 });
    }
    for (const zone of footprint.contests) {
      occupancy[zone].push({ playerId: selection.playerId, weight: CONTEST_WEIGHT });
    }
  }
  return occupancy;
}

/** Total weighted presence in a zone. The raw number 3c turns into space. */
export function zoneStrength(occupancy: Record<Zone, readonly ZonePresence[]>, zone: Zone): number {
  return occupancy[zone].reduce((total, presence) => total + presence.weight, 0);
}
