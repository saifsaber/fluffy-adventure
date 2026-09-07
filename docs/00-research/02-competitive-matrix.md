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

## Positioning

> Every one of these games decides the result and then shows you numbers.
> Ours derives the numbers from the result's causes — and then tells you, in your own dialect,
> which of your decisions caused them.

**One-line pitch:** *Modareb lets you watch a match. This makes you responsible for it.*
