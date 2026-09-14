import {
  createRng,
  type Club,
  type Player,
  type PlayerRole,
  type Position,
  type Rng,
  type Selection,
  type Tactics,
} from '@dakka/engine';

/**
 * A tactical identity for each club, derived from its slug.
 *
 * The harness needs a league where sides play **differently**. If all twenty clubs set up
 * identically, every threshold below becomes a measurement of one fixture repeated three hundred
 * and eighty times, and "every tactic has a context-dependent effect" could not be checked at all.
 *
 * Derived from the slug rather than drawn fresh, so a club plays the same way in every season the
 * harness runs and a regression is attributable to the engine rather than to a different draw.
 * The manager AI proper — picking tactics by opponent and by venue — is a later job; this is the
 * fixed identity it will eventually replace.
 */

const SHAPES: readonly (readonly (readonly [Position, PlayerRole])[])[] = [
  // 4-3-3
  [
    ['GK', 'shot_stopper'],
    ['RB', 'attacking_fullback'],
    ['CB', 'ball_playing_defender'],
    ['CB', 'stopper'],
    ['LB', 'defensive_fullback'],
    ['CDM', 'anchor'],
    ['CM', 'box_to_box'],
    ['CAM', 'advanced_playmaker'],
    ['RW', 'inside_forward'],
    ['ST', 'poacher'],
    ['LW', 'touchline_winger'],
  ],
  // 4-4-2, flatter and more direct
  [
    ['GK', 'shot_stopper'],
    ['RB', 'defensive_fullback'],
    ['CB', 'stopper'],
    ['CB', 'covering_defender'],
    ['LB', 'defensive_fullback'],
    ['RM', 'touchline_winger'],
    ['CM', 'ball_winner'],
    ['CM', 'deep_lying_playmaker'],
    ['LM', 'touchline_winger'],
    ['ST', 'target_man'],
    ['ST', 'poacher'],
  ],
  // 4-2-3-1
  [
    ['GK', 'sweeper_keeper'],
    ['RB', 'attacking_fullback'],
    ['CB', 'ball_playing_defender'],
    ['CB', 'covering_defender'],
    ['LB', 'attacking_fullback'],
    ['CDM', 'anchor'],
    ['CDM', 'deep_lying_playmaker'],
    ['CAM', 'advanced_playmaker'],
    ['RW', 'inside_forward'],
    ['LW', 'inside_forward'],
    ['ST', 'complete_forward'],
  ],
];

const FORMATION_NAMES = ['4-3-3', '4-4-2', '4-2-3-1'] as const;

/** Fitness for the position, then ability. A side should look like a team, not a top-eleven list. */
function pickEleven(club: Club, shape: readonly (readonly [Position, PlayerRole])[]): Selection[] {
  const remaining = new Set(club.squad.map((player) => player.id));
  const byId = new Map(club.squad.map((player) => [player.id, player]));

  const rate = (player: Player, position: Position): number => {
    const { technical, physical, mental } = player.attributes;
    const overall =
      (technical.passing +
        technical.firstTouch +
        physical.pace +
        physical.stamina +
        mental.decisions +
        mental.positioning) /
      6;
    const natural = player.positions.includes(position);
    // Out of position is a real cost, and the engine will punish it through role fit anyway.
    return natural ? overall + 20 : overall;
  };

  return shape.map(([position, role]): Selection => {
    let best: Player | undefined;
    let bestScore = -Infinity;
    for (const id of remaining) {
      const player = byId.get(id);
      if (player === undefined) continue;
      const score = rate(player, position);
      if (score > bestScore) {
        bestScore = score;
        best = player;
      }
    }
    /* c8 ignore next */
    if (best === undefined) throw new Error(`${club.slug} cannot field a ${position}`);
    remaining.delete(best.id);
    return { playerId: best.id, position, role };
  });
}

function pick<T>(rng: Rng, options: readonly [T, ...T[]]): T {
  return rng.pick(options);
}

export function tacticsFor(club: Club): Tactics {
  // Seeded from the slug: the same club plays the same way in every season the harness runs, so a
  // change in the report is a change in the engine.
  const rng = createRng(`tactics ${club.slug}`);
  const shapeIndex = rng.int(0, SHAPES.length - 1);
  const shape = SHAPES[shapeIndex] as readonly (readonly [Position, PlayerRole])[];
  const startingXI = pickEleven(club, shape);
  const bench = club.squad
    .filter((player) => !startingXI.some((s) => s.playerId === player.id))
    .map((player) => player.id);

  const keeper = startingXI[0];
  const striker = startingXI[startingXI.length - 1];
  /* c8 ignore next */
  if (keeper === undefined || striker === undefined) throw new Error('incomplete eleven');

  return {
    formation: FORMATION_NAMES[shapeIndex] ?? '4-3-3',
    startingXI,
    bench,
    captain: keeper.playerId,
    mentality: pick(rng, [
      'ultra_defensive',
      'defensive',
      'balanced',
      'attacking',
      'ultra_attacking',
    ]),
    lineHeight: pick(rng, ['deep', 'normal', 'high', 'very_high']),
    pressingIntensity: pick(rng, ['contain', 'moderate', 'high', 'gegenpress']),
    pressingTrigger: pick(rng, ['own_third', 'middle_third', 'final_third']),
    tempo: pick(rng, ['slow', 'balanced', 'fast']),
    passingDirectness: pick(rng, ['short', 'mixed', 'direct', 'long']),
    width: pick(rng, ['narrow', 'balanced', 'wide']),
    compactness: pick(rng, ['tight', 'balanced', 'loose']),
    setPieceTakers: {
      corners: striker.playerId,
      freeKicks: striker.playerId,
      penalties: striker.playerId,
    },
  };
}
