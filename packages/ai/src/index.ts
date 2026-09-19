/**
 * @dakka/ai — the boundary between what a model says and what the game does.
 *
 * Pure: no network, no keys, no clock, no I/O. A prompt is built here and a reply is validated
 * here; whatever actually talks to a model lives behind the API (Step 8) and passes through these
 * types in both directions.
 *
 * Two rules, and everything in this package is one of them made mechanical:
 *  - **AI never decides an outcome.** An effect carries no magnitude, so the numbers stay in code.
 *  - **The trace is the only thing a prompt may read about a match.** `MatchEvidence` is built from
 *    a `MatchTrace`, and a `MatchResult` does not typecheck where one is wanted.
 */

export { DEFAULT_LOCALE, DIRECTION, LOCALES, isLocale } from './locale.js';
export type { Locale } from './locale.js';

export { MAX_EFFECTS, MORALE_FOR, applyEffects, parseEffects } from './effects.js';
export type {
  AppliedEffects,
  Effect,
  EffectBatch,
  EffectKind,
  EffectParse,
  MoraleChange,
} from './effects.js';

export { PHRASINGS, causeLabel, isControllable } from './phrasing.js';
export type { Phrasing } from './phrasing.js';

export { evidenceFromTrace, numbersIn } from './evidence.js';
export type { EvidenceMoment, MatchEvidence } from './evidence.js';
