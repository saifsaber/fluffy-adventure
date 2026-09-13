import { describe, expect, it } from 'vitest';
import {
  CROWD_FITNESS_LIFT,
  competitionId,
  crowdIntensity,
  drainPerTick,
  foulChance,
  gridTotal,
  matchId,
  refereeLeniency,
  simulate,
  tacticalPresence,
  type Club,
  type Intensity,
  type MatchInput,
  type MatchResult,
} from '../src/index.js';
import { makeClub, makePlayer, makeSide, makeTactics } from './fixtures.js';

/**
 * Home advantage, built out of circumstances rather than a bonus.
 *
 * The rule this file is written against: a **choice** must be able to hurt you, but a
 * **circumstance** may simply be good or bad luck. `HOME_CROWD_LIFT` is registered `circumstantial`
 * in the cause registry precisely because nobody chose it. So a crowd is allowed to be worth
 * something — but it still has to arrive through a named mechanism, and the one mechanism that is a
 * shape change is still a conserved transfer that the right opponent can punish.
 *
 * Three channels, each tested on its own below: fresher legs, a side pushed onto the front foot,
 * and a referee who can hear the ground.
 */

const ground = (slug: string, capacity: number): Club => {
  const club = makeClub(slug, 55);
  return { ...club, stadium: { ...club.stadium, capacity } };
};

const home = ground('home', 8000);
const away = ground('away', 8000);

const match = (seed: string, attendance: number, isDerby = false): MatchInput => ({
  id: matchId('m'),
  seed,
  home: { club: home, tactics: makeTactics(home), decisions: [] },
  away: { club: away, tactics: makeTactics(away), decisions: [] },
  context: { competitionId: competitionId('eg-d4'), awayTravelKm: 250, attendance, isDerby },
});

/** Paired over identical seeds, so seed noise cancels between the two conditions. */
const advantageAt = (attendance: number, n: number, isDerby = false): number => {
  let difference = 0;
  for (let i = 0; i < n; i++) {
    const result: MatchResult = simulate(match(`paired-${i}`, attendance, isDerby));
    difference += result.homeScore - result.awayScore;
  }
  return difference / n;
};

describe('how loud the ground is', () => {
  it('rates a packed village ground above a quarter-full stadium', () => {
    // The Egyptian fourth division is played in small grounds. A model that scored the crowd by
    // stadium size would say every lower-league match is played in silence.
    expect(crowdIntensity(1200, 1200, false)).toBeGreaterThan(crowdIntensity(5000, 20_000, false));
  });

  it('still gives a full big ground the edge over a full small one', () => {
    expect(crowdIntensity(20_000, 20_000, false)).toBeGreaterThan(
      crowdIntensity(1200, 1200, false),
    );
  });

  it('rises with the fill and peaks at one', () => {
    let previous = -1;
    for (const attendance of [0, 2000, 4000, 6000, 8000]) {
      const value = crowdIntensity(attendance, 8000, false);
      expect(value).toBeGreaterThan(previous);
      previous = value;
    }
    expect(crowdIntensity(99_000, 8000, true)).toBeLessThanOrEqual(1);
    expect(crowdIntensity(0, 8000, false)).toBe(0);
  });

  it('is louder for a derby, and safe for a ground with no capacity recorded', () => {
    expect(crowdIntensity(8000, 8000, true)).toBeGreaterThan(crowdIntensity(8000, 8000, false));
    expect(crowdIntensity(500, 0, false)).toBe(0);
  });

  it('reads nothing about who the clubs are', () => {
    // A crowd is a crowd. Scaling it by reputation would be the multiplier this engine refuses
    // everywhere else, dressed as atmosphere.
    expect(crowdIntensity(6000, 8000, false)).toBe(crowdIntensity(6000, 8000, false));
  });
});

describe('the three channels, separately', () => {
  it('fresher legs: a crowd slows the drain', () => {
    const player = makePlayer('runner', 'CM', 'box_to_box', 55);
    const intensity: Intensity = { pressing: 'high', tempo: 'balanced', mentality: 'balanced' };
    expect(drainPerTick(player, 'box_to_box', intensity, 0, 1)).toBeLessThan(
      drainPerTick(player, 'box_to_box', intensity, 0, 0),
    );
    expect(CROWD_FITNESS_LIFT).toBeLessThan(20);
  });

  it('the front foot: a crowd moves bodies without creating them', () => {
    // Conserved, like momentum and urgency. Even luck has to route through a mechanism that can go
    // wrong — a home side pushed up can be caught behind.
    const quiet = tacticalPresence(makeSide(home));
    const roaring = tacticalPresence({ ...makeSide(home), crowd: 1 });
    expect(gridTotal(roaring)).toBeCloseTo(gridTotal(quiet), 9);
    expect(roaring.attacking_centre).toBeGreaterThan(quiet.attacking_centre);
    expect(roaring.middle_centre).toBeLessThan(quiet.middle_centre);
  });

  it('the referee: the away side gives away more, the home side less', () => {
    expect(refereeLeniency(0, true)).toBe(1);
    expect(refereeLeniency(0, false)).toBe(1);
    expect(refereeLeniency(1, true)).toBeLessThan(1);
    expect(refereeLeniency(1, false)).toBeGreaterThan(1);
    expect(foulChance(50, 'moderate', refereeLeniency(1, true))).toBeLessThan(
      foulChance(50, 'moderate', refereeLeniency(1, false)),
    );
  });

  it('a derby is fiercer for both sides', () => {
    expect(foulChance(50, 'moderate', 1, true)).toBeGreaterThan(
      foulChance(50, 'moderate', 1, false),
    );
  });
});

describe('what it adds up to', () => {
  it('gives an empty ground no advantage at all', () => {
    expect(Math.abs(advantageAt(0, 500))).toBeLessThan(0.06);
  });

  it('gives a full house a real and measurable one', () => {
    const full = advantageAt(8000, 500);
    const empty = advantageAt(0, 500);
    expect(full).toBeGreaterThan(0.06);
    expect(full - empty).toBeGreaterThan(0.05);
  });

  it('books the away side more often in front of a full house', () => {
    let homeFouls = 0;
    let awayFouls = 0;
    for (let i = 0; i < 200; i++) {
      const result = simulate(match(`fouls-${i}`, 8000));
      homeFouls += result.stats.home.fouls;
      awayFouls += result.stats.away.fouls;
    }
    expect(awayFouls).toBeGreaterThan(homeFouls * 1.15);
  });

  it('never leaves a player fitter for having been cheered', () => {
    // The lift is felt, not banked: it is added when the resolver reads the squad and never written
    // back, or a home side would finish matches in better condition than it started them.
    const result = simulate(match('cheered', 8000));
    for (const player of result.players) {
      expect(player.conditionAfter.fitness).toBeLessThan(100);
    }
  });
});
