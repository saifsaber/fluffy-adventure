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

export { scoreVoice } from './voice.js';
export type { VoiceScore } from './voice.js';

export { briefingPrompt, scoutingFrom } from './scouting.js';
export type { BriefingPrompt, ScoutNames, ScoutingRecord } from './scouting.js';

export { CHARS_PER_PARAGRAPH, checkDebrief, debriefCacheKey, requestDebrief } from './debrief.js';
export type { DebriefOutcome, DebriefTransport } from './debrief.js';

export { debriefPrompt, numbersInText, paragraphsFor } from './prompt.js';
export type { ActorNames, DebriefPrompt } from './prompt.js';

export { evidenceFromTrace, numbersIn } from './evidence.js';
export type { EvidenceMoment, MatchEvidence } from './evidence.js';

export {
  ALL_MODELS,
  ALL_TASKS,
  BATCH_MULTIPLIER,
  EMPTY_LEDGER,
  PRICES,
  PRICES_READ_ON,
  ROUTING,
  authorise,
  authoriseDebrief,
  briefingSegments,
  cacheHitShare,
  cacheablePrefix,
  ceilingUsd,
  costOf,
  costPerCareer,
  costPerMatch,
  debriefSegments,
  maxTokens,
  outputCeilingTokens,
  record,
} from './cost.js';
export type {
  AiTask,
  Authorisation,
  Budget,
  CachePrefix,
  CacheTtl,
  CallShape,
  DebriefRequest,
  Ledger,
  LedgerEntry,
  Measured,
  ModelId,
  Price,
  PromptSegment,
  RefusalReason,
  SegmentName,
  Usage,
} from './cost.js';
