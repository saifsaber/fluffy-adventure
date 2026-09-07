import type { PlayerId } from './ids.js';
import type { Position, PlayerRole } from './player.js';

/**
 * Tactics are a *shape*, not a multiplier.
 *
 * Every field here feeds the matchup resolver — how much space each zone offers, and who contests
 * it. None of them is applied as a global scalar to a team rating. See
 * `.claude/skills/dakka-engine-rules/SKILL.md` §4: the same choice must be able to help in one
 * context and hurt in another, or it is a scalar wearing a costume.
 */

export type Mentality =
  'ultra_defensive' | 'defensive' | 'balanced' | 'attacking' | 'ultra_attacking';

/** How high the defensive line sits. Interacts with opposition pace, not with a flat modifier. */
export type LineHeight = 'deep' | 'normal' | 'high' | 'very_high';

/** How aggressively possession is contested, and where. */
export type PressingIntensity = 'contain' | 'moderate' | 'high' | 'gegenpress';

/** Which third the press is triggered in. */
export type PressingTrigger = 'own_third' | 'middle_third' | 'final_third';

export type Tempo = 'slow' | 'balanced' | 'fast';
export type PassingDirectness = 'short' | 'mixed' | 'direct' | 'long';
export type TeamWidth = 'narrow' | 'balanced' | 'wide';
/** Vertical distance between the lines. Tight compactness concedes width; loose concedes the centre. */
export type Compactness = 'tight' | 'balanced' | 'loose';

export interface Selection {
  readonly playerId: PlayerId;
  readonly position: Position;
  readonly role: PlayerRole;
}

export interface Tactics {
  /** Display shape, e.g. "4-3-3". The engine reads `startingXI`, not this string. */
  readonly formation: string;
  readonly startingXI: readonly Selection[];
  readonly bench: readonly PlayerId[];
  readonly captain: PlayerId;
  readonly mentality: Mentality;
  readonly lineHeight: LineHeight;
  readonly pressingIntensity: PressingIntensity;
  readonly pressingTrigger: PressingTrigger;
  readonly tempo: Tempo;
  readonly passingDirectness: PassingDirectness;
  readonly width: TeamWidth;
  readonly compactness: Compactness;
  readonly setPieceTakers: {
    readonly corners: PlayerId;
    readonly freeKicks: PlayerId;
    readonly penalties: PlayerId;
  };
}

/** A change the manager makes during the match. Each one is recorded and can be counterfactualled. */
export type InMatchDecision =
  | {
      readonly kind: 'substitution';
      readonly minute: number;
      readonly off: PlayerId;
      readonly on: PlayerId;
      readonly position: Position;
      readonly role: PlayerRole;
    }
  | { readonly kind: 'mentality'; readonly minute: number; readonly to: Mentality }
  | { readonly kind: 'line_height'; readonly minute: number; readonly to: LineHeight }
  | { readonly kind: 'pressing'; readonly minute: number; readonly to: PressingIntensity }
  | { readonly kind: 'tempo'; readonly minute: number; readonly to: Tempo }
  | { readonly kind: 'width'; readonly minute: number; readonly to: TeamWidth }
  | { readonly kind: 'compactness'; readonly minute: number; readonly to: Compactness }
  | {
      readonly kind: 'role_change';
      readonly minute: number;
      readonly playerId: PlayerId;
      readonly to: PlayerRole;
    };
