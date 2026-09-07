import type { Named, PlayerId } from './ids.js';

/** Where a player is fielded. Role is a separate axis — see `PlayerRole`. */
export type Position =
  | 'GK'
  | 'RB'
  | 'LB'
  | 'CB'
  | 'RWB'
  | 'LWB'
  | 'CDM'
  | 'CM'
  | 'CAM'
  | 'RM'
  | 'LM'
  | 'RW'
  | 'LW'
  | 'ST'
  | 'CF';

/**
 * What a player is asked to *do* in that position.
 *
 * This axis is why a twenty-attribute model beats a four-attribute one: two centre-backs with
 * identical ratings behave differently as a `ball_playing_defender` and a `stopper`, and the
 * matchup resolver reads the role, not just the rating.
 */
export type PlayerRole =
  | 'sweeper_keeper'
  | 'shot_stopper'
  | 'ball_playing_defender'
  | 'stopper'
  | 'covering_defender'
  | 'attacking_fullback'
  | 'inverted_fullback'
  | 'defensive_fullback'
  | 'anchor'
  | 'deep_lying_playmaker'
  | 'box_to_box'
  | 'ball_winner'
  | 'advanced_playmaker'
  | 'shadow_striker'
  | 'inside_forward'
  | 'touchline_winger'
  | 'target_man'
  | 'poacher'
  | 'false_nine'
  | 'complete_forward';

/** Attributes are 1–99. Higher is better, always. */
export type Rating = number;

export interface TechnicalAttributes {
  readonly finishing: Rating;
  readonly longShots: Rating;
  readonly passing: Rating;
  readonly vision: Rating;
  readonly crossing: Rating;
  readonly dribbling: Rating;
  readonly firstTouch: Rating;
  readonly heading: Rating;
  readonly tackling: Rating;
  readonly marking: Rating;
}

export interface PhysicalAttributes {
  readonly pace: Rating;
  readonly acceleration: Rating;
  readonly strength: Rating;
  readonly stamina: Rating;
  readonly agility: Rating;
  readonly jumping: Rating;
}

export interface MentalAttributes {
  readonly positioning: Rating;
  readonly decisions: Rating;
  readonly composure: Rating;
  readonly workRate: Rating;
  readonly aggression: Rating;
  readonly anticipation: Rating;
  readonly teamwork: Rating;
  readonly leadership: Rating;
}

/** Present only for goalkeepers. */
export interface GoalkeepingAttributes {
  readonly handling: Rating;
  readonly reflexes: Rating;
  readonly aerialReach: Rating;
  readonly distribution: Rating;
  readonly oneOnOnes: Rating;
}

export interface PlayerAttributes {
  readonly technical: TechnicalAttributes;
  readonly physical: PhysicalAttributes;
  readonly mental: MentalAttributes;
  readonly goalkeeping?: GoalkeepingAttributes;
}

/**
 * Condition carried into a match. These change between matches, never inside this object —
 * the engine returns updated condition in its result rather than mutating its input.
 */
export interface PlayerCondition {
  /** 0–100. Below ~65 the player's physical attributes degrade materially. */
  readonly fitness: number;
  /** 0–100. Affects composure and decisions under pressure. */
  readonly morale: number;
  /** 0–100. Recent-form modifier, distinct from underlying ability. */
  readonly form: number;
}

export interface Player extends Named {
  readonly id: PlayerId;
  readonly clubId: string;
  readonly age: number;
  readonly nationality: string;
  /** Positions the player covers without penalty. First entry is the natural one. */
  readonly positions: readonly [Position, ...Position[]];
  readonly preferredRoles: readonly PlayerRole[];
  readonly attributes: PlayerAttributes;
  readonly condition: PlayerCondition;
  /** Street nickname, e.g. "الأخطبوط". Flavour, never a game input. */
  readonly nickname?: string;
}
