# Modareb Audit — «أنت المدرب / Anta El Modareb»

**Target:** https://modareb.ai.studio/
**Method:** static bundle analysis + headless Chromium playthrough of a locally mirrored copy of the
publicly served client bundle (the app runs fully offline, so a real career could be started and played).
**Date:** 2026-09-07

Every claim below is tagged **OBSERVED** (seen in the running app or read in the shipped bundle) or
**INFERRED** (reasoned from evidence). Anything unknowable is marked **UNKNOWN** — nothing is invented.

---

## 1. What the product is

**OBSERVED.** An Arabic-language football **management career game**, Egypt-flavoured. Meta description:

> «لعبة تدريب وإدارة كرة قدم مصرية تحاكي قيادة نادي في الدرجة الرابعة للصعود وتحقيق البطولات وبناء مسيرة تدريبية أسطورية.»

You start as an unknown manager at **نادي نجم ميت عقبة** in the **Egyptian 4th division**, and climb.

## 2. Technical shape

| Fact | Evidence | Tag |
|---|---|---|
| Vite + React + TypeScript + Tailwind SPA | `index.html`, single `assets/index-*.js` | OBSERVED |
| Bundle: **2.68 MB** JS + 184 KB CSS, one chunk, no code splitting | `curl` sizes | OBSERVED |
| RTL Arabic, fonts Cairo + Tajawal | `<html dir="rtl">`, Google Fonts link | OBSERVED |
| Capacitor → packaged as a native mobile app | `capacitorjs.com`, `Mc.isNativePlatform()` | OBSERVED |
| Firebase / Firestore present; collections referenced: `users`, `matches` | 92 `firestore` + 47 `firebase` refs | OBSERVED |
| Google AdMob: banner + **interstitial** + **rewarded video**; an `isPremium` flag and `Subscription` strings exist | 61 `Interstitial`, 45 `Rewarded`, 24 `isPremium` | OBSERVED |
| **Entire game state lives in `localStorage`** | 31 `anta_el_modareb_save_v1_*` keys | OBSERVED |
| Save size ≈ **1.2 MB**: `teams` 416 KB, `activeLeague` 366 KB, `worldRankings` 351 KB, `fixtures` 100 KB | measured in-browser | OBSERVED |
| **Zero LLM integration.** No Gemini, OpenAI, Anthropic, no `generativelanguage`, no cloud-function call | exhaustive case-insensitive grep | OBSERVED |
| **181 `Math.random()` call sites** | grep count | OBSERVED |
| Firebase project id contains `ai-studio-antaelmodareb` → built with Google AI Studio | localStorage key | OBSERVED |

> The product is hosted on an `.ai.studio` domain and ships **no AI**. The single feature labelled
> «الذكاء الاصطناعي» is a rules-based auto-substitution of tired/injured players.

## 3. Information architecture (complete)

**OBSERVED.** Bottom tab bar, six items:

| Tab | Arabic | Contents |
|---|---|---|
| Dashboard | الرئيسية | day advance, training intensity, next fixture, board+fan confidence, standings position, squad readiness, manager level/licence, budget+stadium, FIFA-style world ranking, star player, tactics summary, news feed |
| Tactics | التكتيك | **19 formations**, XI + 7-man bench + reserves, approach & instructions, captain & set pieces |
| Matches | المباريات | fixture list, **scouting report (100,000 ج.م)**, manager-vs-manager comparison, squad-strength breakdown by line, win/draw/loss probabilities |
| Squad | التشكيلة | 20/25 players, sortable, per-player rating/fitness/salary/market value/**personal savings**, collective bonus payout |
| League | الدوري | 20-club table, 44 rounds, top 2 promoted, national cup, CAF CL, UEFA CL, manager ranking, scorers, assists |
| More | المزيد | World Ranking · **Online PvP («قريباً» — disabled)** · Transfers · Training · Club · Career · Inbox |

Sub-screens: transfer market (**6,409 players**, filters, rumours, negotiations, sell-your-players),
training centre (4 session types + intensity + per-player specialisation), club (finances, stadium,
facilities, sponsors), career (XP, level, reputation, **coaching licences CAF-D → up**, courses,
achievements, job offers), inbox, world rankings (manager + club, regional filters, real managers
Guardiola/Ancelotti/Alonso at the top).

## 4. The core loop as built

```
advance day → set training intensity → (optional) scout opponent
   → match day → play live or quick-sim
   → result → board/fan confidence shifts → news generated
   → next round … × 44 → season end → job offers → next season
```

**OBSERVED.** In-match controls actually exist and are decent: pause, speed, skip-to-end, change
formation, mentality (5 levels: دفاع حديدي → هجوم كاسح), pressing intensity (4 incl. gegenpress),
auto-sub toggle, 5 manual subs, live possession/xG/momentum, commentary feed, live stats,
2D pitch view, rotating LED sponsor board.

## 5. How the match engine really works — the central finding

**OBSERVED**, read from the shipped code:

- Team strength is aggregated (attack / midfield / defence / GK / bench), then per-minute rolls decide events.
- Tactical choices are applied as **flat hard-coded multipliers**, e.g.
  `ultra_attacking → att×1.16, def×0.82` · `attacking → ×1.08/×0.92` · `defensive → ×0.9/×1.14` ·
  `counter_attack → ×1.14` · `park_the_bus / catenaccio → def×1.24, att×0.78` ·
  `gegenpress → ×1.11` · `low block → ×1.08/×0.93`.
- Shot conversion once a chance fires:
  `p = clamp(0.60, 0.88, 0.76 + (attacker − keeper) × 0.003)` then `Math.random() < p`.
- **Match statistics are fabricated after the fact:**
  `homeShots = max(homeShots, homeScore + floor(random×4 + 2))`,
  `homeCorners = max(homeCorners, floor(random×5 + 1))`, shots-on-target `= max(…, score + 1)`.

### Why this matters
The score is produced first; the "analytics" are then back-filled to look plausible.
So the stats screen, the xG figure and the shot counts **are not evidence of anything that happened**.
And because tactics are context-free scalars, the honest description of a decision is
"nudge a global multiplier", not "exploit a weakness". This is the exact failure mode of
*random simulation wearing the costume of a game*.

## 6. Strengths — real ones, worth respecting

1. **Authentic Egyptian lower-league identity.** ميت عقبة، مغاغة، سنورس، طموه، إسنا، قليوب، منوف،
   بلبيس، بيلا، دسوق، أهلي الغرق، القناطر، سمسطا، ميت غمر، الفاقوس — plus real local stadiums and
   Egyptian street nicknames (الأخطبوط، الصاروخ، كابوريا، البلدوزر). **No global competitor has this.**
2. **Genuine breadth**: 6,409 players, 19 formations, cup + CAF + UEFA, world rankings, licence
   progression, board objectives, youth, facilities, negotiations, a generated newspaper.
3. **Offline-first**: fully playable with no network — matters enormously on Egyptian mobile data.
4. **Local economic texture**: player *personal savings* (رصيده), collective bonuses, and moving money
   between transfer budget and wage ceiling. That is Egyptian club reality, not a Football Manager import.
5. **Solid RTL mobile UI** with real information density.

## 7. Weaknesses — evidence-backed

| # | Weakness | Evidence | Severity |
|---|---|---|---|
| 1 | Match outcome is weighted randomness; tactics are context-free multipliers | engine code | **critical** |
| 2 | Statistics fabricated post-hoc, not derived | `max(shots, goals + rand)` | **critical** |
| 3 | No AI whatsoever, on an `.ai.studio` domain | zero LLM refs | high |
| 4 | "2D tactical simulation" is static position labels — no ball, no movement | live match DOM | high |
| 5 | No cloud save. ~1.2 MB in `localStorage`; clearing site data destroys the career | storage dump | **critical** |
| 6 | Online PvP shipped disabled («قريباً»); social layer is a Facebook link | More menu | high |
| 7 | Player model is 4 attributes + overall — no roles, traits, personality, relationships | player cards | high |
| 8 | Template commentary repeats verbatim within minutes | live feed, 3'/7' identical | medium |
| 9 | Untranslated i18n keys leak to users: `match_tips_title`, `scout_cost_label` | matches screen | medium |
| 10 | Unlicensed real players & clubs (Mbappé, Real Madrid, Guardiola) | transfer market | legal |
| 11 | Onboarding is name + age + nationality only — no club, difficulty or philosophy choice | first run | medium |
| 12 | 2.68 MB single bundle, no splitting | build output | medium |
| 13 | Ads-first monetisation (banner + interstitial + rewarded) on a thin retention loop | AdMob refs | medium |

## 8. Explicit UNKNOWNs

- Install base, DAU/MAU, retention, revenue — **UNKNOWN**
- Whether a server-side game backend exists beyond Firestore `users`/`matches` — **UNKNOWN** (PvP is off)
- App-store presence and ratings — **UNKNOWN** (Capacitor is present; store listing not verified)
- Team size, funding, roadmap — **UNKNOWN**
- Whether any data is licensed — **UNKNOWN** (no attribution shipped)

## 9. Entity model reconstructed (Phase 2)

`Manager` (name, age, nationality, level, XP, reputation, licence, world rank, ranking points)
· `Club` (name, division, budget, wage ceiling, stadium capacity, facilities, sponsors, board, fans)
· `Player` (overall, potential, 4 attributes, position, age, nationality, fitness, morale, form, salary,
market value, contract years, **personal savings**, season stats, nickname)
· `League` (20 clubs, 44 rounds, promotion slots) · `Fixture` · `Match` (score, events, stats)
· `CupTournament` (rounds, prize money, development points) · `TransferMarket` / `Negotiation` / `Bid`
· `BoardSystem` (objective, board confidence, fan mood, sack risk) · `Inbox` · `News` · `JobOffer`
· `WorldRankings` (managers + clubs) · `Season` · `TrainingSession` · `Facility` · `Licence` / `Course`

State changes are driven almost entirely by the day-advance tick and the match resolution.
