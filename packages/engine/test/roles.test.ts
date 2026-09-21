import { describe, expect, it } from 'vitest';
import {
  ALL_DECISION_KINDS,
  ROLE_DEMANDS,
  ROLE_FIT_SPREAD,
  YARDSTICK,
  attribute,
  baselineTactics,
  bandCompetence,
  gridTotal,
  indexSquad,
  isKeeperRole,
  roleFit,
  roleRating,
  tacticalPresence,
  yardstickRating,
  type AttributeName,
  type Player,
  type PlayerAttributes,
  type PlayerRole,
  type Position,
  type SideSetup,
} from '../src/index.js';
import { makeClub, makePlayer, makeTactics } from './fixtures.js';

/**
 * Role fit: can this player do this job?
 *
 * The tests that carry this file are the three properties that make it a model instead of a bonus.
 * **Scale-free**, so it can never become a second copy of squad quality — multiply a player by any
 * factor and his fit does not move. **Centred**, so there is no role that makes everybody better.
 * **Two-sided**, so the same instruction helps one player and hurts another, which is
 * `dakka-engine-rules` §4 in one axis.
 *
 * The fixtures elsewhere in this suite give every attribute the same value, which makes role fit
 * exactly 1 for all of them — that is why the rest of the suite did not move when this landed, and
 * why everything here builds players with a *shape* rather than a level.
 */

const ROLES = Object.keys(ROLE_DEMANDS) as readonly PlayerRole[];

const GROUP: Record<AttributeName, keyof PlayerAttributes> = {
  finishing: 'technical',
  longShots: 'technical',
  passing: 'technical',
  vision: 'technical',
  crossing: 'technical',
  dribbling: 'technical',
  firstTouch: 'technical',
  heading: 'technical',
  tackling: 'technical',
  marking: 'technical',
  pace: 'physical',
  acceleration: 'physical',
  strength: 'physical',
  stamina: 'physical',
  agility: 'physical',
  jumping: 'physical',
  positioning: 'mental',
  decisions: 'mental',
  composure: 'mental',
  workRate: 'mental',
  aggression: 'mental',
  anticipation: 'mental',
  teamwork: 'mental',
  leadership: 'mental',
  handling: 'goalkeeping',
  reflexes: 'goalkeeping',
  aerialReach: 'goalkeeping',
  distribution: 'goalkeeping',
  oneOnOnes: 'goalkeeping',
};

/** A player with a *shape*: flat at `base`, with the named attributes moved to `value`. */
function shaped(player: Player, value: number, names: readonly AttributeName[]): Player {
  const attributes = {
    technical: { ...player.attributes.technical },
    physical: { ...player.attributes.physical },
    mental: { ...player.attributes.mental },
    ...(player.attributes.goalkeeping === undefined
      ? {}
      : { goalkeeping: { ...player.attributes.goalkeeping } }),
  } as unknown as Record<string, Record<string, number>>;
  for (const name of names) attributes[GROUP[name]]![name] = value;
  return { ...player, attributes: attributes as unknown as PlayerAttributes };
}

/** The same player, uniformly better or worse. The level moves; the shape does not. */
const scaled = (player: Player, by: number): Player => ({
  ...player,
  attributes: Object.fromEntries(
    Object.entries(player.attributes).map(([group, values]) => [
      group,
      Object.fromEntries(
        Object.entries(values as Record<string, number>).map(([name, value]) => [name, value * by]),
      ),
    ]),
  ) as unknown as PlayerAttributes,
});

describe('the demands table', () => {
  it('judges every role on five distinct attributes', () => {
    // Five each so the means are comparable across roles without a weighting nobody could defend.
    for (const role of ROLES) {
      const names = ROLE_DEMANDS[role];
      expect(names, role).toHaveLength(5);
      expect(new Set(names).size, role).toBe(5);
    }
  });

  it('reads a keeper role off its demands rather than off a second list', () => {
    const keeperRoles = ROLES.filter(isKeeperRole);
    expect([...keeperRoles].sort()).toEqual(['shot_stopper', 'sweeper_keeper']);
  });

  it('builds each yardstick from the union of what its own roles ask for', () => {
    // The centring rests entirely on this. Any other reference — a hand-listed set of "outfield
    // attributes", say — drifts off 1 the first time a role is added, quietly making every squad
    // better or worse for no stated reason.
    for (const role of ROLES) {
      const yard = isKeeperRole(role) ? YARDSTICK.keeper : YARDSTICK.outfield;
      for (const name of ROLE_DEMANDS[role]) expect(yard, `${role}/${name}`).toContain(name);
    }
    const demanded = new Set(ROLES.flatMap((role) => ROLE_DEMANDS[role]));
    expect(new Set([...YARDSTICK.keeper, ...YARDSTICK.outfield])).toEqual(demanded);
  });

  it('reads every attribute from its own name', () => {
    // Twenty-nine names and one switch. A single misrouted case would be invisible almost
    // everywhere — the demands overlap enough that a role would still look roughly right — so it
    // is checked directly, with a different value behind every name.
    const keeper = makePlayer('reader', 'GK', 'shot_stopper', 50);
    const names = Object.keys(GROUP) as readonly AttributeName[];
    const unique = names.reduce<Player>(
      (player, name, index) => shaped(player, 10 + index, [name]),
      keeper,
    );
    names.forEach((name, index) => {
      expect(attribute(unique.attributes, name), name).toBe(10 + index);
    });
  });

  it('never asks an outfield player for a goalkeeping attribute', () => {
    const keeping: readonly AttributeName[] = [
      'handling',
      'reflexes',
      'aerialReach',
      'distribution',
      'oneOnOnes',
    ];
    for (const name of keeping) expect(YARDSTICK.outfield, name).not.toContain(name);
  });
});

describe('what role fit is and is not', () => {
  const anchor = makePlayer('anchor', 'CDM', 'anchor', 50);

  it('is exactly 1 for a player who is the same at everything', () => {
    // The definition, stated as a test: fit is the shape of a profile, and a flat profile has none.
    for (const role of ROLES) {
      if (isKeeperRole(role)) continue;
      expect(roleFit(anchor, role), role).toBeCloseTo(1, 12);
    }
  });

  it('does not move when the same player is made uniformly better', () => {
    // The property that keeps role fit from becoming a second copy of squad quality. Without it
    // every threshold in the harness moves for a reason nobody could point at.
    const good = shaped(anchor, 80, ['tackling', 'marking', 'positioning']);
    const doubled = scaled(good, 1.4);
    for (const role of ROLES) {
      if (isKeeperRole(role)) continue;
      expect(roleFit(doubled, role), role).toBeCloseTo(roleFit(good, role), 12);
    }
  });

  it('is above 1 for the job a player is built for and below 1 for one he is not', () => {
    const destroyer = shaped(anchor, 85, ROLE_DEMANDS.ball_winner);
    expect(roleFit(destroyer, 'ball_winner')).toBeGreaterThan(1);
    expect(roleFit(destroyer, 'advanced_playmaker')).toBeLessThan(1);
  });

  it('cuts both ways when two players swap jobs', () => {
    // `dakka-engine-rules` §4 in one axis: the same instruction has to be able to help and to hurt.
    const destroyer = shaped(anchor, 85, ROLE_DEMANDS.ball_winner);
    const passer = shaped(
      makePlayer('passer', 'CM', 'box_to_box', 50),
      85,
      ROLE_DEMANDS.deep_lying_playmaker,
    );

    const right = roleFit(destroyer, 'ball_winner') + roleFit(passer, 'deep_lying_playmaker');
    const wrong = roleFit(destroyer, 'deep_lying_playmaker') + roleFit(passer, 'ball_winner');
    expect(right).toBeGreaterThan(wrong);
    // And each half of the swap moves the opposite way, which a single total could hide.
    expect(roleFit(destroyer, 'deep_lying_playmaker')).toBeLessThan(
      roleFit(destroyer, 'ball_winner'),
    );
    expect(roleFit(passer, 'ball_winner')).toBeLessThan(roleFit(passer, 'deep_lying_playmaker'));
  });

  it('keeps the whole spread inside what the constant allows', () => {
    // The fit is a ratio of two means of the same attributes, so it is bounded by how far the
    // demanded five can sit from the yardstick — never by a clamp somebody chose.
    const extreme = shaped(anchor, 99, ROLE_DEMANDS.poacher);
    expect(roleRating(extreme, 'poacher')).toBe(99);
    expect(roleFit(extreme, 'poacher')).toBeCloseTo(
      1 - ROLE_FIT_SPREAD + (ROLE_FIT_SPREAD * 99) / yardstickRating(extreme),
      12,
    );
  });

  it('reads a keeper against a keeper', () => {
    const keeper = makePlayer('gk', 'GK', 'shot_stopper', 50);
    const shotStopper = shaped(keeper, 80, ROLE_DEMANDS.shot_stopper);
    expect(roleFit(shotStopper, 'shot_stopper')).toBeGreaterThan(1);
    expect(roleFit(shotStopper, 'sweeper_keeper')).toBeLessThan(1);
    expect(attribute(shotStopper.attributes, 'reflexes')).toBe(80);
  });

  it('does not flatter a keeper for being a poor outfield player', () => {
    // A keeper who cannot finish, cross or dribble is a keeper, not a misfit. Measured against the
    // outfield yardstick his ordinary keeping would read as a gift, and every side in the league
    // would silently carry a better goalkeeper than it has.
    const keeper = makePlayer('gk', 'GK', 'shot_stopper', 50);
    const specialist = shaped(keeper, 20, [
      'finishing',
      'longShots',
      'crossing',
      'dribbling',
      'heading',
      'tackling',
      'marking',
      'passing',
      'vision',
    ]);
    expect(roleFit(specialist, 'shot_stopper')).toBeCloseTo(1, 10);
    expect(roleFit(specialist, 'sweeper_keeper')).toBeCloseTo(1, 10);
  });
});

describe('what it does to the pitch', () => {
  const club = makeClub('home', 55);
  const tactics = makeTactics(club);

  const presenceWith = (players: readonly Player[]): number => {
    const side: SideSetup = { players: indexSquad(players), tactics };
    return gridTotal(tacticalPresence(side));
  };

  it('carries a better-suited player further than a worse-suited one, same attributes', () => {
    // Same eleven, same shape, same fitness — and the same competence in **all three** bands, which
    // is the premise that makes this mean anything. `crossing` and `heading` are read by no band at
    // all, so neither shaping moves a single `bandCompetence`; one of them is something a touchline
    // winger is judged on and the other is not. Without role fit the two grids are identical to the
    // last bit, and this assertion cannot pass by accident.
    const slot = tactics.startingXI.find((s) => s.role === 'touchline_winger');
    expect(slot).toBeDefined();
    const swap = (name: AttributeName): readonly Player[] =>
      club.squad.map((player) =>
        player.id === slot?.playerId ? shaped(player, 85, [name]) : player,
      );

    const suitedMan = swap('crossing').find((p) => p.id === slot?.playerId) as Player;
    const otherMan = swap('heading').find((p) => p.id === slot?.playerId) as Player;
    for (const band of ['defensive', 'middle', 'attacking'] as const) {
      expect(bandCompetence(suitedMan, band), band).toBe(bandCompetence(otherMan, band));
    }
    expect(roleFit(suitedMan, 'touchline_winger')).toBeGreaterThan(
      roleFit(otherMan, 'touchline_winger'),
    );

    expect(presenceWith(swap('crossing'))).toBeGreaterThan(presenceWith(swap('heading')));
  });

  it('leaves a flat squad exactly where it was', () => {
    // The fixtures are flat, so this is the assertion that the rest of the suite did not move.
    const side: SideSetup = { players: indexSquad(club.squad), tactics };
    for (const selection of tactics.startingXI) {
      const player = club.squad.find((p) => p.id === selection.playerId) as Player;
      expect(roleFit(player, selection.role), selection.role).toBeCloseTo(1, 12);
    }
    expect(gridTotal(tacticalPresence(side))).toBeGreaterThan(0);
  });
});

describe('the baseline manager picks for the job', () => {
  /**
   * Three midfielders, two of them identical in the band and different only in the job.
   *
   * The equality is the point. `bandCompetence` reads passing, vision, decisions, work rate,
   * teamwork and stamina; both candidates hold all six at 50, so a selector that read only the band
   * would find them tied and keep the first one it met. Their other four raised attributes are
   * disjoint — one set is what a ball-winner is judged on, the other is not in the band or the role
   * — so the yardsticks match too and the *only* thing that can separate them is fit.
   */
  const IN_BAND: readonly AttributeName[] = [
    'passing',
    'vision',
    'decisions',
    'workRate',
    'teamwork',
    'stamina',
  ];

  const midfielders = (): readonly Player[] => {
    const base = (slug: string, band: number): Player =>
      shaped(makePlayer(slug, 'CM', 'box_to_box', 50), band, IN_BAND);

    // Raised on four attributes a ball-winner is judged on and the band never reads.
    const winner = shaped(base('winner', 50), 85, [
      'tackling',
      'aggression',
      'anticipation',
      'strength',
    ]);
    // Raised on four the band never reads either, and no midfield role asks for.
    const other = shaped(base('other', 50), 85, ['finishing', 'longShots', 'crossing', 'heading']);

    const elsewhere: readonly (readonly [string, Position])[] = [
      ['gk', 'GK'],
      ['rb', 'RB'],
      ['cb1', 'CB'],
      ['cb2', 'CB'],
      ['lb', 'LB'],
      ['rm', 'RM'],
      ['lm', 'LM'],
      ['st1', 'ST'],
      ['st2', 'ST'],
    ];
    return [
      ...elsewhere.map(([slug, position]) => makePlayer(slug, position, 'box_to_box', 50)),
      makePlayer('runner', 'CM', 'box_to_box', 70),
      other,
      winner,
    ];
  };

  it('separates two midfielders the band cannot tell apart', () => {
    const squad = midfielders();
    const winner = squad.find((p) => p.slug === 'winner') as Player;
    const other = squad.find((p) => p.slug === 'other') as Player;
    // The premise, asserted rather than assumed: the band genuinely cannot choose between them,
    // and `other` is the one a selector that ignored fit would keep, because it comes first.
    expect(bandCompetence(winner, 'middle')).toBeCloseTo(bandCompetence(other, 'middle'), 12);
    expect(squad.indexOf(other)).toBeLessThan(squad.indexOf(winner));
    expect(roleFit(winner, 'ball_winner')).toBeGreaterThan(roleFit(other, 'ball_winner'));

    const sheet = baselineTactics(squad);
    const slot = sheet.startingXI.find((s) => s.role === 'ball_winner');
    expect(slot?.playerId).toBe(winner.id);
  });

  it('leaves the decision kinds alone — a role change is still one of them', () => {
    expect(ALL_DECISION_KINDS).toContain('role_change');
  });
});
