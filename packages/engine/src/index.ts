/**
 * @dakka/engine — the causal match simulation.
 *
 * Purity is the contract: no I/O, no clock, no globals, no unseeded randomness. Every source of
 * chance flows through an injected seeded PRNG so that
 *   simulate(seed, input) === simulate(seed, input)
 * holds byte for byte. Determinism is what buys counterfactual replay, a fair daily challenge,
 * honest PvP, and reproducible bug reports — they all break together.
 */

export const ENGINE_VERSION = '0.0.0';

export { createRng } from './rng.js';
export type { Rng } from './rng.js';

export {
  BANDS,
  CHANNELS,
  CONTEST_WEIGHT,
  FOOTPRINTS,
  ZONES,
  bandOf,
  channelOf,
  mirror,
  zoneOccupancy,
  zoneOf,
  zoneStrength,
} from './zones.js';
export type { Band, Channel, Zone, ZoneFootprint, ZonePresence } from './zones.js';

export {
  bandCompetence,
  bandSpace,
  bestAttackingZone,
  channelSpace,
  fitnessFactor,
  gridTotal,
  indexSquad,
  resolveSpace,
  tacticalPresence,
} from './space.js';
export type { SideSetup, SpaceMap, ZoneSpace } from './space.js';

export type { ClubId, CompetitionId, MatchId, Named, PlayerId } from './types/ids.js';
export { clubId, competitionId, matchId, playerId } from './types/ids.js';

export type {
  GoalkeepingAttributes,
  MentalAttributes,
  PhysicalAttributes,
  Player,
  PlayerAttributes,
  PlayerCondition,
  PlayerRole,
  Position,
  Rating,
  TechnicalAttributes,
} from './types/player.js';

export type { Club, Stadium } from './types/club.js';

export type {
  Compactness,
  InMatchDecision,
  LineHeight,
  Mentality,
  PassingDirectness,
  PressingIntensity,
  PressingTrigger,
  Selection,
  Tactics,
  TeamWidth,
  Tempo,
} from './types/tactics.js';

export type { CauseTag, MatchTrace, SwingMoment } from './types/trace.js';

export type { CauseMeta } from './types/causes.js';
export { ALL_CAUSES, CAUSE_REGISTRY } from './types/causes.js';

export type {
  BodyPart,
  MatchContext,
  MatchEvent,
  MatchInput,
  MatchResult,
  MatchSide,
  PlayerMatchOutcome,
  Shot,
  ShotOutcome,
  ShotSituation,
  SideStats,
} from './types/match.js';
