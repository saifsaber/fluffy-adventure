import type { PlayerId } from './ids.js';

/**
 * The closed set of reasons a match swung.
 *
 * This is an enum, never generated prose, for two reasons that both matter:
 *  - The AI layer may only narrate causes that appear here. It cannot invent a reason, which is
 *    what keeps a debrief evidence rather than fluent guessing.
 *  - Rendering into another language is a lookup table plus one model pass, which is what makes
 *    global expansion a translation problem instead of a rewrite (global-strategy §3).
 *
 * Adding a tag is a deliberate act: the engine must be able to *detect* it, and every locale needs
 * a phrasing for it.
 */
export type CauseTag =
  // Shape and space
  | 'HIGH_LINE_VS_PACE'
  | 'DEEP_BLOCK_ABSORBED_PRESSURE'
  | 'MIDFIELD_OVERLOAD'
  | 'MIDFIELD_OUTNUMBERED'
  | 'WIDE_OVERLOAD'
  | 'NARROW_SHAPE_CONCEDED_FLANKS'
  | 'FORMATION_MISMATCH'
  // Pressing
  | 'PRESS_BYPASSED'
  | 'PRESS_FORCED_TURNOVER'
  | 'COUNTER_ATTACK_EXPOSURE'
  // Condition
  | 'FATIGUE_COLLAPSE'
  | 'FRESH_LEGS_ADVANTAGE'
  // Manager decisions
  | 'SUBSTITUTION_SWUNG_MOMENTUM'
  | 'MISSED_SUBSTITUTION_WINDOW'
  | 'MENTALITY_SHIFT_PAID_OFF'
  | 'MENTALITY_SHIFT_BACKFIRED'
  | 'ROLE_MISFIT'
  // Individual moments
  | 'CLINICAL_FINISHING'
  | 'WASTEFUL_FINISHING'
  | 'KEEPER_HEROICS'
  | 'KEEPER_ERROR'
  | 'INDIVIDUAL_BRILLIANCE'
  // Discipline and dead balls
  | 'RED_CARD'
  | 'SET_PIECE_ADVANTAGE'
  | 'SET_PIECE_WEAKNESS'
  // Context
  | 'HOME_CROWD_LIFT'
  | 'PITCH_CONDITIONS';

/**
 * A moment where the match's expected outcome moved materially.
 *
 * `deltaWinProbability` is computed by the engine from its own state, never estimated afterwards.
 */
export interface SwingMoment {
  readonly minute: number;
  readonly cause: CauseTag;
  /** Signed change in the home side's win probability, in [-1, 1]. */
  readonly deltaWinProbability: number;
  readonly actors: readonly PlayerId[];
  /** Which side the moment favoured. */
  readonly favoured: 'home' | 'away';
}

/**
 * The only thing the AI layer is allowed to read about a match.
 *
 * If the trace is thin, the debrief is short. The model does not fill the gap.
 */
export interface MatchTrace {
  /** 5–8 in a normal match, ordered by minute. */
  readonly swings: readonly SwingMoment[];
  /** Home win probability sampled each minute, index 0 = kickoff. Length 91 for a 90-minute match. */
  readonly winProbabilityTimeline: readonly number[];
}
