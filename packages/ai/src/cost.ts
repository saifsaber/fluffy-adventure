import { CHARS_PER_PARAGRAPH } from './debrief.js';
import type { DebriefPrompt } from './prompt.js';
import type { BriefingPrompt } from './scouting.js';

/**
 * What the model costs, counted rather than guessed.
 *
 * The blueprint's risk table answers "LLM cost per user per match" with five words — Haiku for
 * volume, caching, debrief on demand, hard per-career budget. This module is those five words made
 * mechanical, and it obeys the same rule as every other number in this product: **a cost is either
 * counted from something we can point at, or it is marked unknown.** There is no estimate in here.
 * `$0.004 per match, roughly` is the money version of `stats.shots = goals + random()`, and it would
 * be the first fabricated number we ever shipped.
 *
 * So there are exactly two kinds of figure, and the types keep them apart:
 *
 *  - **Measured.** `Usage` as a real response reported it, multiplied by published list price.
 *    Nothing else counts. A call whose usage never came back is `unmetered` and poisons the total
 *    until it is reconciled, because a budget that silently ignores unaccounted spend is not a
 *    budget.
 *  - **A ceiling.** `ceilingUsd` — the most a call *can* cost, proved from the prompt's byte length
 *    and the `max_tokens` cap. A ceiling is not an estimate: it is an inequality that holds. It is
 *    loose, and it is labelled loose, and it is what makes a hard budget defensible before the
 *    first real call has ever been made.
 *
 * The gap between them — the actual per-match figure — needs token counts, and token counts need
 * the API. That half is blocked, is recorded as blocked in the worklog, and is not filled in here
 * with something plausible.
 */

/* ------------------------------------------------------------------------------------------- *
 * Models and prices
 * ------------------------------------------------------------------------------------------- */

/** The three tiers this product has a use for. Adding one means adding a row to `PRICES`. */
export type ModelId = 'claude-opus-5' | 'claude-sonnet-5' | 'claude-haiku-4-5';

export interface Price {
  /** USD per million uncached input tokens. */
  readonly inputPerMTok: number;
  /** USD per million output tokens. */
  readonly outputPerMTok: number;
  /** Cache reads bill at this multiple of the input price. */
  readonly cacheReadMultiplier: number;
  /** Cache writes bill at this multiple of the input price, by TTL. */
  readonly cacheWriteMultiplier: Readonly<Record<CacheTtl, number>>;
  /**
   * A prefix shorter than this **silently** does not cache. No error, no warning — the marker is
   * accepted and `cache_creation_input_tokens` comes back 0. It is not monotonic across
   * generations, which is the trap: the cheapest model has the *highest* minimum.
   */
  readonly minCacheableTokens: number;
}

export type CacheTtl = '5m' | '1h';

/**
 * Anthropic's published list prices and cache minimums, read 2026-09-20.
 *
 * These are the one thing in this package that is true of the world rather than of this codebase,
 * so they are quarantined in a single table with a date on it. When they drift, the cost figures
 * drift with them, and that is a fact about the arithmetic rather than a defect in it — which is
 * why every measured figure this module returns is reproducible from `usage × PRICES` and nothing
 * else.
 */
export const PRICES: Readonly<Record<ModelId, Price>> = {
  'claude-opus-5': {
    inputPerMTok: 5,
    outputPerMTok: 25,
    cacheReadMultiplier: 0.1,
    cacheWriteMultiplier: { '5m': 1.25, '1h': 2 },
    minCacheableTokens: 512,
  },
  'claude-sonnet-5': {
    inputPerMTok: 2,
    outputPerMTok: 10,
    cacheReadMultiplier: 0.1,
    cacheWriteMultiplier: { '5m': 1.25, '1h': 2 },
    minCacheableTokens: 1024,
  },
  'claude-haiku-4-5': {
    inputPerMTok: 1,
    outputPerMTok: 5,
    cacheReadMultiplier: 0.1,
    cacheWriteMultiplier: { '5m': 1.25, '1h': 2 },
    minCacheableTokens: 4096,
  },
};

/** When `PRICES` was read. A cost figure is only as current as this date. */
export const PRICES_READ_ON = '2026-09-20';

/** The Batch API bills every token at half price — input, output, cache reads and cache writes alike. */
export const BATCH_MULTIPLIER = 0.5;

export const ALL_MODELS: readonly ModelId[] = Object.keys(PRICES) as ModelId[];

/* ------------------------------------------------------------------------------------------- *
 * Routing
 * ------------------------------------------------------------------------------------------- */

/** Everything this package builds a prompt for. A new surface is a new member and a new route. */
export type AiTask = 'debrief' | 'briefing' | 'conversation';

export const ALL_TASKS: readonly AiTask[] = ['debrief', 'briefing', 'conversation'];

/**
 * Which model answers which task.
 *
 * **This is a default, not a measurement.** The right way to choose a model is to run the dialect
 * eval against each and pick the cheapest one that clears the bar — and that eval's held-out corpus
 * is blocked, so the bar does not exist yet. What is recorded here is the reasoning, so the day the
 * corpus lands the table can be re-derived rather than re-argued:
 *
 *  - **debrief → the largest.** It is the product. It is also the only surface where the model is
 *    asked to be a person rather than a formatter, it runs once per match at most, and it is on
 *    demand — so it is both the most quality-sensitive and the lowest-volume thing we buy. If cost
 *    per career ever needs cutting, dropping this to `claude-sonnet-5` is the first lever, and it
 *    is a lever the eval must authorise rather than a guess.
 *  - **briefing → the cheapest.** It reads a table of counts and says them in order. Every match
 *    has one, and there is no judgement in it to pay for.
 *  - **conversation → the cheapest.** Highest volume by far — several turns per exchange — and the
 *    typed effect schema means nothing it says can reach a game number anyway.
 */
export const ROUTING: Readonly<Record<AiTask, ModelId>> = {
  debrief: 'claude-opus-5',
  briefing: 'claude-haiku-4-5',
  conversation: 'claude-haiku-4-5',
};

/* ------------------------------------------------------------------------------------------- *
 * Cost from usage
 * ------------------------------------------------------------------------------------------- */

/**
 * Exactly what a response reports, and nothing a caller could make up.
 *
 * Field names mirror the wire (`input_tokens`, `cache_creation_input_tokens`,
 * `cache_read_input_tokens`, `output_tokens`), because the mapping happening at the API boundary
 * has to be obvious enough that nobody quietly sums the wrong pair.
 *
 * **`inputTokens` is the uncached remainder only.** The whole prompt is
 * `inputTokens + cacheWriteTokens + cacheReadTokens`, each billed at its own rate. Treating
 * `inputTokens` as the prompt size double-counts nothing and under-counts everything, which is the
 * standard way a cache dashboard ends up reporting a saving that is not there.
 */
export interface Usage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheWriteTokens: number;
  readonly cacheReadTokens: number;
}

export interface CallShape {
  readonly model: ModelId;
  /** Which TTL the write was billed at. Only matters when `cacheWriteTokens > 0`. */
  readonly ttl?: CacheTtl;
  /** Batch API — half price on every token in the request. */
  readonly batch?: boolean;
}

const PER_MTOK = 1_000_000;

/** What one call cost, from what it reported. The only multiplication in this module. */
export function costOf(usage: Usage, call: CallShape): number {
  const price = PRICES[call.model];
  const write = price.cacheWriteMultiplier[call.ttl ?? '5m'];
  const inputUsd =
    (usage.inputTokens +
      usage.cacheWriteTokens * write +
      usage.cacheReadTokens * price.cacheReadMultiplier) *
    (price.inputPerMTok / PER_MTOK);
  const outputUsd = usage.outputTokens * (price.outputPerMTok / PER_MTOK);
  return (inputUsd + outputUsd) * (call.batch === true ? BATCH_MULTIPLIER : 1);
}

/* ------------------------------------------------------------------------------------------- *
 * Ceilings — the most a call can cost, proved rather than guessed
 * ------------------------------------------------------------------------------------------- */

/**
 * A sound upper bound on the tokens some text can become.
 *
 * Claude's tokenizer is BPE over UTF-8 bytes, so every token covers at least one byte and
 * `tokens ≤ bytes` always holds. That inequality is the whole trick: it needs no tokenizer, it
 * cannot drift when the tokenizer changes, and it points the safe way — a bound that over-states
 * cost can only make a budget stricter than it needed to be.
 *
 * It is **loose**. Arabic runs about two bytes a character and several characters a token, so the
 * real figure is a small multiple below this. That is the price of not having a token count, and
 * the honest thing to do with it is call it a ceiling everywhere and never a cost.
 *
 * It covers the prompt *text* only. A request also carries a small fixed envelope — role wrappers
 * and structure, a handful of tokens — that only a real `usage` settles.
 */
export function maxTokens(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * The `max_tokens` a task is sent with, derived from the length its own validator will accept.
 *
 * `checkDebrief` throws away a reply longer than `maxParagraphs × CHARS_PER_PARAGRAPH` characters.
 * Paying for tokens past that point buys text that is guaranteed to be discarded, so the cap and
 * the length rule are the same number — read from the same constant, so they cannot drift apart.
 *
 * The ×3 converts a character ceiling into a token ceiling in the safe direction: no UTF-8
 * character is more than 3 bytes in the scripts these two locales use, and `tokens ≤ bytes`, so a
 * reply the validator would accept can never be truncated by this cap.
 */
export function outputCeilingTokens(maxParagraphs: number): number {
  return maxParagraphs * CHARS_PER_PARAGRAPH * 3;
}

/**
 * The most one call can cost, in USD.
 *
 * Sound for the prompt text and exact for the output half — `max_tokens` is a hard stop the API
 * enforces, so the output cannot exceed it. Excludes the request envelope described on `maxTokens`.
 * Assumes nothing is cached, which is the expensive case and therefore the right one for a ceiling.
 */
export function ceilingUsd(promptText: string, outputTokens: number, call: CallShape): number {
  return costOf(
    { inputTokens: maxTokens(promptText), outputTokens, cacheWriteTokens: 0, cacheReadTokens: 0 },
    call,
  );
}

/* ------------------------------------------------------------------------------------------- *
 * The cacheable prefix
 * ------------------------------------------------------------------------------------------- */

export type SegmentName = 'system' | 'evidence' | 'scouting' | 'task';

export interface PromptSegment {
  readonly name: SegmentName;
  readonly text: string;
  /** `never` — byte-identical for every match in this locale. `per-match` — depends on the trace. */
  readonly varies: 'never' | 'per-match';
}

/**
 * A debrief prompt in render order, with what changes between matches marked.
 *
 * Order is the point. Prompt caching is a **prefix** match, so a block can only be cached if every
 * block before it is also unchanged — one per-match block near the front makes everything behind it
 * uncacheable no matter how static it is. Writing the order down as data lets a test check the
 * claim instead of a comment asserting it.
 *
 * `task` is marked `per-match` even though it reads like boilerplate: it interpolates the paragraph
 * count, which comes from how many moments the trace produced. It sits behind `evidence` anyway, so
 * it could never have joined the prefix — but marking it honestly means the day someone reorders
 * these blocks, the analysis stays right.
 */
export function debriefSegments(prompt: DebriefPrompt): readonly PromptSegment[] {
  return [
    { name: 'system', text: prompt.system, varies: 'never' },
    { name: 'evidence', text: prompt.evidence, varies: 'per-match' },
    { name: 'task', text: prompt.task, varies: 'per-match' },
  ];
}

export function briefingSegments(prompt: BriefingPrompt): readonly PromptSegment[] {
  return [
    { name: 'system', text: prompt.system, varies: 'never' },
    { name: 'scouting', text: prompt.scouting, varies: 'per-match' },
    { name: 'task', text: prompt.task, varies: 'per-match' },
  ];
}

export interface CachePrefix {
  /** The leading run of blocks that never change — everything a breakpoint could cover. */
  readonly segments: readonly SegmentName[];
  readonly text: string;
  readonly bytes: number;
  /** Sound upper bound on its token count. See `maxTokens`. */
  readonly maxTokens: number;
  /**
   * Models where the prefix **provably** cannot reach the minimum, so a breakpoint on it is
   * guaranteed to buy nothing. Sound because `maxTokens` over-states: if even the ceiling is under
   * the minimum, the real count is too.
   */
  readonly tooShortFor: readonly ModelId[];
  /**
   * Models where bytes alone cannot decide it. Not a promise that caching works — only a real
   * response's `cache_read_input_tokens` settles that, which is the point of counting it in the
   * ledger.
   */
  readonly undecided: readonly ModelId[];
}

/** The longest leading run of blocks that never change — which is all a prefix cache can ever hold. */
export function cacheablePrefix(segments: readonly PromptSegment[]): CachePrefix {
  const prefix: PromptSegment[] = [];
  for (const segment of segments) {
    if (segment.varies !== 'never') break;
    prefix.push(segment);
  }
  const text = prefix.map((segment) => segment.text).join('\n');
  const ceiling = prefix.length === 0 ? 0 : maxTokens(text);
  return {
    segments: prefix.map((segment) => segment.name),
    text,
    bytes: ceiling,
    maxTokens: ceiling,
    tooShortFor: ALL_MODELS.filter((model) => ceiling < PRICES[model].minCacheableTokens),
    undecided: ALL_MODELS.filter((model) => ceiling >= PRICES[model].minCacheableTokens),
  };
}

/* ------------------------------------------------------------------------------------------- *
 * The ledger
 * ------------------------------------------------------------------------------------------- */

export interface LedgerEntry {
  readonly task: AiTask;
  readonly call: CallShape;
  /**
   * What the response reported, or `undefined` when it reported nothing.
   *
   * `undefined` is not an invitation to estimate. Every real response carries `usage`, so a missing
   * one means our own transport is broken or lying — and spending more money on top of spending we
   * cannot account for is exactly the failure a hard budget exists to prevent.
   */
  readonly usage: Usage | undefined;
}

export interface Ledger {
  /** USD, from reported usage only. Never includes a guess for an unmetered call. */
  readonly spentUsd: number;
  readonly calls: number;
  /** Calls that came back without usage. While this is non-zero, `spentUsd` is an undercount. */
  readonly unmetered: number;
  readonly byTask: Readonly<Record<AiTask, number>>;
  /** For the one question bytes cannot answer: is the cache actually being hit? */
  readonly cacheReadTokens: number;
  readonly inputTokens: number;
}

export const EMPTY_LEDGER: Ledger = {
  spentUsd: 0,
  calls: 0,
  unmetered: 0,
  byTask: { debrief: 0, briefing: 0, conversation: 0 },
  cacheReadTokens: 0,
  inputTokens: 0,
};

/** Pure, so a career's ledger is a value that can be stored, replayed and diffed like any other. */
export function record(ledger: Ledger, entry: LedgerEntry): Ledger {
  const { usage } = entry;
  const usd = usage === undefined ? 0 : costOf(usage, entry.call);
  return {
    spentUsd: ledger.spentUsd + usd,
    calls: ledger.calls + 1,
    unmetered: ledger.unmetered + (usage === undefined ? 1 : 0),
    byTask: { ...ledger.byTask, [entry.task]: ledger.byTask[entry.task] + usd },
    cacheReadTokens: ledger.cacheReadTokens + (usage?.cacheReadTokens ?? 0),
    inputTokens: ledger.inputTokens + (usage?.inputTokens ?? 0),
  };
}

/* ------------------------------------------------------------------------------------------- *
 * Reporting — measured, or marked unknown
 * ------------------------------------------------------------------------------------------- */

/** A figure we can stand behind, or a named reason we cannot. There is no third case. */
export type Measured =
  | { readonly measured: true; readonly value: number }
  | { readonly measured: false; readonly why: string };

const unknown = (why: string): Measured => ({ measured: false, why });

/** What this career has cost so far. Unknown while any call is unaccounted for. */
export function costPerCareer(ledger: Ledger): Measured {
  if (ledger.unmetered > 0) {
    return unknown(`${ledger.unmetered} of ${ledger.calls} calls reported no usage`);
  }
  return { measured: true, value: ledger.spentUsd };
}

/**
 * Cost per match.
 *
 * The denominator is passed in because it is a career fact, not an AI fact — and because a module
 * that invented its own denominator could make this number say anything. Zero matches gives
 * `unknown`, not zero: nothing has been divided yet, and a confident `$0.00` would be the first
 * fabricated statistic in the product.
 */
export function costPerMatch(ledger: Ledger, matchesPlayed: number): Measured {
  if (matchesPlayed <= 0) return unknown('no matches played yet');
  const career = costPerCareer(ledger);
  return career.measured ? { measured: true, value: career.value / matchesPlayed } : career;
}

/**
 * The share of prompt tokens served from cache.
 *
 * This is the only honest answer to "is caching working?", and it is why the ledger carries token
 * counts at all. `cacheablePrefix` can prove a prefix is too short; it cannot prove one is being
 * hit. Zero reads across many calls with an identical prefix means something upstream is changing
 * the bytes.
 */
export function cacheHitShare(ledger: Ledger): Measured {
  const total = ledger.inputTokens + ledger.cacheReadTokens;
  if (total === 0) return unknown('no prompt tokens recorded yet');
  return { measured: true, value: ledger.cacheReadTokens / total };
}

/* ------------------------------------------------------------------------------------------- *
 * The budget
 * ------------------------------------------------------------------------------------------- */

export interface Budget {
  /** The hard stop. Once this much is spent, the career buys nothing more from a model. */
  readonly careerUsd: number;
}

export type RefusalReason =
  /** The hard stop has been reached. */
  | 'budget-spent'
  /** A previous call never reported what it cost, so the total is not trustworthy. */
  | 'unmetered-call-outstanding'
  /** Nobody asked. Debriefs are bought when a manager opens one, never on the way out of a match. */
  | 'not-requested'
  /** The trace has no moments, so the screen already says everything there is to say. */
  | 'nothing-to-explain';

export type Authorisation =
  { readonly allowed: true } | { readonly allowed: false; readonly reason: RefusalReason };

const ALLOWED: Authorisation = { allowed: true };
const refuse = (reason: RefusalReason): Authorisation => ({ allowed: false, reason });

/**
 * May this career spend anything at all right now?
 *
 * The stop is on *measured* spend, so it can be exceeded by at most one call — the one in flight
 * when the line is crossed. That overshoot is bounded rather than open-ended, which is what
 * `ceilingUsd` is for: the caller can prove the worst case of the next call before making it, and
 * a budget with a bounded overshoot is a real budget in a way that a hopeful one is not.
 */
export function authorise(ledger: Ledger, budget: Budget): Authorisation {
  if (ledger.unmetered > 0) return refuse('unmetered-call-outstanding');
  if (ledger.spentUsd >= budget.careerUsd) return refuse('budget-spent');
  return ALLOWED;
}

export interface DebriefRequest {
  /** True only when a manager asked for it. A screen opening is not a request. */
  readonly requested: boolean;
  /** How many swing moments the trace produced. */
  readonly moments: number;
}

/**
 * On demand, not automatic — the blueprint's phrase, made into a gate the caller cannot walk past.
 *
 * Two refusals before money is even considered, and both are honesty as much as thrift:
 *
 *  - **Nobody asked.** Generating a debrief for every match on the way out of the whistle buys one
 *    for every match nobody opens. This is the single largest cost lever in the product, and it
 *    costs the player nothing, because the trace is on screen either way.
 *  - **Nothing happened.** A trace with no moments already renders one honest sentence — *no moment
 *    moved the odds far enough to name*. Paying a model to restate it invites it to find something
 *    to say, which is the exact failure the whole package is built to prevent.
 *    This one is a correctness gate and **not** a saving: `pnpm prompt-size` measured 0 quiet
 *    matches in 400, because the engine reliably finds something to name. It is here so that the
 *    day a quiet match happens, nobody is paid to fill it.
 */
export function authoriseDebrief(
  ledger: Ledger,
  budget: Budget,
  request: DebriefRequest,
): Authorisation {
  if (!request.requested) return refuse('not-requested');
  if (request.moments === 0) return refuse('nothing-to-explain');
  return authorise(ledger, budget);
}
