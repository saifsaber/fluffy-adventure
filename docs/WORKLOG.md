# WORKLOG — autonomous handoff state

**This file is the single source of truth for "what happens next".**
A scheduled run starts with no memory of any conversation. It reads this file, does the next
unchecked item, and updates this file. Nothing else carries state between runs.

---

## Protocol for an autonomous run

1. `git pull` the working branch, read `CLAUDE.md`, then this file.
2. Take the **first unchecked box** under "Next up". Do only that one. Do not skip ahead.
3. Follow the invariants in `CLAUDE.md` and the two skills in `.claude/skills/`.
4. When it works: commit, push, tick the box, append a dated line to the log below.
5. If blocked: **do not guess and do not stop the loop.** Write the blocker under "Blocked",
   move to the next unblocked item, and continue.
6. Never ask a question. Nobody is reading in real time. Record the decision and its reasoning
   in `docs/decisions/` instead, and proceed on the most defensible option.
7. Leave the branch green. If tests fail, fix them or revert — never push red.

**Working branch:** `claude/modareb-competitor-planning-tqg7a8`

---

## Planning status — complete, do not redo

Research and planning are finished and approved. These exist and are binding:

- `docs/00-research/01-modareb-audit.md` — hands-on audit of the incumbent
- `docs/00-research/02-competitive-matrix.md` — competitors and positioning
- `docs/00-research/03-viral-tier-audit.md` — 38-0, Koordle, the distribution gap
- `docs/00-research/04-why-they-succeeded.md` — the success mechanics and the claim we sell
- `docs/01-product/03-technical-blueprint.md` — architecture, AI split, MVP
- `docs/01-product/04-build-plan-and-team.md` — the build order
- `docs/01-product/05-global-strategy.md` — global expansion and +MGR
- `docs/decisions/ADR-001` — scale and all eight product decisions, closed

**Do not reopen a decision in ADR-001.** If new evidence genuinely overturns one, write ADR-002
explaining why, and proceed.

---

## Next up

### Step 1 — foundation
- [x] `CLAUDE.md`, `/docs` source of truth, seven agents, two skills
- [x] pnpm workspace, TypeScript strict, shared tsconfig, lint + format
- [x] `packages/engine` scaffold with the purity guard test
- [x] CI: lint, typecheck, test on every push
- [ ] `packages/engine` domain types: `Player`, `Club`, `Tactics`, `MatchInput`, `MatchResult`, `MatchTrace`, `CauseTag`

### Step 2 — data and schema
- [ ] Postgres schema + migrations (careers, seasons, clubs, players, tactics, fixtures, matches, **match_traces**, **decisions**)
- [ ] **Leagues are data, not code** — a league is a seed file; adding a country never touches code (global-strategy §8.4)
- [ ] Latin-script `slug` on every club and player alongside the local name (global-strategy §8.3)
- [ ] Seed the Egyptian fourth division: 20 clubs, ~500 players, ~20 attributes each, full 38-round fixture list
- [ ] `pnpm db:seed` produces a complete queryable season from empty

### Step 3 — the engine
- [ ] Seeded PRNG wrapper; determinism test (same seed ⇒ byte-identical result, 1000 runs)
- [ ] Possession-chain state machine: `BUILD_UP → PROGRESSION → FINAL_THIRD → SHOT → outcome`
- [ ] Matchup resolution — space per zone from the two shapes, contested by the actual players in that zone
- [ ] xG from shot context (distance, angle, pressure, assist type, body part)
- [ ] Fitness, momentum, cards, substitutions
- [ ] Statistics counted as events occur — **never back-filled**

### Step 4 — the gate
- [ ] 10,000-season headless harness
- [ ] Thresholds per `docs/01-product/03-technical-blueprint.md`: goals/match 2.5–2.8 · home advantage +0.3–0.4 · xG↔goals r>0.9 · champion 78–95 pts · stronger side wins 55–65% · every tactic has a context-dependent effect · determinism 100%
- [ ] **Gate: no UI work begins until this passes.** Fix the engine, never the thresholds.

### Step 5 — trace and counterfactual
- [ ] `MatchTrace` emission — 5–8 swing moments with enum causes and win-probability deltas
- [ ] Counterfactual runner — same seed, one decision changed, N runs, outcome-distribution delta
- [ ] **+MGR** — season re-simulated under a neutral baseline manager; the points difference is the player's contribution (global-strategy §4)

### Step 6 — thinnest UI
- [ ] Pick tactics → play match → derived stats → the trace → one counterfactual
- [ ] RTL-native, Arabic, no design system yet — this screen exists to prove the engine

---

## Blocked

*(nothing yet)*

---

## Log

- **2026-09-07** — Planning complete. Seven agents and two skills built and registered. Step 1 foundation landed: pnpm workspace, TS strict, engine package with a purity guard, CI on push. Autonomous loop armed.
