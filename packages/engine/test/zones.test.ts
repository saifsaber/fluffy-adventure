import { describe, expect, it } from 'vitest';
import {
  BANDS,
  CHANNELS,
  CONTEST_WEIGHT,
  FOOTPRINTS,
  ZONES,
  bandOf,
  channelOf,
  mirror,
  zoneOccupancy,
  zoneStrength,
  type Zone,
} from '../src/zones.js';
import { makeTactics, makeClub } from './fixtures.js';

describe('the zone grid', () => {
  it('is three bands by three channels, with no duplicates', () => {
    expect(ZONES).toHaveLength(BANDS.length * CHANNELS.length);
    expect(new Set(ZONES).size).toBe(ZONES.length);
  });

  it('round-trips through its accessors', () => {
    for (const zone of ZONES) {
      expect(BANDS).toContain(bandOf(zone));
      expect(CHANNELS).toContain(channelOf(zone));
    }
  });
});

describe('mirroring', () => {
  it('flips the band, because their defensive third is our attacking third', () => {
    expect(bandOf(mirror('attacking_centre'))).toBe('defensive');
    expect(bandOf(mirror('defensive_centre'))).toBe('attacking');
    expect(bandOf(mirror('middle_centre'))).toBe('middle');
  });

  it('flips the channel too, because our left winger meets their right-back', () => {
    // Getting the band right and the channel wrong would still pass a lazy test, so this is
    // asserted separately and by name.
    expect(mirror('attacking_left')).toBe('defensive_right');
    expect(mirror('attacking_right')).toBe('defensive_left');
    expect(channelOf(mirror('middle_centre'))).toBe('centre');
  });

  it('is its own inverse for every zone', () => {
    for (const zone of ZONES) expect(mirror(mirror(zone))).toBe(zone);
  });
});

describe('position footprints', () => {
  it('places every position somewhere', () => {
    for (const [position, footprint] of Object.entries(FOOTPRINTS)) {
      expect(footprint.occupies.length, position).toBeGreaterThan(0);
    }
  });

  it('never lists the same zone as both occupied and contested', () => {
    for (const [position, footprint] of Object.entries(FOOTPRINTS)) {
      const overlap = footprint.contests.filter((z) => footprint.occupies.includes(z));
      expect(overlap, `${position} both occupies and contests ${overlap.join(', ')}`).toEqual([]);
    }
  });

  it('only names real zones', () => {
    for (const footprint of Object.values(FOOTPRINTS)) {
      for (const zone of [...footprint.occupies, ...footprint.contests]) {
        expect(ZONES).toContain(zone);
      }
    }
  });

  it('keeps the keeper at home and the forwards forward', () => {
    expect(FOOTPRINTS.GK.occupies).toEqual(['defensive_centre']);
    expect(FOOTPRINTS.GK.contests).toEqual([]);
    for (const forward of ['ST', 'CF', 'LW', 'RW'] as const) {
      for (const zone of FOOTPRINTS[forward].occupies) {
        expect(bandOf(zone), forward).toBe('attacking');
      }
    }
  });

  it('keeps wide players on their own side', () => {
    const sided = {
      RB: 'right',
      RM: 'right',
      RW: 'right',
      LB: 'left',
      LM: 'left',
      LW: 'left',
    } as const;
    for (const [position, side] of Object.entries(sided)) {
      const channels = FOOTPRINTS[position as keyof typeof sided].occupies.map(channelOf);
      expect(channels, position).not.toContain(side === 'right' ? 'left' : 'right');
    }
  });
});

describe('occupancy of a real eleven', () => {
  const tactics = makeTactics(makeClub('test', 60));
  const occupancy = zoneOccupancy(tactics.startingXI);

  it('accounts for every zone, including empty ones', () => {
    expect(Object.keys(occupancy).sort()).toEqual([...ZONES].sort());
  });

  it('puts a 4-3-3 in every band', () => {
    for (const band of BANDS) {
      const inBand = ZONES.filter((z) => bandOf(z) === band);
      const total = inBand.reduce((sum, z) => sum + zoneStrength(occupancy, z), 0);
      expect(total, band).toBeGreaterThan(0);
    }
  });

  it('weights an occupied zone above a merely contested one', () => {
    const contestedOnly: Zone = 'middle_right';
    const presences = occupancy[contestedOnly];
    expect(presences.length).toBeGreaterThan(0);
    for (const p of presences) expect([1, CONTEST_WEIGHT]).toContain(p.weight);
  });

  it('is heaviest in the centre, which is where a 4-3-3 actually plays', () => {
    const centre = ZONES.filter((z) => channelOf(z) === 'centre').reduce(
      (s, z) => s + zoneStrength(occupancy, z),
      0,
    );
    const left = ZONES.filter((z) => channelOf(z) === 'left').reduce(
      (s, z) => s + zoneStrength(occupancy, z),
      0,
    );
    expect(centre).toBeGreaterThan(left);
  });

  it('gives an empty selection an empty grid rather than throwing', () => {
    const empty = zoneOccupancy([]);
    for (const zone of ZONES) expect(zoneStrength(empty, zone)).toBe(0);
  });
});
