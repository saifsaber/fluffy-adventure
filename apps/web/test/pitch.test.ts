import { describe, expect, it } from 'vitest';
import { FOOTPRINTS, baselineTactics, bandOf, channelOf } from '@dakka/engine';
import type { Position } from '@dakka/engine';
import { DATA_ROOT, loadLeague } from '@dakka/content';
import { placeXI } from '../src/pitch.js';

/**
 * Where the eleven stand.
 *
 * The claim under test is not "the diagram looks right" — it is that the diagram is **derived from
 * the engine's own zone footprints**, so a player drawn wide is drawn wide because the simulation
 * puts him there. A hand-placed formation would pass every geometric check below and be a
 * decoration; these tests are written so that only a derived one passes.
 */

const { clubs } = loadLeague(DATA_ROOT, 'egy-d4');
const club = clubs[0] as (typeof clubs)[number];
const xi = baselineTactics(club.squad).startingXI;

describe('the eleven are placed from the engine, not by hand', () => {
  it('places every player on the sheet, and only those', () => {
    const marks = placeXI(xi);
    expect(marks).toHaveLength(xi.length);
    expect(new Set(marks.map((m) => m.playerId)).size).toBe(xi.length);
  });

  it('keeps every mark on the pitch', () => {
    // `y === 100` is the goal line, which is on the pitch — that is where a keeper stands.
    for (const mark of placeXI(xi)) {
      expect(mark.x, mark.position).toBeGreaterThan(0);
      expect(mark.x, mark.position).toBeLessThan(100);
      expect(mark.y, mark.position).toBeGreaterThan(0);
      expect(mark.y, mark.position).toBeLessThanOrEqual(100);
    }
  });

  it('never draws two players on top of each other', () => {
    // Two centre-backs occupy the same zone. Without the fan they would be one disc, and the
    // screen would quietly show ten men.
    const marks = placeXI(xi);
    const spots = marks.map((m) => `${m.x.toFixed(2)}:${m.y.toFixed(2)}`);
    expect(new Set(spots).size).toBe(marks.length);
  });

  it('agrees with the footprint of every position the engine has', () => {
    // The real assertion: for each position, the mark sits in the band and channel its footprint
    // occupies. Change a footprint and this fails — which is the point, because the diagram is
    // supposed to be a picture of the model.
    const bandY: Record<string, number> = { defensive: 80, middle: 50, attacking: 20 };
    const channelX: Record<string, number> = { left: 20, centre: 50, right: 80 };
    // `FOOTPRINTS` is `Record<Position, …>`, so its keys are every position the engine has — a
    // new one cannot be added without placing it, and cannot be placed without appearing here.
    for (const position of Object.keys(FOOTPRINTS) as Position[]) {
      const zones = FOOTPRINTS[position].occupies;
      const [mark] = placeXI([{ playerId: club.squad[0]!.id, position, role: 'stopper' }]);
      const keeper = FOOTPRINTS[position].contests.length === 0 && zones.length === 1;
      const expectedY = keeper
        ? 100
        : zones.reduce((total, zone) => total + (bandY[bandOf(zone)] ?? 0), 0) / zones.length;
      const expectedX =
        zones.reduce((total, zone) => total + (channelX[channelOf(zone)] ?? 0), 0) / zones.length;
      expect(mark?.y, position).toBeCloseTo(expectedY, 6);
      expect(mark?.x, position).toBeCloseTo(expectedX, 6);
    }
  });

  it('stands the keeper behind his own defence, not among it', () => {
    // The model's finest resolution is `defensive_centre`, which a keeper shares with both
    // centre-backs — so a plain centroid draws him in the middle of his own back line. He is the
    // only position occupying one zone and contesting none, and that is what moves him.
    const marks = placeXI(xi);
    const keeper = marks.find((m) => m.position === 'GK');
    const backs = marks.filter((m) => m.position === 'CB');
    expect(backs.length).toBeGreaterThan(0);
    for (const back of backs) expect(keeper?.y ?? 0).toBeGreaterThan(back.y);
  });

  it('puts the keeper nearest your own goal and the striker furthest from it', () => {
    const marks = placeXI(xi);
    const keeper = marks.find((m) => m.position === 'GK');
    const forward = marks.filter((m) => m.position === 'ST' || m.position === 'CF');
    expect(keeper).toBeDefined();
    expect(forward.length).toBeGreaterThan(0);
    for (const striker of forward) {
      expect(striker.y).toBeLessThan(keeper?.y ?? 0);
    }
  });

  it('draws the same eleven the same way every time', () => {
    expect(placeXI(xi)).toEqual(placeXI(xi));
  });
});
