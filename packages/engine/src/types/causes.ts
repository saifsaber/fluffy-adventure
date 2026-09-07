import type { CauseTag } from './trace.js';

/**
 * Metadata for every cause the engine can emit.
 *
 * The type is `Record<CauseTag, CauseMeta>`, so adding a tag to `CauseTag` without registering it
 * here fails the build. That is deliberate: the AI layer may only narrate causes that appear in
 * this registry, so an unregistered cause would be a silent hole through which the model could
 * invent an explanation.
 */
export interface CauseMeta {
  /**
   * Whether the manager could have influenced this before or during the match.
   * `controllable` causes are the ones worth putting in a debrief — they are the lesson.
   * `circumstantial` ones explain the result without blaming anyone.
   */
  readonly agency: 'controllable' | 'circumstantial';
  /** Which phase of play produced it. Used to group a debrief coherently. */
  readonly domain:
    'shape' | 'pressing' | 'condition' | 'decision' | 'individual' | 'discipline' | 'context';
}

export const CAUSE_REGISTRY: Record<CauseTag, CauseMeta> = {
  HIGH_LINE_VS_PACE: { agency: 'controllable', domain: 'shape' },
  DEEP_BLOCK_ABSORBED_PRESSURE: { agency: 'controllable', domain: 'shape' },
  MIDFIELD_OVERLOAD: { agency: 'controllable', domain: 'shape' },
  MIDFIELD_OUTNUMBERED: { agency: 'controllable', domain: 'shape' },
  WIDE_OVERLOAD: { agency: 'controllable', domain: 'shape' },
  NARROW_SHAPE_CONCEDED_FLANKS: { agency: 'controllable', domain: 'shape' },
  FORMATION_MISMATCH: { agency: 'controllable', domain: 'shape' },

  PRESS_BYPASSED: { agency: 'controllable', domain: 'pressing' },
  PRESS_FORCED_TURNOVER: { agency: 'controllable', domain: 'pressing' },
  COUNTER_ATTACK_EXPOSURE: { agency: 'controllable', domain: 'pressing' },

  FATIGUE_COLLAPSE: { agency: 'controllable', domain: 'condition' },
  FRESH_LEGS_ADVANTAGE: { agency: 'controllable', domain: 'condition' },

  SUBSTITUTION_SWUNG_MOMENTUM: { agency: 'controllable', domain: 'decision' },
  MISSED_SUBSTITUTION_WINDOW: { agency: 'controllable', domain: 'decision' },
  MENTALITY_SHIFT_PAID_OFF: { agency: 'controllable', domain: 'decision' },
  MENTALITY_SHIFT_BACKFIRED: { agency: 'controllable', domain: 'decision' },
  ROLE_MISFIT: { agency: 'controllable', domain: 'decision' },

  CLINICAL_FINISHING: { agency: 'circumstantial', domain: 'individual' },
  WASTEFUL_FINISHING: { agency: 'circumstantial', domain: 'individual' },
  KEEPER_HEROICS: { agency: 'circumstantial', domain: 'individual' },
  KEEPER_ERROR: { agency: 'circumstantial', domain: 'individual' },
  INDIVIDUAL_BRILLIANCE: { agency: 'circumstantial', domain: 'individual' },

  RED_CARD: { agency: 'circumstantial', domain: 'discipline' },
  SET_PIECE_ADVANTAGE: { agency: 'controllable', domain: 'discipline' },
  SET_PIECE_WEAKNESS: { agency: 'controllable', domain: 'discipline' },

  HOME_CROWD_LIFT: { agency: 'circumstantial', domain: 'context' },
  PITCH_CONDITIONS: { agency: 'circumstantial', domain: 'context' },
};

export const ALL_CAUSES = Object.keys(CAUSE_REGISTRY) as readonly CauseTag[];
