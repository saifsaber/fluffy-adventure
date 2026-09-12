import {
  clubId,
  competitionId,
  indexSquad,
  matchId,
  playerId,
  type Club,
  type MatchInput,
  type MentalAttributes,
  type PhysicalAttributes,
  type Player,
  type PlayerAttributes,
  type Position,
  type PlayerRole,
  type SideSetup,
  type Tactics,
  type TechnicalAttributes,
} from '../src/index.js';

/**
 * A minimal but complete match, built by hand.
 *
 * This exists to answer a question a compiler cannot: are these types actually usable? If
 * constructing one valid match is painful here, it will be worse in the seeder, the API and the
 * client — and the right time to find that out is now, before anything depends on them.
 */

const flat = (value: number): PlayerAttributes => ({
  technical: {
    finishing: value,
    longShots: value,
    passing: value,
    vision: value,
    crossing: value,
    dribbling: value,
    firstTouch: value,
    heading: value,
    tackling: value,
    marking: value,
  },
  physical: {
    pace: value,
    acceleration: value,
    strength: value,
    stamina: value,
    agility: value,
    jumping: value,
  },
  mental: {
    positioning: value,
    decisions: value,
    composure: value,
    workRate: value,
    aggression: value,
    anticipation: value,
    teamwork: value,
    leadership: value,
  },
});

const keeperAttributes = (value: number): PlayerAttributes => ({
  ...flat(value),
  goalkeeping: {
    handling: value,
    reflexes: value,
    aerialReach: value,
    distribution: value,
    oneOnOnes: value,
  },
});

export function makePlayer(
  slug: string,
  position: Position,
  role: PlayerRole,
  overall: number,
): Player {
  return {
    id: playerId(slug),
    clubId: 'club',
    name: slug,
    shortName: slug,
    slug,
    age: 25,
    nationality: 'EGY',
    positions: [position],
    preferredRoles: [role],
    attributes: position === 'GK' ? keeperAttributes(overall) : flat(overall),
    condition: { fitness: 100, morale: 75, form: 70 },
  };
}

const SHAPE_433: readonly (readonly [Position, PlayerRole])[] = [
  ['GK', 'shot_stopper'],
  ['RB', 'defensive_fullback'],
  ['CB', 'ball_playing_defender'],
  ['CB', 'stopper'],
  ['LB', 'attacking_fullback'],
  ['CDM', 'anchor'],
  ['CM', 'box_to_box'],
  ['CAM', 'advanced_playmaker'],
  ['RW', 'inside_forward'],
  ['ST', 'poacher'],
  ['LW', 'touchline_winger'],
];

export function makeClub(slug: string, overall: number): Club {
  const squad = SHAPE_433.map(([position, role], index) =>
    makePlayer(`${slug}-${index}`, position, role, overall),
  );
  return {
    id: clubId(slug),
    name: slug,
    shortName: slug,
    slug,
    country: 'EGY',
    region: 'Giza',
    stadium: {
      name: `${slug} stadium`,
      shortName: slug,
      slug: `${slug}-stadium`,
      capacity: 1200,
      pitchQuality: 55,
    },
    squad,
    reputation: overall,
  };
}

export function makeTactics(club: Club): Tactics {
  const startingXI = club.squad.map((player, index) => {
    const shape = SHAPE_433[index];
    /* c8 ignore next */
    if (shape === undefined) throw new Error('squad and shape lengths must match');
    return { playerId: player.id, position: shape[0], role: shape[1] };
  });
  const keeper = club.squad[0];
  const striker = club.squad[9];
  /* c8 ignore next */
  if (keeper === undefined || striker === undefined) throw new Error('incomplete squad');
  return {
    formation: '4-3-3',
    startingXI,
    bench: [],
    captain: keeper.id,
    mentality: 'balanced',
    lineHeight: 'normal',
    pressingIntensity: 'moderate',
    pressingTrigger: 'middle_third',
    tempo: 'balanced',
    passingDirectness: 'mixed',
    width: 'balanced',
    compactness: 'balanced',
    setPieceTakers: { corners: striker.id, freeKicks: striker.id, penalties: striker.id },
  };
}

export function makeMatchInput(seed = 'test-seed'): MatchInput {
  const home = makeClub('home', 60);
  const away = makeClub('away', 58);
  return {
    id: matchId('m1'),
    seed,
    home: { club: home, tactics: makeTactics(home), decisions: [] },
    away: { club: away, tactics: makeTactics(away), decisions: [] },
    context: {
      competitionId: competitionId('eg-d4'),
      awayTravelKm: 120,
      attendance: 900,
      isDerby: false,
    },
  };
}

/**
 * Attribute overrides for a fixture player.
 *
 * The flat squads above answer "do the types work". These answer the question 3c actually turns on:
 * what happens when the *same* shape is filled with different footballers. A test that cannot make
 * one side quick and another side composed cannot demonstrate a context-dependent tactic.
 */
export interface AttributePatch {
  readonly technical?: Partial<TechnicalAttributes>;
  readonly physical?: Partial<PhysicalAttributes>;
  readonly mental?: Partial<MentalAttributes>;
  readonly fitness?: number;
}

export function patchPlayer(player: Player, patch: AttributePatch): Player {
  const { technical, physical, mental, goalkeeping } = player.attributes;
  return {
    ...player,
    attributes: {
      technical: { ...technical, ...patch.technical },
      physical: { ...physical, ...patch.physical },
      mental: { ...mental, ...patch.mental },
      ...(goalkeeping === undefined ? {} : { goalkeeping }),
    },
    condition:
      patch.fitness === undefined
        ? player.condition
        : { ...player.condition, fitness: patch.fitness },
  };
}

/** Applies a patch to every player fielded in one of the given positions. */
export function patchClub(club: Club, byPosition: Partial<Record<Position, AttributePatch>>): Club {
  return {
    ...club,
    squad: club.squad.map((player) => {
      const natural = player.positions[0];
      const patch = byPosition[natural];
      return patch === undefined ? player : patchPlayer(player, patch);
    }),
  };
}

/** Replaces the role assigned to every player fielded in one of the given positions. */
export function withRoles(
  tactics: Tactics,
  byPosition: Partial<Record<Position, PlayerRole>>,
): Tactics {
  return {
    ...tactics,
    startingXI: tactics.startingXI.map((selection) => {
      const role = byPosition[selection.position];
      return role === undefined ? selection : { ...selection, role };
    }),
  };
}

/** A club plus a shape, in the form the matchup resolver takes. */
export function makeSide(club: Club, overrides: Partial<Tactics> = {}): SideSetup {
  return {
    tactics: { ...makeTactics(club), ...overrides },
    players: indexSquad(club.squad),
  };
}
