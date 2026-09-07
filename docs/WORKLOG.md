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
- [x] `packages/engine` domain types: `Player`, `Club`, `Tactics`, `MatchInput`, `MatchResult`, `MatchTrace`, `CauseTag`

**Step 1 is complete.**

### Step 2 — content and data
**Order changed by ADR-002: content format first, Postgres last.** A schema derived from real content
is right; one guessed in advance is migration debt. It also means Steps 3 and 4 — the engine and the
balance gate, the hardest part of the project — can run against real Egyptian data with **no database
at all**.

- [x] **Leagues are data, not code** — `@dakka/content`, Zod-validated, `loadLeague()` knows no country (global-strategy §8.4)
- [x] Latin-script `slug` on every named entity (global-strategy §8.3)
- [x] The Egyptian fourth division: 20 clubs across 14 real governorates, 420 players, ~24 attributes each
- [x] Fixture generation from the league file (round-robin count is a field, not code) → a 38-round schedule
- [ ] Travel distance from club coordinates, used as a fatigue input
- [ ] *(deferred to after Step 4)* Postgres schema + migrations + `pnpm db:seed`

### Step 3 — the engine

**Read this before starting any box below.** The engine is the entire competitive claim, and it is
the one part that cannot be retrofitted. So it is broken into small pieces that can each be finished,
tested and pushed on their own. Do **one** box per run. Do not attempt two. A half-built matchup
resolver pushed at the end of a run is worse than nothing, because the next run inherits it without
knowing what was intended.

Boxes marked ⚠️ carry the most judgement. If a run cannot do one well, the right move is to push a
note under "## Blocked" describing what is hard about it and stop — not to produce a plausible
version that passes tests but models nothing.

- [ ] **3a. Seeded PRNG.** A tiny injectable `Rng` interface (`next(): number` in [0,1), plus
      `int(min,max)` and `pick(array)`). One implementation, seeded from a string. No engine logic yet.
      Test: same seed ⇒ identical sequence over 10,000 draws; two different seeds differ; the
      distribution is roughly uniform. This is the foundation everything else rests on and it is
      genuinely small — a good first engine run.
- [ ] **3b. Zone model.** Divide the pitch into named zones and map each `Position` to the zones it
      occupies and contests. Pure data plus a lookup. No probabilities yet.
      Test: every position maps to at least one zone; the eleven positions of a 4-3-3 cover the pitch.
- [ ] **3c. ⚠️ Space and matchup resolution.** Given both sides' `Tactics` (line height, width,
      compactness) and their players in a zone, compute how much space each side has there.
      This is the heart of the product: the same tactical choice must help in one context and hurt in
      another. Test that explicitly — construct two opponents where a high line wins and where it
      loses, and assert the sign of the effect flips. If it cannot flip, it is a scalar in disguise.
- [ ] **3d. Possession chain.** `BUILD_UP → PROGRESSION → FINAL_THIRD → SHOT → outcome`, with
      `TURNOVER` transitions, driven by 3c. Counters incremented as events occur.
      Test: a match produces a plausible number of chains; possession ticks sum correctly.
- [ ] **3e. ⚠️ xG from shot context.** Distance, angle, pressure, body part, situation → probability.
      Calibrate against public xG norms (penalty ≈ 0.76, a six-yard tap-in high, a 30-yard shot low).
      Test known situations against expected ranges. Never derive xG from the outcome.
- [ ] **3f. Fitness, momentum, cards, substitutions** over 90 minutes, feeding back into 3c.
- [ ] **3g. Assemble `simulate(MatchInput): MatchResult`** and assert the whole-match determinism
      property: same seed ⇒ byte-identical `MatchResult`, over 1,000 runs.

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

## Note for whoever runs next

The engine (Step 3) is decomposed deliberately. Two rules for it:

1. **One box per run.** The boxes are sized so a single run can finish, test and push one.
2. **A ⚠️ box you cannot do well should be pushed as a blocker, not as a plausible-looking
   implementation.** The failure mode that would kill this product is an engine that passes its
   tests while modelling nothing — because then the decision trace explains a simulation that is not
   real, and a confident wrong explanation is worse than no explanation. The 10,000-season harness in
   Step 4 exists to catch exactly that, but it is much cheaper to not write it in the first place.

## Log

- **2026-09-07** — Planning complete. Seven agents and two skills built and registered. Step 1 foundation landed: pnpm workspace, TS strict, engine package with a purity guard, CI on push. Autonomous loop armed (every 6h).
- **2026-09-07** — **Fixtures.** `generateFixtures()` / `roundsInSeason()` in `@dakka/content`. Circle-method round-robin; the number 38 appears nowhere in code — it falls out of `(clubs − 1) × roundRobin` read from the league file. Tests assert every pair meets exactly twice **once at each ground**, every club gets 19 home and 19 away, no club plays twice in a round, and an odd club count rests one side per round rather than failing. A second test changes `roundRobin` and the club count on a copy of the league and checks the season reshapes itself — that is the "data not code" contract under test, not just asserted in a comment.
  - **Next run:** travel distance from the stored club coordinates (haversine), exposed so the engine can take it as a fatigue input. After that, Step 3 — the engine.
- **2026-09-07** — **Step 2, first slice.** `@dakka/content` landed: Zod content schema, loader, and the Egyptian fourth division as data — 20 clubs across 14 governorates, 420 players. Everything that differs between football cultures (round-robin count, promotion/playoff/relegation slots, points per result) is a **field**; `loadLeague()` contains no country-specific branch, so adding Vietnam is a data change.
  - Squads come from a deterministic build-time generator whose output is committed as data. ADR-002 §3 sets out why that is authored content and not the fabricated-statistics pattern — and the determinism is covered by a test that regenerates and compares byte-for-byte.
  - `packages/content/data/clubs` is Prettier-ignored on purpose: the generator owns that formatting, and Prettier fighting it turned the determinism test into a false failure once already.
  - **Next run:** fixture generation. Read `roundRobin` from the league file — do not hardcode 38. Then travel distance from the stored coordinates.
- **2026-09-07** — **Step 1 complete.** Domain types landed: branded ids, ~24 player attributes across technical/physical/mental/goalkeeping, `PlayerRole` as an axis separate from `Position`, tactics as a shape (line height, pressing intensity + trigger, tempo, directness, width, compactness) rather than a multiplier, `InMatchDecision` as a discriminated union so every decision is counterfactual-able, shots carrying their own context so xG is derived, `SideStats` documented as counters only, and `CauseTag` + `CAUSE_REGISTRY`.
  - `Record<CauseTag, CauseMeta>` makes an unregistered cause a **build error** — verified by adding one and watching TS2741 fire.
  - `Named` carries a Latin `slug`, so global-strategy §8.3 is already satisfied at the type level.
  - `test/fixtures.ts` builds a complete `MatchInput` by hand. It exists to prove the types are usable before the seeder, API and client depend on them.
  - **Next run:** Step 2. Note that global-strategy §8.4 (a league is data, not code) is a schema constraint, not a nice-to-have — design the seed format before writing migrations.
