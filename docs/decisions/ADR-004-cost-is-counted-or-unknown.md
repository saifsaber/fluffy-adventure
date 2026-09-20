# ADR-004 — Cost is counted or it is unknown, and caching is not a lever yet

**Status:** decided · **Date:** 2026-09-20 · **Affects:** blueprint §9 risk row "LLM cost per user per match"

## The decision

Two things, and the second only became decidable because the first was built.

1. **A cost figure in this product is either multiplied out of a `usage` object a real response
   returned, or it is marked unknown.** There is no estimated cost, anywhere, ever. A *ceiling* is
   allowed — an inequality that provably holds — as long as it is called a ceiling in the type, in
   the name and on the page.
2. **Prompt caching is not implemented, and does not become a cost control until a prompt carries a
   large static block.** The blueprint's "prompt caching for the static rules and club context" is
   deferred with a measured reason and a stated trigger, not dropped.

## Why the first one is not pedantry

The whole product is one claim: every number we show is derived from a cause we can point at. We
enforce that on shots, on xG, on possession, on the debrief's own sentences. Money is a number we
show — to ourselves, in the decisions we make about which model to buy — and the failure mode is
identical. `$0.004 per match, roughly` has exactly the epistemic status of
`stats.shots = goals + random()`: plausible, unfalsifiable, and wrong by an amount nobody can state.

It would also be the most expensive kind of wrong. A model choice made on an invented number is a
model choice that cannot be revisited when the number turns out to be off by 4×, because there is
nothing to compare against.

So `packages/ai/src/cost.ts` has one multiplication in it, `costOf(usage, call)`, and `Usage` is
exactly the four fields the wire reports. A call that comes back without usage is recorded as
**unmetered**, contributes nothing to the total, and **refuses further spending on that career**
until it is reconciled. A budget that ignores unaccounted spend is not a budget; it is a budget plus
an unknown.

## Why caching stops being a lever, with the numbers

`pnpm prompt-size` builds every prompt the package produces for 400 simulated matches in both
locales and measures them. Three results decided this.

**The cacheable prefix is one block, and it is small.** Caching is a prefix match, so only the
leading run of never-changing blocks can be cached. In a debrief prompt that is `system` alone —
`evidence` is second and depends on the trace, which makes everything behind it uncacheable.

| locale | prefix | bytes | ⇒ at most |
|---|---|---:|---:|
| `ar-EG` | `[system]` | 688 | 688 tokens |
| `en` | `[system]` | 468 | 468 tokens |

**The published minimum cacheable prefix is not monotonic, and the cheapest model has the highest
one.** A prefix under the minimum silently does not cache — no error, `cache_creation_input_tokens`
comes back `0`.

| model | minimum | our prefix |
|---|---:|---|
| `claude-opus-5` | 512 tokens | undecided from bytes alone |
| `claude-sonnet-5` | 1024 tokens | **provably too short** |
| `claude-haiku-4-5` | 4096 tokens | **provably too short** |

`claude-haiku-4-5` is the model the blueprint routes the *high-volume* work to. So caching buys
provably nothing on the volume path, which is the only path where volume makes it worth having.

**And the input side is not where the money is.** The proved worst case of one debrief is
**$0.087**, of which **92–94% is the output cap**, not the prompt. Caching cannot touch output
tokens at all. Even a perfect cache on a prefix that qualified would address the remaining 6–8% of
a ceiling.

`tokens ≤ bytes` is the only tokenizer-free bound that is sound — a BPE token covers at least one
UTF-8 byte — so it is what the "provably too short" column rests on. It points the safe way: it
over-states the prefix, so *too short* is a conclusion it can reach and *long enough* is not.

## What unblocks caching

One condition, and it is a real one: **a prompt gains a static block over 4096 tokens.** The
blueprint's own phrase names the candidate — club context. A squad with attributes, a season's
standings, the manager's own history: that is plausibly several thousand tokens, identical across
every match of that career, and it would sit in front of the per-match block.

Two things must be true before it counts as a saving:

1. The block is **genuinely static across requests that share it**, checked by diffing rendered
   prompt bytes, not by intending it. One interpolated minute or club name in the prefix and every
   request misses, silently.
2. `usage.cache_read_input_tokens` comes back non-zero on the second request. `cacheHitShare` in
   the ledger exists for exactly this: a cache is working when a response says so, and not when we
   placed a marker and hoped.

**Do not grow a prompt to make it cacheable.** A prefix padded past 4096 tokens costs 1.25× on the
write and full price on every uncached call, so growing a 300-token block to 4096 to save 10% of it
is a loss in every scenario. The block has to be there because the product needs it.

## What we built instead, in order of what it actually saves

1. **On demand, not automatic.** A debrief is bought when a manager opens one. Generating one per
   match on the way out of the whistle buys one for every match nobody reads, and costs the player
   nothing to skip, because the trace is on screen either way. This is the largest lever by a wide
   margin and it is free.
   The *second* refusal in the same gate — no debrief for a match whose trace named nothing — is a
   correctness gate, not a saving, and it is worth being exact about that: `pnpm prompt-size`
   measured **0 quiet matches in 400**. The engine reliably finds something to name, so this branch
   is about never paying a model to invent a reason for a match that had none, and it should not be
   counted as money.
2. **Determinism.** The engine is seeded, so the same match asked twice is the same match:
   `debriefCacheKey` means a debrief is bought once. That was built as a correctness property and
   turns out to be the second-largest cost control in the product.
3. **Routing.** The dear model answers the one surface that is both quality-critical and rare.
4. **The output cap read from the length rule.** `checkDebrief` discards a reply over
   `maxParagraphs × 260` characters, so `max_tokens` is derived from the same constant. The model is
   never paid to write text the validator will throw away, and the two numbers cannot drift apart
   because there is only one of them.
5. **Batch for anything nobody is waiting on** — half price on every token, cache included. The
   blueprint already lists AI pre-generation as a background job.

## What this does not decide

**Which model each surface should use.** `ROUTING` is a default with its reasoning written beside
it, not a measurement. Choosing properly means running the dialect eval against each candidate and
taking the cheapest that clears the bar, and that eval's held-out corpus is blocked (see
`docs/WORKLOG.md` → Blocked). Dropping `debrief` to `claude-sonnet-5` is the first lever to pull if
cost per career is ever too high — and it is a lever the eval must authorise rather than one we pull
on a hunch.

**What a career actually costs.** That needs token counts, which need the API. Until then the
ceiling is what we have, and it is labelled a ceiling everywhere it appears.
