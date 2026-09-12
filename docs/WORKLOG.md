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

## Loop health — read this if the branch has gone quiet

Two independent routines drive this loop, on purpose, because the first one failed silently for
four days and nothing inside it could report that.

| | |
|---|---|
| `trig_01MiGgaizGR9rP72iPdkRo7e` | fires into a **persistent session**, `21 */6 * * *` (00:21 · 06:21 · 12:21 · 18:21 UTC) |
| `trig_017gCYPs5L6e87wS3kahpv9i` | fires a **fresh container** each time, `21 3,9,15,21 * * *` — offset three hours so the two never run together |
| `.github/workflows/heartbeat.yml` | outside both. Fails the job — which emails the owner — if the branch is stale ≥26h while boxes remain |

**What went wrong, 2026-09-08 → 2026-09-12.** `3b` landed on 08 Sep at 06:22 and nothing landed
again until 12 Sep. Every scheduled fire in between reported `SUCCEEDED`, which was misleading: for a
routine bound to a persistent session that status records only that the **wake was delivered**, not
that any turn ran. The best-supported explanation is that a remote container is reclaimed after a
period of inactivity, and a six-hour gap between ticks is longer than that window — so each wake
arrived at a session with nothing alive to execute it and queued instead. Consistent with the
evidence: the loop worked while the session was in active use on 07–08 Sep, stopped as soon as it was
left alone, and the backlog ran the moment the session was next opened.

**CONFIRMED the same day, by direct observation.** The moment the session came back to life,
**seventeen** build ticks arrived at once — every fire from 08 Sep 12:23 through 12 Sep 12:21,
delivered in one batch, none of them previously executed. The last tick that actually ran was 08 Sep
06:22, which is exactly the commit the branch was stuck on. So the wakes were never lost and the
routine was never broken; they queued against a session with no live container and waited for
someone to open it. Nothing inside a loop built that way can ever report its own failure, because
the thing that would report it is the thing that is not running.

**The consequence for anyone reading later:** `last_run: SUCCEEDED` on a persistent-session routine
means the wake was handed over, and nothing more. Do not read it as evidence that work happened.
The only honest health signal is a commit on the branch, which is why the heartbeat workflow
measures exactly that and nothing else.

**The watchdog worked.** Runs 2, 3 and 4 (09, 10 and 11 Sep) all failed deliberately and emailed the
owner. That part of the design is verified rather than hoped for — the alerting caught a real stall
on the first day it happened.

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
- [x] Travel distance from club coordinates, used as a fatigue input
> **Deferred, deliberately — do not pick this up.** Postgres schema, migrations and `pnpm db:seed`
> wait until after Step 4. ADR-002 explains why: the engine and the balance gate run against content
> files with no database at all, and a schema written after the engine exists is a transcription
> rather than a guess. It is written as a quote and not a checkbox so an autonomous run does not read
> it as the next task.

### Step 3 — the engine

**Read this before starting any box below.** The engine is the entire competitive claim, and it is
the one part that cannot be retrofitted. So it is broken into small pieces that can each be finished,
tested and pushed on their own. Do **one** box per run. Do not attempt two. A half-built matchup
resolver pushed at the end of a run is worse than nothing, because the next run inherits it without
knowing what was intended.

Boxes marked ⚠️ carry the most judgement. If a run cannot do one well, the right move is to push a
note under "## Blocked" describing what is hard about it and stop — not to produce a plausible
version that passes tests but models nothing.

- [x] **3a. Seeded PRNG.** A tiny injectable `Rng` interface (`next(): number` in [0,1), plus
      `int(min,max)` and `pick(array)`). One implementation, seeded from a string. No engine logic yet.
      Test: same seed ⇒ identical sequence over 10,000 draws; two different seeds differ; the
      distribution is roughly uniform. This is the foundation everything else rests on and it is
      genuinely small — a good first engine run.
- [x] **3b. Zone model.** Divide the pitch into named zones and map each `Position` to the zones it
      occupies and contests. Pure data plus a lookup. No probabilities yet.
      Test: every position maps to at least one zone; the eleven positions of a 4-3-3 cover the pitch.
- [x] **3c. ⚠️ Space and matchup resolution.** `packages/engine/src/space.ts`. Two guarantees are
      asserted mechanically rather than argued: **shape tactics conserve presence** — line height,
      mentality, width and compactness are implemented only as transfers between zones, verified
      across all 180 combinations, so no setting can ever be a bonus — and **the sign of the effect
      flips with the opponent**, for all three shape knobs. The gate was itself verified: making the
      line-height term opponent-independent breaks exactly the three tests that should break.
- [x] **3d. Possession chain.** `packages/engine/src/chain.ts`. Every transition probability comes
      from the space map for the zone the ball is actually in, so a shot exists because a side got
      through three specific zones against a specific opponent. The chain emits a `ShotContext` and
      **stops** — it has no way to know whether the shot went in, which is what makes "xG is never
      reverse-engineered from the result" structurally true rather than a promise.
      **What 3c hands you:** `resolveSpace(attack, defend) → SpaceMap`, zones in the *attacking*
      side's frame. `space` is weighted bodies of overload, **not** a probability — 3d owns that
      mapping and should calibrate it against Step 4's thresholds rather than guess it. Two identical
      55-rated 4-3-3s give bands of roughly `defensive +1.8 · middle −0.1 · attacking −1.7`, so the
      final third is legitimately the hardest place to find room. Take the route from
      `bestAttackingZone(map)`: the grid *total* is the wrong signal, because every shape setting
      conserves it by construction — only line height and press change how much space exists at all.
      `map.causes` is already derived from the numbers that produced it, so Step 5 reads causes
      instead of inventing them.
- [ ] **3e. ⚠️ xG from shot context.** Distance, angle, pressure, body part, situation → probability.
      Calibrate against public xG norms (penalty ≈ 0.76, a six-yard tap-in high, a 30-yard shot low).
      Test known situations against expected ranges. Never derive xG from the outcome.
      **What 3d hands you:** `ShotContext = Omit<Shot, 'xg' | 'outcome'>` — minute, side, shooter,
      `distanceM`, `angleDeg`, `pressure` (5–98), `bodyPart`, `situation`. Turning it into a `Shot`
      is exactly your job. You physically cannot cheat here: the chain never computed an outcome, so
      there is nothing to reverse-engineer from.
      **The number that matters:** two even 55-rated sides produce **23.6 shots a match** with a mean
      distance of **18.1 m**. The blueprint wants 2.5–2.8 goals a match, so mean xG per shot has to
      land near **0.11**. Calibrate the curve on the football norms first and then check it against
      that figure — if it comes out far away, say so in the log rather than bending the curve to hit
      it, because the shot *rate* may be what is wrong and Step 4 is what decides.
- [ ] **3f. Fitness, momentum, cards, substitutions** over 90 minutes, feeding back into 3c.
      `fitnessFactor()` is already applied inside `tacticalPresence`, so 3f only has to update
      `PlayerCondition.fitness` between ticks — it does not have to retrofit fatigue into the
      resolver. Tiredness shrinks a side's *total* presence, deliberately the one thing no tactic
      can do.
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

**Step 2 is complete except the deferred Postgres work. Next is the engine.**

## Note for whoever runs next

The engine (Step 3) is decomposed deliberately. Two rules for it:

1. **One box per run.** The boxes are sized so a single run can finish, test and push one.
2. **A ⚠️ box you cannot do well should be pushed as a blocker, not as a plausible-looking
   implementation.** The failure mode that would kill this product is an engine that passes its
   tests while modelling nothing — because then the decision trace explains a simulation that is not
   real, and a confident wrong explanation is worse than no explanation. The 10,000-season harness in
   Step 4 exists to catch exactly that, but it is much cheaper to not write it in the first place.

## Log

- **2026-09-12** — **3d: the possession chain.** `packages/engine/src/chain.ts`. A match is a sequence
  of possessions; each walks `BUILD_UP → PROGRESSION → FINAL_THIRD → SHOT` and every transition
  probability is read from the space map for the zone the ball is actually in.
  - **What it refuses to do matters more than what it does.** The chain emits a `ShotContext` and
    stops. It never resolves a shot, so it never knows a result, so nothing downstream of it can be
    derived from one. That is a structural guarantee rather than a rule someone has to remember.
  - **It also does not count passes.** The chain models a phase of play, not individual passes, so
    there is no honest moment at which to increment a pass counter. `passesAttempted` and
    `passesCompleted` therefore stay unset and **must not be displayed** until something actually
    simulates passes. Under-reporting is recoverable; a plausible invented number is the whole
    competitor.
  - **Verified by fabricating on purpose.** Adding the competitor's literal line —
    `shots = Math.max(shots, 8 + random())` — fails two accounting tests immediately: the counter no
    longer matches the shots actually emitted, and the phase funnel stops narrowing. A shot is
    physically unreachable unless a possession got through build-up and progression first.
  - **Calibration, against two even 55-rated sides:** 23.6 shots, 143 possessions, 7.9 corners, 18.1 m
    mean shot distance, possession 50/50. Counters are 2.2 a match, and a counter shot is measurably
    less pressed than an open-play one — derived from the defence being out of shape, not assigned.
  - **Tempo buys the ball or spends it.** A slow, short side holds each possession longer and finishes
    with 69% of the ball against a fast, long one. Possession share is an outcome of that trade and is
    computed from counted ticks at the moment it is asked for.
  - **Two things for Step 4 to judge, flagged rather than hand-tuned.** (1) An ultra-attacking side on
    a very high line took slightly **fewer** shots (11.8) than an ultra-defensive deep opponent (12.7).
    That may well be wrong — a deep block should create less — but the harness is the authority and
    tuning to intuition before it exists is how thresholds get quietly fitted to the engine instead of
    the other way round. (2) Corners run at 7.9 a match against a real ≈10.3.
  - **For the data layer:** footedness is not modelled. There is no `preferredFoot` attribute, so
    which foot a shot comes off is drawn rather than derived, and says so in the code. It is a weak
    xG input and should be replaced the moment the player schema carries a foot.
  - Two type errors that the tests could not see — `tsc` caught both. `entryPhase` can never be
    `SHOT`, which made a guard dead code and the inference circular; naming `EntryPhase` and
    `FieldPhase` fixed both and made the invariant explicit: winning the ball high starts you past
    the build-up, it does not hand you a shot.
  - 120 tests green, lint/typecheck/format clean.
  - **Next run: 3e ⚠️, xG from shot context.** Read the "What 3d hands you" note on that box first —
    especially the mean-xG-per-shot figure and the instruction not to bend the curve to hit it.

- **2026-09-12** — **3c: space and matchup resolution.** `packages/engine/src/space.ts` — the heart of
  the engine, and the one box where a plausible-looking implementation would have been worse than
  nothing. Two properties carry the whole claim, and both are mechanical:
  - **Every shape setting is a conserved transfer.** `lineHeight` moves weight between the defensive
    and middle bands, `mentality` between middle and attacking, `width` between centre and flanks,
    `compactness` condenses around the block's gravity band and tucks the flanks in. Roles drift
    their own player the same way. Nothing anywhere adds. A test sweeps all 180 combinations of the
    four settings and asserts the grid total is unchanged to nine decimals. **A tactic that cannot
    raise your total cannot be a bonus in disguise** — the only thing it can do is change where you
    are strong, which is what a shape is. This is the mechanical form of the rule in
    `dakka-engine-rules` §4 and it is stronger than any comment.
  - **The sign flips.** A high line compresses the opponent's build-up *and* leaves grass behind the
    defence; which term wins depends on whether they can reach it. Against a slow side that builds
    short it costs them space (−0.34); against a quick side playing direct it gives space away
    (+1.59). Same setting, opposite sign. Going wide beats a narrow opponent and walks into a wide
    one. A tight block smothers a central side and is pulled apart by a wing-heavy one. All three
    are asserted as sign flips, not magnitudes.
  - **The gate was verified by breaking it.** Replacing the opponent-dependent `threat / recovery`
    term with a constant made exactly three tests fail — the two line-height flips and the cause
    that depends on them — and nothing else. A gate never seen to fail is not a gate.
  - Line height and mentality act on *different* band pairs on purpose, so they cannot double-count.
    One test asserted the wrong one and failed; the **assertion** was corrected, not the model, and
    it now pins the split in both directions.
  - Causes are computed here, from the numbers that produced them — `HIGH_LINE_VS_PACE` fires only
    when exposure actually exceeds compression, so a slow side facing a high line does not get it.
    That ordering is the difference between an explanation and a plausible story, and it means the
    Step 5 trace is a read rather than an invention.
  - `test/fixtures.ts` gained `patchClub`, `withRoles` and `makeSide`. A test that cannot make one
    side quick and another composed cannot demonstrate a context-dependent tactic at all.
  - 96 tests green, lint/typecheck/format clean.
  - **Next run: 3d, the possession chain.** Read the "What 3c hands you" note on that box before
    starting — in particular that `space` is not a probability and the grid total is the wrong
    signal to read.

- **2026-09-07** — Planning complete. Seven agents and two skills built and registered. Step 1 foundation landed: pnpm workspace, TS strict, engine package with a purity guard, CI on push. Autonomous loop armed (every 6h).
- **2026-09-08** — **3b done: the zone model.** A 3×3 grid (defensive/middle/attacking × left/centre/right), a `FOOTPRINTS` map from every `Position` to the zones it occupies and contests, `zoneOccupancy()` and `zoneStrength()`. Pure data and lookups, no probabilities — those are 3c's job. 15 tests, 71 total.
  - **Zones are team-relative and `mirror()` flips both axes.** The band flips because their defensive third is our attacking third; the **channel** flips too because our left winger meets their right-back. Flipping only the band would still pass a lazy test, so both are asserted by name.
  - `Record<Position, ZoneFootprint>` makes an unplaced position a build error — same guard as `CAUSE_REGISTRY`. A position the engine cannot locate would contribute nothing to any matchup, silently.
  - Occupancy returns **every** zone including empty ones. An unoccupied flank is a fact about the shape that 3c must be able to exploit, not a gap to skip.
  - Sanity check on a real 4-3-3: defensive centre 4.80, attacking centre 3.35, flanks symmetric at 1.45/1.80/1.90. That is the right shape for the formation.
  - **Next run: 3c ⚠️ — space and matchup resolution. This is the heart of the product.** The test that matters: build two opponents where a high line wins and where it loses, and assert the sign of the effect flips. If it cannot flip, it is a scalar in disguise and must not ship.
- **2026-09-08** — **3a done: the seeded PRNG.** `createRng(seed)` giving `next`/`int`/`bool`/`pick`/`fork`. 15 tests over 55 total.
  - **sfc32, deliberately not mulberry32.** Mulberry32 is the usual copy-paste choice but holds 32 bits of state and repeats after ~4.3 billion draws. One 10,000-season harness run makes billions of draws, so a balance experiment could land inside the repeat window and the harness would be measuring the generator instead of the engine. sfc32 carries 128 bits.
  - **`fork(label)` gives named substreams.** Without it, adding one coin flip to injury checks shifts every later shot, and a counterfactual would differ because the draw order moved rather than because the decision did. That would make the headline feature quietly meaningless.
  - Seed expansion avalanches, so `round-12` and `round-13` share nothing — tested with a correlation check across 20,000 draws, and by asserting zero agreeing values in the first 200.
  - The purity guard was confirmed to scan `rng.ts` (verbose run), which matters because this is the one file most tempted toward `Math.random()`.
  - One test failed on `Math.min(...sample)` with 200k arguments overflowing the stack — a test bug, fixed by reducing instead of spreading.
  - **Next run: 3b, the zone model.** Pure data plus a lookup, no probabilities. Then 3c ⚠️, which is the heart of the product.
- **2026-09-07** — **Travel.** Haversine distance, a road-distance estimate, and `travelBurden()` scaled to the longest trip in the league actually being played rather than a hardcoded country figure. Tests check the maths against real Egyptian distances (Cairo–Aswan ≈ 682 km, Cairo–Alexandria ≈ 180 km) and confirm the real fourth division produces a genuine spread — shortest hop under 80 km, longest over 700, a ratio above 10 — because a travel input where every trip is similar is a constant and worth nothing.
  - One test initially asserted that a flat lat/lon approximation is badly wrong over Egypt. It is not: north–south the error is 4 km. The **claim** was corrected rather than the threshold lowered. What haversine actually buys is longitude convergence, which shows up east–west — Siwa to Taba is 909 km real against 1041 km naive — so the test now measures that instead. Worth remembering when reading the harness thresholds in Step 4: a failing check is a claim to re-examine, not a number to move.
  - **Next run: Step 3a — the seeded PRNG.** Small, self-contained, and the foundation the whole engine rests on.
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
