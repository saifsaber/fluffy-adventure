import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DATA_ROOT, loadLeague } from '@dakka/content';
import {
  ALL_ATTRIBUTES,
  ATTRIBUTE_GROUP,
  ROLE_DEMANDS,
  attribute,
  baselineTactics,
  type AttributeName,
  type Player,
  type PlayerRole,
} from '@dakka/engine';
import {
  AGE_CURVES,
  FULL_SEASON_GAIN,
  GROWTH_WITHOUT_FOOTBALL,
  ageDrift,
  develop,
  type Appearance,
} from '../src/index.js';

/**
 * Development, and the failure the box named: *a random walk with a plausible curve*.
 *
 * So the first test in this file is that there is no walk — nothing here draws a random number,
 * checked by reading the source rather than by believing the comment. The rest are the claims the
 * model makes: that the **job** decides what a player becomes, that **minutes** decide how much,
 * that a career is summed rather than rounded season by season, and that the league neither
 * inflates nor collapses when it is all run out over ten years.
 */

const league = loadLeague(DATA_ROOT, 'egy-d4');
const SEASON_MINUTES = 38 * 90;
const squad = league.clubs[0]?.squad as readonly Player[];
const young = squad.find((player) => player.age <= 19) as Player;
const seasons = (role: PlayerRole | undefined, count: number): readonly Appearance[][] =>
  Array.from({ length: count }, () =>
    role === undefined ? [] : [{ role, minutes: SEASON_MINUTES }],
  );

const KEEPING: readonly AttributeName[] = [
  'handling',
  'reflexes',
  'aerialReach',
  'distribution',
  'oneOnOnes',
];
const overall = (player: Player): number => {
  const names = ALL_ATTRIBUTES.filter(
    (name) => player.attributes.goalkeeping !== undefined || !KEEPING.includes(name),
  );
  return names.reduce((sum, name) => sum + attribute(player.attributes, name), 0) / names.length;
};
const at = (player: Player, name: AttributeName): number => attribute(player.attributes, name);

describe('there is no walk here', () => {
  it('draws no random number anywhere in the package', () => {
    // The named failure, refused mechanically. A seeded draw would be defensible elsewhere in this
    // codebase; here it is the thing that would make a rise unexplainable, so there is none at all.
    const files = readdirSync(join(import.meta.dirname, '..', 'src')).filter((f) =>
      f.endsWith('.ts'),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(join(import.meta.dirname, '..', 'src', file), 'utf8');
      expect(/\bMath\s*\.\s*random\b/.test(source), file).toBe(false);
      expect(/\bDate\s*\.\s*now\b/.test(source), file).toBe(false);
      expect(/\bRng\b/.test(source), file).toBe(false);
    }
  });

  it('gives the same answer every time it is asked', () => {
    const once = develop(young, seasons('box_to_box', 4), SEASON_MINUTES);
    const twice = develop(young, seasons('box_to_box', 4), SEASON_MINUTES);
    expect(once).toEqual(twice);
  });

  it('attaches a cause to every change, and the causes add up to the change', () => {
    // A rise the player cannot trace is the number this product refuses to show.
    const grown = develop(young, seasons('ball_winner', 5), SEASON_MINUTES);
    expect(grown.changes.length).toBeGreaterThan(5);
    for (const change of grown.changes) {
      expect(change.because.length, change.attribute).toBeGreaterThan(0);
      const summed = change.because.reduce((total, part) => total + part.amount, 0);
      expect(Math.round(change.from + summed), change.attribute).toBe(change.to);
    }
  });
});

describe('a career is summed, not rounded season by season', () => {
  it('lets a player who improves slowly improve at all', () => {
    // The bug the first measurement found, and it was silent and total: attributes are whole
    // numbers, so rounding each season on its own threw the remainder away every year and a young
    // player who did not play stood still **forever**. Summing his whole career and rounding once
    // cannot lose anything.
    const idle = develop(young, seasons(undefined, 6), SEASON_MINUTES);
    expect(idle.changes.length).toBeGreaterThan(0);
    expect(overall(idle.player)).toBeGreaterThan(overall(young));

    // And the proof that it is the *summing* doing it: one season at a time loses the remainder.
    let stepped = young;
    for (let i = 0; i < 6; i++)
      stepped = develop(stepped, seasons(undefined, 1), SEASON_MINUTES).player;
    expect(overall(stepped)).toBeLessThan(overall(idle.player));
  });

  it('answers "where was he after three seasons" from the same history', () => {
    // Nothing is stored: a prefix of the career is the player at that point, so the difference
    // between two prefixes is what a season did.
    const career = seasons('box_to_box', 6);
    const afterThree = develop(young, career.slice(0, 3), SEASON_MINUTES);
    expect(afterThree.player.age).toBe(young.age + 3);
    expect(overall(afterThree.player)).toBeGreaterThan(overall(young));
    expect(overall(afterThree.player)).toBeLessThan(
      overall(develop(young, career, SEASON_MINUTES).player),
    );
  });
});

describe('the job decides what he becomes', () => {
  const asMidfielder = develop(young, seasons('box_to_box', 6), SEASON_MINUTES).player;
  const asStriker = develop(young, seasons('poacher', 6), SEASON_MINUTES).player;

  it('sharpens what the role is judged on, and leaves the rest to age', () => {
    for (const name of ROLE_DEMANDS.box_to_box) {
      if ((ROLE_DEMANDS.poacher as readonly AttributeName[]).includes(name)) continue;
      expect(at(asMidfielder, name), name).toBeGreaterThan(at(asStriker, name));
    }
    for (const name of ROLE_DEMANDS.poacher) {
      if ((ROLE_DEMANDS.box_to_box as readonly AttributeName[]).includes(name)) continue;
      expect(at(asStriker, name), name).toBeGreaterThan(at(asMidfielder, name));
    }
  });

  it('leaves an attribute both roles read at exactly the same place', () => {
    // `acceleration` is judged in both. If it moved differently the model would be telling a story
    // about midfielders rather than reading `ROLE_DEMANDS`.
    expect(ROLE_DEMANDS.box_to_box).toContain('acceleration');
    expect(ROLE_DEMANDS.poacher).toContain('acceleration');
    expect(at(asMidfielder, 'acceleration')).toBe(at(asStriker, 'acceleration'));
  });

  it('makes him a different player rather than a better one', () => {
    // Two shapes at one level: the role is not a route to a higher rating, it is a choice of what
    // he is good at. A role that simply made players better would be a bonus with a job title.
    expect(Math.abs(overall(asMidfielder) - overall(asStriker))).toBeLessThan(0.5);
  });
});

describe('minutes are the manager’s lever', () => {
  it('develops a regular far more than a man who never got on', () => {
    const regular = develop(young, seasons('box_to_box', 6), SEASON_MINUTES).player;
    const benched = develop(young, seasons(undefined, 6), SEASON_MINUTES).player;
    expect(overall(regular) - overall(young)).toBeGreaterThan(
      2 * (overall(benched) - overall(young)),
    );
  });

  it('gives a half-season half of what a full one gives', () => {
    const half = develop(
      young,
      [[{ role: 'box_to_box', minutes: SEASON_MINUTES / 2 }]],
      SEASON_MINUTES,
    );
    const full = develop(young, seasons('box_to_box', 1), SEASON_MINUTES);
    expect(half.played.share).toBeCloseTo(0.5, 9);
    expect(full.played.share).toBeCloseTo(1, 9);
  });

  it('never lets a season count for more than a season', () => {
    // Three clubs' worth of minutes in one year is a bookkeeping error, not a training regime —
    // and without the cap it would be three seasons of growing up crammed into one, which is the
    // cheapest exploit a development system has.
    const tripled = develop(
      young,
      [[{ role: 'box_to_box', minutes: SEASON_MINUTES * 3 }]],
      SEASON_MINUTES,
    );
    const single = develop(young, seasons('box_to_box', 1), SEASON_MINUTES);
    expect(tripled.player.age).toBe(single.player.age);

    // The ageing half is capped outright: one year of football is one year of growing up, so an
    // attribute no role asks for must land in exactly the same place.
    const untouched = ALL_ATTRIBUTES.filter(
      (name) =>
        ATTRIBUTE_GROUP[name] !== 'goalkeeping' &&
        !(ROLE_DEMANDS.box_to_box as readonly AttributeName[]).includes(name),
    );
    expect(untouched.length).toBeGreaterThan(10);
    for (const name of untouched) {
      expect(at(tripled.player, name), name).toBe(at(single.player, name));
    }
  });
});

describe('ageing is not one curve', () => {
  it('takes a footballer’s legs before his head', () => {
    expect(ageDrift(34, 'physical')).toBeLessThan(ageDrift(34, 'technical'));
    expect(ageDrift(34, 'mental')).toBe(0);
    // And the head never declines at all, at any age, which is why a veteran is worth having.
    for (let age = 16; age <= 45; age++)
      expect(ageDrift(age, 'mental'), String(age)).toBeGreaterThanOrEqual(0);
  });

  it('declines whether he plays or not, and rises only if he does', () => {
    // A manager cannot preserve a thirty-five-year-old by resting him. Football does not have that
    // lever, so neither does this.
    const veteran = squad.reduce((a, b) => (a.age > b.age ? a : b));
    expect(veteran.age).toBeGreaterThan(30);
    const played = develop(veteran, seasons('stopper', 4), SEASON_MINUTES).player;
    const rested = develop(veteran, seasons(undefined, 4), SEASON_MINUTES).player;
    expect(overall(rested)).toBeLessThan(overall(veteran));
    expect(overall(played)).toBeLessThan(overall(veteran));
    expect(overall(rested)).toBeLessThan(overall(played));
  });

  it('gives a man who never plays some of his growing up, but not much of it', () => {
    expect(GROWTH_WITHOUT_FOOTBALL).toBeGreaterThan(0);
    expect(GROWTH_WITHOUT_FOOTBALL).toBeLessThan(0.5);
  });

  it('peaks each group where football says it does', () => {
    expect(AGE_CURVES.physical.peakTo).toBeLessThan(AGE_CURVES.technical.peakTo);
    expect(AGE_CURVES.technical.peakTo).toBeLessThan(AGE_CURVES.goalkeeping.peakTo);
    expect(AGE_CURVES.mental.fall).toBe(0);
  });
});

describe('the scale holds', () => {
  /** The same man with every attribute pinned, so the top and bottom of the scale can be reached. */
  const pinned = (value: number): Player => {
    const flatten = <T extends object>(group: T): T =>
      Object.fromEntries(Object.keys(group).map((key) => [key, value])) as unknown as T;
    return {
      ...young,
      attributes: {
        technical: flatten(young.attributes.technical),
        physical: flatten(young.attributes.physical),
        mental: flatten(young.attributes.mental),
      },
    };
  };

  it('stops at the top of the scale because there is no room left, not because of a clamp', () => {
    // The distinction matters. `headroom` is zero at 99 and the gain is multiplied by it, so a
    // maxed player is already immovable before anything is clamped — which is why fifteen seasons
    // of football move him by nothing rather than by something that then gets trimmed. The clamp
    // stays as a guard against a malformed attribute arriving from content; it is not what holds
    // the ceiling, and a probe that deletes it bites nothing, which is recorded rather than hidden.
    const maxed = develop(pinned(99), seasons('box_to_box', 15), SEASON_MINUTES);
    for (const name of ALL_ATTRIBUTES) {
      if (ATTRIBUTE_GROUP[name] === 'goalkeeping') continue;
      expect(at(maxed.player, name), name).toBeLessThanOrEqual(99);
    }
    // Isolated on the one group that never declines: fifteen seasons of football, six of them at a
    // role that reads `workRate`, and he does not move a point — because there is nowhere to move,
    // not because something caught him on the way past.
    const stuck = maxed.changes.filter((change) => ATTRIBUTE_GROUP[change.attribute] === 'mental');
    expect(stuck).toEqual([]);
    // The legs still go, which is the model working rather than a maxed player being frozen.
    expect(at(maxed.player, 'pace')).toBeLessThan(99);
  });

  it('never pushes a player through the bottom of it', () => {
    const old = { ...pinned(1), age: 40 };
    const faded = develop(old, seasons(undefined, 15), SEASON_MINUTES).player;
    for (const name of ALL_ATTRIBUTES) {
      if (ATTRIBUTE_GROUP[name] === 'goalkeeping') continue;
      expect(at(faded, name), name).toBeGreaterThanOrEqual(1);
    }
  });

  it('develops a keeper’s keeping and gives an outfielder none to develop', () => {
    const keeper = squad.find((player) => player.attributes.goalkeeping !== undefined) as Player;
    const grown = develop(keeper, seasons('shot_stopper', 6), SEASON_MINUTES);
    expect(
      grown.changes.some((change) => ATTRIBUTE_GROUP[change.attribute] === 'goalkeeping'),
    ).toBe(true);

    const outfield = develop(young, seasons('box_to_box', 6), SEASON_MINUTES);
    expect(outfield.player.attributes.goalkeeping).toBeUndefined();
    expect(
      outfield.changes.some((change) => ATTRIBUTE_GROUP[change.attribute] === 'goalkeeping'),
    ).toBe(false);
  });
});

describe('a decade of it, over the real league', () => {
  it('neither inflates the division nor empties it', () => {
    // The check a development system most needs and least often gets. Ten seasons, every club, the
    // eleven playing and the bench not — if everybody improved every year the league would drift
    // upward for no reason anybody chose, which is inflation wearing a progression curve.
    const baselines = league.clubs.map((club) => [...club.squad]);
    const history = baselines.map((squad) => squad.map(() => [] as Appearance[][]));
    const means: number[] = [];

    for (let season = 0; season <= 10; season++) {
      const now = baselines.map((squad, club) =>
        squad.map(
          (player, index) => develop(player, history[club]?.[index] ?? [], SEASON_MINUTES).player,
        ),
      );
      const all = now.flat();
      means.push(all.reduce((sum, player) => sum + overall(player), 0) / all.length);

      now.forEach((squad, club) => {
        const sheet = baselineTactics(squad);
        const minutes = new Map(
          sheet.startingXI.map((s) => [
            String(s.playerId),
            { role: s.role, minutes: SEASON_MINUTES },
          ]),
        );
        squad.forEach((player, index) => {
          const spell = minutes.get(String(player.id));
          history[club]?.[index]?.push(spell === undefined ? [] : [spell]);
        });
      });
    }

    const start = means[0] as number;
    for (const mean of means) {
      expect(
        Math.abs(mean - start),
        `drifted to ${mean.toFixed(2)} from ${start.toFixed(2)}`,
      ).toBeLessThan(1.5);
    }
    // And it is not flat because nothing happened: the young rise and the old fall inside it.
    expect(FULL_SEASON_GAIN).toBeGreaterThan(0);
    expect(means[4]).toBeGreaterThan(start);
    expect(means[10]).toBeLessThan(means[4] as number);
  });
});
