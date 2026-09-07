# ADR-001 — Starting scale, and every open decision, closed

**Status:** decided · **Date:** 2026-09-07

The first blueprint ended with eight open questions. That was the wrong output: a product team
decides and recommends, and escalates only what genuinely belongs to the owner. All eight are
closed below. Only #6 is a business call, and it has a default we proceed on unless overridden.

---

## Part 1 — The scale we start at

Three different questions hide inside "scale". Here is each, with a number.

### A. Content scale — what ships

| | MVP (week 6) | V1 (month 3) |
|---|---|---|
| Divisions | **1** (Egyptian 4th tier) | **4** (4th → Premier) |
| Clubs | **20** | **~80** |
| Players | **~500** (25/club) | **~2,000** |
| Attributes per player | **~20** + roles + traits | same |
| Rounds | **38** (double round-robin) | 38 + national cup |
| Seasons | **1**, ending in a season review | multi-season career with promotion/relegation |
| Matches simulated per season | 380 (you play 38) | ~1,500 |

Not 6,409 players. The competitor's 6,409 players sit behind a 4-attribute model — breadth
covering for depth. 500 players modelled properly is the harder and more defensible thing, and
breadth is cheap to add later.

### B. User scale — what we build for

**10,000 daily active / 50,000 monthly active in year one.**

Grounded in: Egypt is the largest and fastest-growing games market in MENA-3 ($2.8 B by 2026,
87 M players); a competitor in the viral tier reached a claimed 5.4 M with a two-minute game and no
marketing; a deep Arabic manager game with a daily loop reaching 10k DAU is ambitious but not fantasy.

This is the number that sizes the infrastructure. It is a planning figure, not a forecast.

### C. Infrastructure scale — what that actually costs

**Because the engine is a pure client-side package, users are nearly free. Only AI scales with them.**

| Load at 10,000 DAU | Where it runs | Cost |
|---|---|---|
| 10,000 matches/day | **the client** | **zero server CPU** |
| Daily-challenge submissions | server, ~0.12 req/sec | trivial |
| Career saves + sync | Postgres, ~500 KB/career → **~25 GB at 50k MAU** | one instance |
| PvP resolution (V2) | server, same engine package | small |
| **AI debriefs** | Anthropic API | **the only variable cost** |

**The AI number, computed rather than guessed** (Claude Haiku 4.5 at $1.00/1M input, $5.00/1M output):

```
one debrief ≈ 3,000 input tokens + 800 output tokens (Arabic is token-heavy)
            ≈ $0.003 + $0.004  =  ~$0.007

10,000 DAU × 30% request a debrief × $0.007  =  ~$21/day  ≈  $630/month
                                              ≈  $0.06 per active user per month
```

Controls that hold it under the **$0.05/user/month hard cap**: prompt caching on the static prefix
(rules, tone, club context), debriefs on demand rather than automatic, and a free-tier rate limit.

**The decisive conclusion: at 10k DAU this runs on one small Postgres and one small API instance.
Infrastructure is tens of dollars a month. The entire variable cost is AI, and it is capped at
$0.05 per active user.** Any ARPU above ~$0.10/month is safely profitable.

---

## Part 2 — The eight decisions

| # | Decision | **Call** | Why |
|---|---|---|---|
| 1 | Name | **Build under `dakka`.** Commercial name is a launch-week decision. | It blocks nothing. Deciding it now is procrastination wearing a hat. |
| 2 | Arabic-only vs bilingual | **Arabic-first (Egyptian), i18n-structured from day 1.** | The moat is the Egyptian setting; English adds cost with no early users. But i18n structure costs nothing on day 1 and everything on day 200 — so we build for it and ship one locale. |
| 3 | PWA vs native | **PWA-first; Capacitor wrapper at week 6.** | No store-review latency during iteration, and Capacitor reaches both stores without a rewrite. Both the deep competitor and the viral one already prove this path. |
| 4 | Supabase vs custom backend | **Supabase for auth + Postgres + RLS + storage; our own Fastify service for engine and AI endpoints.** | Auth and RLS are undifferentiated work. The most successful comparable product in this space runs exactly this shape. |
| 5 | Own data vs licence | **Own dataset; elite non-Egyptian clubs and players fictionalised until licensed.** | Not really a choice: no open Egyptian football data exists, and the incumbent's unlicensed real names are a live legal exposure we will not inherit. |
| 6 | Monetisation | **MVP free, no ads. At V1, one premium unlock; the fence is unlimited AI debriefs + advanced analytics. No ads, no pay-to-win.** | AI is our only variable cost, so it is the natural fence. Ads are what make the incumbent feel cheap. Pay-to-win destroys a game whose entire premise is that *your decisions* determined the result. **This is the one call that is genuinely the owner's — we proceed on this default unless overridden.** |
| 7 | Match the incumbent's breadth in V1 | **No. Depth-first through V1.** | Breadth is where they already win and where we can catch up cheaply. Depth is where they cannot follow. |
| 8 | LLM budget | **Claude Haiku 4.5 · $0.05 per active user per month, hard cap · debriefs on demand · prompt caching required and verified via `cache_read_input_tokens`.** | Math above. |

---

## Part 3 — What this does not change

**Week 1 is untouched.** None of the eight decisions affect the foundation, the schema, or the
engine. The only thing that was ever blocking was a go-ahead.
