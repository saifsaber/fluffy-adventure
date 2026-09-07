# Competitive Landscape & Matrix

Sources: hands-on audit of Modareb; published 2026 comparative review of Android football-manager
games (unstore.io); Niko Partners MENA-3 market data; search of the AI-football-assistant space.
Competitor detail below is **INFERRED from published reviews**, not hands-on, except Modareb.

## Direct competitors

| Product | Developer | Match engine | Tactics | Monetisation | Documented weakness |
|---|---|---|---|---|---|
| **Modareb** | indie (EG) | weighted random + flat multipliers; **stats back-filled** | 19 formations, mentality, pressing | AdMob banner/interstitial/rewarded + premium flag | no cloud save, no AI, PvP disabled, fabricated analytics |
| **Football Manager 26 Mobile** | Sports Interactive (Netflix) | advanced, responds to instructions, player roles | deep | Netflix subscription only | paywalled behind Netflix; no standalone purchase |
| **Online Soccer Manager (OSM)** | Gamebasics | "shallow next to Football Manager" | "built for accessibility rather than depth" | free + Boss Coins + ads | shallow engine; most features need a connection |
| **Top Eleven** | Nordeus | moderate, head-to-head focused | moderate | free + Tokens + ads | "freemium pressure is heavy, time-gated progression"; always online |
| **Soccer Manager 2026** | Invincibles Studio | moderate, single-player tuned | moderate–deep | free + IAP + ads | "interface and match presentation feel dated" |
| **Hattrick** | Hattrick (since 1997) | moderate, human-vs-human | moderate | free + cosmetic Supporter sub | dated UI, steep curve, real-world weekly pace, online only |
| **Soccer Club Management 2026** | Go Play Games | light, 3D highlights | moderate | free + IAP | engine lighter than rivals; leans on IAP |
| **Underworld Football Manager** | Jokko Games | shallow | shallow | free + IAP | "gimmick wears thin", "monetization is pushy" |

## The viral tier (added on review — see `03-viral-tier-audit.md`)

These are not management games, but they are what football fans actually play and share in 2026,
and they compete for exactly the same attention.

| Product | What | Scale | Monetisation | Weakness |
|---|---|---|---|---|
| **38-0.app** | 2-minute draft game: spin a wheel, draft an XI across eras, "simulate" 38 games, chase 38-0-0 | **CLAIMED** 5.4 M players, 46 M X impressions, 10.9 M seasons, zero marketing; iOS 5.0★/466 | **none** — no ads, no IAP | no real simulation; concept cloned within weeks; **no revenue model** |
| **38-0.io** | client-side clone, explicitly SEO-targeted, EN/PT/ES | UNKNOWN | UNKNOWN | ships its scoring formula in the browser; no backend |
| **Koordle** | **Arabic** daily player-guessing game, 10 leagues incl. **the Egyptian league**, friend challenges | UNKNOWN | ad slots only | no accounts, streaks or leaderboards visible — thin and beatable |
| **Sportsdle / Sportdle / WordleCup / FIFA "Who Am I"** | daily football Wordles, World Cup 2026 modes | large, commoditised | ads / official | zero decision-making |

**What 38-0 proves:** a solo developer reached millions with a 2-minute game and no marketing, while
Modareb's far deeper game has no viral surface beyond a Facebook link. Reach in this category comes
from a share loop and a daily loop — both far cheaper to build than a causal engine.

**What 38-0 does not prove:** that it is a business. It has no ads and no IAP.

## Adjacent: the AI-football space (2026)

| Product | What it is | Why it matters to us |
|---|---|---|
| **FIFA + Lenovo "Football AI Pro"** | enterprise AI assistant querying FIFA match data for all 48 WC-2026 teams | proves the *AI-explains-football* interaction is real and desirable |
| **FM Assistant / AssMan.AI / FootballGPT** | LLM companions that read your FM screens and advise | **all are bolt-ons to someone else's game** — none own the simulation |
| **AgentPitch** | research simulator where each player is an LLM agent generating decision code | direction-of-travel signal; a research prototype, not a product |

**The gap:** the AI products don't own a simulation; the games that own a simulation have no AI.
**Nobody has shipped an AI-native football management game where the model is inside the loop and the
simulation is decision-driven.** That is the opening.

## Data availability finding

The `openfootball/awesome-football` collection is **Eurocentric — it contains no Egyptian or African
league datasets**, and per-dataset commercial licensing varies. So an authentic Egyptian dataset
must be built, not downloaded. That is a cost, and also a moat.

## Market context

- MENA-3 (KSA/UAE/Egypt) games market: ~$1.8 B (2022) → **~$2.8 B by 2026**, ~10 % CAGR.
- Players: 67.4 M → **87.3 M by 2026**.
- **Egypt has the largest gaming population and is the fastest-growing market** in MENA-3.
- 76 % of MENA-3 gamers are under 35; Egypt skews even younger.

## The matrix — feature by feature, and how we beat it

Legend: ● strong · ◐ partial · ○ absent

| Feature | Modareb | OSM | Top Eleven | FM26 Mobile | **Ours** |
|---|:--:|:--:|:--:|:--:|---|
| Arabic-first, RTL | ● | ◐ | ◐ | ○ | ● native, Egyptian dialect throughout |
| Authentic Egyptian lower leagues | ● | ○ | ○ | ○ | ● deeper: geography, travel, pitch quality, local economy |
| Offline play | ● | ○ | ○ | ◐ | ● engine runs locally, syncs to cloud |
| Cloud save | ○ | ● | ● | ◐ | ● server-authoritative, career never lost |
| Causal match engine | ○ | ○ | ◐ | ● | ● possession-chain state machine; **every stat derived** |
| Honest analytics | ○ fabricated | ◐ | ◐ | ● | ● xG from shot context; nothing back-filled |
| Tactics that read the opponent | ○ scalars | ○ | ◐ | ● | ● matchup-resolved per zone and phase |
| Explains *why* you lost | ○ | ○ | ○ | ◐ | ● **decision trace → AI debrief in Egyptian Arabic** |
| Counterfactual replay | ○ | ○ | ○ | ○ | ● **"لو كنت غيّرت القرار ده"** — nobody has this |
| Opponent managers that adapt to you | ○ | ○ | ◐ | ◐ | ● persona + season-long pattern reading |
| Natural-language press / dressing room | ○ | ○ | ○ | ◐ canned | ● generated text, **typed mechanical effects** |
| Real PvP | ○ disabled | ● | ● | ○ | ● deterministic seeded server resolution |
| Player depth | ○ 4 attrs | ◐ | ◐ | ● | ● roles, traits, personality, relationships |
| Licensing safety | ○ risk | ● | ◐ | ● | ● own dataset + fictionalised elite until licensed |
| Monetisation pressure | ads-first | heavy | "heavy, time-gated" | subscription | low-pressure; no pay-to-win |
| Share loop | ○ | ○ | ◐ | ○ | ● decision trace + counterfactual as the share artifact |
| Daily habit loop | ○ | ◐ login streak | ◐ | ○ | ● seeded daily challenge, identical conditions for everyone |
| Social / private leagues | ○ | ● | ● | ○ | ● V2: private leagues + ranked ladder |

## Positioning

Three tiers, three different failures:

| Tier | Example | Has | Lacks |
|---|---|---|---|
| **Deep managers** | Modareb, FM26 Mobile, OSM | depth, session length | virality, honest analytics (Modareb), reach |
| **Viral drafts** | 38-0 | reach, share loop, live-ops | depth, revenue, defensibility |
| **Daily puzzles** | Koordle, Sportsdle | habit, low cost | any decision-making at all |

**Nobody occupies the middle: a game with real decisions that is also share-native.**

The bridge is a property we already committed to for other reasons — the engine is **deterministic
given a seed**. That single decision buys four things no competitor can copy without rebuilding
their engine:

1. **Counterfactual replay** — re-run the match with one decision changed.
2. **A genuinely fair daily challenge** — same fixture, same seed, same squad, same opponent for
   everyone on earth; the only variable is the quality of your decisions. 38-0 can't do this with
   real depth (no simulation); Modareb can't do it at all (random engine ⇒ runs aren't comparable).
3. **Honest PvP** — the server resolves once, both managers see the identical match.
4. **A share artifact that is an argument, not a score** — 38-0's most-screenshotted line is
   "Weak Link" because it is *contestable*. Our decision trace is made of contestable claims,
   and the counterfactual is the reply.

> Every one of these games decides the result and then shows you numbers.
> Ours derives the numbers from the result's causes — then tells you, in your own dialect,
> which of your decisions caused them, and lets you argue about it in public.

**One-line pitch:** *Modareb lets you watch a match. 38-0 lets you share a score.
This makes you responsible for a decision — and gives you something worth arguing about.*
