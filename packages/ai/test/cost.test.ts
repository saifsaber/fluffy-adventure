import { describe, expect, it } from 'vitest';
import {
  ALL_MODELS,
  ALL_TASKS,
  BATCH_MULTIPLIER,
  CHARS_PER_PARAGRAPH,
  EMPTY_LEDGER,
  PRICES,
  ROUTING,
  authorise,
  authoriseDebrief,
  cacheHitShare,
  cacheablePrefix,
  ceilingUsd,
  costOf,
  costPerCareer,
  costPerMatch,
  debriefPrompt,
  debriefSegments,
  evidenceFromTrace,
  maxTokens,
  outputCeilingTokens,
  paragraphsFor,
  record,
  type Ledger,
  type LedgerEntry,
  type Locale,
  type ModelId,
  type PromptSegment,
  type Usage,
} from '../src/index.js';
import { busy, quiet, thin } from './prompt-fixtures.js';

/**
 * Cost controls, held to the same rule as every other number here: counted, or marked unknown.
 *
 * The tests that matter most are not the arithmetic ones. They are the three that stop a cost
 * figure being invented — an unmetered call must poison the total rather than be quietly skipped,
 * a denominator of zero must produce `unknown` rather than `$0.00`, and a cache saving must be read
 * from a response rather than assumed from a marker we placed.
 */

const usage = (u: Partial<Usage> = {}): Usage => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
  ...u,
});

const metered = (task: LedgerEntry['task'], model: ModelId, u: Usage): LedgerEntry => ({
  task,
  call: { model },
  usage: u,
});

const ledgerOf = (...entries: readonly LedgerEntry[]): Ledger =>
  entries.reduce(record, EMPTY_LEDGER);

const evidenceFor = (trace: Parameters<typeof evidenceFromTrace>[0], locale: Locale = 'ar-EG') =>
  evidenceFromTrace(trace, 'home', locale);

describe('the price table', () => {
  it('has a row for every model, and a model for every task', () => {
    expect([...ALL_MODELS].sort()).toEqual(Object.keys(PRICES).sort());
    for (const task of ALL_TASKS) expect(ALL_MODELS).toContain(ROUTING[task]);
  });

  it('routes the expensive model to the one task that is bought on demand', () => {
    // The routing is only defensible because the dear model is also the rare call. If a
    // high-volume task ever points at the same model as `debrief`, this is the reasoning that
    // broke, not the test.
    const volume = ALL_TASKS.filter((task) => task !== 'debrief');
    for (const task of volume) {
      expect(PRICES[ROUTING[task]].inputPerMTok).toBeLessThan(PRICES[ROUTING.debrief].inputPerMTok);
    }
  });
});

describe('what a call cost', () => {
  it('multiplies reported tokens by the published price', () => {
    // 1M in and 1M out on Opus is exactly the headline figure, which is the cheapest possible
    // check that the table is wired to the arithmetic the right way round.
    const cost = costOf(usage({ inputTokens: 1_000_000, outputTokens: 1_000_000 }), {
      model: 'claude-opus-5',
    });
    expect(cost).toBeCloseTo(
      PRICES['claude-opus-5'].inputPerMTok + PRICES['claude-opus-5'].outputPerMTok,
      10,
    );
  });

  it('bills a cache read at a tenth of an uncached token, and a write at a premium', () => {
    const model: ModelId = 'claude-opus-5';
    const plain = costOf(usage({ inputTokens: 10_000 }), { model });
    const read = costOf(usage({ cacheReadTokens: 10_000 }), { model });
    const write5m = costOf(usage({ cacheWriteTokens: 10_000 }), { model, ttl: '5m' });
    const write1h = costOf(usage({ cacheWriteTokens: 10_000 }), { model, ttl: '1h' });

    expect(read / plain).toBeCloseTo(PRICES[model].cacheReadMultiplier, 10);
    expect(write5m / plain).toBeCloseTo(PRICES[model].cacheWriteMultiplier['5m'], 10);
    expect(write1h / plain).toBeCloseTo(PRICES[model].cacheWriteMultiplier['1h'], 10);
    expect(write1h).toBeGreaterThan(write5m);
  });

  it('does not count a cached token twice', () => {
    // `input_tokens` is the uncached remainder only — the whole prompt is the sum of all three
    // fields. Adding `cacheReadTokens` into the full-price term is the standard way a caching
    // dashboard reports a saving that never happened, so it gets its own test.
    const model: ModelId = 'claude-opus-5';
    const half = costOf(usage({ inputTokens: 1_000, cacheReadTokens: 1_000 }), { model });
    const none = costOf(usage({ inputTokens: 2_000 }), { model });
    const rate = PRICES[model].inputPerMTok / 1_000_000;

    expect(half).toBeCloseTo(1_000 * rate + 1_000 * rate * PRICES[model].cacheReadMultiplier, 12);
    expect(half).toBeLessThan(none);
  });

  it('halves everything in a batch, cache included', () => {
    const shape = usage({
      inputTokens: 900,
      outputTokens: 300,
      cacheReadTokens: 400,
      cacheWriteTokens: 200,
    });
    const standard = costOf(shape, { model: 'claude-haiku-4-5' });
    const batched = costOf(shape, { model: 'claude-haiku-4-5', batch: true });
    expect(batched / standard).toBeCloseTo(BATCH_MULTIPLIER, 12);
  });

  it('charges nothing for a call that used nothing', () => {
    expect(costOf(usage(), { model: 'claude-opus-5' })).toBe(0);
  });
});

describe('ceilings, which are inequalities and not estimates', () => {
  it('bounds tokens by UTF-8 bytes, in the safe direction for both locales', () => {
    // A BPE token covers at least one byte, so `tokens ≤ bytes` holds without a tokenizer. The
    // bound has to survive Arabic, where a character is two bytes and the count is *larger* than
    // the character count — which is exactly why bytes and not characters.
    expect(maxTokens('abc')).toBe(3);
    expect(maxTokens('دكة')).toBeGreaterThan('دكة'.length);
    expect(maxTokens('')).toBe(0);
  });

  it('caps output at the length its own validator would accept', () => {
    // If these two ever disagree, we are either paying for text that gets thrown away or
    // truncating replies that would have passed.
    for (const moments of [0, 1, 3, 6]) {
      const paragraphs = paragraphsFor(moments);
      const charCeiling = paragraphs * CHARS_PER_PARAGRAPH;
      expect(outputCeilingTokens(paragraphs)).toBeGreaterThanOrEqual(charCeiling);
      // No character in either locale exceeds three UTF-8 bytes, so a reply the validator accepts
      // can never be cut off by this cap.
      expect(outputCeilingTokens(paragraphs)).toBeGreaterThanOrEqual(
        maxTokens('ة'.repeat(charCeiling)),
      );
    }
  });

  it('is never beaten by a real call on the same prompt', () => {
    const prompt = debriefPrompt(evidenceFor(busy));
    const text = [prompt.system, prompt.evidence, prompt.task].join('\n');
    const cap = outputCeilingTokens(prompt.maxParagraphs);
    const ceiling = ceilingUsd(text, cap, { model: 'claude-opus-5' });

    const realistic = costOf(
      usage({ inputTokens: maxTokens(text), outputTokens: cap, cacheReadTokens: 0 }),
      { model: 'claude-opus-5' },
    );
    expect(realistic).toBeLessThanOrEqual(ceiling);
    // Anything cached, shorter, or batched only goes further under it.
    expect(
      costOf(usage({ cacheReadTokens: maxTokens(text), outputTokens: cap }), {
        model: 'claude-opus-5',
        batch: true,
      }),
    ).toBeLessThan(ceiling);
  });

  it('grows with the prompt and with the cap', () => {
    const call = { model: 'claude-haiku-4-5' } as const;
    expect(ceilingUsd('aa', 10, call)).toBeGreaterThan(ceilingUsd('a', 10, call));
    expect(ceilingUsd('a', 20, call)).toBeGreaterThan(ceilingUsd('a', 10, call));
  });
});

describe('the cacheable prefix', () => {
  const prefixFor = (locale: Locale, trace: Parameters<typeof evidenceFromTrace>[0]) =>
    cacheablePrefix(debriefSegments(debriefPrompt(evidenceFor(trace, locale))));

  it('stops at the first block that depends on the match', () => {
    // Caching is a prefix match. `evidence` sits second, so nothing behind it can ever be cached —
    // including `task`, which reads like boilerplate but carries the paragraph count.
    const prefix = prefixFor('ar-EG', busy);
    expect(prefix.segments).toEqual(['system']);
    // Measured in bytes, not characters. The minimum a model publishes is in tokens, and only
    // `tokens ≤ bytes` is sound — Arabic characters are two bytes each, so counting characters
    // would under-state the prefix and could call a cacheable block too short.
    expect(prefix.bytes).toBe(maxTokens(prefix.text));
    expect(prefix.bytes).toBeGreaterThan(prefix.text.length);
  });

  it('is byte-identical across different matches in the same locale', () => {
    // This is the whole property a cache needs, and the thing a later edit breaks silently: one
    // interpolated club name in the system block and every request misses, with no error anywhere.
    for (const locale of ['ar-EG', 'en'] as const) {
      const a = prefixFor(locale, busy).text;
      const b = prefixFor(locale, thin).text;
      const c = prefixFor(locale, quiet).text;
      expect(a).toBe(b);
      expect(b).toBe(c);
      expect(a.length).toBeGreaterThan(0);
    }
    expect(prefixFor('ar-EG', busy).text).not.toBe(prefixFor('en', busy).text);
  });

  it('is provably too short to cache on the model the volume tasks use', () => {
    // The measured finding this box exists to surface. Haiku 4.5's minimum cacheable prefix is
    // 4096 tokens — the *highest* of the three, on the cheapest model — and our only static block
    // is a few hundred bytes of rules. So "prompt caching for the static rules" buys exactly
    // nothing on the high-volume path today. It becomes a lever the day a large static block
    // (club context) enters a prompt, and not before.
    const volume = ALL_TASKS.filter((task) => task !== 'debrief').map((task) => ROUTING[task]);
    for (const locale of ['ar-EG', 'en'] as const) {
      const prefix = prefixFor(locale, busy);
      expect(prefix.maxTokens).toBeLessThan(PRICES['claude-haiku-4-5'].minCacheableTokens);
      for (const model of volume) expect(prefix.tooShortFor).toContain(model);
    }
  });

  it('says undecided rather than yes when bytes cannot settle it', () => {
    // A prefix above the minimum in *bytes* may still be below it in tokens. The bound only proves
    // the negative, so the positive stays unclaimed until a response reports a cache read.
    const prefix = prefixFor('ar-EG', busy);
    for (const model of prefix.undecided) {
      expect(prefix.maxTokens).toBeGreaterThanOrEqual(PRICES[model].minCacheableTokens);
    }
    expect([...prefix.tooShortFor, ...prefix.undecided].sort()).toEqual([...ALL_MODELS].sort());
  });

  it('is empty when the first block already varies', () => {
    const segments: readonly PromptSegment[] = [
      { name: 'evidence', text: 'x', varies: 'per-match' },
      { name: 'system', text: 'the rules', varies: 'never' },
    ];
    const prefix = cacheablePrefix(segments);
    expect(prefix.segments).toEqual([]);
    expect(prefix.maxTokens).toBe(0);
    expect(prefix.tooShortFor).toEqual([...ALL_MODELS]);
  });
});

describe('the ledger', () => {
  it('sums what was reported, and splits it by task', () => {
    const ledger = ledgerOf(
      metered('debrief', 'claude-opus-5', usage({ inputTokens: 1_000, outputTokens: 500 })),
      metered('briefing', 'claude-haiku-4-5', usage({ inputTokens: 1_000, outputTokens: 500 })),
    );
    expect(ledger.calls).toBe(2);
    expect(ledger.unmetered).toBe(0);
    expect(ledger.spentUsd).toBeCloseTo(ledger.byTask.debrief + ledger.byTask.briefing, 12);
    expect(ledger.byTask.debrief).toBeGreaterThan(ledger.byTask.briefing);
    expect(ledger.byTask.conversation).toBe(0);
  });

  it('adds no dollars for a call that reported nothing, and does not forget it', () => {
    const ledger = ledgerOf(
      metered('debrief', 'claude-opus-5', usage({ inputTokens: 100, outputTokens: 100 })),
      { task: 'briefing', call: { model: 'claude-haiku-4-5' }, usage: undefined },
    );
    expect(ledger.calls).toBe(2);
    expect(ledger.unmetered).toBe(1);
    expect(ledger.spentUsd).toBeCloseTo(
      costOf(usage({ inputTokens: 100, outputTokens: 100 }), { model: 'claude-opus-5' }),
      12,
    );
  });

  it('is a value, not a mutation', () => {
    const before = ledgerOf(metered('debrief', 'claude-opus-5', usage({ inputTokens: 10 })));
    const after = record(before, metered('debrief', 'claude-opus-5', usage({ inputTokens: 10 })));
    expect(before.calls).toBe(1);
    expect(after.calls).toBe(2);
    expect(EMPTY_LEDGER.calls).toBe(0);
  });
});

describe('what may be reported as measured', () => {
  it('reports a career total when every call accounted for itself', () => {
    const ledger = ledgerOf(metered('debrief', 'claude-opus-5', usage({ inputTokens: 1_000 })));
    expect(costPerCareer(ledger)).toEqual({ measured: true, value: ledger.spentUsd });
  });

  it('refuses a total while any call is unaccounted for, and says how many', () => {
    const ledger = ledgerOf(metered('debrief', 'claude-opus-5', usage({ inputTokens: 1_000 })), {
      task: 'briefing',
      call: { model: 'claude-haiku-4-5' },
      usage: undefined,
    });
    const career = costPerCareer(ledger);
    expect(career.measured).toBe(false);
    if (!career.measured) expect(career.why).toBe('1 of 2 calls reported no usage');
  });

  it('says unknown, not zero, before a match has been played', () => {
    // `$0.00 per match` is the money version of a back-filled statistic: a confident number with
    // nothing underneath it. Nothing has been divided yet, so there is nothing to report.
    expect(costPerMatch(EMPTY_LEDGER, 0)).toEqual({
      measured: false,
      why: 'no matches played yet',
    });
  });

  it('divides by a denominator it was handed, never one it invented', () => {
    const ledger = ledgerOf(metered('debrief', 'claude-opus-5', usage({ inputTokens: 4_000 })));
    const per = costPerMatch(ledger, 4);
    expect(per.measured).toBe(true);
    if (per.measured) expect(per.value).toBeCloseTo(ledger.spentUsd / 4, 12);
  });

  it('reads the cache hit share off the response, not off our own intentions', () => {
    expect(cacheHitShare(EMPTY_LEDGER).measured).toBe(false);
    const hit = ledgerOf(
      metered('briefing', 'claude-haiku-4-5', usage({ inputTokens: 250, cacheReadTokens: 750 })),
    );
    const share = cacheHitShare(hit);
    expect(share.measured).toBe(true);
    if (share.measured) expect(share.value).toBeCloseTo(0.75, 12);
  });
});

describe('the budget', () => {
  const budget = { careerUsd: 0.5 };
  const spend = (usd: number): Ledger => ({ ...EMPTY_LEDGER, calls: 1, spentUsd: usd });

  it('allows spending under the line', () => {
    expect(authorise(spend(0.49), budget)).toEqual({ allowed: true });
  });

  it('stops at the line and stays stopped', () => {
    expect(authorise(spend(0.5), budget)).toEqual({ allowed: false, reason: 'budget-spent' });
    expect(authorise(spend(0.51), budget)).toEqual({ allowed: false, reason: 'budget-spent' });
  });

  it('refuses to keep spending on top of spending it cannot account for', () => {
    // A budget that ignores unmetered calls is not a budget — it is a budget plus however much the
    // broken path is quietly costing. This refusal outranks the money check for that reason.
    const blind: Ledger = { ...EMPTY_LEDGER, calls: 1, unmetered: 1 };
    expect(authorise(blind, budget)).toEqual({
      allowed: false,
      reason: 'unmetered-call-outstanding',
    });
  });

  it('overshoots by at most one call, and that call has a proved ceiling', () => {
    // The stop is on measured spend, so the call in flight when the line is crossed still lands.
    // What makes that acceptable is that its worst case is computable before it is sent.
    const prompt = debriefPrompt(evidenceFor(busy));
    const text = [prompt.system, prompt.evidence, prompt.task].join('\n');
    const worst = ceilingUsd(text, outputCeilingTokens(prompt.maxParagraphs), {
      model: ROUTING.debrief,
    });
    const after = record(spend(0.49), {
      task: 'debrief',
      call: { model: ROUTING.debrief },
      usage: usage({
        inputTokens: maxTokens(text),
        outputTokens: outputCeilingTokens(prompt.maxParagraphs),
      }),
    });
    expect(after.spentUsd).toBeLessThanOrEqual(0.49 + worst);
    expect(authorise(after, budget).allowed).toBe(false);
  });
});

describe('a debrief is bought, not produced', () => {
  const budget = { careerUsd: 1 };

  it('is refused when nobody asked for it', () => {
    // The largest lever in the product, and it costs the player nothing: the trace is on screen
    // whether or not a paragraph was ever bought to sit beside it.
    expect(authoriseDebrief(EMPTY_LEDGER, budget, { requested: false, moments: 6 })).toEqual({
      allowed: false,
      reason: 'not-requested',
    });
  });

  it('is refused when the trace has nothing in it', () => {
    // The quiet match already renders one true sentence. Paying a model to restate it is paying it
    // to find something to say, which is the failure this whole package exists to prevent.
    expect(authoriseDebrief(EMPTY_LEDGER, budget, { requested: true, moments: 0 })).toEqual({
      allowed: false,
      reason: 'nothing-to-explain',
    });
    expect(evidenceFor(quiet).moments).toHaveLength(0);
  });

  it('is allowed when a manager asked and there is something to explain', () => {
    const moments = evidenceFor(busy).moments.length;
    expect(moments).toBeGreaterThan(0);
    expect(authoriseDebrief(EMPTY_LEDGER, budget, { requested: true, moments })).toEqual({
      allowed: true,
    });
  });

  it('still respects the budget once both gates are passed', () => {
    const spent: Ledger = { ...EMPTY_LEDGER, calls: 1, spentUsd: 1 };
    expect(authoriseDebrief(spent, budget, { requested: true, moments: 6 })).toEqual({
      allowed: false,
      reason: 'budget-spent',
    });
  });
});
