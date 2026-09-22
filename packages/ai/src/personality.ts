import type { Personality } from '@dakka/engine';
import type { EffectKind } from './effects.js';
import { MORALE_FOR } from './effects.js';

/**
 * How a player takes what is said to him.
 *
 * `MORALE_FOR` says what a thing said is worth to *anybody*. This says how far it moves *him* — and
 * that is the whole of personality in this product. It changes a conversation, never a match.
 *
 * **The boundary is the dependency graph, not a promise.** `Personality` is declared on `Player` in
 * `@dakka/engine`, and its meaning lives here, in a package the engine cannot import. So the answer
 * to *how does personality reach the dressing room without deciding an outcome* is that it has no
 * path to an outcome at all: `simulate` could not read a personality effect if it wanted to, and a
 * test asserts the same thing from the outside in case the union is ever read directly.
 *
 * **Nobody gets a free lunch.** A personality that took praise harder *and* criticism more lightly
 * would be a strictly better player to manage — a bonus with a character note attached, which is
 * the same species as a fabricated statistic. A test refuses one. What is allowed is the real
 * trade: a man who is hard to lift is also hard to break, and a man you can lift in a sentence is
 * one you can lose in a sentence.
 */
export interface PersonalityMeta {
  /** Multiplier on what praise is worth to him. */
  readonly toPraise: number;
  /** Multiplier on what criticism costs him. */
  readonly toCriticism: number;
  /** One line, for the person reading the table rather than for the screen. */
  readonly is: string;
}

/** `Record<Personality, …>`, so a personality nobody has decided the meaning of is a build error. */
export const PERSONALITY_REGISTRY: Record<Personality, PersonalityMeta> = {
  steady: {
    toPraise: 0.6,
    toCriticism: 0.6,
    is: 'hard to lift, and hard to break — a week of either barely moves him',
  },
  volatile: {
    toPraise: 1.5,
    toCriticism: 1.5,
    is: 'you can pick him up in a sentence and lose him in one',
  },
  proud: {
    toPraise: 0.7,
    toCriticism: 1.4,
    is: 'takes praise as his due and criticism as a slight',
  },
};

export const ALL_PERSONALITIES = Object.keys(PERSONALITY_REGISTRY) as readonly Personality[];

/** Which side of a player a thing said reaches. `nothing_said` is neither, and is worth nothing. */
export const isPraise = (kind: EffectKind): boolean =>
  kind === 'player_backed' || kind === 'squad_praised';

/**
 * What this thing said is worth **to this player**.
 *
 * Rounded to whole morale points, because morale is shown as a whole number and a change the player
 * cannot see happening is a change he cannot trace to what was said. Rounded away from zero, so a
 * man the manager barely reached still moved — silently rounding a slight down to nothing is how a
 * dressing room stops being answerable.
 */
export function moraleFor(kind: EffectKind, personality: Personality | undefined): number {
  const base = MORALE_FOR[kind];
  if (personality === undefined || base === 0) return base;
  const meta = PERSONALITY_REGISTRY[personality];
  const scaled = base * (isPraise(kind) ? meta.toPraise : meta.toCriticism);
  return scaled < 0 ? -Math.max(1, Math.round(-scaled)) : Math.max(1, Math.round(scaled));
}
