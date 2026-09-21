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

One routine drives this loop, `trig_01MiGgaizGR9rP72iPdkRo7e`, firing into a persistent session every
**three** hours (`21 */3 * * *`). `.github/workflows/heartbeat.yml` watches it from outside and fails the
job — which emails the owner — if the branch is stale ≥26h while boxes remain.

### What actually stopped it, 2026-09-08 → 2026-09-12

**The account's weekly usage limit was exhausted.** A sibling session on the same account records it
verbatim: *"You've hit your weekly limit · resets Sep 12, 12pm (UTC)"*, with a seven-day rate limit in
`rejected` state. The window reset at 12:00 UTC on 12 Sep and the very next scheduled tick, 12:21,
ran and built 3c. Every fire in between — seventeen of them — queued unexecuted and arrived in one
batch afterwards.

**The heartbeat named this on day one.** Its alert text lists *"Weekly usage quota exhausted — it
resumes on its own when the window resets"* as cause number one, and it fired on 09, 10 and 11 Sep.
The watchdog was right and was not read.

### A wrong diagnosis, recorded so it is not repeated

Earlier on 12 Sep this file claimed the cause was **container reclamation** — that a six-hour gap
outlived the container, so wakes arrived with nothing to execute them — and labelled it CONFIRMED on
the strength of those seventeen queued ticks. **That was wrong.** Queued ticks show that turns did not
run; they say nothing about why. The rate-limit record does, and it fits the timing exactly, to the
minute of the reset.

Two lessons worth more than the fix:

1. **A symptom consistent with your theory is not evidence for it.** The queue was equally consistent
   with the true cause, and the true cause was already written down in the alert.
2. **Check the cheap signal first.** One `list_sessions` call carried the answer the whole time.

### The fresh-container runner, tried and removed

A second routine was created that fires a fresh container per tick, on the theory above. It ran once
at 15:21 for seven minutes and **pushed nothing**, because a routine created through the API gets no
repository attached — `sources` and `outcomes` are both empty — so the session can clone this public
repo but has no credentials to push back. The routine could not do the one thing a build loop exists
to do, and every fire spent weekly allowance to achieve nothing, so it was deleted.

### The cadence, and when to back it off — 2026-09-17

Raised from six hours to three (4 ticks a day → 8) because the owner said they would stop using
their allowance elsewhere for the rest of the month and put it all here. That is the only reason it
is safe: the binding constraint has always been the **weekly** allowance, not the schedule.

**What doubling buys, honestly.** More attempts, not better ones. The hard engine boxes are hard
because they are multi-constant re-fits, and a second attempt three hours later is the same attempt.
Where it pays is the twenty-six boxes of Steps 7–12, which are mostly ordinary build work and are
genuinely rate-limited by tick count.

**What it costs.** This session's context grows with every tick, and that context is the largest cost
per tick — so eight ticks a day is more than twice the burn of four, not exactly twice.

**The back-off rule.** If the branch goes quiet for more than a day while boxes remain, the weekly
window has almost certainly been exhausted; the heartbeat will say so. **Do not add runners** — that
was tried and doubled the burn on the very budget that was the limit. Put the cron back to
`21 */6 * * *`, note the date here, and let the window reset. A loop that runs slowly all month beats
one that sprints for three days and stalls for four, which is exactly what happened 8–12 Sep.

### What this means for how the loop is run

The mechanism was never broken. The binding constraint is the **weekly allowance**, and the loop
resumes by itself when the window resets — exactly as the heartbeat says. Throughput is therefore
bought by making each tick cheap, not by adding runners: a second routine would have doubled the burn
on the very budget that was the limit. The largest cost per tick is this session's own accumulated
context, which is why boxes are sized to be finished and pushed in one run.

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
- [x] **3e. ⚠️ xG from shot context.** `packages/engine/src/xg.ts`. A logistic on distance and the
      angle of goal available, solved for five published anchors and asserted against all five.
      `expectedGoals(shot: ShotContext): number` — it cannot see the outcome, and it cannot see the
      shooter either. The second omission is the important one: if a striker's finishing raised his
      xG, "he should have scored" would be unsayable, because the yardstick would move with the man
      being measured.
- [x] **3d·fix. ⚠️ Shot quality distribution.** Replaced the per-zone distance and angle constants
      with real geometry driven by how far the attack penetrated. Goals a match went **1.15 → 2.63**
      (blueprint wants 2.5–2.8) and mean xG per shot **0.047 → 0.115** (football is ~0.11), without
      touching the xG curve. The distance bands are now asserted against published football.

- [x] **3f. Fitness, momentum, cards, substitutions.** `packages/engine/src/condition.ts` plus live
      match state in `chain.ts`. **This is the box that makes 3c live:** the space maps are now
      rebuilt whenever something discrete happens — a substitution, a sending-off, a shape change —
      and otherwise every 30 ticks so accumulated fatigue reaches the resolver. Before it, both maps
      were resolved once at kick-off, which made every in-match decision decoration.

- [x] **3g. Assemble `simulate(MatchInput): MatchResult`.** `packages/engine/src/simulate.ts`.
      Determinism asserted over **1,000 runs** of the same seed, byte-identical. The one thing it
      adds is the **score**, which no earlier stage was allowed to know: shots are resolved as they
      are struck, so a side behind late throws bodies forward — and a shot's context is frozen
      before it is resolved, so nothing is ever shaped by its own outcome.
      `passesAttempted`, `passesCompleted`, `offsides` and `assists` are now **optional and absent**,
      because nothing counts them. Absent is not zero, and the compiler enforces the difference.

**Step 3 is complete. The engine runs a whole match.**

### Step 3·gap — what Step 4 will fail on

Measured with `simulate()` over 500 matches of two even 55-rated sides. Both of these are real
missing models, not tuning, and the harness cannot pass without them.

- [x] **⚠️ Home advantage — built, and it delivers +0.14 of the required +0.30–0.40.** Three named
      channels, each individually tested: fresher legs (a crowd is adrenaline, routed through the
      fatigue channel), the front foot (a conserved band transfer, so it can be punished), and the
      referee (the best-evidenced component in the literature). An empty ground gives 0.004; a full
      house 0.140; a derby 0.179. It also **grows through the match** — 0.056 in the first half,
      0.084 in the second — which is what the real game does and which falls out of the adrenaline
      channel rather than being scripted. The remaining gap is **not** a crowd problem; see below.

- [x] **⚠️ The deep block. Three of the four rows fixed; the fourth has a new and different cause.**
      Two changes, each with a clear football reason:
      1. **Line height moves the whole team.** It used to transfer defence↔midfield only, so a deep
         side kept every forward exactly where it was — a team cut in half, and the reason sitting
         off was free. It is now a flow across all three bands. Mentality still moves midfield↔attack
         and nothing else, so the two knobs remain genuinely different: **line height says where the
         block sits, mentality says how many commit forward within it.**
      2. **Congestion buys quality, not volume.** A packed final third was suppressing *whether* a
         side shot as well as *where from*, charging the same congestion twice. You can always have a
         go from the edge of the box; what a packed area takes away is getting inside it.

      | row | before | after |
      |---|---|---|
      | 3d·fix — chances conceded by a deep block vs a high line | 14.8 m vs 15.3 m (backwards) | **16.1 m vs 13.4 m** |
      | home advantage vs a deep away side | +0.140 → **−0.001** (erased) | **+0.205**, above the +0.175 even case |
      | shot volume conceded by a low block | 0.84× a high line | **1.01×** |
      | goals per match | 2.85 | **2.83** |

- [x] **⚠️ Row 1: the frame error — landed, with every constant re-fitted against the harness.**
      Zones are thirds of the *pitch* now, not thirds of a shape. Each side gets an offset from its
      line height, both are sampled onto a shared 0–2 coordinate, and with neither offset it reduces
      **exactly** to the old `mirror()` pairing — asserted by a test, so everything calibrated before
      it is still calibrated. `LINE_SHIFT` is gone: it and the offset both modelled "the team drops",
      and applying both double-counted it.

- [x] **Sanity-check the strength curve against real league spread.** Done by the harness, on the
      real Egyptian ratings rather than invented extremes: the stronger side takes **0.632** of the
      points on offer in mismatched fixtures, against a wanted 0.55–0.65. The invented-extremes
      figure that started this (a 68-rated side beating a 46-rated one 93% of the time) was never
      the right question — the threshold is about a *league's* typical gap.

### Step 4 — the gate
> **Two things measured in 3f for the harness to judge.** (1) Goals a match are **2.85** against the
> stated 2.5–2.8: open play and set pieces give 2.68, which is inside the band, and correctly-rated
> penalties add 0.19 on top. Each component matches real football on its own, so detuning one to slip
> under the ceiling would break something that is currently right. (2) The attacking-vs-deep-block
> pairing has now thrown three odd readings across 3d, 3d·fix and 3f, and wants a proper look.

- [x] **10,000-season headless harness.** `packages/harness` — runs whole seasons of the real
      Egyptian fourth division through `simulate()`, on real grounds, real crowds and real distances
      between Egyptian towns, and checks the result against the blueprint. Thresholds live as data
      with their source beside them, and `test/harness.test.ts` **pins their exact values** so
      loosening one means deleting a test. A check that could not be measured reports `??`, never a
      pass: a green report that skipped something is worse than a red one.
- [x] Thresholds per `docs/01-product/03-technical-blueprint.md`, as data in `metrics.ts`.
- [x] **Gate: no UI work begins until this passes.** **It passes — 7 of 7.** UI work is unblocked.
- [x] **`pnpm harness` wired into CI**, at 20 seasons (7,600 matches, ~40 s) on every push.

### Step 4·verdict — ALL SEVEN MET

45 seasons, 17,100 matches of the real Egyptian fourth division. Was 3 of 6 when the harness was
first built two days ago.

| | measured | wanted |
|---|---|---|
| goals per match | **2.581** | 2.5–2.8 |
| shots per match | **23.887** | 22–28 |
| home advantage | **0.332** | +0.3–0.4 |
| xG ↔ goals correlation | **0.901** | > 0.9 |
| champion points | **83.311** | 78–95 |
| stronger side wins | **0.628** | 0.55–0.65 |
| determinism | **1.000** | 1 |

> **The xG correlation sits at 0.901 against a floor of 0.9, and the thin margin is real rather than
> marginal.** It was re-measured at **0.904 on 6,000 club-seasons** — 300 seasons, 114,000 matches —
> which the zone-lookup speedup made a four-minute question instead of an afternoon one. Nearly
> seven times the sample moved it *up* by 0.003 and left every other threshold in place (2.568
> goals, 23.890 shots, 0.323 home advantage, 0.629 stronger-side, determinism 1.000). So 0.901 was
> not a run that squeaked through; the engine genuinely sits just above the floor.
>
> It sits *just* above it because the number is in genuine tension with a feature: finishing skill is
> *designed* to make goals deviate from xG, because that is what `CLINICAL_FINISHING` and
> `WASTEFUL_FINISHING` measure. A correlation of 1.0 would mean finishing does not exist. Treat a
> drift below 0.9 as a signal to re-examine `PER_FINISHING`, not to chase the number.

- [x] **Performance: 2.4× on the real workload, from a profile rather than a guess. The guesses
      before it were worth nothing.**

      **The obstacle was a flag, not a build.** This file previously recorded `node --cpu-prof`
      through `tsx` as reporting 98% idle, and concluded a compiled build was needed. That was
      wrong: run as `tsx cli.ts`, tsx re-executes the program in a **child** process and the
      sampler dutifully profiles the idle parent. `node --cpu-prof --import tsx src/cli.ts`
      profiles in-process and names real source files. No bundle, no compiled output, no new
      dependency — and `pnpm harness:profile` now ships so nobody rediscovers this.

      **What the profile said, which nobody would have guessed.** 28% of total CPU in `bandOf` and
      12% in `channelOf` — **40% of the engine spent recovering one of nine constants from a
      string**, because both were `zone.split('_')[0]`, allocating a two-element array per call.
      `zoneOf` was the same mistake inverted: it built a fresh `${band}_${channel}` string for
      every grid lookup, which is most of why `flowBands` sat at 11%.

      **The fix is three lookup tables** in `zones.ts`. Measured paired, interleaved, same session:
      **229 → 548 matches/s, a 2.4× speedup whose two distributions do not overlap.** The 45-season
      gate went from minutes to **34 s**; the blueprint's full 10,000 seasons goes from roughly
      eight hours to about two, which is the difference between impossible and an overnight job.

      Three things worth keeping:

      - **The tables are *safer* than the code they replaced**, which is not the usual trade. Both
        accessors ended in an unchecked `as Band` cast; `Record<Zone, Band>` makes a missing key a
        build error. It does **not** catch a *mistyped* one, so `zones.test.ts` gained a test that
        reads each zone back against its own name — `Zone` is `${Band}_${Channel}`, so the split is
        the definition, and it now runs nine times in a test instead of millions of times a season.
        Verified by sabotage: a consistently swapped channel table survives the mirror round-trip
        and 15 of 16 zone tests, and is caught by the new one.
      - **The gate output is identical to three decimals** — 2.581 / 23.887 / 0.332 / 0.901 /
        83.311 / 0.628 / 1.000, the same seven numbers recorded above. A performance change that
        moves a balance number is a correctness bug wearing a costume.
      - **Both earlier guesses were aimed at the wrong half of the code.** They optimised
        allocation inside `tacticalPresence`; the cost was in string handling underneath it. A
        micro-benchmark told me which *function* was expensive and I assumed I knew *why*. The
        profile answered the second question in four minutes.

      **Confirmed at scale.** 300 seasons, 114,000 matches, sustained **530 matches/s** — the
      speedup is not an artefact of short runs, and the throughput held while the accumulator grew.
      Memory is not the next wall either: `Accumulator` is streaming, keeping scalars plus arrays
      that grow by about twenty entries a season, so the full 10,000 is bounded by CPU alone.

      **What is left, and why it is a separate decision.** The profile is now flat — the top entry
      is `tacticalPresence` at 17%, which is real work. Going further means changing `Grid` from
      `Record<Zone, number>` to a nine-element array indexed by `band * 3 + channel`, which touches
      the engine's public types and should be argued on its own merits, not smuggled in as a
      micro-optimisation. Not needed at the current speed.

### Step 5 — trace and counterfactual
- [x] **`MatchTrace` emission — the match explains itself.** `packages/engine/src/trace.ts`, wired
      into `simulate()`, replacing the deliberately-empty trace. Mean **6.97 swings a match**, inside
      `dakka-engine-rules` §6's 5–8, and the gate is **identical to three decimals** — the trace
      reads the match, it does not change it.

      **Win probability comes from the engine's own state.** The chain now records a `MinuteState`
      every minute: the score, and how many shots a minute each side is generating *from the space
      actually in force*. One layer up, where xG lives, that becomes a goal rate and runs through a
      Poisson model of the minutes remaining. Nothing consults the final score to decide what the
      game looked like at minute 20, and at full time the rate vanishes so the last entry is a fact
      rather than a forecast.

      **The rate model is checked against the chain, not asserted.** `shotChancePerPossession` is a
      closed-form reading of a stochastic loop, so if it drifts the trace explains a slightly
      different match — fluently. It predicts **0.95 of the home side's real shots and 0.94 of the
      away side's**, and tracks the *split* as well as the total. Both are tests. It shares
      `ZONE_PICK_FLOOR` and the corner constants with the loop that produces the shots, so the two
      cannot drift by accident.

      **A swing is measured against what was expected of it.** Before a shot is struck the win
      probability is already `xg` of the way to what a goal would make it, so a goal is worth
      `(1 - xg)` of the gap and a miss `-xg` of it. A converted penalty barely registers; a save from
      six yards is one of the biggest moments in a match. Neither is special-cased — it falls out of
      the arithmetic, which is what makes the trace know what was *surprising* rather than just list
      goals.

      **⚠️ The bug worth remembering: a cause cited backwards.** `map.causes` lists both polarities
      of the same pitch, so taking the strongest entry explained an away goal with
      `DEEP_BLOCK_ABSORBED_PRESSURE` — the reason the scorer's attack was being smothered. Fluent,
      specific, and exactly backwards; the failure this product exists to be better than. Fixed by
      adding `favours: 'attack' | 'defence' | 'neither'` to `CAUSE_REGISTRY`, where the compiler
      makes every future cause declare one.

      **And the first guard for it was worthless.** It asserted the cited cause was not
      direction-blind, which a backwards cause passes — reverting the fix left all 21 tests green.
      The test that bites checks the cause's polarity against *whether the shooter's side came out
      of the moment ahead*; under the same sabotage it fails naming `MIDFIELD_OUTNUMBERED cited for
      a goal that favoured away`. The `FORMATION_MISMATCH` guard needed a fixture whose two sides
      line up differently, or it would have passed by never exercising the cause at all.

      **What is deliberately not emitted, and why.** `SUBSTITUTION_SWUNG_MOMENTUM`,
      `MISSED_SUBSTITUTION_WINDOW`, `MENTALITY_SHIFT_PAID_OFF` and `MENTALITY_SHIFT_BACKFIRED`.
      Substitutions plainly move matches, but the honest question — *would this match have gone
      differently without it?* — is a counterfactual, and answering it by reading the win probability
      either side of the change credits the substitution with everything else in that minute. The
      next box can answer it properly by replaying the match without the decision. A test pins the
      omission so it cannot quietly creep back.

      `FORMATION_MISMATCH` is also never cited: it fires on the largest zone mismatch *in either
      direction*, so it does not know whose goal it opened. Making it directional in `space.ts` would
      let it back in and is worth doing.

      **Cost: ~2% of throughput**, measured paired and interleaved. Worth recording how nearly that
      went wrong: the gate read 375 matches/s against 509 this morning, which looks like a 26%
      regression and is not one — the machine is a third slower right now, and the paired no-trace
      baseline reads 340. The unpaired comparison would have cost a whole run chasing nothing.
- [x] **Counterfactual runner — what a decision was actually worth.**
      `packages/engine/src/counterfactual.ts`. `counterfactual()` for the study,
      `replayCounterfactual()` for the single illustrative pair, `withoutDecisions` /
      `withoutDecision` to build the variant safely.

      **The replay is the same match until the decision bites.** Change one decision, keep the seed,
      and everything before that minute is byte-identical — the same draws in the same order, not a
      model of what might have happened. `Replay.divergedAtMinute` reports where the two stop being
      one match, and a test asserts the event streams match exactly before it. This is the thing no
      non-deterministic engine can offer, and it is the entire return on rule 2.

      **The hard part was refusing to answer.** Running it twice is easy; the danger is reporting a
      difference smaller than its own noise, which is a number with no cause behind it dressed as
      insight. So nothing returns a bare delta. Every measurement carries the standard error of its
      own mean, computed from the spread of the pairs, and a `significant` flag that requires two of
      them. **A `false` there is a real answer** — "too close to call at this many runs" — and
      `runsNeededFor()` says what it would take, from the spread already observed rather than a rule
      of thumb.

      **Pairing is worth about 7× the runs.** The paired standard deviation of the points difference
      is **0.693**, against roughly 1.9 for two independent runs, because both arms share every draw
      up to the decision. Same claim, a seventh of the simulations.

      **What it costs to call something.** Measured on the real league: a decision worth 0.1 points
      needs **200–750 paired runs**; one worth a full point is called in well under 100. That is the
      number the UI has to respect — a debrief that says "your substitution was worth +0.08 points"
      after 50 runs is reporting noise.

      **The test that matters most:** parking the bus from minute 1 significantly reduces goals
      scored (−0.40) *and* goals conceded (−0.22) at 120 pairs, while the points effect stays
      uncalled because the two nearly cancel. The runner reporting what it can measure and declining
      what it cannot, in a single study. Verified by sabotage — breaking the seed pairing is caught
      by the no-op study, which is the strongest form of that check: comparing a thing with itself
      must give exactly zero.
- [x] **Tactical dominance probe — `pnpm dominance`.** `packages/harness/src/dominance.ts`. For a
      tactical dial it plays every setting against every opposing setting and asks the question
      `dakka-engine-rules` §4 actually poses: *is any choice strictly better than another, whatever
      the opponent does?* Nothing else in the project looked at that.

      **The gap it closes.** The balance harness plays each club's own fixed tactical identity, so it
      measures the league **as played** — never the decision space a player can explore. A dial with
      one right answer leaves all seven thresholds green while making the game a single correct
      move, which is the same failure as a fabricated statistic in different clothes: the screen
      offers a choice the engine does not really have.

      It is a **probe, not a gate** — it always exits zero. The dials it indicts today are an open
      box, and a permanently red check is one everyone learns to ignore.

      **It needed error bars, and finding that out was most of the work.** "Beaten in every column"
      is a conjunction of several noisy comparisons, so at a small sample enough of them line up by
      luck to convict a healthy dial. At 48 matches a cell it reported `compactness` dominance in the
      **opposite direction** to the one it found at 480. Cells now keep their per-match goal
      differences and are compared **paired, on the same fixtures and seeds**, through the engine's
      `pairedDifference` — the same arithmetic the counterfactual runner uses, exported rather than
      copied so the two cannot drift apart about what counts as a finding.

      **And the first significance rule was still wrong.** Requiring only that the loser is never
      *significantly* better convicts on one significant column while most columns come back tied —
      it reported `attacking` as dominated by `ultra_defensive` while attacking was plainly ahead
      (0.80 vs 0.72) against a balanced opponent. Dominance now needs **both**: the raw average never
      worse *and* a significant gap somewhere. That is the plain meaning of "beaten in every column",
      with noise unable to manufacture it. Correcting it moved `mentality` from indicted to healthy.
      Verified by sabotage, including the trap this file has now fallen into twice — a synthetic
      "noise" case built by shifting both arms equally has a **constant** difference, which is
      certainty, not noise, and tests nothing.

- [x] **⚠️ Line height is a choice again. `EXPOSURE_SCALE` 1.1 → 3, and the gate holds.**
      One constant. All seven thresholds pass on **114,000 matches**, and the xG correlation — the
      one with no margin — reads **0.902 against a baseline of 0.904**, a difference well inside the
      noise at n=6,000 club-seasons.

      **The diagnosis I wrote last tick was wrong, and the measurement that corrected it is the
      useful part.** I had said the dominant term was PROGRESSION volume. It is not, above `deep`:
      shots barely move across the top of the ladder (13.7 → 14.4 → 14.2) while **xG per shot rises
      47%** (0.1021 → 0.1505), because shot pressure falls 76.8 → 57.3 and distance 14.8m → 13.3m.
      Volume is `deep`'s problem; the `normal` → `very_high` ladder is a shot-*quality* problem. Two
      channels, and only one of them was where I had been looking.

      **What was actually wrong: the reward for pushing up dwarfed the risk.** Measured like for like
      — the space a side gains in its best attacking zone by going `very_high` rather than `deep`,
      against the grass that hands the opponent — it was **1.72 of reward for 0.88 of risk**. At 3 it
      is 1.72 against 2.40, a ratio of 0.71. `space.test.ts` pins the *ratio*, not either constant,
      and `reward` is independent of the scale by construction (both arms face the same opponent, so
      the exposure term cancels), which is what makes the bound bite on this constant alone.

      | dial | dominated before | after |
      |---|---|---|
      | `lineHeight` | 5 | **3** — `normal` answers something again; only `deep` is best at nothing |
      | `pressingIntensity` | 3 | **1** |
      | `mentality` | 0 | **1** — a regression, see below |
      | `tempo` | 2 | 2 |
      | `width` | 3 | 3 |
      | `compactness` | 3 | 3 |

      16 dominated pairs down to 13. Goals go 2.581 → 2.723 and shots 23.887 → 24.700, both inside
      band; home advantage is unmoved at 0.332.

      **Two things tried and rejected, with the numbers, so nobody spends a run on them again.**

      1. **Splitting shot pressure into separate attacker and defender coefficients.** The reasoning
         looked sound — `room` drives shot geometry *and* pressure, so an overload is charged twice,
         the same double-count this engine fixed once for congestion. Sweeping the attacker term 12 →
         0 did cut dominance (5 → 1), but the **xG correlation collapsed with it**: 0.892 → 0.860 →
         0.845 → 0.765, against a floor of 0.9, and no re-centring of `SHOT_PRESSURE_BASE` recovered
         it. The term is carrying real signal: strip the attacker's presence out of pressure and xG
         stops distinguishing good chances from bad ones. **It is not a double-count** — it is two
         genuine consequences of the same cause, and the diagnosis was wrong.
      2. **`COUNTER_DEPTH`** — scaling exposure by how much room the attacker had to run into, so a
         deep block converts a high line into counter-attacks. Retried here because the earlier
         verdict ("too weak") was measured at the *old* exposure scale, where it had a third of the
         leverage. At `EXPOSURE_SCALE=3` with `deep: 2.8` it **works**: zero dominated settings and
         nothing best-at-nothing, a fully healthy line-height dial. But it costs **0.018 of xG
         correlation** (0.900 → 0.882 at 45 seasons), consistently across every sweep row, and §7 is
         explicit that the engine gets fixed rather than the threshold lowered. Left out.

         The hypothesis worth testing next: a deep side's counters are taken by whoever happens to be
         upfield, so the chance is good and the finisher is not — xG says one thing and goals say
         another. If that is it, the fix is in who `pickShooter` finds on a counter, not in exposure.

      **`deep` is still the best answer to nothing.** That is the honest remaining state of this
      dial, and `COUNTER_DEPTH` above is the most promising route to it.

- [x] **+MGR — how many points your decisions were worth.** `packages/engine/src/mgr.ts`. Replay the
      same fixtures, same seeds and same squad with a manager who makes no decisions, and subtract.
      This is the number global-strategy §4 wants the product known for, and it exists only because
      the engine is deterministic: a random engine makes the baseline noise rather than a control.

      **The baseline is specified, not improvised.** A flat 4-4-2 — deliberately not the 4-3-3 most
      managers reach for, so it never coincides with a player's choice by accident — every tactical
      dial neutral, no in-match decisions, and an XI chosen by the best available natural for each
      slot. "Best" is `bandCompetence`, the engine's **own** reading of a player: inventing a second
      rating here would mean the baseline was judged by a standard the match never uses, and the gap
      between the two would end up inside +MGR.

      **What it reads on the real league** — 38 fixtures, manager = the club's own `tacticsFor`
      identity:

      | club | +MGR | managed | baseline | per match ± 2se | called? |
      |---|---|---|---|---|---|
      | matoubas-sporting | **+11** | 41 | 30 | +0.289 ± 0.538 | no |
      | abu-kabir-sporting | **−11** | 63 | 74 | −0.289 ± 0.612 | no |
      | maghagha-cement | +3 | 70 | 67 | +0.079 ± 0.561 | no |
      | naga-hammadi-sugar | +1 | 63 | 62 | +0.026 ± 0.577 | no |
      | borg-elarab-industrial | **−23** | 45 | 68 | −0.605 ± 0.515 | **YES** |

      **⚠️ Read that table before putting +MGR on a screen.** A season resolves roughly **±20 points**
      — so `−23` is a real finding and `+11` is a coin. `PlusMgr.skill` carries the per-match spread
      and says which it is, and a caller that shows `points` without reading it is publishing luck as
      achievement. To call ±5 points takes about **17 seasons** of fixtures on this spread. The
      season figure is still exact and worth showing — it is a true fact about that season — it is
      the *skill* claim that needs the repetition.

      Verified by sabotage, including the one that nearly got through: keeping the player's in-match
      decisions in the baseline passed all fourteen tests, because every fixture had
      `decisions: []` and asserting they were stripped was asserting nothing. The fixtures now carry
      real decisions and a test proves +MGR prices them, not just the team sheet.

### Step 6 — thinnest UI

> **Read `DESIGN.md` before writing a line of this.** It exists now — palette, type scale, the RTL
> rules Arabic actually needs, and the never-list. "Thinnest" means the smallest set of screens that
> proves the engine, **not** unstyled: a screen built without the system is work that gets thrown
> away, and the whole point of having the file is that the first screen sets the precedent. §2's
> surface ladder and §4's "what earns a card" are the two that will get broken first.

- [x] Pick tactics → play match → derived stats → the trace → one counterfactual — `apps/web`,
      React 19 + Vite + Tailwind 4. Setup screen (club, opponent, venue, three dials, one in-match
      call), result screen (score, openable numbers, trace, counterfactual, the seed). 200 paired
      replays, `mean ± 2se`, "could be luck" printed as plainly as the other answer.
- [x] **Both locales from this first screen** (ADR-003) — `ar-EG` and `en`, direction from the
      locale, one layout, switcher on the header. `Messages` is one contract both dictionaries
      implement, cause names are `Record<CauseTag, Record<Locale, string>>`, and the §4 guard walks
      the TypeScript AST rather than pattern-matching JSX.
> **Not in this box, and the screen says so out loud:** the eleven picks itself
> (`baselineTactics`), the opponent is the neutral baseline with no decisions, and there is no live
> matchday — so DESIGN.md's floodlight surface is defined and unused. A note, deliberately not a
> checkbox: an autonomous run takes the first unchecked box as its work, and this is scope that was
> decided, not scope that is waiting.

### Weeks 2–6 — how the rest of the MVP is cut up

These stay **inside "Next up"** on purpose: the protocol at the top takes the first unchecked box
under that heading, and a section outside it would never be reached.

Decomposed from `docs/01-product/04-build-plan-and-team.md` §C and the blueprint's §7 MVP list.
Nothing here is new scope: if a box is not traceable to one of those, it does not belong.

**Three rules for this section.**

1. **Same sizing rule as the engine.** One box, one run, finished and pushed. A box that cannot be
   finished in a run is written wrong — split it rather than half-landing it.
2. **Order is dependency order, not importance order.** The AI layer cannot be honest before there
   is a trace to read (there is), the dashboard cannot be honest before there is a season to show,
   and the daily challenge cannot exist before persistence. Do not reorder to reach the fun parts.
3. **⚠️ This is where a fake product would get built.** Everything up to here was engine work, where
   fabrication is caught by the harness. From here on the failure mode is a screen that looks
   finished: a debrief the model invented, a stat with no counter behind it, a button that does
   nothing, a save that is a JSON blob in `localStorage`. Each box below names what faking it would
   look like, because that is the cheapest moment to refuse.

### Step 7 — the AI layer (Week 2)

> The rule this whole step exists to obey, from the blueprint §2: **AI never decides an outcome. AI
> explains, converses and generates. Code decides.** No model output becomes a game number except
> through a typed, validated effect schema.

- [x] **`packages/ai` — the boundary, before any model call.** Typed effect schema and validator,
      the `Locale` union (now single-sourced — the UI re-exports it), and `MatchEvidence`, which is
      built from a `MatchTrace` and refuses a `MatchResult`. Pure: a guard fails on `fetch`, on
      `process.env`, on anything that looks like a key or an endpoint. **Both "done means" clauses
      are compile-time**, so both are tested by compiling the forbidden snippet and asserting the
      compiler refused — `applyEffects` takes a branded batch no literal can produce, and
      `evidenceFromTrace(result, …)` does not typecheck.
- [x] **`CAUSE_REGISTRY` → phrasing table, both locales.** `packages/ai/src/phrasing.ts`, all 27
      causes × 2 locales, each with a `label`, a `one` form, a `many` form and — for exactly the
      `controllable` causes — a `lesson`. The web's duplicate label table is gone; `Trace.tsx` reads
      `causeLabel()` from the one table. **`one`/`many` came out of a measurement, not a hunch:**
      `pnpm causes` shows `WASTEFUL_FINISHING` in 85% of traces and up to **7 times in one match**,
      so a repeated cause collapses into its `many` form with a count rather than firing three
      wordings of "he missed" in a row. ⚠️ **But read the Blocked entry below before building on
      this: 14 of the 27 phrasings describe causes the engine has never once emitted.**
- [x] **The debrief prompt, built from a trace and nothing else.** `packages/ai/src/prompt.ts`.
      Three blocks — `system`, `evidence`, `task` — kept apart so "every number here came from the
      trace" is testable on the evidence alone; the instructions have numbers of their own. Eight
      golden files (4 traces × 2 locales) are checked in and regenerated with
      `pnpm --filter @dakka/ai golden`, so a reviewer can read exactly what a model would be handed.
      A repeated cause collapses into its `many` form with its minutes beside it. A thin trace asks
      for fewer paragraphs; an empty one asks for a sentence or two and says the match was quiet.
- [x] **⚠️ The debrief itself — everything except the transport, which is stubbed and said so.**
      `packages/ai/src/debrief.ts`. `DebriefTransport` is a seam, not an implementation: nothing here
      opens a socket or reads a key, and the purity guard fails the build on either. Step 8 supplies
      the real one. **The part that needed no API is the part that mattered** — a prompt made only of
      trace facts does not guarantee a *reply* made only of trace facts, so `checkDebrief` refuses a
      number the trace never produced, a statistic it does not carry, a cause that did not happen,
      and a reply longer than the evidence supports. A reply that fails is not shown at all: the
      trace is honest on its own, and a missing paragraph costs less than a fabricated one.
      **Still open for Step 8:** the HTTP transport and where the key lives.
- [x] **Opponent briefing from scouting data.** `packages/ai/src/scouting.ts`. **You scout by
      watching:** `scoutingFrom` takes `MatchResult[]` and counts everything from matches actually
      played — a `Club` does not typecheck in a record's place, so the opponent's hidden attribute
      values have no route to a prompt. A side you have never met produces an almost empty record and
      a briefing that says so in one line. Shot shares are `undefined` rather than 0 until there is a
      shot to divide, because "they never shoot from range" and "we have not seen them shoot" are
      different claims.
- [~] **⚠️ Dialect eval — the scorer is built, the held-out set is blocked.** `scoreVoice` in
      `packages/ai/src/voice.ts` scores MSA markers, Arabic-Indic digits, hedging, repetition and
      sentence length, names a reason for every fall, and **demonstrably moves**: a sample degraded
      one rule at a time scores strictly lower at each step, and 7 of 7 sabotage probes bite. It also
      passes the phrasing table we already ship, which would otherwise mean one of the two was wrong.
      **What is NOT done, and must not be claimed:** this measures conformance to *our own written
      rules*, not resemblance to real Egyptian coach speech. The corpus half needs source material —
      see Blocked. Until it exists, "the Arabic obeys the rules" is checkable and "the Arabic is
      good" is still an opinion.
- [~] **Cost controls — the machinery is built and measured; the dollar figure needs the key.**
      `packages/ai/src/cost.ts` + `pnpm prompt-size`. **ADR-004** records the decisions.
      **Built and tested (32 tests, 14/14 sabotage probes bite):** routing (`ROUTING`), the
      published price table with its date, `costOf(usage, call)` — the only multiplication, and it
      does not double-count a cached token — an immutable per-career `Ledger`, a hard budget stop
      with a **bounded** one-call overshoot, and the on-demand gate that refuses a debrief nobody
      asked for and one for a match whose trace named nothing.
      **The unknown discipline, applied to money.** A call that reports no usage is `unmetered`: it
      adds no dollars, and it refuses all further spending on that career until reconciled. Zero
      matches gives `unknown`, never `$0.00`.
      **What the measurement found, and it changed the plan.** The debrief's cacheable prefix is
      `[system]` alone — 688 bytes `ar-EG`, 468 `en` — and `claude-haiku-4-5`'s published minimum is
      **4096 tokens**, the *highest* of the three models, on the one we route volume to. So
      "prompt caching for the static rules" provably buys nothing today. And **92–94% of a debrief's
      proved ceiling is the output cap, not the prompt**, which caching cannot touch at all. ADR-004
      names the single condition that makes caching worth building: a static block over 4096 tokens,
      verified by `cache_read_input_tokens` coming back non-zero — never by having placed a marker.
      **What is NOT done, and must not be claimed:** the actual cost per match and per career.
      `tokens ≤ bytes` bounds it from above and nothing bounds it from below, so `pnpm prompt-size`
      prints byte counts and ceilings and says so at the bottom of its own output. See Blocked.

### Step 7b — the chosen direction, built (unblocked 2026-09-20)

> **The owner chose board C, the matchday programme.** `DESIGN.md` is frozen on it and
> `apps/web/src/styles/theme.css` now encodes it. ADR-005 is not needed — §10 of `DESIGN.md` *is*
> the record of the decision and of the three board values that were measured and rejected.
>
> **Build order matters here.** The screens come before the restyle: the old screens are a stack of
> panels, and re-inking them does not make a programme. Do **one box per run**, and do not restyle
> anything the box does not name.

- [x] **⚠️ Kit colours, as data.** `packages/content/src/colour.ts` + `kit` on `clubSchema`, and the
      twenty kits authored in `scripts/clubs.egy-d4.json` — the club files are **generated**, so
      that identity file is the only place a human writes one. Each kit carries a `note` saying why
      that colour (cement grey for مغاغة, indigo for غزل كفر الدوار, cane green for كوم أمبو); the
      note stays in the authoring file because a reviewer needs it and a renderer does not.
      **Validated, with the design coupling named rather than hidden:** a shirt number is printed in
      `news`, so the rule is *a paper-coloured number reads on the shirt at 4.5:1* — one rule giving
      two guarantees, since the number's ink and the page are the same colour. A club with no kit is
      a build error, not a blank swatch. 14 tests, 12/12 sabotage probes bite.
      **What the measurement changed.** The separation gate is **ΔE 22**, not the 25 it started at,
      and the number came from a search rather than a preference: over the 75,069 sRGB colours that
      are both plausible as a kit and dark enough to take a number, the best achievable separation
      for twenty clubs is **ΔE 24.8**. A gate set at its own ceiling is one the twenty-first club
      could never pass. The shipped palette's closest pair is 24.8, so the margin is real.
      **And it is honest about what it protects:** colour never carries meaning alone here — on the
      pitch your side is a filled disc and theirs an outlined diamond — so two clubs printing alike
      costs polish, not correctness. It is a quality gate and says so.
      **Crests are not in this box and were not attempted.** A crest is artwork, not a colour pair;
      nothing in the chosen direction needs one, and a generated crest would be the invented-at-
      render-time thing this box exists to prevent.
- [x] **⚠️ Tactics screen — the masthead, the fixture bar, the pitch diagram, the team sheet.**
      Built as components in `apps/web/src/components/` and assembled in `screens/Setup.tsx`.
      **The pitch is derived, not drawn.** `src/pitch.ts` places each player at the centroid of the
      zones their position *occupies*, read from the engine's own `FOOTPRINTS` — the same table the
      simulation reads to decide who contests what. The diagram is a picture of the model, so a
      wrong footprint looks wrong on screen. A test walks every position in `Record<Position, …>`
      and checks its mark against the table, which a hand-placed formation could never pass.
      **Two honest adaptations**, both of which a prettier screen would have faked. Players carry
      **no squad number** in the data, so the disc prints the *position* — eleven invented numbers
      per club is a fabricated fact in a small costume. And the **opposition is not drawn at all**:
      before kickoff we have played them no times, so there is nothing observed to put on the pitch,
      and the screen says that in one line instead of showing a generic shape. That is the same
      refusal `scoutingFrom` makes, enforced where the temptation actually is.
      **The one exception to the derivation, and why it is not a fudge.** The model's finest
      resolution is `defensive_centre`, which a keeper shares with both centre-backs, so a faithful
      centroid stands him in the middle of his own back line. He is moved to his goal line by a
      property read off the table — the only position occupying one zone and contesting none — not
      by testing for the string `'GK'`. If the engine ever gave a keeper a sweeping role, his
      footprint would gain a contested zone and he would come out of goal here with no edit.
      13 new tests; screenshotted at 390 and 1100 in both locales, `dir` correct, no console errors.
- [~] **⚠️ Matchday screen — four of the five are built; the fifth is the `trace.ts` blocker.**
      `src/matchday.ts` (pure) + `screens/Matchday.tsx`. The replay **reads the finished match
      back**: the engine resolved it in one call, and this works out what a clock at minute N would
      have shown. Nothing here can invent a goal or a swing, because nothing here has randomness or
      an opinion — and skipping to full time changes nothing, which is the give-away that it is a
      record rather than a performance.
      **Score, minute, momentum and your call are all on screen at once.** The score is counted from
      goal events up to the minute — a test asserts it moves on exactly the minutes the engine
      recorded a goal and on no others, which is what separates a counted scoreline from an
      interpolated one. Momentum is `winProbabilityTimeline`, the engine's own per-minute sample,
      oriented to the side you manage.
      **The fifth — what your call was worth — is deliberately not on this screen**, and that is the
      honest part. The engine emits no cause in the `decision` domain (measured over 1,200 matches;
      see Blocked), so there is no swing that can be attributed to a decision, and printing one
      would be the competitor's failure exactly: a plausible reason attached to a number that did
      not come from it. The call appears as its own beat at its own minute, carrying **no delta**,
      and full time hands over to the counterfactual — a paired difference with a standard error,
      which is a weaker claim per match and a much stronger one overall. A test asserts the call row
      has no number in it, so the attribution cannot be quietly added later.
      **This box closes properly when the `trace.ts` detector is fixed.** Not before, and not by
      putting a number on that row.
      24 tests (13 on the replay model). The scoreline was verified by **measuring glyph positions
      in both locales**, not by reading a screenshot: the home score's `x` falls on the same side as
      the home club's in `rtl` and in `ltr`.

### Step 8 — persistence and the API (Week 3)

> ADR-002 deferred Postgres until the content existed. It exists. The blueprint §5 is explicit that
> a JSON blob is the anti-pattern being corrected — Modareb's 1.2 MB `localStorage` career cannot be
> queried, shared, leaderboarded or recovered.

- [x] **`apps/api` — Fastify skeleton.** Health, one typed error shape, validated config, and
      `POST /match` resolving server-side. 17 API tests + a structural guard; 11/11 sabotage probes
      bite once the eleventh was made bite-able — see the Log for why the first version of it could
      not.
      **The line this box actually draws: choices cross it, capabilities never do.** A `MatchInput`
      carries squads and attributes, so accepting one over the wire would let a client field an
      eleven it invented and call the result server-authoritative. The body names clubs by slug and
      says which way three dials point; the server builds the fixture from its own content. Every
      object in the schema is `.strict()`, so a body carrying `squad` or `reputation` is **refused**
      rather than accepted-and-ignored — which would read, to whoever wrote the client, as though
      the field did something.
      **New package `@dakka/fixture`**, because the client plays offline and the server is
      authoritative: `buildFixture` and `seedOf` now live in one place that both run. `apps/web`
      re-exports it and is otherwise unchanged.
      **Done means, met:** a test plays the same choices through the **browser's** assembly path
      (`buildLeague` over raw JSON) and through the service over HTTP, and requires the payloads to
      be identical strings. That covers the two real risks — two loaders producing different
      content, and floats surviving JSON differently than they survive memory.
- [x] **Postgres schema — core tables and migrations.** `packages/db`: plain SQL in
      `migrations/0001_core.sql`, a runner that records what it applied, and **17 tests that run it
      against a real Postgres** — PGlite is PostgreSQL 18.3 compiled to WebAssembly, so every
      constraint is enforced by the engine that will enforce it in production. A migration nobody
      has executed is a plausible-looking artifact, which is the one thing this project refuses.
      **Thirteen tables, not the eleven named.** `player_attributes` and `competition_entries` are
      both in the blueprint's own core list, and both are load-bearing: without the first,
      "progression is inspectable" has nowhere to live; without the second, `pnpm db:seed` — the
      very next box — cannot say which clubs are in the league.
      **`player_attributes` is one row per attribute per version**, never a wide row rewritten. That
      shape is what the claim means: *his finishing went 62 → 64, on this date, for this reason* is
      one query. A wide row updated in place answers what he is and destroys how he got there.
      **Append-only is enforced by the database, not documented.** A trigger refuses UPDATE and
      DELETE on `matches` and `player_attributes`. 10 of 12 sabotage probes bite; the two that do
      not are recorded in the Log with why.
      `users` deliberately holds **no credential** — Supabase owns auth, and a second copy of a
      secret is a second place to leak it from a public repository.
- [x] **`match_traces` and `decisions` as first-class tables**, not logs.
      `migrations/0002_trace_and_decisions.sql`. **One row per swing moment**, cause in an enum,
      `(match_id, minute)` indexed as blueprint §5 names — plus `trace_actors`,
      `match_win_probability` (one row a minute, so the momentum of a season is a query), and
      `decision_valuations`. Storing the trace as JSON on `matches` would have been three lines and
      would have made the coaching arc a migration away.
      **The test that carries the box is a round trip:** a real simulated match's whole trace goes
      in as rows and comes back out equal to the trace the engine produced. A blob would pass that
      trivially and answer none of the queries beside it.
      **A valuation stores the measurement, never the verdict.** There is no `significant` column —
      significance is a conclusion drawn from a delta and its error at a chosen threshold, and a
      stored conclusion drifts away from the numbers it came from. `engine_version` is on it because
      a rebalanced engine values the same decision differently.
      **A decision is stored whole or not at all:** a CHECK ties the shape to the kind, so half a
      substitution — a row nobody can read back into an `InMatchDecision` — cannot exist.
      12/12 sabotage probes bite, after two of them exposed real defects (see the Log).
- [x] **`pnpm db:seed`** — the Egyptian fourth division into Postgres, and it **runs**.
      First run: 3 migrations applied, **20 clubs, 420 players, 10,380 attribute rows**. Second run:
      *schema already current, 0 new attribute rows.* Idempotence shown end to end, not only in a
      test. It writes to a file-backed Postgres under `.dakka/db` by default, which is a real
      database you can query today.
      **Migration 0003 came out of building it**, which is what migrations are for: the attribute
      baseline is append-only, so `on conflict do update` is refused by the trigger and a second run
      would otherwise append a duplicate. A partial unique index — one baseline row per player per
      attribute, only where `career_id is null and source = 'content'` — gives the seed an
      `on conflict do nothing` that needs no UPDATE, and leaves a career's own history free to grow.
      **Idempotent is not inert:** an edited club file reaches the database on the next run, and a
      test holds that separately from "a second run changes nothing".
      **A queryable season, precisely:** the seed stops at content. A season here belongs to a
      career — the league exists as something someone is playing through — so fixtures are generated
      when a career starts, and what the seed must guarantee is that they *can* be. A test generates
      the 38 rounds from the seeded entries and the competition's own `round_robin` column and
      checks every club appears in every round.
      **With `DATABASE_URL` set the command refuses**, and says why: a server client this repository
      has never run against a server is a code path nobody has executed. It arrives with the
      Supabase box, tested against something real. 6/6 sabotage probes bite.
- [x] **⚠️ Auth and row-level security.** `migrations/0004_row_level_security.sql` — real Postgres
      RLS, policies written against Supabase's `auth.uid()`, tested against real Postgres.
      **The box names the failure and the test is built to catch it.** *Faking it looks like
      filtering by `career_id` in application code only* — so **every query in the test runs with no
      ownership filter at all**. `select seed from matches` as manager A returns A's match and
      nothing else because Postgres will not hand over the other rows, not because a handler
      remembered a `where`.
      **Two things stop it being a comfortable test.** It runs as the `authenticated` role, because
      a table's owner — and PGlite's superuser — bypasses RLS and would make every policy look like
      it worked; and `force row level security` is on every user table, with a catalogue query
      asserting it. Writes are covered too: `with check` on every policy, so one manager cannot
      append a decision to another's history.
      **The split that matters:** content is public (the league is the league), and
      `player_attributes` is *both* — the dataset baseline reads publicly, a career's own
      progression does not. A signed-out caller is refused the personal tables at the **grant**
      level, before any policy is consulted, which is the stronger of the two outcomes.
      **`auth.uid()` is deliberately not in the migration.** A copy would be deployed to Supabase
      and shadow theirs with something that can drift, and what it decides is who reads whose
      career. `src/local-auth.ts` stands one up for the tests and the local database, outside
      `migrations/`. 8/8 sabotage probes bite.
- [x] **⚠️ Cloud save and offline sync.** `packages/sync` + `packages/db/src/apply.ts` +
      migration 0005. **Done means** is met by a test that plays three matches offline, fails a
      reconnection, reconnects, and ends with the database holding exactly what the client saw —
      seeds, scores, traces and the decision.
      **Last-write-wins never comes up, because nothing here queues state.** A generic app queues a
      *row*: two clients send their version and somebody loses. This queues **intents** — the
      choices a manager made — and the server replays them through the same deterministic engine
      and keeps its own result. There is no version to choose between.
      **The client's score travels as a claim, not as data.** The server compares its derivation
      and, when they differ, reports a **divergence** and keeps its own answer. With a
      deterministic engine that can only mean the two sides ran different engine versions or
      different content — a bug that wants a person, not a merge.
      **Three outcomes and no fourth.** Applied, already (a retry after a lost acknowledgement costs
      nothing — `applied_intents` is keyed by the *client's* uuid), and rejected, which **stays
      queued**. A transport that throws leaves the whole batch queued, so a dropped connection costs
      a player nothing.
      **The queue's rules are tested against both stores** — in memory and in real IndexedDB via
      `fake-indexeddb` — so a rule that holds in a test holds in the browser. 11/11 sabotage probes
      bite.

### Step 9 — the season loop (Week 3)

- [x] **Season state machine** — `packages/season`, pure and deterministic: no clock, no
      randomness, no I/O. `startSeason` → `nextRound` → `record` → `standings` → `seasonEnd`.
      **The table is never stored.** Every column is recomputed from the results, so there is no
      second source of truth to drift the first time a result is corrected — the same rule the rest
      of the product lives under, applied to the one number football players stare at most.
      **`tieBreak` is now a league field**, because this is exactly where a hardcoded rule would
      make "a league is data" false: England and Germany go to goal difference, Italy and Spain
      settle it head-to-head first. Added to `leagueSchema`, to the Egyptian file, and to
      `competitions` (migration 0006) so content and database still agree.
      **Level clubs share a position** — 1, 2, 2, 4. An index-based rank prints 1, 2, 3, 4 and
      claims a separation the competition's own rules did not make.
      **`seasonEnd` answers only when the season is over.** Telling somebody they are relegated in
      March is how a product loses a player. 17 tests, 10/10 sabotage probes bite — after three of
      them found real holes (see the Log).
- [x] **Board objectives, confidence and sack risk.** `packages/board` — and **there is no
      confidence bar in it**, deliberately. The box names the failure (*a bar that moves by a
      hand-tuned amount per result*), and a bar is tempting precisely because it looks like
      knowledge while being a constant somebody picked. `43%` after a defeat is the same species as
      the competitor's invented shot count.
      **The outlook has three values and two of them are proofs.** `certain`: the best club below
      the line cannot catch you even winning every remaining match while you win none.
      `impossible`: you cannot reach the line even winning out. `undecided`: arithmetic does not
      settle it, so neither do we — what is reported instead is the gap, the games left, the points
      still winnable, and the rate the gap implies. *You need 2.1 a game and you are getting 1.2* is
      a fact; *confidence 43%* is a decoration. A test asserts the shape has no `confidence` or
      `sackRisk` field to tune.
      **Sack risk is the board's own rule, evaluated.** A board's patience is not something to model
      from outside — it is authored beside the objective (`until_impossible`, or `adrift_by` N
      points from game M) and every verdict carries the condition it was judged against, so a player
      can always ask what would have to change. A `warned` band exists where you are within one win
      of the threshold: a fact about distance, not a colour.
      **A test caught a real bug in the model.** Holding the objective line, the club that can take
      your place is the best one *below* it; my first version compared you with yourself, giving a
      margin of nought and a certainty that never arrived. 15 tests, 10/10 sabotage probes bite.
- [x] **⚠️ The dashboard — the five questions, answered in under three seconds.** `packages/dashboard`
      (pure) + `apps/web/src/screens/Dashboard.tsx` + the career loop that makes it true.
      **Silence is a value, and that is the whole design.** Every question returns an `Answer`:
      a derived value, or a named `Silence`. `tiles()` draws only the answered ones, so a fresh
      career shows **one** tile and four questions are simply not there. A dashboard whose five
      cards must be filled every visit is a dashboard that will one day fill one with something
      invented — the rule "no tile exists to fill space" is only enforceable if *nothing to say* is
      representable.
      **"Since I last played" is a marker, not a memory.** The career stores one number, how many
      results had been recorded when the manager last looked. Because `record` only appends, the
      table he saw is `standings(results.slice(0, n))` — **re-derived**, never stored. A first visit
      says `first_visit`, which is a different thing from `nothing_changed` and a test says so.
      **The biggest risk is ordered by consequence, not by a score.** Two risks: the board's own
      patience rule being approached, and going slower than the club your objective turns on. Which
      is live is arithmetic; only their ranking is a claim, and it is a claim about which outcome is
      worse rather than coefficients anybody can tune.
      **The assistant's opinion is counted, then phrased.** The `controllable` cause that cost the
      most win probability over the recent window, from the manager's own traces, named through
      `PHRASINGS` — code decides what to raise, language only says it. Circumstantial causes are
      excluded: advice about a miss implies a control that does not exist.
      20 dashboard tests + 31 app tests, **16/16 sabotage probes bite** — two after they found real
      holes in the tests (see the Log).

**Step 9 is complete.** The loop runs end to end in the browser: take a club → dashboard → set up
the fixture the calendar names → play → record → the whole round is simulated → dashboard again.
**It does not survive a reload** — the career is React state, and `@dakka/sync` already holds the
intents that would fix it. That is a persistence box, not a season box.

### Step 10 — squad depth (Week 4)

- [ ] **Roles and traits** — beyond the role fit the engine already reads.
- [ ] **Personality**, and how it reaches the dressing room without deciding an outcome.
- [ ] **⚠️ Training and development.** Player progression must be inspectable: attribute history is
      versioned (blueprint §5) so a rise can be explained. **Faking it looks like:** a random walk
      with a plausible curve.
- [ ] **⚠️ Adaptive opponent managers.** They must make decisions through the same `InMatchDecision`
      path a human uses, and the counterfactual runner must be able to price those decisions. An
      opponent that cheats is the fastest way to lose the product's whole claim.

### Step 11 — polish (Week 5)

- [ ] **RTL design system consolidation** — promote what `DESIGN.md` describes into real tokens and
      components. The file is the specification; by Week 5 it should be enforceable rather than
      advisory (tokens in code, a lint rule for physical-direction properties, contrast checked in
      CI, and the ADR-003 test that fails on any user-facing string outside a locale file).
      Touchline, not SaaS — explicitly not the dark-slate-and-neon-emerald dashboard Modareb
      already is.
- [ ] **E2E tests** over the full loop: pick tactics → play → debrief → counterfactual → season end.
- [ ] **Performance pass** on the client. `pnpm harness:profile` is the pattern: profile before
      touching anything, and measure paired.

### Step 12 — distribution (Week 6)

> Blueprint §1b: this is the omission the first draft made, and both boxes are cheap **because** the
> engine has been deterministic since Week 1. They cannot be retrofitted onto a random engine, which
> is exactly why they are a moat rather than a feature.

- [ ] **⚠️ The seeded daily challenge** — one fixture, one squad, one seed, identical for every
      player worldwide, so the only variable is decision quality. **Done means:** two players on
      different devices provably get the same match.
- [ ] **⚠️ The share card, built from the decision trace.** A score is not shareable; an argument is.
      38-0's most-screenshotted output is the contestable line. The card carries a claim from the
      trace and the counterfactual is the reply. Latin `slug` on every named entity so it reads in
      any locale.
- [ ] **MVP release candidate** — the blueprint §7 list, checked end to end against the "In:" line,
      with the "Out of MVP:" list still out.


---

## Parked — engine balance, deliberately deferred

**Decision, 2026-09-17, by the owner.** Three boxes of engine-balance work are parked here so the
loop walks past them and builds the product instead. They are **not abandoned** and nothing in them
is stale — every measurement below still holds against the current engine.

**Why parking is legitimate.** The balance gate **passes**: all seven thresholds on 17,100 matches.
The engine produces football. What these boxes chase is a quality problem nothing outside this
project asked for — *some tactical settings have no context that makes them worth choosing* — which I
found with a probe I wrote myself. It is real and it should be fixed before anyone plays this, but it
had consumed six consecutive runs and two reverts while twenty-six boxes of shippable product work
waited behind it, and it was on course to eat a month of budget.

**What it costs to park it, stated honestly.** The build plan's Step 4 "done means" includes *every
tactical option has a measurable, context-dependent effect*, and that line is **not satisfied**. A
player who worked out that `very_high` and `narrow` and `tight` beat everything would find the
tactical layer thinner than it looks. So this is a debt with a name, not a thing quietly dropped.

**When to unpark.** Before the thin UI of Step 6 is shown to anyone outside this project, and in any
case before the MVP release candidate in Step 12. Whoever picks it up should read all three boxes in
order — they are the same problem understood three times over, and later ones correct earlier ones:

1. **Crossing, second attempt** — the furthest along. The shot-distance re-fit is *solved*; the crowd
   is the blocker.
2. **Crossing, first attempt** — why crossing matters at all: the only mechanism found that *raises*
   the xG correlation, and every constant it needs.
3. **The four dominated dials** — the original diagnosis, the measurements, and two fixes that
   failed with the numbers that killed them.

- [ ] **⚠️ Crossing, second attempt: two of the four blockers solved, two left and both measured.**
      Still not shipped — the gate passes but three engine tests do not, and `chain.ts` is unchanged.
      Read this box **and** the one below it before starting; between them they carry the whole
      mechanism, so nothing needs re-deriving.

      **Solved 1 — the shot-distance distribution, which was the headline blocker.** Crosses used to
      push 35% of all shots into the six-to-eleven band against a published 22%. Re-fitting the
      open-play geometry *with crosses in it* fixes every band at once:
      **`PENETRATION_SKEW` 0.45 → 0.52** and **cross depth 5–24 m** (from 4–18). All five published
      bands land inside tolerance and shots inside the box read **0.654** against a 0.5–0.72 window.
      That was the sub-problem the last attempt could not see past.

      **Solved 2 — the goals the re-fit costs.** Pushing shots further out took goals to 2.264.
      **`SHOT_PRESSURE_BASE` 75 → 58** brings them back to 2.574 and costs no correlation. This is
      the right constant to spend: the engine's own comment above it says it is "a 5–98 scale I made
      up" and that a mean near 70 "may be covering for a curve that is slightly generous at these
      geometries". It is the least anchored number in the file.

      **Solved 3 — the trace's rate model.** `crossSurvival(map, side)` in
      `shotChancePerPossession`: the share of final-third arrivals still ending in a shot, from the
      `pickZone`-weighted chance of landing wide, the attempt rate for that width, and the find-rate.
      The per-player delivery term is left out as the penalty branch is. At a half-rate it passes;
      at the full rate the *asymmetry* check still fails (0.42 against 0.6), so it needs the delivery
      term after all — use the mean `crossing` of the wide-band occupants.

      **With all that, the gate is green at 12 seasons on a halved attempt rate**
      (`{ narrow: 0.13, balanced: 0.23, wide: 0.35 }`, `CROSS_PER_SPACE` 0.02): goals 2.761, shots
      23.495, home advantage 0.329, **xG correlation 0.914**, champion points 84.4, stronger side
      0.634. Three tests still fail.

      **⚠️ Left 1 — the crowd. This is the real one, and it is a genuine regression, not noise.**
      Measured at 2,500 matches a side: a full house gives **0.253 ± 0.056** and an empty ground
      **0.247 ± 0.055** — a crowd worth **0.006**, where the test wants at least 0.03 and it used to
      clear it. Crossing adds an aerial channel to chance creation that none of the crowd's three
      levers touch (stamina relief, the front-foot transfer, referee leniency), so the crowd's share
      of what decides a match shrinks. **`CROWD_STAMINA_RELIEF`, `CROWD_REFEREE_BIAS` and
      `CROWD_FITNESS_LIFT` need re-fitting with crosses in**, exactly as the shot geometry did. Note
      the harness still reads home advantage in band — travel and pitch unfamiliarity carry it — so
      only the crowd component collapsed, and only this test sees it.

      **⚠️ Left 2 — the low block, and both misses are tiny.** "Pushes shots further out against a
      low block" reads 15.97 m against 16.09 needed; "does not also take the shots away" reads 0.892
      against 0.93. A cross is met at a distance that does not depend on the block, so crossing
      dilutes the first, and cleared crosses remove shots, which is what the second forbids.

      **Tried and rejected: a cleared cross going behind for a corner.** Football-honest, and it does
      restore some volume — 0.822 → 0.837 on the shots test. But it took the crowd measurement from
      0.268 to 0.118, roughly halving it again, so it makes the harder problem worse to nudge the
      easier one. `CORNER_FROM_CLEARED_CROSS = 0.42` if anyone wants to re-test it after the crowd
      is re-fitted.

      **The order for the next run.** Re-fit the crowd constants first — it is the only genuine
      regression and the other two are within a few percent. Then decide honestly whether the two
      low-block thresholds are measuring a principle crossing has legitimately changed (a side now
      *chooses* to cross into a packed box and can lose the ball, which is different from congestion
      suppressing shots) or a real fault. **Re-basing a test to accommodate a change needs saying out
      loud and justifying**; it is one step from lowering a threshold, which §7 forbids.

- [ ] **⚠️ Crossing — built, measured, reverted. It is the first mechanism that *raises* the xG
      correlation, and that is the constraint that has blocked everything else.** Nothing shipped;
      `chain.ts` is unchanged and the gate is green. What follows is worth more than the code was.

      **What it is.** A chance worked down the flank is delivered into the middle instead of shot
      from out there. Whether it finds a head depends on the crosser's `crossing`, the aerial contest
      between the boxes, the room out wide (time to pick a cross) and the room in the middle
      (somebody to aim at). Find nobody and the ball is gone — that downside is what makes it a
      choice rather than a free upgrade. `crossing` sits on all ~500 players in this league and,
      before this, **was read by nothing in the engine**.

      **The prize: the xG correlation went 0.900 → 0.914 at 45 seasons, and 0.920 at 12.** It has
      never had a margin before; it has sat at 0.900–0.904 against a floor of 0.9 all along, and it
      has now killed four structural changes in a row — the shot-pressure split, `COUNTER_DEPTH`, the
      defence-follows-attack stretch, twice. The reason crossing does the opposite is exactly the
      property the last blocker note asked for: **a better side exploits it more.** Delivery is the
      crosser's, the finish is the target's heading and jumping against the defenders'. Measured at
      60 matches a side: a 20-rated crosser to a 90-rated one is **+13% shots**, a 20-rated aerial
      side to a 90-rated one is **+32%**. That stratifies the league instead of levelling it.

      **What it breaks, and why that makes it a re-fit rather than a tuning.** Nine tests, in three
      groups. The shot-distance distribution is anchored to published top-flight shares, and crosses
      move mass into the six-to-eleven band (0.22 expected, 0.35 measured) and out of the band
      outside the box; **76% of shots end up inside the box against a ceiling of 72%**. The low-block
      tests stop discriminating, because a cross is met at a similar distance whatever the block is
      doing. And the trace's own rate model overstates every side's shots, because
      `shotChancePerPossession` does not know a final-third arrival can end as a cleared cross.

      **The finding that settles it:** the gain and the breakage come from the same place. Halving
      the attempt rate takes the failures from nine to two — and the correlation straight back to
      **0.899**. There is no rate at which crossing is both worth having and harmless. The open-play
      shot geometry was fitted in a world with no crosses, so it has to be re-fitted **with** them:
      `PENETRATION_SKEW`, `PENETRATION_DEPTH`, `DEPTH_NEAR`/`DEPTH_FAR`, `SPREAD_CENTRAL`/
      `SPREAD_WIDE` and the cross geometry, together, against the published shares.

      **Crossing alone does not fix the dominance** — 13 dominated pairs before and after, with
      `pressingIntensity` going healthy and `tempo` getting worse. It is a **prerequisite**, not the
      fix.

      **But crossing + the stretch does.** `DEFENCE_FOLLOWS_ATTACK = 0.6` (see the box below) with
      crossing in: **three dials fully healthy and 7 dominated pairs against 13**, the best state
      this engine has reached. It failed 5 of 7 thresholds — but the correlation read 0.896, which is
      the stretch's usual −0.02 applied to crossing's higher starting point rather than to a number
      already on the floor. **That is the route.** Re-fit the geometry first, then re-apply the
      stretch to the headroom crossing buys.

      **The exact configuration, so none of this is re-derived.** In `chain.ts`:
      `CROSS_ATTEMPT = { narrow: 0.25, balanced: 0.45, wide: 0.68 }` · `CROSS_BASE = 0.72` ·
      `CROSS_PER_DELIVERY = 0.3` · `CROSS_PER_AERIAL = 0.25` · `CROSS_PER_WIDE_SPACE = 0.06` ·
      `CROSS_PER_SPACE = 0.04` · `CROSS_FLOOR = 0.12` · `CROSS_CEILING = 0.92` ·
      `CROSS_AERIAL = 0.68` · cross geometry depth 4–18 m, lateral ±5.5 m, penetration 0.75.
      A `crosses` counter on `ChainStats`, incremented when the delivery is struck. `crossFinds()`
      reads the wide zone the cross comes *from* for delivery and the central zone for the finish —
      reading only the middle made crossing punish width, which is backwards.

      **⚠️ Two traps found the hard way, both by sabotage.** `CROSS_BASE` was first set **above**
      `CROSS_CEILING`, so `crossFinds` returned the clamp almost every time and no player attribute
      moved it — football-shaped, coin-flip behaviour, and zeroing the aerial term changed nothing.
      Then the test for it still passed with the term zeroed, because a bare `toBeGreaterThan` on two
      noisy samples is carried by luck about half the time. Both guards need a **margin taken from a
      measurement** (the +13% and +32% above). That is the fifth guard-that-guarded-nothing on this
      branch and the sabotage check caught every one.

- [ ] **⚠️ Four dials still have a dominated setting. The cause is found and the fix is found; the
      fix cannot pass the gate, and the reason it cannot is the most useful thing here.** Nothing
      shipped this run — `space.ts` is unchanged and the gate is where it was.

      **The root cause, measured.** Vs a balanced opponent, over 8 fixtures × 50 seeds:

      | dial | goals for | goals against |
      |---|---|---|
      | `narrow` | **1.79** | 0.91 |
      | `balanced` | 1.62 | 0.90 |
      | `wide` | 1.47 | 0.95 |
      | `tight` | **1.67** | **1.11** |
      | `balanced` | 1.45 | 1.21 |
      | `loose` | 1.39 | 1.30 |

      `narrow` scores 0.32 more than `wide` and concedes the *same*. `tight` scores 0.28 more than
      `loose` **and** concedes 0.19 less. Concentrating is free, and the reason is structural:
      `width` and `compactness` are conserved transfers of a side's **own** presence, so the space
      they vacate costs the opponent nothing to be given. Nothing in the engine makes a defence pay
      for being pulled out of shape, because nothing pulls it.

      **The fix works.** `DEFENCE_FOLLOWS_ATTACK` — a conserved channel transfer on the *defending*
      grid, in the direction of the attacking side's own channel bias. Stretching a defence is the
      missing half of width, and it is naturally contextual: dragging a block that is already spread
      achieves less, because there is less left in the middle to move. At **k = 0.6 both `width` and
      `compactness` come back healthy**, no dominated settings at all.

      **⚠️ And it cannot ship, because it levels the league.** Every strength that materially helps
      the dials compresses the difference between clubs:

      | k | goals | home adv | champion pts | stronger side | xG corr | verdict |
      |---|---|---|---|---|---|---|
      | 0 (shipped) | 2.723 | 0.339 | 82.4 | 0.633 | **0.900** | 3+3 dominated |
      | 0.3 | 2.603 | 0.307 | 78.3 | 0.627 | 0.886 | 1 threshold fails |
      | 0.4 | 2.574 | 0.293 | 77.0 | 0.621 | 0.877 | 3 fail |
      | 0.6 | 2.531 | 0.287 | 76.2 | 0.619 | 0.872 | 3 fail, dials healthy |

      Champion points fall 82 → 76 and `stronger side wins` 0.633 → 0.619. The mechanism makes
      **shape matter more and players matter less**, and a league where clubs are more alike has less
      between-club spread in xG for the correlation to work with.

      **Scaling the drag by player quality does not rescue it**, which is worth knowing because it is
      the obvious next idea. Ratio of the attackers' `workRate`/`teamwork` to the defenders'
      `positioning`/`teamwork`, clamped like `reach` does for exposure: the correlation went to
      **0.864**, *worse* than the unscaled version. Scaling how far the block is dragged still
      punishes the concentrating side regardless of who they are.

      **The pattern worth acting on.** The xG correlation has now been the binding constraint on
      **every** structural change attempted: the shot-pressure split (0.892 → 0.765), `COUNTER_DEPTH`
      (−0.018), and this (−0.014 to −0.028). It is not three unrelated coincidences. That check
      measures the spread of club quality as much as it measures xG's honesty — a mechanism that
      compresses clubs toward each other reduces the between-club variance the correlation needs, so
      it fails whatever else it gets right.

      **So the next attempt needs a mechanism a better side exploits more**, not one that is scaled
      by quality after the fact. The difference matters: a good side should get *more* out of
      stretching a defence, rather than being dragged by the same tactic slightly less hard. Ideas
      worth measuring, in order of promise: make the space a stretch opens exploitable only by
      players who can use it (pace, anticipation, off-the-ball), the way `exposure` already gates
      grass behind a line on `paceOf`; or give the *flank itself* a use — there is no crossing in
      this engine, so a chance worked wide is finished from wide, which is most of why conceding a
      flank is cheap.

      Measure the gate at **300 seasons** before believing any verdict about the correlation: it sits
      at 0.900–0.904 against a floor of 0.9 and the 45-season reading runs about 0.003 low.

---

## Blocked

- **⚠️ The dialect eval has no held-out set, and one cannot be invented.** The box asks for *real*
  Egyptian coach language to score against. There is no corpus in this repo, nothing licensed to
  hand, and writing 50 lines myself and labelling them "real" would be precisely the fabrication
  this product exists to refuse — a plausible number measuring nothing.
  - **What was built instead** is a rule-conformance scorer, named as such in the module's own first
    paragraph so nobody mistakes it later. It answers "does this obey `dakka-arabic-voice`", which is
    real and checkable; it cannot answer "does this sound like a coach in Kafr El Sheikh".
  - **What unblocks it, in order of preference:** (1) the owner writes or collects 30–50 short lines
    of genuine Egyptian football speech — post-match interviews, touchline talk, commentary — held
    out and never shown to a prompt; (2) a separately licensed corpus. Either one turns the scorer
    into a similarity measure against real speech and finishes the box.

- **⚠️ Cost per match cannot be measured without an Anthropic key — the same one Step 8 needs.**
  The box says *measured, not an estimate*, and that is the right bar. A cost is
  `tokens × published price`; the price half is in `PRICES` with the date it was read, and the token
  half only exists in a real response's `usage`. There is no offline tokenizer that gives Claude's
  counts — using a different model's tokenizer would produce a number that looks measured and is
  wrong by an unknown factor, which is the exact failure this product refuses.
  - **What was built instead** is everything that does not need the key: the ledger that will record
    the real usage the moment a transport reports it, and a **ceiling** — `tokens ≤ bytes` plus the
    `max_tokens` cap — which is an inequality that holds rather than an estimate. `pnpm prompt-size`
    prints both and refuses to print a cost.
  - **What unblocks it:** the key, in a server-side environment variable, reaching the transport
    that Step 8 builds. The first real call closes this: `costPerCareer` and `costPerMatch` start
    returning `{ measured: true }`, and `cacheHitShare` answers the one question bytes cannot —
    whether a prefix is actually being hit.
  - **Do not paste a key into the chat.** This repository is public, and a key that passes through a
    message is a key that has to be rotated.
  - Until then, do not report a dialect-quality figure to anyone as if it measured quality.

- **Club identity is half-built: colours shipped, crests and Latin player names did not.**
  Kit colours are authored data now (Step 7b), so this is no longer a blocker for the fixture bar or
  the pitch diagram. Two pieces of the same species are still missing and neither is blocked on
  anything but a decision about scope:
  - **Crests.** Artwork, not a colour pair. Nothing in the chosen direction needs one, and a
    generated crest would be invented-at-render-time in exactly the way the colours no longer are.
  - **Latin player names.** Every club carries a `slug`; players carry an Arabic name only, so the
    English locale prints Arabic surnames on the team sheet and the pitch. Global-strategy §8.3 says
    every named entity carries a Latin-script name, and players are the one place it is not true.

- **⚠️ The engine emits no `decision` cause at all. The product's central claim has nothing behind
  it.** Measured with `pnpm causes` (checked in this run, so it is reproducible): over 1,200 matches
  with tactics randomised across the whole dial space and both sides making in-match changes,
  **14 of 27 registered causes never fire once** — and all five of the `decision` domain are among
  them: `SUBSTITUTION_SWUNG_MOMENTUM`, `MISSED_SUBSTITUTION_WINDOW`, `MENTALITY_SHIFT_PAID_OFF`,
  `MENTALITY_SHIFT_BACKFIRED`, `ROLE_MISFIT`. Also dead: both pressing causes, both condition
  causes, `FORMATION_MISMATCH`, `KEEPER_ERROR`, `SET_PIECE_WEAKNESS`, `HOME_CROWD_LIFT`,
  `PITCH_CONDITIONS`.
  - **Why this is the most serious thing on this page.** Dakka's one sentence is *your decisions
    were worth this*. 70% of the surveyed sides changed mentality and 80% made a substitution, and
    the trace attributed a swing to **none** of it. A debrief today can only ever say they wasted
    chances and the keeper saved — which is both repetitive and, worse, a systematic account of
    football in which the manager does not appear.
  - **What it is not.** Not a phrasing bug, not an AI-layer bug, and not the same thing as the
    parked balance work: +MGR already proves decisions move *results* (`mgr.ts`), so the effect
    exists and the **trace is failing to attribute it**. The swing detector picks the biggest
    win-probability moves, and a substitution's effect is spread over twenty minutes rather than
    landing in one — so it is always outbid by a shot. That is a detector design problem, in
    `trace.ts`, and it is a real box, not a tweak.
  - **Until it is fixed, do not build anything whose value depends on decision causes appearing** —
    in particular the debrief prompt's "the lesson" section. Write the prompt so a trace with no
    controllable cause produces a short debrief rather than a padded one, which
    `dakka-engine-rules` §6 requires anyway.
  - Verify with `pnpm causes`. A test in `packages/harness/test/causes.test.ts` stops the surviving
    13 from shrinking further, and will fail loudly if an engine change loses one.

- **Refero MCP — connected, but the account has no active plan.** The server is registered and
  reachable; every tool call comes back `NO_SUBSCRIPTION` with
  `https://refero.design/mcp/upgrade`. That is a plan-level refusal rather than a rejected key, so
  the wiring is not the problem. Not blocking: the four style references in `DESIGN.md` §10 were
  read from the public catalogue instead, which covers visual language. What the plan would add is
  the part the public site does not have — real product **screens** and **flows**, searchable by
  pattern. That is worth having before Step 7 onward, where screens stop being a single surface and
  start being a journey. Needs the account holder.

---

**Step 2 is complete except the deferred Postgres work. Next is the engine.**

## Note for whoever runs next

**Any test of the form "A differs from B only by X" needs a fixture where every field that is not
X is off its default.** Three times now a guard has passed while the thing it guards was broken, for
the same reason each time: the sabotage had nothing to change. The trace-polarity test passed under
a revert; +MGR's baseline passed fourteen tests while keeping the player's in-match decisions,
because every fixture had `decisions: []`; and this run, "the two arms differ by the decision and
nothing else" passed while the without-call arm also reset the mentality, because the fixture's
approach was already `balanced`. Neutral defaults make assertions vacuous. Assert the fixture is
off-default in the test itself, the way `match.test.ts` now does.

**Next box is the crossing re-fit above, and the order matters.** The lead from two runs ago — this
engine has no crossing — turned out to be right and to be bigger than a fix for the flanks: crossing
is the only mechanism found so far that *raises* the xG correlation, which is the threshold that has
blocked four structural changes in a row. It is built, measured and written down constant by
constant; it was reverted only because it moves the shot-distance distribution off its published
shares.

**Engine balance is parked — see the "Parked" section — and that was the owner's call, not a drift.**
Do not pick it back up on your own initiative. The gate passes, the engine produces football, and the
twenty-six boxes of Steps 7–12 are the product. The debt is named and dated in that section, with the
condition for unparking it: before anyone outside this project is shown the game.

**So the next box is +MGR**, then the thin UI, then Step 7. Read the three rules at the head of the
Weeks 2–6 section before starting any of those — especially the third one. Everything up to here was
engine work, where fabrication gets caught by the harness. From Step 7 on the failure mode is a
screen that looks finished, and no harness catches that. Each box names what faking it would look
like.

The engine (Step 3) is decomposed deliberately. Two rules for it:

1. **One box per run.** The boxes are sized so a single run can finish, test and push one.
2. **A ⚠️ box you cannot do well should be pushed as a blocker, not as a plausible-looking
   implementation.** The failure mode that would kill this product is an engine that passes its
   tests while modelling nothing — because then the decision trace explains a simulation that is not
   real, and a confident wrong explanation is worse than no explanation. The 10,000-season harness in
   Step 4 exists to catch exactly that, but it is much cheaper to not write it in the first place.

## Log

- **2026-09-21 (27)** — **The dashboard, and the career loop that makes it honest.**
  - **The five questions are answered by `packages/dashboard`, and four of them can decline.** A
    question returns `{answered:true,value}` or `{answered:false,silent}` where `Silence` is a
    closed union — `first_visit`, `nothing_changed`, `nothing_played`, `no_live_risk`,
    `no_controllable_cause`, `season_complete`, `no_fixture`. `tiles()` filters, so a silent
    question has no markup at all: no empty state, no "no data yet", no skeleton. On day one of a
    career the screen draws exactly one tile.
  - **What changed since I last played is re-derived, not remembered.** The only thing stored is a
    count of results seen. Everything else — the position then, the points then — is
    `standings()` over that prefix, which is sound *because* `record` only appends. Storing the
    table instead would be a second copy of the standings in the save file, disagreeing with the
    first the day a result was corrected.
  - **Two tests were passing for the wrong reason, and the probes found both.** The "before" test
    used the bottom club of a runaway season, whose points and position never move — so taking the
    *current* table instead of the prefix gave identical output. The "next fixture" test used a club
    that happened to be first in its round, so "the fixture this club is in" and "the round's first
    fixture" were the same thing. **This is the named anti-pattern again** (a constant that matches
    the only case under test is invisible to it), in its third distinct costume.
  - **A real modelling error, caught by walking a real career.** The pace risk first measured a
    manager against `assess`'s `neededPerGame` — which assumes the club on the line takes nothing
    more. Eight rounds into the Egyptian fourth division that told a club sitting **19th** it needed
    0.2 points a game and had no risk at all. True, and useless. It now compares two **counted**
    rates over the same window: yours, and the club your objective actually turns on. *You are
    taking 1.2 a game and طوخ is taking 1.8* is a fact; *you need 0.2* was an artefact of an
    assumption printed somewhere else.
  - **The career loop is real, including the ninety per cent of it the manager is not at.** Playing
    a fixture records it *and simulates the other nine* through the same engine with both sides on
    the neutral baseline. A table filled in by a plausible random draw would look identical on
    screen and mean nothing — that difference is the entire product.
  - **The screen lost a control, which is an improvement.** Venue was a dial; inside a season it is
    the calendar's, so it is gone, and `SetupScreen` now hands back only the three dials and the
    call. A control that cannot change anything is the costume a fake product wears.
  - **The masthead prints the round now.** It deliberately did not before — there was no season
    behind it, and `1` would have been the smallest possible fabricated statistic. There is one now.
  - 726 tests across 48 files. `pnpm lint && pnpm format && pnpm typecheck && pnpm test` green. No
    engine change, so no harness run.
  - **For the next tick:** Step 9 is complete. Step 10 opens with **roles and traits**. Two things
    this box leaves for whoever picks up persistence: the career lives in React state only — a
    reload starts over, and `@dakka/sync` already has the intents to fix that — and the board brief
    is derived from the competition's promotion places rather than authored per club, which is
    honest but blunt (a bottom side is told to go up). Both are noted in the code where they bite.

- **2026-09-21 (26)** — **The board, with no confidence bar in it.**
  - **The refusal is the design.** Any 0–1 confidence needs a mapping from a points margin to a
    percentage, and that mapping is a constant somebody chose. So the module says `certain` only
    when the rival cannot catch you winning out, `impossible` only when you cannot catch them
    winning out, and `undecided` otherwise — with the gap, the games left and the required rate
    beside it. Two of the three are proofs; the third admits it is not one.
  - **Sack risk is the board's rule, not our model of a board.** Patience is authored data
    (`until_impossible`, or `adrift_by` N from game M) and the verdict carries its own condition.
    That keeps it in the same family as `tieBreak` and kit colours: the thing that varies is a
    field, and the code evaluates it.
  - **The test found a real bug, not a typo.** When you already hold the objective line, comparing
    your points with the club *on* the line means comparing you with yourself: margin nought, and
    `certain` unreachable even after winning the league. The rival above the line is the best club
    *below* it. `assess` now reports which club it measured against, so the number can be traced.
  - **Two probes stayed silent for the same reason as last tick** — the Egyptian file is 3-1-0, so a
    hardcoded 3 agrees with it. A competition worth two for a win separates them, and that test now
    exists. Worth noting as a pattern: **any constant that matches the only league we ship is
    invisible to every test over that league.**
  - **For the next tick (⚠️ the dashboard, blueprint §6):** the five questions now have real
    sources — `assess()` answers *am I on track* and *what is my biggest risk* with a condition
    attached, `standings()` answers where you are, and the trace answers *what does my assistant
    think, and why*. The one with nothing behind it yet is *what changed since I last played*,
    which needs a notion of a visit; the honest version is a marker on the career, not a guess.

- **2026-09-21 (25)** — **The season, and three tests that were passing for the wrong reason.**
  - **The sabotage pass earned its keep.** Three probes stayed silent, and all three were my tests
    being weak rather than the code being right:
    1. *The tie-break order is hardcoded* — my test played a season where every club finished level,
       so swapping `tieBreak` changed nothing. Rewritten around four clubs who all end on one win
       and one defeat, where goal difference and goals scored **disagree**; the two orders now differ
       at second place. Writing it also caught my own arithmetic: I asserted the wrong club first,
       having forgotten one of them wins a match too.
    2. *Points come from a constant* — the Egyptian file uses 3-1-0, so a hardcoded 3-1-0 agreed
       with it. Now a competition worth two for a win separates them.
    3. *A league may omit its tie-break rules* — nothing asserted the field was required. It is now.
  - **`tieBreak` is a field, not a branch.** A standings function that picks its own order is a rule
    in code where the schema promised data, and it is the exact thing global-strategy §8.4 forbids.
    It travels all the way through: schema → league file → `competitions` column → seed.
  - **A driver detail worth remembering:** an array of a *custom enum* comes back from PGlite as the
    raw Postgres literal, `{goal_difference,goals_for,wins}`, not as an array. Anyone reading one of
    those columns will get a string where they expect a list.
  - **For the next tick (board objectives, ⚠️):** `standings()` already gives position, points and
    games remaining, which is everything an objective needs to be *derived* rather than hand-tuned.
    The box's own warning — a confidence bar that moves by a fixed amount per result — is avoided by
    computing from the objective and the table, and `seasonEnd` is the shape to copy: answer nothing
    until the answer exists.

- **2026-09-21 (24)** — **Sync without a merge, because there is nothing to merge.**
  - **The box names the failure — *faking it looks like last-write-wins* — and the design makes it
    unaskable.** The queue holds the manager's choices, not the client's state; the server replays
    them deterministically and keeps its own answer. A "conflict" would require two versions of the
    same fact, and there is only ever one: the server's derivation.
  - **A divergence is a first-class outcome, not a conflict.** The client's score is checked and
    discarded. When it disagrees the server stores what it derived and says so, because with this
    engine disagreement can only mean different engine versions or different content — something a
    person should see, not something to quietly resolve.
  - **An intent played on another engine is refused, not replayed.** Replaying it here would
    produce a different match and silently rewrite what the player watched. It stays queued for a
    client that has updated, which is the honest outcome of an engine that moved underneath
    somebody.
  - **A uuid intent id is a real constraint, and the test found out the hard way.** My first test
    used readable ids like `match-1` and Postgres refused them. Keeping the column as `uuid` is
    right: a client numbering its intents 1, 2, 3 collides with every other client, and the second
    player's match would be swallowed as *already applied*. Two devices have to mint ids without
    talking to each other.
  - **`fake-indexeddb` is a real implementation, not a mock**, so the queue's rules run against both
    stores — ordering by an autoincrement key rather than the client's clock, because a device whose
    clock jumps must not reorder its own history.
  - **For the next tick (Step 9, the season loop):** `applyIntent` currently takes `careerId` and
    `seasonId` from the caller and inserts a fixture per match. Once a season exists, fixtures are
    generated up front and the intent should name the fixture it played rather than create one.

- **2026-09-21 (23)** — **The database refuses, not the handler.**
  - **The test is written so it can only pass for the right reason.** No query in it filters by
    ownership. If `select seed from matches` needed a `where career_id = $1` to return one row, the
    test would be checking the query rather than the schema — which is the exact failure the box
    names.
  - **Two ways this kind of test fools people, both closed.** A table's owner bypasses RLS, and
    PGlite connects as superuser, so the suite `set role authenticated` and every user table carries
    `force row level security`, asserted from `pg_class` rather than assumed. And reading is only
    half: `with check` on every policy, with a test that one manager cannot append a decision to
    another's history.
  - **A better-than-expected result, kept.** A signed-out caller does not get zero rows from
    `careers` — it gets `permission denied`, because `anon` holds no grant on it at all. That is the
    outer defence and does not depend on a policy being right; the test now asserts the refusal
    rather than the empty result.
  - **`auth.uid()` is not in the migration, on purpose.** Defining it there would deploy a copy to
    Supabase that shadows theirs and can drift, and what it decides is who may read whose career.
    It lives in `src/local-auth.ts`, outside `migrations/`. Ordering matters and cost me a failing
    run: Postgres resolves `auth.uid()` when a policy is *created*, so the stand-in has to be up
    before 0004 — which mirrors Supabase, where the `auth` schema predates every migration.
  - **`pnpm db:seed` still runs**, and I checked rather than assumed: adding 0004 broke it first,
    because the local database had no `auth` schema. Both runs verified again, 4 migrations applied
    then `0 new attribute rows`.
  - **For the next tick (cloud save and offline sync, ⚠️):** the server client is still unwritten
    and still deliberate. That box needs one, and it is the first place a real connection can be
    tested — `signIn`/`signOut` in `src/local-auth.ts` are the shape a session takes.

- **2026-09-21 (22)** — **The seed runs, twice, and the second time does nothing.**
  - **A command nobody can run is not done**, so `pnpm db:seed` writes to a file-backed Postgres
    under `.dakka/db` rather than requiring a server that does not exist here. Output of the two
    runs, verbatim: `applied 0001_core, 0002_trace_and_decisions, 0003_content_baseline_once` /
    `20 clubs, 420 players, 10380 new attribute rows`, then `schema already current (3 migrations)`
    / `0 new attribute rows`.
  - **Building it needed a schema change, and that is the point of migrations.** `on conflict do
    update` is refused on an append-only table, and without a constraint a re-run appends a second
    baseline. 0003 adds a partial unique index so the seed can say `do nothing` — no UPDATE, one
    baseline per player per attribute, and a career's own attribute history still free to grow.
  - **I read the output instead of trusting it, and caught my own query.** A first sanity check
    printed `squad: 519` per club; the data was right and the query was wrong — joining players to
    attributes multiplies rows, so `count(p.id)` was counting attribute rows. With
    `count(distinct p.id)` every club has 21. Worth recording because the number looked plausible
    enough to report.
  - **What "a queryable season" honestly means here.** Seasons are career-scoped by design, so a
    content seed cannot create one without inventing a user. The seed guarantees the ingredients
    instead, and a test generates the full 38-round double round-robin from the seeded entries and
    the competition's own `round_robin` column.
  - **For the next tick (auth and RLS, ⚠️):** `users` holds no credential on purpose, and the
    server client is deliberately unwritten — that box is where both get done against something
    real. The RLS test the box asks for has a natural shape here: seed two careers, then prove a
    query as one manager cannot see the other's matches.

- **2026-09-21 (21)** — **Traces as rows, and two enums that had already drifted.**
  - **The failure that mattered.** The first insert of real content was rejected:
    `invalid input value for enum role_code: "touchline_winger"`. I had written `role_code` and
    `attribute_code` in migration 0001 **from memory** — inventing four roles that do not exist,
    missing one that does, and omitting all five goalkeeper attributes. The schema had been wrong
    since the moment it was written and every test passed, because nothing compared the two lists.
  - **So now something does.** Four enum-agreement tests read the source of truth at runtime —
    `roleSchema.options`, `positionSchema.options`, the keys of `playerSchema`'s attribute groups,
    `ALL_CAUSES`, `ALL_DECISION_KINDS` — and require the database's enums to match exactly. An enum
    nobody compares is an enum that has already drifted; this one had, on day one.
  - **One engine change, additive only:** `ALL_DECISION_KINDS`, built from
    `Record<InMatchDecision['kind'], true>` so a new kind is a build error. It exists because a
    union cannot be enumerated outside TypeScript and the database needs to. No simulation logic
    touched; `pnpm harness` still meets all 7 thresholds.
  - **A test of mine was passing for the wrong reason.** The win-probability check used minute 200
    *and* probability 1.4, so the minute rule refused it and the probability rule could be deleted
    without anything failing. Split into two tests, each with only one thing wrong.
  - **For the next tick (`pnpm db:seed`):** every enum the seed will touch is now verified against
    the content, so an insert that typechecks should load. `competition_entries` is waiting.
    Attribute rows go in with `source = 'content'` and `career_id = null`; goalkeeper attributes are
    optional in the content, so a non-keeper simply has no row for them — which is the schema's
    difference between *not measured* and *zero*, kept.

- **2026-09-20 (20)** — **The schema, and a rule that would have refused to forget someone.**
  - **The test caught a real flaw in my own migration.** The append-only trigger refused DELETE on
    `matches`, so the cascade from `users` could not run: a person asking to be forgotten would
    have been told no by a rule meant to stop someone editing a scoreline. My SQL comment even
    claimed the cascade still worked. It did not. **Rewriting history and erasing it are different
    acts**, so a DELETE now passes only when the transaction has declared `dakka.erasing`, which
    makes erasure explicit and greppable while refusal stays the default. Both sides are tested.
  - **Run, not written.** PGlite is real PostgreSQL in-process, so the migration is executed by the
    same engine that will run it in production and the tests are about rules biting rather than
    tables existing: a club cannot play itself, `SW` is not a position, a kit colour must be
    lowercase hex, a match cannot carry an empty seed.
  - **Two sabotage probes stayed silent, and both are recorded rather than hidden.** One was a weak
    probe of mine and was rewritten until it bit. The other is structural: removing the runner's
    `begin`/`rollback` breaks nothing, because PGlite and node-postgres both run a multi-statement
    `exec` in an implicit transaction anyway. It is kept for the seam — `SqlClient` is any client
    with `exec` and `query` — and the comment in `migrate.ts` says so, so nobody later assumes the
    tests prove it.
  - **For the next tick (`pnpm db:seed`):** `competition_entries` exists for exactly that box, and
    `loadLeague` already returns everything the insert needs. The seed must be idempotent — the
    natural key is `clubs.slug`, which is unique, so `on conflict (slug) do update` is the shape.
    Attribute rows go in with `source = 'content'` and `career_id = null`, which is the baseline
    every career starts from and none owns.

- **2026-09-20 (19)** — **The API, and a sabotage probe that could not bite.**
  - **The probe worth writing down.** I changed `seedOf` expecting the client and the server to
    disagree. Nothing failed — because they import the same module, so the change moved both. That
    is the guarantee working, and it means the determinism test **cannot** catch the failure it is
    named after: it proves the two loaders agree and that JSON survives the trip, and it can never
    prove nobody wrote a second builder, because a second builder would never reach it.
  - **So the property is held structurally instead.** `packages/fixture/test/one-builder.test.ts`
    scans every application source for `matchId` or `competitionId` — the two constructors you
    cannot assemble a `MatchInput` without — and fails if an app imports either. Same shape as the
    AI package's purity guard. Verified by adding one import to a screen and watching it fail.
  - **The boundary rule, stated once so the next endpoint inherits it:** a client sends what it is
    entitled to **decide**, never what it is **made of**. `.strict()` is what enforces it, and
    accepting-and-ignoring would be worse than refusing, because it looks like it worked.
  - **Config refuses rather than falls back.** A service that boots with half its configuration
    missing fails later, somewhere less obvious, in front of a user. No secrets in the file and no
    `process.env` outside it — when a model key arrives it arrives as a required field.
  - **A TypeScript trap for the next tick:** `app.inject` is overloaded three ways and the bare call
    resolves to an intersection with none of the response's properties on it. Name the types
    (`InjectOptions`, `Response`) from `light-my-request`, which `apps/api` now declares.
  - **Next box: the Postgres schema.** `@dakka/fixture` is where a stored career's choices will be
    rehydrated from, and `seedOf` is already the natural primary key for a match.

- **2026-09-20 (18)** — **Matchday, and the number I did not print.**
  - **The replay reads the match back; it does not play one.** `simulate` resolves a whole match in
    one call, so `matchday.ts` is pure and answers one question: what would a clock at minute N have
    shown? The strongest test is that the score may only move on the minutes the engine recorded a
    goal — an interpolated scoreline passes every other check and fails that one.
  - **The box asked for something the engine cannot currently support**, and the right move was to
    say so rather than to produce it. *"The consequence of your call is a trace moment with a real
    delta"* presumes a swing attributable to a decision; the engine emits no `decision` cause at all
    (measured, recorded under Blocked). So the call is its own beat with **no number on it**, and a
    test asserts that row contains no `.num` — the attribution cannot be quietly added later. The
    measured consequence stays where it is real: the counterfactual, a paired difference with a
    standard error. Box is `[~]`, and it closes when the detector is fixed.
  - **A third bidi rule, and it is the opposite of the second.** `.seq` exists to stop
    `1.42 → 1.48` reversing. A scoreline in the fixture bar is the inverse case: the clubs flip with
    `dir`, so a score pinned left-to-right stays put while the names swap around it — which is how
    this product once shipped 1-0 as 0-1. Isolate each value, never the pairing, when the pairing is
    what has to move. Verified by measuring glyph positions in both locales: home club at x=252 and
    home score at x=213 in `rtl`; x=0 and x=163 in `ltr`. Same side both times.
  - **For the next tick:** `theme.css`'s `.reversed` now has two real users (the clock strip and the
    pressure band) and the red strip is inline rather than a class — if a third appears, promote it.
    The Result screen is unchanged and still reachable through the replay's skip button. — **The Tactics screen, and a pitch that is a picture of the engine.**
  - **The thing worth copying from this box.** The formation is not drawn; it is *derived*. Each
    player sits at the centroid of the zones his position occupies in `FOOTPRINTS`, which is the
    table the simulation itself reads. So the diagram cannot drift from the model — a wrong
    footprint produces a shape that looks wrong — and the test iterates
    `Object.keys(FOOTPRINTS)`, which is every position the engine has, by construction.
  - **Two things this screen refuses to fake**, and both would have looked better if it had.
    Players carry no squad number, so the disc prints the position; and the opposition is absent
    from the pitch entirely, because we have played them no times and a generic opposing shape is a
    scouting report nobody earned. The screen says so in a line rather than leaving a blank half.
  - **The keeper exception is derived too.** He shares `defensive_centre` with both centre-backs, so
    the honest centroid stands him among his own defenders. He is moved by the one structural
    property that identifies him — occupies one zone, contests none — rather than by a string
    compare, so the rule survives a change to the model instead of outliving it.
  - **Two defects found by looking, not by testing.** Every test passed while the keeper stood in
    his own back line and the defenders' names ran into each other. Screens get judged by looking;
    the fix was more room under the goal line, a taller canvas than the pitch, and a wider fan.
  - **Where the masthead went.** It started on the Tactics screen and duplicated the shell's title —
    two `h1`s with the same word, which the app test caught immediately. It belongs in the shell:
    a programme has one masthead.
  - **Next box: the Matchday screen** — score, minute, momentum, the one call and its consequence.
    `FixtureBar` already takes a `standing` slot for the scoreline, and `.reversed` and the red
    clock strip are in `theme.css` waiting for it. — **Club colours, and a threshold set by measurement instead of by taste.**
  - **The mistake worth recording first.** I wrote the twenty kits straight into the club JSON
    files. The generator's own idempotence test wiped every one of them within the minute — the
    club files are **generated** from `scripts/clubs.egy-d4.json`, and that identity file is where
    a human authors a club. The test caught it immediately, which is the argument for having it.
  - **The honesty question this box actually turns on**, since "never fabricate" is the project's
    first rule: these clubs are **fictional** — Matoubas Sporting is a club placed in a real town,
    not a real club — so giving one a green shirt is *authoring content*, exactly like naming it.
    What the rule forbids is a number assigned rather than counted, and the thing this box replaces
    is its true analogue: a colour chosen at a call site because a screen needed one, or generated
    from a hash of the slug. Both are invented at render time and unreviewable. Colours now live in
    the identity file with a `note` saying why, and get overwritten the day a real league is
    licensed.
  - **I lowered a threshold, and that needs justifying rather than mentioning.** The separation gate
    started at ΔE 25 and ships at 22. Not because the palette could not reach 25 — because **nothing
    can**: a farthest-point search over the 75,069 colours that are both plausible as a kit and dark
    enough to carry a paper-coloured number puts the ceiling for twenty clubs at **24.8**. Setting a
    gate at its own ceiling means the twenty-first club can never be added. The distinction from the
    harness thresholds, which do not get lowered, is that those encode football realism — a claim
    about the world — while this encodes a visual judgement, and the measurement is what turned the
    judgement into a number.
  - **Contrast is the wrong measure here and the test says so.** A red and a green of the same
    darkness have a contrast ratio of ~1 — by that measure they are the same colour, and they are
    the one pair a fixture bar must never print together. ΔE in Lab is what sees it. That is the
    only place in this codebase where a WCAG ratio is the wrong tool.
  - **One design token reached into the content package** — the colour a shirt number is printed in.
    I named it `SHIRT_NUMBER_INK` and wrote down why, rather than hiding it behind "contrast against
    white", which would have been a looser rule wearing a universal's clothes and would have shipped
    four clubs whose numbers measured 3.89:1.
  - **Next box: the Tactics screen.** The fixture bar and the pitch diagram now have real colours to
    read, and `readableOn` picks the number's ink so no call site guesses it.

- **2026-09-20 (15)** — **The owner chose C. `DESIGN.md` is frozen on the matchday programme.**
  - **What choosing C actually removes.** A and B both split the product into a paper mode and a
    night mode — two of every colour token, two contrast audits, and a rule that existed only to
    manage the split (*"level 2 is a fill on paper and an edge on night"*). C is one stock
    throughout and emphasis is **reversed ink**: a black block with the paper knocked out of it.
    The entire floodlight palette is gone. That is a smaller system, not just a different one.
  - **It also settles the Modareb conflict by removing it.** The never-list said *never dark-slate
    with neon-emerald*; board A was a dark shell with green accents, which is adjacent to the one
    thing this product defined itself against. C cannot be mistaken for it.
  - **Three of the board's own values did not survive, and were corrected rather than copied.** A
    board is drawn to be looked at; a design file is built from. Measured: its `faint` `#8C8371` is
    **3.05** on the page — below the 4.5 floor for a label — so `faint` is now `#6A6252` at **4.90**.
    Its keeper disc puts paper on gold at **3.20**, so text on a gold fill is ink at **4.67**. And
    its captions run at 9.5–11px, so `label` holds at 12. §8 now carries the whole measured table,
    and a new token gets its ratio computed before it is used — the same rule a statistic lives under.
  - **The masthead is small and the score is enormous.** That inversion is the signature and the
    fastest way to tell this from a dashboard, which always opens with a big page title. `h2` is the
    largest the product's own name is ever set in; `scoreline` at 40px mono is the biggest thing on
    the screen.
  - **The code was moved with the doc, not after it.** `theme.css` is the direction encoded —
    reversed blocks, the rule-weight ladder, zero radius, the halftone paper screen — and the nine
    call sites that referenced a deleted token were migrated. One consequence worth noting: three
    buttons wore the primary fill, and *one action per screen* means only the verb that plays the
    match keeps it. Screenshotted in both locales at 390 and 1100: renders, `dir` correct, no
    console errors.
  - **What this is not.** The old screens are still a stack of panels wearing new ink. There is no
    masthead device, no fixture bar and no pitch, because those are screens rather than tokens —
    they are the next two boxes, and re-inking is not a substitute for building them.

- **2026-09-20 (14)** — **Cost controls: the machinery, the measurement, and the number I refuse to print.**
  - **The finding that changed the plan.** The blueprint pairs "Haiku for volume" with "prompt
    caching for the static rules". Measured, those two sentences fight each other:
    `claude-haiku-4-5`'s published minimum cacheable prefix is **4096 tokens** — higher than
    Sonnet's 1024 and Opus's 512, on the *cheapest* model — and our only static block is the rules,
    at 688 bytes in `ar-EG` and 468 in `en`. A prefix under the minimum does not cache and does not
    say so; `cache_creation_input_tokens` simply comes back 0. So the saving we had written down as
    a mitigation does not exist at today's prompt sizes. ADR-004 states the one condition that would
    change it and the trap to avoid — never grow a prompt to make it cacheable.
  - **And the input side is the wrong side anyway.** The proved worst case of one debrief is
    $0.08722, of which **92%** is the output cap. Caching cannot touch output tokens. That single
    ratio reorders every lever: on demand beats caching, determinism beats caching, and the output
    cap — already derived from the length rule that throws long replies away — beats both at
    bounding the worst case.
  - **The unknown discipline applied to money.** A call whose response reported no usage adds no
    dollars *and refuses further spending on that career*. A budget that silently ignores
    unaccounted spend is a budget plus an unknown. `costPerMatch` of an unplayed career is
    `unknown`, not `$0.00` — a confident zero is a back-filled statistic with a currency symbol.
  - **What I will not do.** The box says *measured, not an estimate*. I can bound cost from above
    (`tokens ≤ bytes`, which is sound because a BPE token covers at least one byte) and I cannot
    bound it from below without Claude's tokenizer. Reaching for a different model's tokenizer would
    produce a number indistinguishable from a measurement and wrong by an unknown factor. So
    `pnpm prompt-size` prints bytes and ceilings, and prints a line saying the cost is not there.
  - 32 tests, **14 of 14 sabotage probes bite** — including the two that matter most: folding a
    cache read into the full-price term, and reporting a career total while a call is unaccounted
    for. Branch green: lint, typecheck, and the full suite.

- **2026-09-20 (13)** — **The dialect scorer, and an honest refusal on the half that needs a corpus.**
  - The box wanted a held-out set of **real** Egyptian coach language. I have none, nothing licensed,
    and writing the lines myself and calling them real would be the fabrication this whole product
    exists to refuse. That half is under Blocked with what unblocks it: 30–50 short lines of genuine
    football speech, held out and never shown to a prompt.
  - **What is built is real and does what the box's "done means" asks.** `scoreVoice` counts MSA
    markers, Arabic-Indic digits, hedging, repeated sentences and sentence length; a sample degraded
    one rule at a time scores **strictly lower at every step** (1.000 → 0.933 → 0.800 → 0.667), and
    `findings` names the reason for each fall. 7 of 7 sabotage probes bite.
  - **Two things it deliberately refuses to punish**, both of which a naive scorer would get wrong.
    `ممكن يكون` is not hedging — "الفرق ده ممكن يكون صدفة" is this product telling the truth about a
    measurement, and scoring it down would push the copy towards false confidence. And vernacular is
    **reported but never counted into `overall`**, because a short plain correct debrief uses none of
    it and penalising that would push the writing towards slang for its own sake.
  - An inapplicable rule is **absent, not 1**: English has no MSA or Arabic-Indic sub-score at all,
    because scoring a rule that does not apply as a pass would inflate the English average. Same
    discipline as `SideStats`.
  - It passes the phrasing table we already ship at 1.000 across all 27 causes — if it had not, one
    of the two was wrong.
  - 460 tests across 33 files.
  - **Next box: cost controls** — model per task, prompt caching, debrief on demand, a per-career
    budget. **Done means measured cost, not an estimate**, so expect it to be partly blocked on the
    same key Step 8 needs. UI boxes stay blocked until the owner picks a direction.

- **2026-09-20 (12)** — **The opponent briefing. The guard is that you scout by watching.**
  - `scoutingFrom(results, clubId)` counts goals, shots, on-target, xG, cards, where their shots came
    from and who scored — all from matches actually played. It takes `MatchResult[]`, and a
    compile-refusal test proves a `Club` cannot be passed in a record's place. A fourth-division
    manager cannot open a rival's attribute values, so neither can the model; that is the box's whole
    point and it is now a type error rather than a convention.
  - **A side you have never played gets an almost empty record, and the briefing says so** in one
    sentence instead of producing a confident paragraph about nobody. Same rule as the thin trace.
  - **Shot shares are absent, not zero, until there is a shot to divide.** The `SideStats` discipline
    again: *they never shoot from range* and *we have not seen them shoot* are different claims and
    only one is true before kickoff.
  - Opponent facts live in one block for the same reason the debrief's do — so "every number here was
    counted from a match we watched" is testable about that block while the instructions stay free to
    carry numbers of their own. A scorer with no resolved name is **dropped**, never written as a
    placeholder.
  - `@dakka/content` is a **devDependency** of `@dakka/ai` now, test-only: the record is built from a
    real simulated league because "it adds up to what the results say" is only worth asserting
    against results the engine actually produced. `src/` never imports it and the purity guard scans
    `src/`.
  - 449 tests across 32 files. 6 of 6 sabotage probes bite.
  - **Next box: ⚠️ the dialect eval set and its scorer** — a held-out set of real Egyptian coach
    language and a number that moves when the prompt gets worse. That one needs real source material;
    if it cannot be done honestly, push a blocker rather than a plausible scorer. UI boxes stay
    blocked until the owner picks a direction from `docs/design/boards/`.

- **2026-09-19 (11)** — **The debrief's return trip. The prompt was only half the problem.**
  - `debrief.ts`: the transport is a typed seam and nothing more — Step 8 plugs in the real one. What
    is built and tested is everything around it, and that is where the risk actually was. A prompt
    containing only trace facts does not produce a reply containing only trace facts; a model adds a
    plausible minute, or mentions possession because debriefs usually do. That is the competitor's
    failure arriving through the back door in better prose.
  - `checkDebrief` refuses four things: a number that is not a minute or a count the trace produced;
    a statistic the trace never carries (possession, xG, passing — with or without a number on it);
    a cause that did not happen in this match; and a reply longer than the evidence supports. It is
    pure and synchronous, so a stored debrief can be re-checked after a prompt or model change.
  - **A failed check shows nothing.** The trace is already honest on its own, so the screen's answer
    to a bad reply is the same as its answer to a dead network: show the moments, say the debrief is
    not available, do not guess. A transport failure is an outcome, never an exception.
  - **`UNCARRIED` is deliberately short.** `shots` and `corners` are left off it: "dangerous from
    corners" is a fair reading of a `SET_PIECE_ADVANTAGE` moment, and any count attached to one is
    caught by the number rule instead. A guard with false positives gets switched off.
  - **The guard caught a fabrication in its own test.** My "known-good" reply said the goal came at
    61 — copied from a mock-up rather than from the fixture, where it is at 81 — and `checkDebrief`
    refused it. Recorded in the test rather than quietly corrected.
  - `debriefCacheKey` includes `ENGINE_VERSION`, because a rebalanced engine makes a different trace
    from the same seed and last week's debrief would describe a match that no longer happens.
  - 437 tests across 31 files. 6 of 6 sabotage probes bite.
  - **Next box: the opponent briefing** — same discipline, and it needs no API either: the model sees
    a derived scouting record, never the opponent's hidden attributes. UI boxes stay blocked until
    the owner picks a direction from `docs/design/boards/`.

- **2026-09-19 (10)** — **Three art-direction boards, because the first UI was not a football game.**
  - The owner sent `DESIGN_DIRECTION_G6_1` from another project of his. Its diagnosis matches what
    the screenshots show: a football game has a pitch as its main object, a broadcast matchday, and
    club identity. Dakka had none of the three. Its six acceptance questions are now the gate, and
    they are in the boards' README.
  - **The process point I had skipped:** *approve visual examples, not a taste adjective.* I wrote a
    `DESIGN.md` from a descriptor and built straight from it. There was never a choice put in front
    of anyone. The boards fix that.
  - `docs/design/boards/` — three self-contained pages, one shared `_pitch.js` so they differ in art
    direction only and never in what they show. Real XI (what `baselineTactics` actually picks for
    مطوبس), real opponent, real match numbers: 1-0, goal at 61', swings at 31' and 57' with their
    real deltas.
  - **Board A had the bidi sign bug in its first render** — `-0.13` as `0.13-`, `67'` as `'67`. The
    same defect I fixed in the app two ticks ago, reintroduced the moment I wrote CSS outside
    `apps/web`. It is a rule in `DESIGN.md` §3 and it still did not travel. When the direction is
    chosen, the isolation rule belongs in the shared stylesheet, not in each surface's discipline.
  - **Data gap found while drawing shirts: clubs have no kit colours and no crest.** Every board uses
    invented placeholders and labels them. Under Blocked; it gates all three directions.
  - Nothing in `apps/web` was touched — the working UI stays until a replacement is chosen, per the
    brief's own workflow.

- **2026-09-19 (9)** — **The debrief prompt. A model can now be handed a match without being handed
  a way to invent one.**
  - Three blocks, deliberately separate. `system` is who the coach is, `task` is what to write, and
    **`evidence` is the only place a match fact may appear** — which is what makes the central test
    possible: every digit in that block must be a minute the trace recorded or a count of what it
    recorded, and a second test proves no minute leaks into the other two blocks, so the first is
    not quietly checking the wrong text.
  - **Eight golden files are checked in**, 4 traces × 2 locales, regenerated by
    `pnpm --filter @dakka/ai golden` through the *same* renderer the test uses — a golden cannot be
    "updated" into agreeing with a bug by being rendered slightly differently. Open
    `packages/ai/test/golden/busy.ar-EG.txt` to see what the model actually gets.
  - Repeated causes collapse: `WASTEFUL_FINISHING` ×3 becomes one line plus `(18, 44, 68)`. A quiet
    trace says so and asks for a sentence or two. `paragraphsFor` ties length to evidence, so
    `dakka-engine-rules` §6 is arithmetic rather than hope.
  - **Two bugs found by the tests failing, both mine.** The collapse test used `في الدقيقة` as its
    discriminator — the shared opening of *every* Arabic `one` form — so it counted other causes'
    lines; it now uses the tail after the last slot and asserts that tail is distinctive. And
    sabotage Q5 would not bite because `renderOne` filled a missing actor with `''`, producing
    "On 22 minutes  took it first time" — a headless sentence with no visible hole. Removing the
    `?? ''` makes an unfillable slot survive into the text where the guard can see it, and the label
    fallback is now the only way past. 6 of 6 probes bite.
  - English `one` forms read "On 63 minutes …" rather than "On 63 …", which is how the language
    actually says it. The Arabic was already right; this is the difference ADR-003 exists for.
  - 423 tests across 30 files.
  - **Next box is ⚠️ the debrief itself, server-side — and it needs Step 8's API, which does not
    exist.** Per the box's own instruction, stub the transport and say so, or do Step 8 first. Do
    not call a model from the client: the key would ship in the bundle, and `packages/ai`'s purity
    test exists to make that impossible to do by accident.

- **2026-09-19 (8)** — **The phrasing table is written. Measuring it first found something worse
  than a missing phrasing.**
  - `packages/ai/src/phrasing.ts`: 27 causes × 2 locales. `label` for the trace screen, `one` and
    `many` for the narration, `lesson` for exactly the controllable causes — all four checked by
    tests, including that English is never a copy of the Arabic and that the Arabic carries none of
    the ten MSA markers that separate a news bulletin from a touchline. 8 of 8 sabotage probes bite.
  - **`one` / `many` exists because of the survey, not because it seemed tidy.** The voice skill
    forbids repeating a template within a match; the engine repeats `WASTEFUL_FINISHING` up to
    **7 times** in one. Three variants would still have collided, and three wordings of "he missed"
    is bad football writing anyway. A coach says *four clear chances went begging*, once.
  - **The finding: 14 of 27 causes never fire.** Recorded under Blocked with the reproduction
    (`pnpm causes`, now a checked-in harness command with its own tests). The whole `decision`
    domain is dead, which is the product's own sentence failing. **It is a `trace.ts` detector
    problem, not a balance problem** — +MGR already shows decisions move results, so the effect is
    there and the trace is not attributing it. A substitution's effect spreads over twenty minutes;
    the swing detector takes the biggest single-minute moves, so a shot outbids it every time.
  - **The first survey I ran was wrong and I nearly wrote it up.** It used neutral tactics on both
    sides, which structurally cannot produce a shape, pressing or decision cause — it would have
    reported 17 dead causes for the wrong reason. The checked-in version randomises the dials and
    makes in-match changes precisely so a missing cause means something.
  - The web's duplicate `CAUSE_LABEL` table is deleted; there is one table now, and its tests live
    beside it. 410 tests across 29 files.
  - **Next box is the debrief prompt.** Write it so a trace with no controllable cause yields a
    *short* debrief, not a padded one — that is `dakka-engine-rules` §6 and, until the detector is
    fixed, it is also the normal case.

- **2026-09-17 (7)** — **The AI boundary exists, and the schema has nowhere to write a number.**
  - **The design decision this box turned on.** The blueprint's split puts morale, form, board
    confidence and sack risk in the *deterministic* column and conversation in the model's — so an
    effect schema with a `delta: number` field would hand the model the one thing the split says is
    code's. So **effects carry no magnitude at all.** An effect names what was said — backed him,
    criticised him, said nothing — and `MORALE_FOR` in `effects.ts`, which nothing outside the
    package can reach, decides what that is worth. A model that wants to award +50 morale has no
    field to write the 50 in. That is a stricter reading of blueprint §2 than "validate the number",
    and it is the one the table in §2 actually implies.
  - `MORALE_FOR`'s values are **chosen, not derived** — design constants like the engine's, with
    nothing measuring them yet. Criticism costs more than praise earns; that is a decision recorded
    as a decision, and it gets fitted once there is a season loop to fit it against.
  - **Both guarantees are compile-time, so both are tested by compiling.** `test/compile.ts` writes
    a snippet, runs it through the TypeScript API and asserts the diagnostics. A runtime test would
    have passed whether or not the guarantee held, and a comment saying "the types prevent this" is
    a claim nobody checks. The door is tested alongside the wall: one case asserts the *parser's*
    output still compiles, or a signature that rejected everything would pass the refusals.
  - `Locale` now has one definition. `apps/web/src/i18n/locale.ts` re-exports `@dakka/ai`'s rather
    than declaring its own, and a test asserts they are the same array — every ADR-003 guarantee is
    a `Record<Locale, …>` exhaustiveness check, and two copies would be checks against two lists.
  - **Two sabotage misses, both mine, both worth the time.** Removing `.strict()` from the effect
    schema changed nothing, because `playerTarget` was strict *and* every member re-applied it —
    two independent sources of one guarantee, so deleting either was a no-op. Strictness is single
    -sourced now. And the structural "no numeric field" test could not see a member that accepts
    junk, because it only inspects output from valid input; there is now a test that feeds junk to
    all five kinds and a clean value to all five. 8 of 8 probes bite.
  - `MatchEvidence` re-signs every swing to the manager being spoken to before the model sees it.
    The engine signs `deltaWinProbability` for the home side; a model that forgets to flip it for an
    away manager writes a debrief that is fluent, specific and exactly backwards.
  - 392 tests across 27 files. Harness unchanged at 45 seasons, all seven met.
  - **Next box: `CAUSE_REGISTRY` → phrasing table, both locales.** Note the boundary with what
    already exists: `apps/web/src/i18n/causes.ts` holds the short *name* of each cause, which is all
    the trace screen needs. This box is the *sentence* — the phrasing the model narrates with — and
    it belongs in `packages/ai`. Do not duplicate the names; move them if that reads better.

- **2026-09-17 (6)** — **Ran the app in a browser and it was showing the score to the wrong club.**
  - Three bidi bugs, all the same species, and none of them reachable by a test or a typecheck:
    **isolating each Latin run is not enough — the *order* of a sequence of runs reverses too.**
    1. `2-1` as one isolated string beside two club names: a **1-0 home win rendered as 0-1 in
       Arabic** and correctly in English, from the same markup. Confirmed against the engine rather
       than guessed — `simulate` said `1 - 0`, goal at 43'. Fixed by pairing each club with its own
       number inside one element, so no direction can separate them.
    2. `1.42 → 1.48` in the counterfactual: the three parts reversed, so the arrow pointed from the
       new value back to the old one and contradicted the signed difference printed above it. Fixed
       with a `.seq` isolator around the whole expression.
    3. A signed number substituted into a translated sentence: `+0.42` renders as `0.42+` in
       Arabic — the sign detaches, and a swing towards you reads as one against you. The number is
       now its own element and the sentence goes around it.
  - A fourth, subtler one: **`.num` sets `direction: ltr`, so `padding-inline-end` on that same
    element resolves to its right regardless of the page.** A table cell carrying both padded
    towards the previous column and the numbers ran into the text beside them. Padding belongs on
    the container, isolation on the number. All four are now rules in DESIGN.md §3.
  - Three more guards, sabotage-verified — 11 of 11 across the two runs. The placeholder one is the
    useful one: every interpolation in a locale file must sit on a short allowlist with a reason, so
    putting a number back inside a sentence has to be argued for first.
  - **A correction worth recording.** I read the first low-resolution screenshot as showing the sign
    still detached after the fix, and was wrong — measuring the glyph boxes put `-` at x=215.3 with
    the digits from x=223.7. Reading RTL layout off a downscaled screenshot is not evidence; the DOM
    and the glyph positions are.
  - **Possession is real but narrow.** Checked because the screen showed 50%/50%: across 40 fixtures
    with deliberately opposed tactics it ranges **46.1–54.0%**, eight distinct rounded values. So the
    counter works and that match was genuinely even — but real football swings 30–70%, and this
    engine's possession barely answers tactics at all. A *new* item for the parked balance work,
    not a restatement of the crossing finding.
  - The screenshot rig is in the scratchpad, not the repo: Playwright against the dev server, with
    the Google Fonts request served from disk because the browser does not trust this container's
    proxy CA. Worth a project run-skill if anyone screenshots this again.

- **2026-09-17 (5)** — **The thin UI is up. The product has a face, and the face argues.**
  - `apps/web`: pick club, opponent, venue, three dials and one call after kickoff; play; then the
    score, the numbers, where it turned, and what the call was worth. Both locales from this first
    screen. 352 tests across 23 files, harness at 45 seasons still meets all seven.
  - **The interesting decision was what "every stat opens" means.** Shots, xG and cards open the
    events the engine recorded as they happened. Corners and fouls open a plain statement that the
    counter was incremented at the moment it occurred and that no per-event detail exists — true and
    checkable, rather than a number dressed as more than it is. Passes and offsides have no counter
    at all and render as an em dash with a line saying why. A `0` there would be the competitor's
    `shots = max(shots, goals + random())` in a nicer font.
  - **A league stays data on the client.** `packages/content/src/pure.ts` holds validation and the
    data-to-domain transforms with no I/O, so the browser reads the same JSON through the same
    schema and the same `toClub` as the harness. A test asserts the two build an *identical* league
    — not a similar one — because the moment they diverge, a match simulated on the client stops
    being reproducible on the server and determinism buys nothing.
  - **Eight guards verified by sabotage, and the eighth attempt found a real hole** — see the
    standing rule now at the top of "Note for whoever runs next". That is the third time.
  - **Three measurements the next boxes need:**
    - **Bundle: 594 kB raw, 139 kB gzipped**, of which the league is 476 kB of JSON. The data
      dominates the bundle, and the audience is on Egyptian mobile. Lazy-loading the league, or
      shipping a squad only when a club is chosen, belongs in Step 11 with that number attached.
    - **The xG ↔ goals correlation gate passes by nothing: 0.900 against a floor of 0.900** at 45
      seasons, and **0.894 at 12 seasons**. The margin is inside the run-to-run noise, so that
      threshold is effectively a coin flip on any given run. It strengthens the parked crossing
      finding rather than changing it — crossing is still the only mechanism found that raises it.
    - **Invariant 3 is met by clubs and not by players.** `matoubas-sporting` is a real Latin-script
      transliteration; `matoubas-sporting-1` is a positional id, not a name. So the UI shows the
      Arabic name in both locales — correct for a person's name, and fine for now — but the share
      card in Step 12 cannot read outside Arabic until player data carries a Latin name. That is a
      data box, and it needs to exist before Step 12.
  - Not built, deliberately, and said on screen rather than implied: hand-picked XI, an opponent with
    a manager, substitutions, and a live matchday — so the floodlight palette is defined and unused.
  - **Next box is Step 7's first: `packages/ai` — the boundary, before any model call.** Read the
    three rules at the head of the Weeks 2–6 section first; from here on the failure mode is a screen
    that looks finished, and no harness catches that.

- **2026-09-17 (4)** — **Design references studied properly; `DESIGN.md` gained the four rules it
  was missing.**
  - Read four systems from `styles.refero.design` in full: Steep, Hyer Aviation, Notion, Column.
    Most of what they agree on, `DESIGN.md` had already reached independently — no shadows, one
    accent, hierarchy from surface contrast. That agreement is the useful part of the exercise: it
    means the file was not guessing.
  - Four things were genuinely missing, and are now in: **the surface ladder** (§2 — four levels,
    named, with level 2 an *edge* on night rather than a fill, because a green fill on a dark ground
    is Modareb's exact surface); **the scale is closed** (§3 — seven roles, no eighth, and no ratio
    to extrapolate from); **what earns a card** (§4 — a boundary around a target, not a rectangle
    around unrelated facts); and **a measure cap** (§6 — 640px prose, 960px shell, against the
    1200–1440px those systems use, because they are marketing pages).
  - **The finding worth keeping.** All four buy display hierarchy with negative tracking, −0.02em to
    −0.04em, tightening with size. We cannot: it breaks Arabic joins, and nearly every string here is
    localised. So size, weight and surface carry the load alone — and that is the actual reason
    `display` is 34px rather than the 44–90px those systems open with. An agent reading any of those
    references will reach for tracking first, so §3 now says why it must not.
  - §10 records where the file's *form* came from, since "every number is answerable" ought to apply
    to our own design decisions too.
  - Refero's MCP is connected but the account has no plan — logged under Blocked. Not on the
    critical path for Step 6; it matters more from Step 7, where the UI becomes a journey.

- **2026-09-17 (3)** — **+MGR shipped. The product has its headline number, and a measured reason not
  to trust one season of it.**
  - `mgr.ts`: replay the same fixtures, seeds and squad with a manager who makes no decisions, and
    subtract. Baseline is a flat 4-4-2, every dial neutral, no in-match changes, XI by the engine's
    own `bandCompetence` — no second rating invented, because the gap between two ratings would end
    up inside the number. 312 tests green, gate unchanged.
  - **The measurement that matters more than the feature.** On the real league a season resolves to
    about **±20 points**: `borg-elarab-industrial` at **−23** is called, `matoubas-sporting` at
    **+11** is not. So `PlusMgr.skill` carries the per-match standard error and a `significant` flag,
    and the box above says plainly that showing `points` without it is publishing luck as
    achievement. Calling ±5 points needs roughly 17 seasons.
  - **Sixth guard-that-guarded-nothing, and it was the important one.** Sabotaging the baseline to
    keep the player's in-match decisions passed all fourteen tests — every fixture had
    `decisions: []`, so asserting they were stripped asserted nothing at all. +MGR would have priced
    the team sheet and silently ignored everything the manager did after kick-off, which is most of
    what the product claims to measure. The fixtures now carry real decisions and a test proves they
    move the number. **Same lesson each time: if the test passes while the mechanism is off, the test
    is the bug.**
  - `makeTactics` in the fixtures now fields the first eleven and benches the rest instead of
    demanding a squad of exactly eleven, which had quietly made selection untestable.
  - **Next box is the thin UI** — and it is the first product surface. `DESIGN.md` and the three
    rules at the head of the Weeks 2–6 section before writing a line, and two locales from that first
    screen (ADR-003).

- **2026-09-17 (2)** — **Crossing, second attempt. Solved the distribution problem that blocked it;
  two blockers left, both measured. Still not shipped.**
  - **The headline blocker is gone.** `PENETRATION_SKEW` 0.45 → 0.52 with cross depth 5–24 m puts all
    five published shot-distance bands inside tolerance **with crosses in**, and inside-the-box at
    0.654. `SHOT_PRESSURE_BASE` 75 → 58 restores the goals that pushing shots outward costs — the
    right constant to spend, since the engine's own comment calls it the least anchored number it has.
  - **Gate green at 12 seasons on a halved attempt rate**, correlation **0.914**. Three tests fail.
  - **⚠️ The crowd is a real regression, measured at 2,500 matches a side: worth 0.006.** Full house
    0.253 ± 0.056 against an empty ground 0.247 ± 0.055. Crossing adds an aerial channel none of the
    crowd's three levers touch, so its share of the outcome shrinks. The crowd constants need
    re-fitting with crosses in, the same way the shot geometry just did. Only that test sees it —
    the harness still reads home advantage in band, because travel and pitch unfamiliarity carry it.
  - **The two low-block misses are within a few percent** (15.97 m against 16.09; 0.892 against 0.93).
  - **Rejected: a cleared cross going behind for a corner.** It restores a little volume and halves
    the crowd effect again — it makes the hard problem worse to nudge the easy one.
  - **A pre-existing test was passing on luck.** The crowd test compares two 400-match samples and
    wants a 0.03 gap; the standard error at that size is ±0.14. It says it is paired, but changing
    attendance diverges the RNG stream immediately, so almost nothing cancels. It passed before
    because the effect was real *and* the sample happened to fall right. Worth fixing whatever
    happens to crossing — same lesson as the five guards on this branch: **a threshold a noisy
    sample clears is not a guard, it is a coin that has been landing the same way.**

- **2026-09-17** — **Built crossing. Reverted it. It is the key to the whole dominance problem and it
  needs a re-fit to land.**
  - The engine had no crosses: a chance worked down the wing was *shot* from the wing, and `crossing`
    sat unread on every player in the league. Built it as a real trade — delivery, aerial contest,
    room wide for time on the ball, room central for a target, and a cleared cross loses you the ball.
  - **The prize, and it is the big one: the xG correlation went 0.900 → 0.914.** That number has had
    no margin at all since the gate first passed, and it has now killed four structural changes.
    Crossing is the first mechanism that lifts it, for the exact reason the last blocker asked for —
    a better side exploits it more. Measured: +13% shots from a 90-rated crosser over a 20, +32% from
    a 90-rated aerial side.
  - **Why it could not ship.** Nine tests. Crosses move the shot-distance distribution off its
    published shares (76% inside the box against a 72% ceiling), stop the low-block tests
    discriminating, and break the trace's rate model, which does not know a final-third arrival can
    end as a cleared cross. **Halving the rate takes the failures to two and the correlation back to
    0.899** — the gain and the breakage are the same thing, so this is a re-fit of the open-play shot
    geometry with crosses in it, not a tuning.
  - **Crossing alone does not fix the dominance** (13 pairs before and after). **Crossing plus the
    stretch does**: `DEFENCE_FOLLOWS_ATTACK = 0.6` gives **three healthy dials and 7 dominated pairs
    against 13**, the best this engine has reached. That is the route — re-fit the geometry, then
    spend crossing's headroom on the stretch.
  - Every constant is written into the box above so nothing is re-derived.
  - **Fifth guard-that-guarded-nothing, and the worst one yet.** `CROSS_BASE` was set above
    `CROSS_CEILING`, so the find-rate was clamped almost always and no attribute moved it — a coin
    flip wearing a football word. The test written to catch exactly that passed anyway, because a
    bare `toBeGreaterThan` on two noisy samples is carried by luck. Both now carry a margin taken
    from a measurement. **If a test about a mechanism passes while the mechanism is switched off, the
    test is the bug** — and only the sabotage pass ever finds it.

- **2026-09-16 (4)** — **Found the cause of the width/compactness dominance and a fix that works.
  Shipped nothing: the fix levels the league and the gate says no.**
  - **Cause, measured:** `narrow` scores 0.32 more than `wide` and concedes the same; `tight` scores
    0.28 more than `loose` and concedes 0.19 less. Both dials are conserved transfers of a side's
    *own* presence, so the space they vacate costs the opponent nothing to be given. Nothing makes a
    defence pay for being pulled out of shape, because nothing pulls it.
  - **Fix, working:** `DEFENCE_FOLLOWS_ATTACK`, a conserved channel transfer on the defending grid
    toward the attack's channel bias. At k=0.6 both dials come back fully healthy.
  - **Why it cannot ship:** champion points 82 → 76, stronger-side 0.633 → 0.619, xG correlation
    0.900 → 0.872. It makes shape matter more and players less. Even k=0.3 — barely enough to help —
    still fails the correlation at 0.886. Reverted; `space.ts` is untouched and the gate is green.
  - **Quality-scaling the drag made it worse, not better** (corr 0.864). Scaling *how far* a block is
    dragged still punishes the concentrating side whoever they are.
  - **The pattern to act on next time.** The xG correlation has now blocked *every* structural change
    tried: pressure split (0.892 → 0.765), `COUNTER_DEPTH` (−0.018), this (−0.014 to −0.028). That
    check measures the spread of club quality as much as xG's honesty, so any mechanism that
    compresses clubs toward each other fails it whatever else it gets right. The next attempt needs a
    mechanism **a better side exploits more** — not one scaled by quality after the fact.
  - **Concrete lead for the next run:** there is no crossing in this engine. A chance worked down the
    flank is finished from the flank, which is most of why conceding a flank is cheap and therefore
    why `narrow` and `tight` are free. Giving the flank a use is a mechanism good players would
    exploit more, which is exactly the shape the correlation demands.

- **2026-09-16 (3)** — **Line height is a choice again. One constant, and two rejected fixes recorded
  with their numbers.**
  - `EXPOSURE_SCALE` 1.1 → 3. All seven thresholds pass on 114,000 matches; xG correlation 0.902
    against a 0.904 baseline. Dominated pairs across all six dials: 16 → 13. `lineHeight` 5 → 3 and
    `normal` is a real answer again; `pressingIntensity` 3 → 1; `mentality` 0 → 1, a regression worth
    checking for small-sample artefact before chasing.
  - **My last diagnosis was wrong and the correction is the useful part.** I said PROGRESSION volume.
    Above `deep`, shots barely move (13.7 → 14.2) while **xG per shot rises 47%** — pressure 76.8 →
    57.3, distance 14.8m → 13.3m. The upper ladder is shot *quality*. `deep`'s problem is volume.
    Two different channels; I had been looking at one of them.
  - **The real fault: reward 1.72 against risk 0.88**, measured like for like. And the figure that
    first made it look like an order of magnitude was comparing a three-zone sum with a single
    scalar — not like for like at all. The honest ratio was 1.95, and is 0.71 now.
  - **Rejected, with numbers: splitting shot pressure into attacker and defender terms.** The
    double-count reasoning was wrong. Sweeping the attacker coefficient 12 → 0 cut dominance but took
    the xG correlation 0.892 → 0.765 with it, and no re-centring recovered it. That term carries real
    signal; it is two consequences of one cause, not a double charge.
  - **Rejected, with numbers: `COUNTER_DEPTH`.** Retried because the earlier "too weak" verdict was
    measured at the old exposure scale. At the new one it *works* — zero dominated settings, a fully
    healthy dial — but costs 0.018 of xG correlation, consistently. §7 says the engine gets fixed, not
    the threshold. Next hypothesis: a deep side's counters are taken by whoever is upfield, so the
    chance is good and the finisher is not — look at `pickShooter` on a counter.
  - **A test I wrote had to move, and it was the right move for the wrong-looking reason.** The
    counterfactual "calls what it can see" test failed after the re-fit. The park-the-bus effect on
    goals conceded barely changed (-0.217 → -0.210); at 120 pairs it had been clearing the
    significance bar by luck. Raised to 300 — resolution, not a nudge toward a desired answer.
  - **Fourth guard-that-guarded-nothing on this branch.** The new ratio test passed at the old
    constant because I wrote the bound from the un-measured "order of magnitude" figure rather than
    from the real 1.95. Measured both ends, put the bound between them, and it fails on revert. The
    sabotage check caught it; nothing else would have.

- **2026-09-16 (2)** — **Took the line-height box. Did not fix it; found it was five times bigger, and
  built the tool that measures it.**
  - `pnpm dominance` plays every tactical setting against every opposing setting and asks §4's
    question directly. The balance harness structurally cannot: it plays each club's fixed identity,
    so it validates the league as played and never the decision space. 295 tests green, gate
    identical — no engine behaviour changed.
  - **The finding is now five dials, not one.** `lineHeight` (worst), `pressingIntensity`, `tempo`,
    `width`, `compactness` all have a dominated setting; only `mentality` is healthy. The tactical
    layer is currently a set of single correct answers.
  - **Mechanism, measured:** dropping from `normal` to `deep` takes your own chance rate 0.1705 →
    0.0997 *and* lifts the opponent's 0.1513 → 0.1681 — worse at both ends. The dominant term is
    PROGRESSION, not the final third. The cause is clamp asymmetry: a deep block's build-up gain hits
    a 0.97 ceiling and its crowding hits a 0.18 floor, while the final third has 0.37 of headroom
    above base. Buying final-third space is always worth more than selling it.
  - **One fix attempted and reverted.** `COUNTER_DEPTH` scaled exposure by the attacker's own depth —
    football-honest, moved the right way (+0.30 → +0.53), nowhere near enough (+0.89 needed).
    Exposure is too small a lever against a 4-unit midfield deficit. Reverted rather than shipped,
    per the ⚠️ rule.
  - **Two methodology corrections worth more than the probe itself.** The first version compared raw
    averages and flipped `compactness`'s direction between sample sizes; it now pairs per match and
    uses `pairedDifference`, exported from the engine so the probe and the counterfactual runner
    cannot disagree about what a finding is. The second version required only "never *significantly*
    better", which convicts on one significant column while the rest tie — it indicted `mentality`
    while `attacking` was plainly ahead in a column. Dominance now needs the raw average never worse
    **and** a significant gap somewhere.
  - **The trap, twice now:** a synthetic "noise" test built by shifting both arms equally has a
    *constant* paired difference, which is certainty. Both times the sabotage check caught it. If a
    test about noise passes instantly, check that the difference actually varies.
  - **Next:** the re-fit. Start at `PHASE_CEILING.BUILD_UP` and `PHASE_FLOOR.FINAL_THIRD` — the
    asymmetry is arithmetic and needs no simulation to see. Run `pnpm dominance` beside `pnpm
    harness`: the seven thresholds and the dominance matrix must come good together.

- **2026-09-16** — **The counterfactual runner, and the first thing it found.**
  - `counterfactual.ts`: same seed, one decision changed, N paired runs, with the honesty gate built
    in. Every measurement carries the standard error of its own mean and a `significant` flag needing
    two of them, and `runsNeededFor()` says what an uncalled effect would cost to call. A `false`
    there is an answer, not a failure. 286 tests green, gate unchanged.
  - **The replay is byte-identical until the decision minute** — asserted on the event streams, not
    assumed. That is what rule 2 was bought for.
  - **Pairing is worth ~7× the runs**: paired sd of the points difference is 0.693 against ~1.9
    unpaired. And the practical scale: a 0.1-point decision needs 200–750 paired runs to call. The UI
    must respect that number rather than quote a delta after fifty.
  - **⚠️ First finding, written up as the next box: sitting deep against a high line is punished far
    too hard.** Forcing `deep` → `very_high` roughly triples goals scored against five different
    opponents (+0.51 to +1.12 points, all significant) while conceding barely moves. But between two
    sides that both start `normal` the trade is correct (+0.46 for, +0.39 against), so the mechanism
    works — what is broken is the deep-versus-high-line matchup specifically.
  - **The part worth remembering is why the gate missed it.** The harness plays each club's own fixed
    tactical identity, so it validates *the league as played* and never *the decision space a player
    can explore*. A player who found "always push up" would break the game and 17,100 matches would
    have said everything was fine. The counterfactual runner is the tool that sees this class of
    problem, and it found one on its first real use.
  - Probe discipline note: my first probe used `'lineHeight'` where the type is `'line_height'`, and
    the decision silently did nothing — harness scratch files are `eslint-disable`d and not
    typechecked, so nothing caught it. The exact-zero result is what exposed it. A counterfactual
    that reports precisely 0.000 ± 0.000 means the variant is not a variant.

- **2026-09-15 (3)** — **Step 5, first half: the trace. The engine explains itself now.**
  - `trace.ts` turns the chain's new per-minute state into a win-probability timeline and 5–8 swing
    moments with closed-enum causes. Mean 6.97 swings a match; gate identical to three decimals, so
    the trace reads the match without touching it. 269 tests green.
  - **The design decision that matters:** win probability is Poisson over the minutes remaining, at a
    goal rate the *engine* reports (`MinuteState.shotsPerMinute`), not a curve fitted to results. The
    closed-form rate is checked against the chain's real shot output — 0.95 home, 0.94 away, and the
    split as well as the total — because a rate model that drifts makes the trace explain a slightly
    different match, convincingly.
  - **A swing is measured against expectation**, so `(1 - xg)` for a goal and `-xg` for a miss. A
    converted penalty barely registers, a save from six yards is huge, and neither is special-cased.
  - **⚠️ Caught a cause cited backwards** — an away goal explained by the reason its scorer was being
    smothered. `CAUSE_REGISTRY.favours` fixes it. **The first test for it guarded nothing**: the
    sabotage passed all 21 tests, because "the cause is not direction-blind" is true of a backwards
    cause. The version that bites compares polarity against whether the shooter's side came out
    ahead. Third time this branch has shipped a guard that did not guard; the sabotage check caught
    it every time, and is the only reason.
  - **Substitution and mentality causes are deliberately unemitted**, with a test pinning it. Saying
    a sub swung a match needs the match replayed without it — which is the next box, and the right
    tool. A missing moment costs a short debrief; a confident wrong one costs the whole claim.
  - **Measurement note worth keeping:** the gate read 375 matches/s against 509 this morning. That is
    not a 26% regression from the trace — paired, the trace costs ~2% and the machine is simply a
    third slower today. Same lesson as the performance box, and it nearly cost a run.
  - **Next:** the counterfactual runner — same seed, one decision changed, N runs, outcome
    distribution delta. It unblocks the four decision causes above. Two smaller things found on the
    way: `pickZone`, `bandSpace` and `channelSpace` each call `ZONES.filter(...)`, allocating an
    array per call on a hot path — the same class of waste as the zone-string fix, worth its own box
    with a paired measurement. And `FORMATION_MISMATCH` should be made directional in `space.ts` so
    the trace can cite it.

- **2026-09-15 (2)** — **The engine is 2.4× faster. The profile found it in four minutes; two days
  of guessing had found nothing.**
  - **The obstacle recorded here yesterday was a flag, not a missing build.** `tsx cli.ts`
    re-executes the program in a child process, so `--cpu-prof` sampled the idle parent and reported
    98% idle. `node --cpu-prof --import tsx src/cli.ts` profiles in-process. I had written "give the
    harness a build that resolves to compiled JS" as the next step; I did build that bundle, and it
    worked, and then it turned out to be unnecessary. **Shipped `pnpm harness:profile`** so the next
    run gets the answer in one command instead of rediscovering the flag.
  - **The answer: 40% of all CPU was in `bandOf` and `channelOf`**, recovering one of nine constants
    from a string with `zone.split('_')`, once per call, millions of times a season. `zoneOf` was the
    same mistake inverted — a fresh template string per grid lookup. Three lookup tables in
    `zones.ts`. Paired, interleaved, same session: **229 → 548 matches/s, distributions
    non-overlapping.** The 45-season gate: minutes → **34 s**. The blueprint's full run: ~8 h → ~2 h.
  - **The gate output is identical to three decimals** — all seven numbers unchanged. That is the
    check that matters for a performance change, and I would not have shipped it otherwise.
  - **The tables are safer than what they replaced**, which is not the usual trade: `split()[0] as
    Band` was an unchecked cast, `Record<Zone, Band>` is a build error. But a *complete* table can
    still be *wrong*, so `zones.test.ts` gained a test reading each zone back against its own name.
    Verified by sabotage — a consistently swapped channel table passes the mirror round-trip and 15
    of the 16 zone tests, and fails the new one.
  - **Why the earlier guesses missed.** Both aimed at allocation inside `tacticalPresence`; the cost
    was in the string handling underneath it. A micro-benchmark had told me which function was
    expensive and I assumed I knew why. That is the whole lesson: a benchmark localises, only a
    profile explains.
  - **CI now runs the gate at 45 seasons rather than 20**, which is what the speedup was worth
    spending: it is the sample size every figure in the docs is quoted at, and at 20 the thin xG
    margin reports noise.
  - **Then spent the rest of it settling that margin.** 300 seasons — 114,000 matches, 215 s, a
    thing that was not worth doing yesterday — puts the xG correlation at **0.904 on 6,000
    club-seasons** against 0.901 on 900. All seven thresholds pass. The engine sits just above the
    floor because finishing is *meant* to decouple goals from xG, not because a small run got lucky.

- **2026-09-15** — **Performance: a negative result, recorded properly. Nothing shipped.**
  - Micro-benchmarks pointed at `resolveBoth` as roughly half a match, so I tried the two obvious
    things: one reusable scratch grid in `tacticalPresence` instead of about thirty-three short-lived
    ones per call, and precomputing the three pitch positions instead of an `indexOf` per zone per
    band. Both were verified byte-identical against a whole-season SHA, so correctness was never in
    question.
  - **Measured paired, on the real workload, same machine, same session: 131/128 matches per second
    against a baseline of 128/128.** Nothing. Reverted — an in-place mutation rewrite that buys no
    speed is strictly worse than the copying version it replaced, and keeping it "because it should
    be faster" is how complexity accumulates without justification.
  - Two things worth keeping from it. V8 allocates short-lived small objects almost for free, and a
    three-element `indexOf` is not a scan worth removing; both of my "optimisations" were guesses
    dressed as analysis. And the paired measurement mattered: the machine was running roughly 30%
    slower this session than last, so an unpaired before/after would have shown whatever I wanted.
  - **Profiling did not work, and the obstacle is now written down** rather than left for the next
    run to rediscover: `node --cpu-prof` through `tsx` reports 98% idle because the sampler does not
    see the work through its loader, and the compiled `dist/` output will not run standalone because
    every workspace `package.json` points `main` at TypeScript source.
  - Tree unchanged, 245 tests green. **I do not know where the time goes, and the box says so.**
  - **Next run: Step 5, the decision trace.** `MatchTrace` is still emitted empty by design. The
    engine can be trusted to produce football now; the next job is making it explain itself, which is
    the thing the whole product exists for.

- **2026-09-15** — **The gate passes. All seven thresholds, on 17,100 matches of real content.**
  Step 4 is the wall the blueprint put in front of any UI work, and it is down.
  - **Home advantage was the last one, and it came from the field nobody had connected.**
    `Stadium.pitchQuality` has been in the type since Step 1 doing nothing. A side knows its own
    surface; on a rutted fourth-division pitch that is worth something and on a smooth one it is not.
    Wiring it took home advantage from **0.063 to 0.332**.
  - **The result I like most is one nobody wrote.** A rutted pitch is now worth **0.367** of a goal
    to its owner and a good one **0.165** — because familiarity matters more when the ball does
    unpredictable things. That falls out of scaling by quality; there is no rule anywhere saying it.
  - **Two wrong hypotheses, killed by measurement before they could cost anything.**
    1. *Away caution.* I was confident home advantage came from away managers setting up more
       cautiously, and wrote that into the box as the next step. Built it: the advantage did not
       move (0.069) and goals fell from 2.571 to 2.217, because caution suppresses both sides about
       equally. Reverted. In the literature away caution is a **response** to home advantage, not a
       cause of it — I had the arrow backwards.
    2. *A sensitivity sweep that measured nothing.* I probed how big a home-side edge the engine
       needs by scaling fitness, and read "a 16% edge is worth only 0.056 goals" — which would have
       said no credible mechanism could ever work. The bug: fitness starts at 100 and the code caps
       it at 100, so the multiplier was clamped away. Re-run against presence, the real answer is
       **~5.0 goals of advantage per unit of presence edge**, so +0.35 needs about 7%. That is the
       difference between "this is impossible" and "this is one honest mechanism away".
  - **Also landed: the harness now runs in CI** at 20 seasons on every push. It was deliberately kept
    out until it was green, because a permanently red pipeline teaches everyone to ignore it.
  - The xG correlation passes at **0.901** against a 0.9 floor, measured on 900 club-seasons. Thin,
    and recorded as thin — with the note that it is in real tension with finishing skill, which is
    *designed* to make goals deviate from xG. A correlation of 1.0 would mean finishing does not
    exist.
  - 245 tests green, lint/typecheck/format clean.
  - **Next run: Step 5 — the decision trace.** `MatchTrace` is still emitted empty by design, and it
    is the thing the whole product is for: the engine can now be trusted to produce football, so the
    next job is making it explain itself.

- **2026-09-15** — **The pitch model landed, every constant re-fitted, and the gate went 3 of 6 to
  6 of 7.** Measured on 45 seasons — 17,100 matches — of the real Egyptian fourth division.
  - **Zones are thirds of the pitch now.** Each side gets an offset from its line height, both are
    sampled onto a shared coordinate, and with neither offset it reduces **exactly** to the old
    pairing — asserted, so everything calibrated before it stays calibrated. `LINE_SHIFT` is gone:
    it and the offset both modelled "the team drops", and applying both double-counted it.
  - **The re-fit was driven by the harness, not by probes**, which is exactly why the harness had to
    come first. Sweeping constants against whole leagues found combinations that single-fixture
    probing would have called good and the league would have rejected.
  - **The harness caught a failure that was not in its own threshold list.** An early re-fit hit
    goals per match perfectly — with 15.7 shots a match, each worth 0.155 xG. Goals are shots times
    conversion, so a gate checking only the product can be satisfied by a league no one would
    recognise as football. I added **shots per match (22–28) as a seventh threshold**, which is
    tightening the gate — permitted; lowering one is not — and then had to earn it back.
  - **Two external anchors disagreed, and the correction went on the invention.** With shot distances
    matching published football closely, shots were still worth 0.139 xG each against a real ~0.11.
    The distance bands and the xG curve are both anchored to published figures; `pressure` is a 5–98
    scale I made up. So the correction belongs there — `SHOT_PRESSURE_BASE` 45 → 75 — and the code
    says plainly that a resulting mean near 70 is high, that it may be covering for a slightly
    generous curve rather than genuinely closed-down shots, and that the two look identical from
    here.
  - **`COMPETENCE_SPREAD`: ability is now damped to a third of its raw ratio.** Competence was
    `mean / 50`, so a squad averaging 70 carried 1.75× the presence of one averaging 40 in every
    zone — and that gap was multiplied again through three sequential phase gates. The stronger side
    won 79% of a real league. Damping is not a fudge for the threshold; it is the statement that a
    1–99 attribute scale is not linear in match effect, which was an unexamined assumption until
    there was a harness to test it.
  - **A conclusion I drew and then corrected.** I read three harness runs as showing the xG
    correlation tracking `COMPETENCE_SPREAD`. The spread across near-identical configurations was
    0.016 — the "trend" was inside the noise. Re-measured at 900 club-seasons instead of 280, which
    is the only reason the final number (0.904) can be trusted at all.
  - **Two tests were rewritten, not nudged.** Line height no longer moves bodies within the shape, so
    the old assertion was asserting a mechanism that no longer exists; it now asserts the new truth
    (presence untouched) plus the replacement claim (the block contests different ground). And the
    strength test's 2× bar became 1.35×, with the reason written beside it — a far better side should
    work clearly more openings, not overwhelm.
  - 243 tests green, lint/typecheck/format clean.
  - **Next run: home advantage — and the answer is probably not the crowd.** Away managers set up
    more cautiously in real football, and the harness gives every club one fixed tactical identity
    regardless of venue. Make the manager venue-aware and re-measure before touching a crowd constant.

- **2026-09-14** — **Step 4: the harness exists, and it says the engine is not ready.**
  - **`packages/harness` runs real seasons.** Real grounds, real crowds derived from each club's
    standing, real distances between Egyptian towns, real fixture list, real points system read from
    the league file. Nothing in it decides a result — it builds each `MatchInput`, calls `simulate`,
    and adds up what comes back, which is the only way a gate can check the engine rather than offer
    a second opinion about it.
  - **The verdict, 20 seasons / 7,600 matches: 3 of 6.** Passing — xG↔goals correlation **0.951**
    (the xG we show genuinely predicts the goals we score), champion points **94.9**, determinism
    **1.000** (a whole season replays byte for byte). Failing — goals per match **3.654** against
    2.5–2.8, home advantage **0.044** against +0.3–0.4, and the stronger side winning **78.7%**
    against a wanted 55–65%.
  - **The most valuable thing it found was invisible before.** Every earlier measurement used two
    identical 55-rated sides and read 2.83 goals a match. On a real league it is **3.65**. The
    difference is mismatches: a league where the stronger side wins 79% of the time is a league of
    blowouts, and blowouts are where the extra goals come from. So the goals figure is probably a
    symptom of the strength curve and not a separate fault — which is precisely the kind of thing
    single-fixture probing could never have told me, and why the harness had to come before the
    re-balancing rather than after.
  - **The thresholds are pinned by a test.** `CLAUDE.md` says the engine gets fixed and the
    thresholds do not get lowered; `harness.test.ts` asserts their exact values, so loosening one
    now means deleting a test that says why it exists.
  - **An unmeasured check reports `??` and fails the run.** Three-valued on purpose: a green report
    that quietly skipped a check is worse than a red one.
  - **A 31% speed-up, verified byte-identical.** A match went from 13.7 ms to 9.4 ms by writing out
    the nine-key grid literals instead of `Object.fromEntries`, inlining the competence sums instead
    of allocating a six-element array per zone per player, and resolving both sides' maps in one pass
    instead of building every grid twice. I took a SHA of a whole season's results before and after
    each step and it never moved — which is the only way to make a performance change to a
    deterministic engine and still be able to say it changed nothing.
  - Full gate still takes ~10 hours, and `resolveSpace` is still 62% of a match. Filed with the
    number rather than left as "it's slow".
  - 241 tests green, lint/typecheck/format clean.
  - **Next run: the strength curve.** It is the largest failure, it probably explains the goals
    figure, and the note on that box says where to look — ability compounds through four stages
    between `bandCompetence` and a phase probability.

- **2026-09-14** — **Row 1: diagnosed and built, then deliberately reverted. Nothing shipped.**
  - **My previous diagnosis was wrong, and the correction matters.** I had blamed
    `space = attack − defence` for treating an empty midfield (0 − 0) like a crowded one (2 − 2).
    Measured, that is not what happens: against an ultra-attacking side, the deep side has **more**
    midfield presence — 2.67 against 1.84 — so the differential is real and correctly favours it.
    The worklog box has been rewritten rather than left to mislead the next run.
  - **The real defect is a frame error.** Zones are thirds of a *shape*, and `mirror()` pairs them
    band for band, which assumes both teams' thirds line up on the grass. They do not. A side sitting
    deep is compressed into its own third, so its "midfield" is behind the halfway line and is not
    contesting the opponent's build-up at all. Pairing it there let a low block strangle a phase of
    play it was not present in.
  - **Built it and it works — as far as it goes.** Both sides placed on a shared 0–2 pitch coordinate
    and sampled with a proximity kernel. It reduces **exactly** to the old pairing when both sides
    play a normal line, which I verified: the even-tactics numbers came out byte-identical. Row 1
    flipped — an ultra-attacking side now outshoots the ultra-defensive one, 12.13 to 11.79, where it
    was 11.29 to 13.11 — and **possession moved off 50% for the first time** (51.4% against a low
    block), which no tactic had ever managed.
  - **And I reverted it, because it trades one symptom for two.** Goals per match against a deep side
    fall from 2.51 to 1.90, and the home advantage against a deep away side goes from +0.205 back to
    −0.03 — undoing the box before this one. Congestion in front of a low block roughly triples, and
    `PHASE_BASE`, the floors and the ceilings were all calibrated against the old levels. Rebalancing
    them needs every pairing checked at once; doing it one probe at a time is exactly how constants
    end up fitted to whichever pairing I happened to measure last. **That is what the harness is for**,
    so the change is written up in full and filed to land with Step 4.
  - **One genuine bug found inside the experiment, and kept in the note.** `LINE_SHIFT` (a band
    transfer) and the pitch offset both model "the team drops", so applying both double-counts it.
    Under the pitch model line height should carry the offset only. Removing the double count moved
    goals from 1.74 to 1.90 on its own.
  - Branch unchanged at 219 tests green. **A reverted experiment with a written-up result is worth
    more than a landed regression** — and this is the second time this week that checking a fix by
    reverting it has been the step that told me the truth.
  - **Next run: Step 4, the 10,000-season harness.** Build it to re-fit the phase constants against
    every tactical pairing simultaneously, then land the pitch model inside it.

- **2026-09-14** — **The deep block: three rows fixed, and the fourth traced to a different defect.**
  - **Line height now moves the whole team.** It transferred defence↔midfield only, so a side
    dropping its line kept every forward where it was. That is not a low block, it is a team cut in
    half — and it was why sitting off cost nothing. Mentality still moves midfield↔attack alone, so
    the two stay distinct: line height says where the block sits, mentality how many commit forward
    within it. The original split existed to stop them double-counting, and stopping the
    double-count is what created the free lunch.
  - **Congestion buys quality, not volume.** A packed final third was suppressing whether a side shot
    as well as where from — charging the same congestion twice. You can always have a go from the
    edge of the box; what a packed area takes away is getting inside it.
  - **Results.** Chances conceded by a deep block versus a high line went from 14.8 m vs 15.3 m
    (backwards) to **16.1 m vs 13.4 m**. Home advantage against a deep away side went from **erased**
    (−0.001) to **+0.205**, now above the +0.175 even-tactics case — sitting deep costs you. Shot
    volume conceded by a low block went from 0.84× to 1.01× a high line. Goals per match held at 2.83.
  - **A test that guarded nothing, caught.** After the fix I reverted it to check the gate — and
    **every test still passed**. The correction was load-bearing and completely unguarded, which is
    exactly how a fix gets silently undone by a later run. Worse, my first attempt at a guard also
    passed under revert: the thresholds were loose enough that the *other* change carried them. The
    discriminating measure turned out to be shot **volume** conceded by a low block — 1.01× with the
    fix, 0.84× without — and the test is now set where it actually separates the two.
  - **Row 1 is still wrong, and it is a different defect.** An ultra-attacking high side still works
    fewer shots (11.3) than the ultra-defensive deep side it plays (12.7). The cause is not the low
    block: **possession sits at 50% in every configuration measured**, responding only to tempo and
    directness, so a side camped in the opponent's half cannot camp. And that traces to
    `space = attackPresence − defencePresence`, which scores an empty midfield (0 − 0) identically to
    a crowded one (2 − 2). In football, 0 v 0 means there is nobody to pass to. When both sides
    vacate midfield — exactly what ultra-attacking versus ultra-defensive produces — the model calls
    it neutral and lets the deep side stroll through. Filed as its own ⚠️ box with the fix direction.
  - 219 tests green, lint/typecheck/format clean.
  - **Next run: the 0-v-0 problem.** It is the last thing between here and the Step 4 harness, and it
    will move goals per match and possession share, so re-measure both.

- **2026-09-13** — **Home advantage, and the defect it finally pinned down.**
  - **Built out of three named channels**, each tested on its own: a crowd is adrenaline, so the home
    side drains slower; a crowd pushes a side onto the front foot, as a conserved band transfer that
    the right opponent can punish; and the referee hears the ground, which is the best-evidenced
    component of home advantage in the literature. `crowdIntensity` is driven mostly by how **full**
    a ground is rather than how big — the fourth division is played in small grounds, and a model
    that scored the crowd by stadium size would say every lower-league match is played in silence.
    Nothing reads either club's reputation: a crowd is a crowd, and scaling it by who the club is
    would be the multiplier this engine refuses everywhere else, dressed as atmosphere.
  - **The principle this box turned on.** A **choice** must be able to hurt you; a **circumstance**
    may simply be good or bad luck. `HOME_CROWD_LIFT` is registered `circumstantial` for exactly that
    reason. So a crowd is allowed to be worth something — but the one channel that is a shape change
    is still conserved, so even luck routes through a mechanism that can go wrong.
  - **Delivered: empty 0.004 · full house 0.140 · derby 0.179**, against a required +0.30–0.40. It
    grows through the match (0.056 first half, 0.084 second), which is what the real game does and
    which falls out of the adrenaline channel rather than being scripted. Fouls read 9.2 home
    against 12.2 away at a full house.
  - **I did not force the number.** Reaching +0.35 through the crowd would need about 25 fitness
    points of lift, or a band shift larger than half an ultra-attacking mentality. Neither is
    physically credible, and both would be fitting the engine to a threshold rather than fixing it.
  - **A measurement mistake worth recording.** My first sweep read a tunable from `globalThis` at
    module load, before the test set it — so every row ran at the same value and the "curve" was pure
    seed noise. It also showed that **seed noise is about ±0.1 goals at N=400**, which means the
    earlier crowd readings were barely above noise. Everything after that is **paired**: identical
    seeds across conditions, so the noise cancels in the comparison. Unpaired sampling would have let
    me report almost any conclusion I wanted here.
  - **And it pinned down the real defect.** Testing whether away caution explains the rest gave the
    decisive result: an away side simply **dropping its line erased the entire advantage**, +0.140 →
    −0.001. That is the **fourth** independent signal that the deep block is too strong, after 3d,
    3d·fix and 3f. Filed as its own ⚠️ box with all four rows and a specific place to look: a deep
    line zeroes `LINE_RISK`, which cancels both `exposure` **and** `compression`, so sitting off
    currently costs a side nothing at all. In football it costs territory, the ball and shooting
    position.
  - 216 tests green, lint/typecheck/format clean.
  - **Next run: the deep block.** It blocks the home-advantage threshold and probably more of Step 4
    besides. Re-measure all four rows in that box afterwards, and re-check goals per match.

- **2026-09-13** — **3g: `simulate()`, and Step 3 is complete.** The engine plays a whole match.
  - **Determinism holds over 1,000 runs** of the same seed, byte for byte. That is the property
    counterfactual replay, the seeded daily challenge, honest PvP and reproducible bug reports all
    rest on, and they die together, so it is checked at a thousand rather than at two.
  - **`simulate()` decides nothing.** Possessions came from the chain, xG from a curve that cannot
    see the shooter, outcomes from a resolver that cannot see the future. This file tallies them,
    which is why it is short and why there is nowhere in it to invent a number.
  - **The one thing it adds is the score.** Shots are resolved the instant they are struck, so the
    running score reaches the chain in time to change what happens next — a side a goal down late
    throws bodies forward, as a conserved transfer, and can be caught on the break for it. The
    ordering guarantee is the point: a shot's context is frozen *before* it is resolved, so the score
    changes what follows and never reaches backwards. 17.9% of goals now come after the 75th minute.
  - **`passesAttempted`, `passesCompleted`, `offsides` and `assists` became optional.** Nothing
    counts a pass or an offside line, so there is no honest moment to increment them, and a zero
    would claim we looked and found none. Absent now differs from zero at the type level, and the
    compiler will not let a UI read one without handling it. Verified by filling them in with
    plausible values derived from possession — the exact competitor pattern — which fails the test
    immediately.
  - **Ratings are built only from counted contributions**: goals, the xG of the chances a player got
    into, saves, goals conceded, fouls and cards. No form fudge and no jitter, so a player who did
    nothing gets 6.0 every time — which means a rating can be *explained* rather than merely shown.
  - **The trace is emitted empty on purpose.** It is Step 5's, and an empty trace has to be a legible
    state rather than a hole someone quietly patches, because `dakka-engine-rules` §6 says a thin
    trace means a short debrief and the model does not fill the gap. A test asserts it is empty.
  - **Two gaps measured and filed above as `Step 3·gap`.** Home advantage is **0.006** against a
    required +0.3–0.4 — nothing models the crowd at all, though `attendance`, `isDerby` and
    `HOME_CROWD_LIFT` were all designed for it and left unconnected. And the strength curve needs
    checking against the real league's spread rather than invented extremes.
  - 203 tests green, lint/typecheck/format clean.
  - **Next run: home advantage.** It is the last thing standing between the engine and the Step 4
    harness, and the note on that box says how to build it without reaching for a multiplier.

- **2026-09-13** — **3f: fitness, momentum, cards and substitutions.** The box that makes 3c live.
  - **The structural change.** Both space maps used to be resolved once at kick-off and never again.
    A substitution changed nothing, a sending-off changed nothing, ninety minutes of running changed
    nothing — `InMatchDecision` had been a typed union since Step 1 and **no code read it**. The maps
    are now rebuilt on any discrete event and otherwise every 30 ticks, which is cheap enough for a
    10,000-season harness and still lets fatigue reach the resolver.
  - **Verified by reverting it.** Putting back the resolve-once behaviour fails four tests, including
    one where a sent-off player carries on committing fouls for the rest of the match.
  - **Everything is counted when it happens**, per side, and the rates land on football: **21.9
    fouls** (real ~22), **3.38 yellows** (~3.5), **0.200 reds** (~0.2), **0.204 penalties** (~0.25).
  - **Effort is the resource shape cannot conjure.** A gegenpress / fast / ultra-attacking side ends
    on **70.3** fitness where a contain / slow / ultra-defensive one ends on **89.9**. That is the
    counterweight to 3c's conservation guarantee: no tactic can raise your total presence, but
    running yourself into the ground genuinely lowers it.
  - **Reds were twice the real rate until a real mechanism fixed them.** Rather than shaving the
    constant, a booked player now pulls out of challenges — ordinary football, and it took second
    bookings from 0.42 a match to 0.20 on its own.
  - **A found API flaw, worth recording.** `conditionAfter` was one map keyed by player id. Two
    squads sharing an id — as the fixtures do — let one side's fatigue silently overwrite the
    other's, and it hid the entire intensity model for a full probe run: gegenpress and contain both
    read 84.5. It is per side now, and a test deliberately plays a squad against itself to keep it
    that way. The lesson is the general one: a merge keyed on something not guaranteed unique will
    fail quietly and look like a modelling result.
  - **Momentum is chances and territory, decayed — never goals.** The chain still does not know the
    score, which is what keeps xG impossible to reverse-engineer from a result. It acts as a
    conserved band transfer like every other shape change, so a side pressing for a winner leaves
    space behind and the right opponent can punish it. Conservation is asserted for it too.
  - **Goals a match are 2.85 against the stated 2.5–2.8, and I did not tune to hide it.** Measured
    over 600 matches: goals 2.853 against xG 2.867, a ratio of 0.995, so the calibration identity
    holds. Open play and set pieces are 2.68 — inside the band — and penalties, awarded at the real
    rate, add 0.19. Every component is individually right, so shaving one to slip under the ceiling
    would break something correct. Flagged for the harness under Step 4 with the decomposition.
  - One older test was over-specified and failed once counters and corners could share a route: it
    read "three zones means the possession started in defence". Replaced with the actual invariant,
    that a route never goes backwards through the bands.
  - 181 tests green, lint/typecheck/format clean.
  - **Next run: 3g — assemble `simulate()`.** Read the note on that box: it is assembly, pass stats
    stay unset, and score-driven urgency belongs there because 3g is the first place a score exists.

- **2026-09-13** — **3d·fix: the shot quality distribution.** The box 3e opened, and the one that was
  standing between this engine and Step 4.
  - **The defect.** `shotGeometry` picked distance and angle from per-zone constants plus noise, so
    every shot in football came from a seven-metre band around eighteen metres. The mean was right;
    the spread did not exist. xG is sharply convex in distance, so a distribution like that cannot
    score: **0.5% of shots came from inside 11 m where real football has 30%**, and the engine
    produced 1.15 goals a match.
  - **The fix is a quantity, not a constant.** Reaching the final third is not one event. Most
    attacks that get there produce a half-chance from range and a few are worked right through, so
    `penetration = U^k` is that spectrum — right-skewed because breaking a block down is hard, with
    `k` falling when the attacking side has room in the zone and falling further on a counter.
    Depth comes from penetration, lateral offset from the channel, and **distance and angle are then
    derived rather than chosen**. The angle is the goalmouth genuinely subtended from that spot.
  - **Fitted to published football, then asserted.** `PENETRATION_SKEW = 0.45` and
    `PENETRATION_DEPTH = 0.8` were solved against the real distribution of shot distances, the same
    discipline the xG anchors use: external targets, fitted parameters, tests that pin them.

    | band | engine | real |
    |---|---|---|
    | inside 6 m | 6.5% | 8% |
    | 6–11 m | 24.2% | 22% |
    | 11–16.5 m | 30.4% | 32% |
    | 16.5–22 m | 21.9% | 22% |
    | 22–30 m | 15.8% | 13% |
    | inside the box | **61.0%** | 62% |
    | mean distance | **15.1 m** | 15.1 m |
    | mean xG per shot | **0.115** | ~0.11 |
    | goals per match | **2.63** | 2.5–2.8 |

  - **The real error was conceptual, and worth remembering.** The first attempt still came out at
    0.068 xG per shot. The measurement showed why: only **15% of shots were central**, because the
    code read "the channel the attack progressed down" as "where the shot was struck". A cross from
    the left is finished in the middle. Making the lateral offset peak at the centre for *both*
    channels — the channel widens the spread, it does not move the mode — was most of the remaining
    gap. Players attack the goal, not the corner flag.
  - **The xG curve was not touched.** It is calibrated to published anchors, they are the only
    externally-sourced numbers in the repo, and the fault was never there. Goals (2.63) and xG (2.67)
    per match now agree, which is the check that the displayed number means something.
  - **One test was dropped rather than fitted.** I had asserted that a defence which leaves room
    concedes closer chances. Measured, the opposite holds — 14.8 m against a deep compact block
    versus 15.3 m against a loose high line — which is arguable football, since a low block concedes
    territory but not space. I could not justify either direction from first principles, so pinning
    one would have been encoding a guess as a test. It is the **second** signal pointing at the
    attacking-vs-deep-block pairing (3d's log flagged the shot counts), and Step 4 should look there.
  - 155 tests green, lint/typecheck/format clean.
  - **Next run: 3f — fitness, momentum, cards and substitutions over 90 minutes.** Note that
    `fitnessFactor()` is already inside `tacticalPresence`, so 3f updates `PlayerCondition` between
    ticks rather than retrofitting fatigue into the resolver.

- **2026-09-12** — **3e: xG from shot context.** `packages/engine/src/xg.ts`. A logistic on distance
  and the angle of goal available, solved for three published anchors and checked against two more.
  - **The signature is the guarantee.** `expectedGoals(shot: ShotContext): number` takes the context
    and nothing else. It cannot see the outcome, because `ShotContext` has none and the chain never
    computed one. It cannot see the **shooter** either, and that is the deliberate part: if finishing
    raised a player's xG, then "he scored more than his chances were worth" would be meaningless,
    because the yardstick would move with the man. Finishing enters at `resolveShot`, and the gap
    between goals and xG is precisely what `CLINICAL_FINISHING` and `WASTEFUL_FINISHING` measure.
    Those two causes exist only because this function refuses to look.
  - **Verified by violating it.** Making a good striker's chances "worth more" — the tempting,
    wrong version — fails exactly the two shooter-blindness tests and nothing else.
  - **Calibration.** Six yards central 0.420, penalty spot 0.193, edge of the box 0.060, tight angle
    close in 0.080, thirty yards 0.008, penalty 0.760. Angle is a separate input from distance on
    purpose, and the test proves why: eight metres out by the byline is a **worse** chance than
    fourteen metres out in front of goal.
  - **The counter bonus is deliberately small (+0.15 logit).** The chain already hands counters
    twenty points less pressure, which is most of the benefit; the full effect on top would pay twice
    for the same defensive disarray. That is the commonest way a model silently doubles an advantage.
  - **Goals track xG.** Over 20,000 shots by average players against an average keeper, goals divided
    by xG sits inside 0.9–1.1. If that ever drifts, the xG we display has become decoration.
  - **3e found a defect in 3d, and it is now the next box.** The curve is right; the shots are not.
    Mean xG per shot is **0.047** against football's ~0.11, giving **1.15 goals a match** against the
    blueprint's 2.5–2.8. The cause is measured precisely: shot distances run p10 14.5 m to p90 22.0 m,
    so **0.5% of shots come from inside 11 m where real football has 30%**, and none at all from
    beyond 25 m. The mean distance is correct — the spread is missing. I did **not** lift the curve to
    close the gap, because the anchors are the only externally-sourced numbers in this repo and
    bending them would have hidden the real fault. See the `3d·fix` box for the full table.
  - 142 tests green, lint/typecheck/format clean.
  - **Next run: `3d·fix`.** It is ⚠️ and it blocks Step 4 — the harness cannot pass at 1.15 goals a
    match, and no amount of tuning elsewhere will fix a distribution with no close-range tail.

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
