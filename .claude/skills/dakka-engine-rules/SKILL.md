---
name: dakka-engine-rules
description: The non-negotiable invariants of the Dakka match engine. Load before touching packages/engine, the balance harness, any statistic shown in the UI, or anything that produces a match outcome. Use when working on simulation, xG, tactics resolution, match statistics, or the decision trace.
---

# Dakka engine invariants

The entire product rests on one claim: **every number we show is derived from a cause we can point at.**
These rules exist so no agent, in any future session, quietly breaks that claim.

## 1. Purity

`packages/engine` imports nothing but its seeded PRNG. No I/O, no clock, no network, no globals,
no framework. It runs byte-identically in a browser and on a Node server. That is not tidiness —
it is what lets offline play, server-authoritative PvP, and the daily challenge share one codebase.

## 2. Determinism

```
simulate(seed, matchInput) === simulate(seed, matchInput)   // always, byte for byte
```

Every source of randomness takes the injected PRNG. A bare `Math.random()` anywhere in the package
is a bug, not a style issue. Determinism buys four features: counterfactual replay, a genuinely
fair daily challenge, honest PvP, and reproducible bug reports. Break it and all four die at once.

## 3. Never back-fill a statistic

This is the pattern we exist to be better than, taken verbatim from a shipped competitor:

```js
homeShots = Math.max(homeShots, homeScore + Math.floor(Math.random() * 4 + 2));
```

The score was decided first, then plausible-looking stats were invented on top. The stats screen
therefore describes nothing that happened.

**In this codebase:** shots, corners, possession, and xG are incremented by the chain as it runs.
If a statistic is not a counter incremented at the moment the event occurs, it does not ship.

## 4. Tactics resolve through matchups

A global multiplier is not a tactical model:

```js
if (mentality === 'attacking') attack *= 1.08;   // ← not this
```

Transition probability comes from: the two shapes (line height, width, compactness) → space per zone;
the specific players contesting that zone; their fatigue; role fit and familiarity; and game state
(score, minute, momentum, cards). The same choice must be able to help in one context and hurt in
another. If it cannot, it is a scalar wearing a costume.

## 5. xG comes from shot context

Distance, angle, pressure, assist type, body part. It is an output of the chain, never an input,
and never a headline number reverse-engineered from the score.

## 6. Every match emits a trace

```ts
type SwingMoment = {
  minute: number;
  cause: CauseTag;          // machine-readable, a closed enum
  deltaWinProbability: number;
  actors: PlayerId[];
};
```

5–8 moments per match. This is the only thing the AI layer is allowed to read about the match.
If the trace is thin, the debrief is short — the model does not fill the gap.

## 7. The harness is a gate

Any change to balance constants requires a fresh 10,000-season run and a report of the deltas.
Thresholds live in `docs/01-product/03-technical-blueprint.md`. Failing the harness blocks the merge,
and the engine gets fixed — the thresholds do not get lowered.
