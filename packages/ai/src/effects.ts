import { z } from 'zod';
import { playerId, type Player, type PlayerId } from '@dakka/engine';
import { moraleFor } from './personality.js';

/**
 * The boundary. Nothing a model says becomes a game number except through here.
 *
 * **The design decision that matters: an effect carries no magnitude.** The blueprint's split puts
 * morale, form, board confidence and sack risk in the deterministic column and conversation in the
 * model's, so a schema with a `delta: number` field would hand the model the one thing the split
 * says is code's. Instead an effect names *what was said* — backed him, criticised him, said nothing
 * — and a table in this file, which no model can see or reach, decides what that is worth. A model
 * that wants to award +50 morale has nowhere to write the 50.
 *
 * The batch that comes out of `parseEffects` is branded, so `applyEffects` cannot be handed an
 * object literal. That is the difference between a validator you are supposed to call and a
 * validator you cannot skip.
 */

export type EffectKind =
  'player_backed' | 'player_criticised' | 'squad_praised' | 'squad_criticised' | 'nothing_said';

export type Effect =
  | { readonly kind: 'player_backed'; readonly playerId: PlayerId }
  | { readonly kind: 'player_criticised'; readonly playerId: PlayerId }
  | { readonly kind: 'squad_praised' }
  | { readonly kind: 'squad_criticised' }
  | { readonly kind: 'nothing_said' };

/**
 * What each thing said is worth, in morale points.
 *
 * Chosen, not derived — these are design constants like the engine's balance numbers, and nothing
 * has measured them yet. Recorded as a decision rather than presented as a finding: criticism costs
 * more than praise earns, because praise is the expected baseline and criticism is a breach of it.
 * When there is a season loop to measure against, these get fitted like everything else.
 */
export const MORALE_FOR: Record<EffectKind, number> = {
  player_backed: 4,
  player_criticised: -6,
  squad_praised: 2,
  squad_criticised: -3,
  nothing_said: 0,
};

/** One conversation cannot be an unlimited number of things. */
export const MAX_EFFECTS = 6;

/**
 * Deliberately not `.strict()` here: `.extend()` inherits the setting, so marking it in both places
 * would mean two independent sources of the same guarantee and removing either would change
 * nothing. A guard that cannot be broken by deleting it is a guard nobody can verify. Strictness
 * lives on each member below, once.
 */
const playerTarget = z.object({ playerId: z.string().min(1) });

/**
 * `.strict()` on every member is load-bearing: a model that returns
 * `{ kind: 'player_backed', playerId: 'x', delta: 50 }` must be *rejected*, not quietly stripped.
 * Silently dropping the extra field would teach nobody that the model tried.
 */
const effectSchema = z.discriminatedUnion('kind', [
  playerTarget.extend({ kind: z.literal('player_backed') }).strict(),
  playerTarget.extend({ kind: z.literal('player_criticised') }).strict(),
  z.object({ kind: z.literal('squad_praised') }).strict(),
  z.object({ kind: z.literal('squad_criticised') }).strict(),
  z.object({ kind: z.literal('nothing_said') }).strict(),
]);

const batchSchema = z.array(effectSchema).max(MAX_EFFECTS);

declare const validated: unique symbol;

/**
 * A set of effects that has been through `parseEffects`.
 *
 * The symbol is not exported, so this type cannot be written by hand anywhere else in the codebase
 * — including in a test that wants to take a shortcut.
 */
export interface EffectBatch {
  readonly effects: readonly Effect[];
  readonly [validated]: true;
}

export type EffectParse =
  | { readonly ok: true; readonly batch: EffectBatch }
  | { readonly ok: false; readonly problems: readonly string[] };

/**
 * The brand is a phantom: `validated` is declared, never defined, so it exists to the compiler and
 * not at runtime. The sealed object is just `{ effects }` — the guarantee is entirely in the type,
 * which is what makes it free and what makes this cast the only one in the package.
 */
const seal = (effects: readonly Effect[]): EffectBatch => ({ effects }) as unknown as EffectBatch;

/**
 * The only way to turn model output into something applicable.
 *
 * Returns problems rather than throwing, because a malformed reply is an expected event — the
 * caller retries or falls back to silence, and never to a guess.
 */
export function parseEffects(raw: unknown): EffectParse {
  const parsed = batchSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.map(
        (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
      ),
    };
  }

  const problems: string[] = [];
  const targeted = new Set<string>();
  let squadWide = 0;

  for (const effect of parsed.data) {
    if (effect.kind === 'squad_praised' || effect.kind === 'squad_criticised') {
      squadWide += 1;
      continue;
    }
    if (effect.kind === 'nothing_said') continue;
    // Saying the same thing about the same player twice is a model repeating itself, not a manager
    // doing something twice as hard. Stacking it would make repetition an exploit.
    if (targeted.has(effect.playerId)) {
      problems.push(`${effect.playerId}: named more than once in the same exchange`);
    }
    targeted.add(effect.playerId);
  }
  if (squadWide > 1) problems.push('(root): more than one squad-wide effect in the same exchange');

  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    batch: seal(
      parsed.data.map((effect): Effect =>
        'playerId' in effect
          ? { kind: effect.kind, playerId: playerId(effect.playerId) }
          : { kind: effect.kind },
      ),
    ),
  };
}

/** A morale move, with the thing that caused it attached. No change is ever anonymous. */
export interface MoraleChange {
  readonly playerId: PlayerId;
  readonly from: number;
  readonly to: number;
  readonly because: EffectKind;
  /**
   * What it was worth to this player, before the 0–100 clamp.
   *
   * Reported separately from `from`/`to` because personality makes the same sentence worth
   * different amounts to different men, and a screen that showed only the new number would be
   * showing a figure whose cause cannot be reached — which is the one thing this product refuses.
   */
  readonly worth: number;
}

export interface AppliedEffects {
  readonly squad: readonly Player[];
  readonly changes: readonly MoraleChange[];
}

const clamp = (value: number): number => Math.max(0, Math.min(100, value));

/**
 * Applies a validated batch, and reports every change with its cause.
 *
 * Takes `EffectBatch`, never `Effect[]` — an unvalidated literal does not typecheck here, which is
 * what makes "the schema cannot be skipped" a compiler guarantee rather than a convention. The
 * changes come back alongside the squad because a morale move the player cannot trace to a moment
 * is exactly the kind of number this product refuses to show.
 */
export function applyEffects(squad: readonly Player[], batch: EffectBatch): AppliedEffects {
  const perPlayer = new Map<string, EffectKind>();
  let squadWide: EffectKind | null = null;

  for (const effect of batch.effects) {
    if (effect.kind === 'squad_praised' || effect.kind === 'squad_criticised') {
      squadWide = effect.kind;
    } else if (effect.kind !== 'nothing_said') {
      perPlayer.set(effect.playerId, effect.kind);
    }
  }

  const changes: MoraleChange[] = [];
  const next = squad.map((player): Player => {
    const individual = perPlayer.get(player.id);
    const because = individual ?? squadWide;
    if (because === null || because === undefined) return player;

    const from = player.condition.morale;
    // What it was worth to *him*. `MORALE_FOR` prices the thing said; personality prices the man.
    const worth = moraleFor(because, player.personality);
    const to = clamp(from + worth);
    if (to === from) return player;

    changes.push({ playerId: player.id, from, to, because, worth });
    return { ...player, condition: { ...player.condition, morale: to } };
  });

  return { squad: next, changes };
}
