# Dakka — working agreement

An Arabic football management game whose central claim is: **every number we show is derived from a
cause we can point at.** Read `docs/` before changing anything; `docs/decisions/` is binding.

## Status

Steps 1–9 of the build plan are done: content, the engine and its harness, the AI boundary, the
thin client, persistence and the API, the season, the board, and the dashboard. The loop runs end
to end in the browser but does not yet survive a reload. Build order is in
`docs/01-product/04-build-plan-and-team.md`; what happens next is in `docs/WORKLOG.md`, which is
the single source of truth for it.

## The three rules that outrank everything

1. **Never fabricate data.** No statistic is ever assigned rather than counted. The pattern
   `stats.shots = max(stats.shots, goals + random())` is what a shipped competitor does and is the
   single thing this product exists to be better than.
2. **The model never decides an outcome.** AI explains, converses and generates. Code decides.
   No LLM output becomes a game number except through a typed, validated effect schema.
3. **The engine stays pure and deterministic.** `packages/engine` has no I/O and no unseeded
   randomness. Same seed ⇒ identical match. This buys counterfactual replay, a fair daily challenge,
   honest PvP, and reproducible bugs — all four die together if it breaks.

## Four things that keep global expansion possible

The product ships Egypt first and expands one market at a time. That only stays cheap if these are
structurally true from the start — retrofitting any of them is a rewrite, not a rollout.
Full reasoning in `docs/01-product/05-global-strategy.md`.

1. **Causes are a closed enum, never generated prose.** `CauseTag` + `CAUSE_REGISTRY` in
   `packages/engine/src/types`. `Record<CauseTag, CauseMeta>` makes an unregistered cause a build
   error. Translating a locale is then a lookup table, not a rewrite — and the AI layer physically
   cannot narrate a cause the engine did not emit.
2. **Two locales ship from the first screen** — `ar-EG` and `en`, neither a translation of the other
   (ADR-003, superseding ADR-001 #2). One locale lets hardcoded strings hide; you find them on the
   day you add the second, which is too late. The _content_ stays the Egyptian fourth division.
3. **Every named entity carries a Latin-script `slug`** alongside its local name (the `Named`
   interface). A share card has to read in any locale.
4. **A league is data, not code.** Adding a country is a seed file. If supporting a new league would
   require a code change, the schema is wrong.

## Layout

```
DESIGN.md           the visual system — load before writing any UI, no exceptions
packages/engine     pure TS simulation — no I/O, seeded, runs on client and server
apps/web            React 19 + Vite + Tailwind, RTL-native
apps/api            Fastify service; auth and persistence via Supabase
docs/               source of truth — research, blueprint, ADRs
.claude/agents/     the seven agents and their boundaries
.claude/skills/     dakka-engine-rules · dakka-arabic-voice
```

## Before you write UI

Read `DESIGN.md` first and bound the task to one screen or one component family. It carries the
palette, the type scale, the RTL rules Arabic actually needs, and a list of things never to build —
including the two that matter most here: **never show a number whose cause cannot be reached**, and
**never a skeleton loader shaped like content**, which is a fabricated statistic wearing a different
costume.

## Before you finish

`pnpm lint && pnpm typecheck && pnpm test`, and for any engine change, `pnpm harness` —
which must stay inside the thresholds in `docs/01-product/03-technical-blueprint.md`.
Failing the harness blocks the merge; the engine gets fixed, the thresholds do not get lowered.
