import { playerId, type MatchTrace, type Player, type PlayerId } from '@dakka/engine';

/**
 * Hand-built rather than simulated.
 *
 * These tests are about the boundary, not about football, and a trace produced by `simulate` would
 * make them fail whenever the engine's balance moved — which is a different thing going wrong.
 */

export const pid = (slug: string): PlayerId => playerId(slug);

export const trace: MatchTrace = {
  swings: [
    {
      minute: 23,
      cause: 'HIGH_LINE_VS_PACE',
      deltaWinProbability: -0.14,
      actors: [pid('a'), pid('b')],
      favoured: 'away',
    },
    {
      minute: 61,
      cause: 'CLINICAL_FINISHING',
      deltaWinProbability: 0.31,
      actors: [pid('c')],
      favoured: 'home',
    },
  ],
  winProbabilityTimeline: Array.from({ length: 91 }, (_, i) => (i === 90 ? 1 : 0.42)),
};

export function player(slug: string, morale: number): Player {
  return {
    id: pid(slug),
    clubId: 'club',
    name: slug,
    shortName: slug,
    slug,
    age: 25,
    nationality: 'EGY',
    positions: ['CM'],
    preferredRoles: ['box_to_box'],
    traits: [],
    attributes: {
      technical: {
        finishing: 50,
        longShots: 50,
        passing: 50,
        vision: 50,
        crossing: 50,
        dribbling: 50,
        firstTouch: 50,
        heading: 50,
        tackling: 50,
        marking: 50,
      },
      physical: {
        pace: 50,
        acceleration: 50,
        strength: 50,
        stamina: 50,
        agility: 50,
        jumping: 50,
      },
      mental: {
        positioning: 50,
        decisions: 50,
        composure: 50,
        workRate: 50,
        aggression: 50,
        anticipation: 50,
        teamwork: 50,
        leadership: 50,
      },
    },
    condition: { fitness: 100, morale, form: 70 },
  };
}
