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
  /**
   * Whose side of the ball this cause helps, read from the perspective of the side whose space map
   * emitted it.
   *
   * `space.ts` puts both kinds of cause on the same list: `MIDFIELD_OVERLOAD` says this side has the
   * numbers, `MIDFIELD_OUTNUMBERED` says it does not. Without this field the trace will happily
   * explain a goal with the reason its scorer was being smothered — fluent, specific, and exactly
   * backwards. That is the failure this product exists to avoid, so the polarity lives in the
   * registry where the compiler makes every future cause declare one.
   *
   * `neither` means the cause is real but direction-blind, so nothing may be attributed to it: the
   * trace skips it rather than guessing which way it cut.
   */
  readonly favours: 'attack' | 'defence' | 'neither';
}

export const CAUSE_REGISTRY: Record<CauseTag, CauseMeta> = {
  HIGH_LINE_VS_PACE: { agency: 'controllable', domain: 'shape', favours: 'attack' },
  DEEP_BLOCK_ABSORBED_PRESSURE: { agency: 'controllable', domain: 'shape', favours: 'defence' },
  MIDFIELD_OVERLOAD: { agency: 'controllable', domain: 'shape', favours: 'attack' },
  MIDFIELD_OUTNUMBERED: { agency: 'controllable', domain: 'shape', favours: 'defence' },
  WIDE_OVERLOAD: { agency: 'controllable', domain: 'shape', favours: 'attack' },
  NARROW_SHAPE_CONCEDED_FLANKS: { agency: 'controllable', domain: 'shape', favours: 'attack' },
  FORMATION_MISMATCH: { agency: 'controllable', domain: 'shape', favours: 'neither' },

  PRESS_BYPASSED: { agency: 'controllable', domain: 'pressing', favours: 'attack' },
  PRESS_FORCED_TURNOVER: { agency: 'controllable', domain: 'pressing', favours: 'defence' },
  COUNTER_ATTACK_EXPOSURE: { agency: 'controllable', domain: 'pressing', favours: 'attack' },

  FATIGUE_COLLAPSE: { agency: 'controllable', domain: 'condition', favours: 'neither' },
  FRESH_LEGS_ADVANTAGE: { agency: 'controllable', domain: 'condition', favours: 'neither' },

  SUBSTITUTION_SWUNG_MOMENTUM: { agency: 'controllable', domain: 'decision', favours: 'neither' },
  MISSED_SUBSTITUTION_WINDOW: { agency: 'controllable', domain: 'decision', favours: 'neither' },
  MENTALITY_SHIFT_PAID_OFF: { agency: 'controllable', domain: 'decision', favours: 'neither' },
  MENTALITY_SHIFT_BACKFIRED: { agency: 'controllable', domain: 'decision', favours: 'neither' },
  ROLE_MISFIT: { agency: 'controllable', domain: 'decision', favours: 'neither' },

  CLINICAL_FINISHING: { agency: 'circumstantial', domain: 'individual', favours: 'attack' },
  WASTEFUL_FINISHING: { agency: 'circumstantial', domain: 'individual', favours: 'defence' },
  KEEPER_HEROICS: { agency: 'circumstantial', domain: 'individual', favours: 'defence' },
  KEEPER_ERROR: { agency: 'circumstantial', domain: 'individual', favours: 'attack' },
  INDIVIDUAL_BRILLIANCE: { agency: 'circumstantial', domain: 'individual', favours: 'attack' },

  RED_CARD: { agency: 'circumstantial', domain: 'discipline', favours: 'neither' },
  SET_PIECE_ADVANTAGE: { agency: 'controllable', domain: 'discipline', favours: 'attack' },
  SET_PIECE_WEAKNESS: { agency: 'controllable', domain: 'discipline', favours: 'defence' },

  HOME_CROWD_LIFT: { agency: 'circumstantial', domain: 'context', favours: 'neither' },
  PITCH_CONDITIONS: { agency: 'circumstantial', domain: 'context', favours: 'neither' },
};

export const ALL_CAUSES = Object.keys(CAUSE_REGISTRY) as readonly CauseTag[];
