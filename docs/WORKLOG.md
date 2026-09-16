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
six hours (`21 */6 * * *`). `.github/workflows/heartbeat.yml` watches it from outside and fails the
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

- [ ] **⚠️ Four dials still have a dominated setting: `tempo`, `width`, `compactness`, and the
      remainder of `lineHeight` and `mentality`.** `pnpm dominance -- --dial=all --pairs=8
      --seeds=60` is the measurement, about four minutes.

      Current state: `lineHeight` 3 (all of them `deep`), `mentality` 1 (`ultra_defensive` beaten by
      `attacking` — this one *regressed* when `EXPOSURE_SCALE` rose, so check it is not a small-sample
      artefact before chasing it), `pressingIntensity` 1 (`gegenpress` beaten by `contain`), `tempo`
      2 (`slow` and `balanced` beaten by `fast`), `width` 3 (`narrow` beats everything),
      `compactness` 3 (`tight` beats everything).

      **What the line-height fix suggests as a method.** Look for the dial's *risk* term and ask
      whether it is priced against its reward in the same units. `width` and `compactness` are the
      obvious next candidates: `narrow` and `tight` concede something real — the flanks and the space
      between the lines — and if those dials are ladders, the conceding side of each is probably as
      underpriced as `exposure` was. Measure the two sides like for like before changing anything;
      the figure that first made line height look ten times out of balance was comparing a three-zone
      sum against a single scalar, and the real ratio was 1.95.

      Keep `pnpm dominance` open beside `pnpm harness`: the seven thresholds and the matrix have to
      come good together, and the xG correlation has **no margin** — it sits at 0.900–0.904 against a
      floor of 0.9, so measure it at 300 seasons before believing any verdict about it.

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

**Next box is the remaining ⚠️ dominance work above.** Line height is fixed; four dials still have a
setting no context makes worth choosing. Read that box first: it carries the method that worked
(price a dial's risk against its reward, in the same units), two fixes that failed with the numbers
that killed them, and the warning that the xG correlation has no margin at all.

The runner now exists to check any such fix: change one thing, keep the seed, and the difference is
attributable and comes with its own error bars. Note what it costs, though — a 0.1-point effect needs
200–750 paired runs, so budget the simulations rather than trusting a small study.

Still open after that: the four decision causes in `trace.ts` can now be emitted honestly, because
the runner can prove what a substitution was worth. That was the whole reason they were deferred.

One habit this branch has now paid for three times over: **measure before deciding, and verify every
guard by making it fail.** Three separate pieces of work were reverted after measurement said they
did nothing, and the one that finally worked was found by a profile after two rounds of confident
guessing. A test that passes when you sabotage the thing it guards is not a test.

The engine (Step 3) is decomposed deliberately. Two rules for it:

1. **One box per run.** The boxes are sized so a single run can finish, test and push one.
2. **A ⚠️ box you cannot do well should be pushed as a blocker, not as a plausible-looking
   implementation.** The failure mode that would kill this product is an engine that passes its
   tests while modelling nothing — because then the decision trace explains a simulation that is not
   real, and a confident wrong explanation is worse than no explanation. The 10,000-season harness in
   Step 4 exists to catch exactly that, but it is much cheaper to not write it in the first place.

## Log

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
