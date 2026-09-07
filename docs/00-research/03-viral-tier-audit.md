# The Viral Tier — 38-0 and the games that actually reach people

Added after review feedback. This tier was missing from the first pass, and it changes the plan.

Tags as before: **OBSERVED** (read in the shipped bundle / live site / store listing),
**CLAIMED** (the product's own marketing claim, not independently verified), **INFERRED**, **UNKNOWN**.

---

## 1. Two different products share the name "38-0"

| | **38-0.app** — the original | **38-0.io** — a clone |
|---|---|---|
| Stack | Next.js on Vercel, **Supabase auth**, Sentry | plain Vite SPA, 44 KB bundle |
| Backend | **28 API routes**, server-authoritative | none — all client-side |
| Apps | **iOS + Android shipped** | browser only |
| Languages | EN | EN / PT / ES |
| Positioning | a product | **explicitly SEO bait** — its own copy says it targets "fans searching for terms like premier league 38-0, epl 38-0" |

There is also a clone swarm around them: `38-0-game.com`, `38-0-football.com`, `82-0-challenge.com`.
**That is the tell: the concept has no technical moat and gets cloned within weeks.** The moat is brand,
distribution and live-ops — not code.

## 2. What 38-0 is

A **draft game**, not a management game. The whole session is ~2 minutes:

```
pick a formation → spin a wheel → it lands on a real club+season (e.g. Arsenal 2003)
  → draft ONE player from that squad into an open position
  → repeat × 11 → "simulate" a 38-game season → chase a perfect 38-0-0
  → get a shareable result card → dare your mates to beat it
```

**Scale — CLAIMED by the product:** 10,877,438 seasons simulated · 5.4 M+ players ·
46 M+ impressions on X · "all without a penny of marketing".
**Content — OBSERVED:** 51 English top-flight clubs, 18,000+ player seasons, 1992–2027.

**iOS listing — OBSERVED:** *38-0: Football Draft*, seller **Robert Novakov** (a solo developer),
free, **no ads, no in-app purchases**, 4+, v1.1.5, released 26 June, updated 27 August, **5.0★ from 466 ratings**.

## 3. Its "simulation" is a formula — and 38-0.io's is fully readable

The clone ships its scoring in the client. Reproduced from the bundle:

```
attack/midfield/defense = mean(player.overall × positionFit) per line
chemistry               = min(99, 45 + maxSameClubCount×7 + filledSlots×2)

x = mean(all)×0.43 + weakestLine×0.22 + chemistry×0.13 + exactFitRatio×10
    + meanHistoricSeasonPoints×0.08 + bonus
    − (strongestLine − weakestLine)×0.28          // imbalance penalty
    − outOfPositionCount×1.25

Q      = (charCodeHash(squad) % 3) − 1            // deterministic, NOT random
wins   = clamp(12, 37, round(x − 57) + Q)
losses = clamp(0, 16, round((88 − x + outOfPosPenalty) / 5))
draws  = 38 − wins − losses
```

**There is no simulation and no randomness.** It is a weighted rating formula with a
deterministic hash as jitter. A perfect 38-0 is gated behind a hard threshold
(all 11 exact positions, weakest line ≥ 88, chemistry ≥ 86, mean ≥ 89).

**INFERRED:** 38-0.app's engine is server-side and not in the client bundle, so its exact model is
**UNKNOWN** — but the product makes no claim to a real match simulation either.

**The honest read:** this is not a worse simulation than Modareb's. It is a *different genre* that
never pretends to simulate. Modareb's failure is claiming analytics it does not compute; 38-0's
formula is transparent about being a score. And because it is deterministic, results are
comparable and arguable — which is exactly why it spreads.

## 4. The retention stack — this is the part worth stealing

From the API surface and store listing, all **OBSERVED**:

| Mechanic | How it works | Why it works |
|---|---|---|
| **Daily Challenge** (`/api/daily/progress`) | one fresh puzzle a day, **streak tracked** | manufactures a daily habit |
| **Last One Standing** (`/api/los/*`) | one event a day, a **cut line that moves as the round plays**; "do nothing and you are out" | elimination pressure — the strongest daily-return mechanic here; has rest days, hall of fame, notification prefs |
| **Ranked multiplayer** (`/api/mp/ranked/standing`, `/history`) | persistent ladder | long-arc competition |
| **Private leagues** (`/api/my-leagues`) | play with your own group | social graph = retention |
| **Nations Trophy** | limited-time event | urgency |
| **One-Club XI / Hard Mode** (ratings hidden) | constraint modes | replayability from the same content |
| **January transfer window** | change your XI mid-season | a second decision point per run |
| **Manager selection** | changes seasonal style | a light tactical lever |
| **European Nights** | knockout after a strong finish | a reward arc |
| **Home-screen widgets** | league position, deadlines | re-entry without opening the app |
| **Push** (`/api/push/*`) | event and deadline alerts | re-entry |
| **Share card** | image with record, MVP, Best Pick, **Weak Link** | the "Weak Link" line is the argument that gets screenshotted |

Plus accounts, achievements, leaderboards, GDPR consent/delete, analytics, feedback, broadcast.

## 5. The wider tier: daily football puzzle games

| Product | What | Relevance |
|---|---|---|
| **Koordle** (`koordle.com`) | **Arabic** daily player-guessing game. 8 attempts, colour-coded clues, 10 leagues **including the Egyptian league**, free-play + daily challenge, easy/hard, friend challenges, EN/AR | **the Arabic-market proof point** — the daily-habit format already works in Arabic. Monetised by ad slots only; no visible accounts, streaks or leaderboards → **a thin, beatable incumbent** |
| **Sportsdle / Sportdle / WordleCup** | daily player Wordles across leagues + World Cup 2026 modes, Immaculate Grid puzzles | the format is commoditised in English |
| **FIFA "Who Am I"** (play.fifa.com) | official guess-the-player, **has Arabic** | a licensed incumbent in the casual slot |

## 6. What this changes about our plan

**The gap this exposes:** the original blueprint optimised for *depth and correctness* and contained
**no distribution mechanic at all** — no share loop, no daily loop, no social layer. 38-0 is the
counter-example: a solo developer reached a claimed 5.4 M players with a 2-minute game and no
marketing budget, while Modareb's far deeper game has no viral surface beyond a Facebook link.

**But the correct response is not to build a draft game.** 38-0 has scale and no revenue
(no ads, no IAP — **its business model is UNKNOWN and possibly absent**), and its concept is being
cloned faster than it can defend. Modareb has depth and no scale.

**The synthesis — and it falls out of a decision already made.** The engine is *deterministic given a
seed*. That was required for counterfactual replay. The same property pays off twice more:

1. **A fair daily challenge.** Same fixture, same seed, same squad, same opponent — everyone in the
   world faces *identical* conditions, and the only variable is the quality of your decisions.
   38-0 cannot do this with real depth because it has no simulation. Modareb cannot do it at all
   because its engine is random, so two players' runs are never comparable.
2. **Honest PvP.** The server resolves once; both managers see the identical match.
3. **A share artifact that is an argument, not a score.** 38-0's most-screenshotted line is
   "Weak Link" — because it is contestable. Our decision trace is *made of* contestable claims:
   *"you lost this at minute 63: high line vs their pace."* That is inherently shareable, and
   the counterfactual is the reply: *"here's what would have happened if I'd made the sub."*

**Determinism was one architectural decision. It now buys counterfactuals, a fair daily
challenge, honest PvP, and a native share loop.** That is the strongest argument for the
engine-first build order, not a weaker one.

## 7. Revised competitive positioning

Three tiers, three different failures:

| Tier | Example | Has | Lacks |
|---|---|---|---|
| **Deep managers** | Modareb, FM Mobile, OSM | depth, session length | virality, honest analytics (Modareb), reach |
| **Viral drafts** | 38-0 | reach, share loop, live-ops | depth, revenue, defensibility |
| **Daily puzzles** | Koordle, Sportsdle | habit, low cost | any decision-making at all |

**Nobody occupies the middle: a game with real decisions that is also share-native.**
That is the position, and determinism is the bridge to it.

## 8. New UNKNOWNs

- 38-0's revenue model — **UNKNOWN** (no ads, no IAP on iOS as of v1.1.5)
- 38-0's server-side engine — **UNKNOWN** (not in the client bundle)
- Whether the 5.4 M / 46 M figures are independently verifiable — **CLAIMED, not verified**
- 38-0's retention curve past the novelty window — **UNKNOWN**
- Koordle's traffic, ownership and revenue — **UNKNOWN**
