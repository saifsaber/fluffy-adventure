# دكة — Dakka (working codename)

A next-generation Arabic football management game, planned as a competitor to
**«أنت المدرب» (modareb.ai.studio)**.

> **Status: planning only. No product code has been written.**
> This repository currently contains research and the approved-pending blueprint.

## The thesis

Every football management game on the market decides the result first and then presents
numbers. We invert it: **the result is the consequence of a causal chain, and every number
shown is derived from that chain.** That one architectural commitment is what makes the
differentiating features possible — decision traces, honest analytics, counterfactual replay,
and an AI that explains rather than fabricates.

## Documents

| Doc | What's in it |
|---|---|
| [`docs/00-research/01-modareb-audit.md`](docs/00-research/01-modareb-audit.md) | Full hands-on audit of Modareb: IA, core loop, match engine internals, strengths, evidence-backed weaknesses, explicit UNKNOWNs |
| [`docs/00-research/02-competitive-matrix.md`](docs/00-research/02-competitive-matrix.md) | Direct + adjacent competitors, the AI-football gap, market data, feature matrix |
| [`docs/00-research/03-viral-tier-audit.md`](docs/00-research/03-viral-tier-audit.md) | 38-0 (both products), its retention stack, Koordle and the Arabic daily-game tier — and the distribution gap this exposed in the plan |
| [`docs/01-product/03-technical-blueprint.md`](docs/01-product/03-technical-blueprint.md) | Product thesis, AI/not-AI split, match engine design, architecture, database, MVP, risks, open decisions |
| [`docs/01-product/04-build-plan-and-team.md`](docs/01-product/04-build-plan-and-team.md) | Skills inventory, open-source evaluation, agent team, and the exact step-by-step build plan |
| `docs/00-research/screens/` | Screenshots captured while playing Modareb |

## The rule that governs everything

**AI never decides an outcome. AI explains, converses, and generates. Code decides.**

No LLM output ever becomes a game number except through a typed, validated effect schema
that the engine applies. If a screen shows a number, a pure function produced it.

## Why determinism

The engine is deterministic given a seed. That one decision buys four things:
counterfactual replay, a genuinely fair daily challenge (identical fixture and seed for every
player, so the only variable is decision quality), honest PvP, and a share artifact that is an
*argument* rather than a score. Competitors can copy none of them without rebuilding their engine.

## Next step

Awaiting approval of the blueprint before Step 1 of the build plan begins.
