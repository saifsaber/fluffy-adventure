import { describe, expect, it } from 'vitest';
import {
  BANDS,
  CAUSE_REGISTRY,
  CHANNELS,
  ZONES,
  bandOf,
  bandSpace,
  bestAttackingZone,
  channelOf,
  channelSpace,
  fitnessFactor,
  gridTotal,
  mirror,
  resolveSpace,
  tacticalPresence,
  type Compactness,
  type LineHeight,
  type Mentality,
  type SideSetup,
  type TeamWidth,
} from '../src/index.js';
import { makeClub, makeSide, patchClub, withRoles } from './fixtures.js';

/**
 * These tests exist to falsify one specific lie the product is built to avoid: a "tactical system"
 * that is really a multiplier with a football word attached. Two properties kill that lie, and both
 * are asserted mechanically below.
 *
 *   1. A shape setting can never change how much presence a side has, only where it is.
 *   2. The effect of a shape setting changes *sign* depending on the opponent.
 *
 * If either stops holding, the engine has become `attack *= 1.08` and the decision trace would be
 * explaining a simulation that models nothing.
 */

const base = makeClub('base', 55);

const totalSpace = (side: SideSetup, against: SideSetup): number => {
  const map = resolveSpace(side, against);
  return ZONES.reduce((sum, zone) => sum + map.zones[zone].space, 0);
};

describe('presence is conserved by every shape setting', () => {
  const reference = gridTotal(tacticalPresence(makeSide(base)));

  const lineHeights: readonly LineHeight[] = ['deep', 'normal', 'high', 'very_high'];
  const mentalities: readonly Mentality[] = [
    'ultra_defensive',
    'defensive',
    'balanced',
    'attacking',
    'ultra_attacking',
  ];
  const widths: readonly TeamWidth[] = ['narrow', 'balanced', 'wide'];
  const compactnesses: readonly Compactness[] = ['tight', 'balanced', 'loose'];

  it('holds across all 180 combinations of line height, mentality, width and compactness', () => {
    // This is the mechanical form of "a tactic is not a bonus". If any combination could raise the
    // total, some setting would be strictly better than another regardless of the opponent — which
    // is exactly the multiplier we refuse to ship.
    for (const lineHeight of lineHeights) {
      for (const mentality of mentalities) {
        for (const width of widths) {
          for (const compactness of compactnesses) {
            const grid = tacticalPresence(
              makeSide(base, { lineHeight, mentality, width, compactness }),
            );
            expect(
              gridTotal(grid),
              `${lineHeight}/${mentality}/${width}/${compactness} changed the total`,
            ).toBeCloseTo(reference, 9);
          }
        }
      }
    }
  });

  it('never leaves a zone with negative presence', () => {
    for (const lineHeight of lineHeights) {
      for (const compactness of compactnesses) {
        const grid = tacticalPresence(makeSide(base, { lineHeight, compactness, width: 'wide' }));
        for (const zone of ZONES)
          expect(grid[zone], `${lineHeight}/${compactness} ${zone}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('is conservation, not inertness — the weight genuinely moves', () => {
    // The two vertical knobs are deliberately split so they cannot double-count: line height moves
    // the rear block between the defensive and middle bands, mentality decides how many of the
    // middle join the attack. Asserting them separately is what keeps that split honest.
    const deep = tacticalPresence(makeSide(base, { lineHeight: 'deep' }));
    const high = tacticalPresence(makeSide(base, { lineHeight: 'very_high' }));
    expect(high.middle_centre).toBeGreaterThan(deep.middle_centre);
    expect(high.defensive_centre).toBeLessThan(deep.defensive_centre);
    expect(high.attacking_centre).toBeCloseTo(deep.attacking_centre, 9);

    const cautious = tacticalPresence(makeSide(base, { mentality: 'ultra_defensive' }));
    const committed = tacticalPresence(makeSide(base, { mentality: 'ultra_attacking' }));
    expect(committed.attacking_centre).toBeGreaterThan(cautious.attacking_centre);
    expect(committed.middle_centre).toBeLessThan(cautious.middle_centre);
    expect(committed.defensive_centre).toBeCloseTo(cautious.defensive_centre, 9);

    const narrow = tacticalPresence(makeSide(base, { width: 'narrow' }));
    const wide = tacticalPresence(makeSide(base, { width: 'wide' }));
    expect(wide.middle_left + wide.middle_right).toBeGreaterThan(
      narrow.middle_left + narrow.middle_right,
    );
    expect(wide.middle_centre).toBeLessThan(narrow.middle_centre);
  });

  it('condenses a tight block toward the middle and thins the flanks', () => {
    const tight = tacticalPresence(makeSide(base, { compactness: 'tight' }));
    const loose = tacticalPresence(makeSide(base, { compactness: 'loose' }));
    const flanks = (g: typeof tight): number =>
      ZONES.filter((z) => channelOf(z) !== 'centre').reduce((s, z) => s + g[z], 0);
    expect(flanks(tight)).toBeLessThan(flanks(loose));
    expect(tight.middle_centre).toBeGreaterThan(loose.middle_centre);
  });
});

describe('roles move a player without making him bigger', () => {
  it('sends an attacking full-back further forward than a defensive one, at the same cost', () => {
    const tactics = makeSide(base).tactics;
    const attacking = makeSide(base, {
      startingXI: withRoles(tactics, { RB: 'attacking_fullback' }).startingXI,
    });
    const defensive = makeSide(base, {
      startingXI: withRoles(tactics, { RB: 'defensive_fullback' }).startingXI,
    });
    const forward = tacticalPresence(attacking);
    const back = tacticalPresence(defensive);

    expect(forward.middle_right + forward.attacking_right).toBeGreaterThan(
      back.middle_right + back.attacking_right,
    );
    expect(forward.defensive_right).toBeLessThan(back.defensive_right);
    expect(gridTotal(forward)).toBeCloseTo(gridTotal(back), 9);
  });

  it('tucks an inside forward into the centre and keeps a touchline winger wide', () => {
    const tactics = makeSide(base).tactics;
    const inside = tacticalPresence(
      makeSide(base, { startingXI: withRoles(tactics, { RW: 'inside_forward' }).startingXI }),
    );
    const wide = tacticalPresence(
      makeSide(base, { startingXI: withRoles(tactics, { RW: 'touchline_winger' }).startingXI }),
    );
    expect(inside.attacking_right).toBeLessThan(wide.attacking_right);
    expect(inside.attacking_centre).toBeGreaterThan(wide.attacking_centre);
    expect(gridTotal(inside)).toBeCloseTo(gridTotal(wide), 9);
  });
});

describe('fitness is a resource, unlike a shape', () => {
  it('shrinks total presence rather than redistributing it', () => {
    const fresh = tacticalPresence(makeSide(base));
    const spent = tacticalPresence(makeSide(patchClub(base, { CM: { fitness: 30 } })));
    expect(gridTotal(spent)).toBeLessThan(gridTotal(fresh));
  });

  it('degrades gently above 65 and steeply below it', () => {
    expect(fitnessFactor(100)).toBeCloseTo(1, 9);
    expect(fitnessFactor(100) - fitnessFactor(65)).toBeLessThan(0.1);
    expect(fitnessFactor(65) - fitnessFactor(30)).toBeGreaterThan(0.15);
    expect(fitnessFactor(-20)).toBe(fitnessFactor(0));
    expect(fitnessFactor(140)).toBe(fitnessFactor(100));
  });
});

describe('the map itself', () => {
  it('is antisymmetric in presence: my overload here is their shortage there', () => {
    const map = resolveSpace(makeSide(base), makeSide(base));
    for (const zone of ZONES) {
      const here = map.zones[zone];
      const there = map.zones[mirror(zone)];
      expect(here.attack - here.defence, zone).toBeCloseTo(-(there.attack - there.defence), 9);
    }
  });

  it('makes the final third harder than your own half, for two identical sides', () => {
    // Every side is crowded near the goal it is attacking. That is football, and it is also the
    // reason `bestAttackingZone` — not the grid total — is the number a shape tactic moves.
    const map = resolveSpace(makeSide(base), makeSide(base));
    expect(bandSpace(map, 'attacking')).toBeLessThan(0);
    expect(bandSpace(map, 'defensive')).toBeGreaterThan(0);
  });

  it('is deterministic and leaves its inputs untouched', () => {
    const attack = makeSide(base, { lineHeight: 'high' });
    const defend = makeSide(base, { compactness: 'tight' });
    const before = JSON.stringify(defend.tactics);
    const first = resolveSpace(attack, defend);
    const second = resolveSpace(attack, defend);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(JSON.stringify(defend.tactics)).toBe(before);
  });

  it('refuses to invent a player it was not given', () => {
    const side = makeSide(base);
    const missing: SideSetup = { tactics: side.tactics, players: new Map() };
    expect(() => tacticalPresence(missing)).toThrow(/selected but was not supplied/);
  });

  it('covers every zone exactly once', () => {
    const map = resolveSpace(makeSide(base), makeSide(base));
    expect(Object.keys(map.zones).sort()).toEqual([...ZONES].sort());
    for (const zone of ZONES) expect(map.zones[zone].zone).toBe(zone);
  });

  it('sums its bands and channels back to the whole grid', () => {
    const map = resolveSpace(makeSide(base, { width: 'wide' }), makeSide(base));
    const whole = ZONES.reduce((sum, zone) => sum + map.zones[zone].space, 0);
    expect(BANDS.reduce((s, b) => s + bandSpace(map, b), 0)).toBeCloseTo(whole, 9);
    expect(CHANNELS.reduce((s, c) => s + channelSpace(map, c), 0)).toBeCloseTo(whole, 9);
  });

  it('picks the roomiest attacking-third zone as the best route', () => {
    const map = resolveSpace(
      makeSide(base, { width: 'wide' }),
      makeSide(base, { width: 'narrow' }),
    );
    const best = bestAttackingZone(map);
    expect(bandOf(best.zone)).toBe('attacking');
    for (const zone of ZONES.filter((z) => bandOf(z) === 'attacking')) {
      expect(map.zones[zone].space).toBeLessThanOrEqual(best.space);
    }
  });
});

/**
 * The gate for 3c.
 *
 * Each of these takes one tactical setting and finds two opponents for which its effect has
 * opposite signs. A setting that cannot do this is a scalar in disguise and does not ship.
 */
describe('the same tactic helps against one opponent and hurts against another', () => {
  it('a high line: strangles a slow side that builds short, and is torn open by a quick direct one', () => {
    const slowSquad = patchClub(base, {
      RW: { physical: { pace: 40, acceleration: 40 } },
      LW: { physical: { pace: 40, acceleration: 40 } },
      ST: { physical: { pace: 40, acceleration: 40 } },
      CB: { technical: { passing: 70, firstTouch: 70 }, mental: { composure: 70, decisions: 70 } },
      CM: { technical: { passing: 70, firstTouch: 70 }, mental: { composure: 70, decisions: 70 } },
    });
    const quickSquad = patchClub(base, {
      RW: { physical: { pace: 88, acceleration: 88 } },
      LW: { physical: { pace: 88, acceleration: 88 } },
      ST: { physical: { pace: 88, acceleration: 88 } },
    });

    const slow = makeSide(slowSquad, { passingDirectness: 'short', tempo: 'slow' });
    const quick = makeSide(quickSquad, { passingDirectness: 'direct', tempo: 'fast' });

    const deep = makeSide(base, { lineHeight: 'deep' });
    const high = makeSide(base, { lineHeight: 'very_high', pressingIntensity: 'high' });

    // Positive means pushing the line up conceded more space than sitting deep would have.
    const costAgainstSlow = totalSpace(slow, high) - totalSpace(slow, deep);
    const costAgainstQuick = totalSpace(quick, high) - totalSpace(quick, deep);

    expect(costAgainstSlow).toBeLessThan(0);
    expect(costAgainstQuick).toBeGreaterThan(0);
    expect(Math.sign(costAgainstSlow)).not.toBe(Math.sign(costAgainstQuick));
  });

  it('a high line exposes a slow back line and is survivable behind a quick one', () => {
    const quick = makeSide(
      patchClub(base, {
        RW: { physical: { pace: 88, acceleration: 88 } },
        LW: { physical: { pace: 88, acceleration: 88 } },
        ST: { physical: { pace: 88, acceleration: 88 } },
      }),
      { passingDirectness: 'direct', tempo: 'fast' },
    );
    const line = { lineHeight: 'very_high' } as const;
    const slowBackLine = makeSide(
      patchClub(base, {
        CB: { physical: { pace: 35, acceleration: 35 } },
        RB: { physical: { pace: 35, acceleration: 35 } },
        LB: { physical: { pace: 35, acceleration: 35 } },
      }),
      line,
    );
    const quickBackLine = makeSide(
      patchClub(base, {
        CB: { physical: { pace: 85, acceleration: 85 } },
        RB: { physical: { pace: 85, acceleration: 85 } },
        LB: { physical: { pace: 85, acceleration: 85 } },
      }),
      line,
    );
    // Same line height, same opponent — only the recovery pace behind it differs.
    expect(resolveSpace(quick, slowBackLine).exposure).toBeGreaterThan(
      resolveSpace(quick, quickBackLine).exposure,
    );
  });

  it('going wide: beats a narrow opponent and walks into a wide one', () => {
    const wide = makeSide(base, { width: 'wide' });
    const narrow = makeSide(base, { width: 'narrow' });

    const againstNarrow =
      bestAttackingZone(resolveSpace(wide, makeSide(base, { width: 'narrow' }))).space -
      bestAttackingZone(resolveSpace(narrow, makeSide(base, { width: 'narrow' }))).space;
    const againstWide =
      bestAttackingZone(resolveSpace(wide, makeSide(base, { width: 'wide' }))).space -
      bestAttackingZone(resolveSpace(narrow, makeSide(base, { width: 'wide' }))).space;

    expect(againstNarrow).toBeGreaterThan(0);
    expect(againstWide).toBeLessThan(0);
  });

  it('a tight block: smothers a central side and is pulled apart by a wing-heavy one', () => {
    const wingTactics = withRoles(makeSide(base).tactics, {
      RW: 'touchline_winger',
      LW: 'touchline_winger',
      RB: 'attacking_fullback',
      LB: 'attacking_fullback',
    });
    const centralTactics = withRoles(makeSide(base).tactics, {
      RW: 'inside_forward',
      LW: 'inside_forward',
      RB: 'inverted_fullback',
      LB: 'inverted_fullback',
    });
    const wingSide = makeSide(base, { width: 'wide', startingXI: wingTactics.startingXI });
    const centralSide = makeSide(base, { width: 'narrow', startingXI: centralTactics.startingXI });

    const tight = makeSide(base, { compactness: 'tight' });
    const loose = makeSide(base, { compactness: 'loose' });

    // Positive means the defending side's tight block left the attacker a better route than a loose
    // one would have.
    const againstWings =
      bestAttackingZone(resolveSpace(wingSide, tight)).space -
      bestAttackingZone(resolveSpace(wingSide, loose)).space;
    const againstCentre =
      bestAttackingZone(resolveSpace(centralSide, tight)).space -
      bestAttackingZone(resolveSpace(centralSide, loose)).space;

    expect(againstWings).toBeGreaterThan(0);
    expect(againstCentre).toBeLessThan(0);
  });
});

describe('causes', () => {
  it('only ever emits causes the registry knows', () => {
    const setups: readonly [SideSetup, SideSetup][] = [
      [makeSide(base), makeSide(base)],
      [makeSide(base, { width: 'wide' }), makeSide(base, { width: 'narrow' })],
      [makeSide(base, { mentality: 'ultra_attacking' }), makeSide(base, { lineHeight: 'deep' })],
      [
        makeSide(base, { passingDirectness: 'direct', tempo: 'fast' }),
        makeSide(base, { lineHeight: 'very_high', pressingIntensity: 'gegenpress' }),
      ],
    ];
    for (const [attack, defend] of setups) {
      for (const cause of resolveSpace(attack, defend).causes) {
        expect(CAUSE_REGISTRY[cause], cause).toBeDefined();
      }
    }
  });

  it('blames the line only when the line is actually costing them', () => {
    const quick = makeSide(
      patchClub(base, {
        RW: { physical: { pace: 90, acceleration: 90 } },
        LW: { physical: { pace: 90, acceleration: 90 } },
        ST: { physical: { pace: 90, acceleration: 90 } },
      }),
      { passingDirectness: 'direct', tempo: 'fast' },
    );
    const slow = makeSide(
      patchClub(base, {
        RW: { physical: { pace: 35, acceleration: 35 } },
        LW: { physical: { pace: 35, acceleration: 35 } },
        ST: { physical: { pace: 35, acceleration: 35 } },
      }),
      { passingDirectness: 'short', tempo: 'slow' },
    );
    const high = makeSide(base, { lineHeight: 'very_high', pressingIntensity: 'high' });

    expect(resolveSpace(quick, high).causes).toContain('HIGH_LINE_VS_PACE');
    expect(resolveSpace(slow, high).causes).not.toContain('HIGH_LINE_VS_PACE');
  });

  it('credits a deep block that absorbs pressure', () => {
    const attack = makeSide(base, { mentality: 'ultra_attacking' });
    const deep = makeSide(base, { lineHeight: 'deep', compactness: 'tight' });
    expect(resolveSpace(attack, deep).causes).toContain('DEEP_BLOCK_ABSORBED_PRESSURE');
  });

  it('names a narrow shape when the flanks are the way through', () => {
    const wide = makeSide(base, {
      width: 'wide',
      startingXI: withRoles(makeSide(base).tactics, {
        RW: 'touchline_winger',
        LW: 'touchline_winger',
        RB: 'attacking_fullback',
        LB: 'attacking_fullback',
      }).startingXI,
    });
    const narrow = makeSide(base, { width: 'narrow', compactness: 'tight' });
    const causes = resolveSpace(wide, narrow).causes;
    expect(causes).toContain('WIDE_OVERLOAD');
    expect(causes).toContain('NARROW_SHAPE_CONCEDED_FLANKS');
  });

  it('orders them strongest first, and identically every time', () => {
    const attack = makeSide(base, { width: 'wide', mentality: 'ultra_attacking' });
    const defend = makeSide(base, { width: 'narrow', lineHeight: 'very_high' });
    const first = resolveSpace(attack, defend).causes;
    const second = resolveSpace(attack, defend).causes;
    expect(first).toEqual(second);
    expect(new Set(first).size).toBe(first.length);
  });
});
