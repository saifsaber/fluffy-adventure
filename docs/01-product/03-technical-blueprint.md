# Technical Blueprint (working codename: **دكة / Dakka**)

> *Dakka* = the dugout — where a coach actually makes decisions. Name is a proposal, pending approval.

## 1. Product thesis

Every competitor decides the result first and then presents numbers. We invert it:
**the result is the consequence of a causal chain, and every number shown is derived from that chain.**
That single architectural commitment is what makes the differentiating features possible at all.

**Core loop**

```
Read the situation (dashboard tells you what needs a decision)
  → Make a decision (tactics, selection, training, transfer, in-match change)
  → Engine resolves it causally, emitting a DECISION TRACE
  → You see derived evidence (xG from shot context, not back-filled counts)
  → AI assistant debriefs you in Egyptian Arabic, strictly from the trace
  → Counterfactual: re-run with one decision changed, see the delta
  → Opponents adapt to your patterns → the next decision is harder
```

## 2. The AI / not-AI split — the rule

**AI never decides an outcome. AI explains, converses, and generates. Code decides.**

| Deterministic code (testable, seeded) | LLM |
|---|---|
| match engine, possession chains, xG, ratings | post-match debrief **from the trace** |
| fitness, morale, form, injury risk | pre-match opponent briefing from scouting data |
| standings, fixtures, promotion, cups | press conference & dressing-room dialogue |
| economy, wages, transfer valuation, negotiation logic | commentary variety, grounded in real events |
| board confidence, sack risk, objectives | assistant-coach Q&A over *your* save's data |
| rankings, XP, licences, progression | career story/scenario generation |
| auth, persistence, PvP resolution | — |

If a screen shows a number, a pure function produced it. If a screen shows prose, a model wrote it —
about numbers it was given, never numbers it invented. **No LLM output is ever parsed into a game
number except through a typed, validated effect schema the engine applies.**

## 3. The match engine (`@dakka/engine`)

A **pure TypeScript package**: no I/O, no dates, no globals, seeded PRNG. Runs identically in the
browser (offline play) and on the server (PvP, verification). This is the keystone of the whole system.

**Model:** a possession-chain state machine, not a per-minute dice roll.

```
KICKOFF → BUILD_UP → PROGRESSION → FINAL_THIRD → SHOT → {GOAL, SAVE, BLOCK, MISS} → TRANSITION
                 ↘ TURNOVER ↗
```

Each transition probability is computed from a **matchup**, not a global scalar:
- the two teams' current shapes (line height, width, compactness) → space available per zone
- the specific players contesting that zone (not team averages) + their fatigue
- role fit, familiarity, and set-piece/situation context
- game state (score, minute, momentum, red cards)

`xG` is then computed from **shot context** — distance, angle, pressure, assist type, body part.
Shots, corners, possession are **counted as they occur**. Nothing is back-filled. Ever.

**Determinism is a feature, not an implementation detail.** Same seed + same decisions ⇒ same match.
That is what enables: reproducible bug reports, the balance harness, honest PvP, and counterfactuals.

**Decision trace.** The engine emits a structured `MatchTrace`: the 5–8 moments where win probability
swung most, each with a machine-readable cause (`{cause: "high_line_vs_pace", minute: 63, delta_wp: -0.14, actors: [...]}`).
The trace is the *only* input the debrief model gets about what happened.

**Counterfactual runner.** Re-run the same seeded match with exactly one decision changed, N times,
and report the shift in the outcome distribution. This is the feature no competitor has.

## 4. Architecture

```
┌─ Client (React 19 + TS + Vite + Tailwind, RTL-first) ─────────────┐
│  PWA + Capacitor (iOS/Android)                                    │
│  Zustand (game state) · TanStack Query (server state)             │
│  @dakka/engine runs LOCALLY → offline play stays a feature        │
│  IndexedDB write-queue → syncs when online                        │
└────────────────────────┬──────────────────────────────────────────┘
                         │ HTTPS
┌────────────────────────▼──────────────────────────────────────────┐
│ API (Fastify + TS)  ·  Auth + RLS (Supabase)                      │
│  /career /match /trace /counterfactual /ai/* /pvp                 │
│  @dakka/engine (same package) = server-authoritative resolution    │
├───────────────────────────────────────────────────────────────────┤
│ AI service (server-side ONLY — API keys never reach the client)   │
│  Claude via Anthropic API · structured outputs / tool use         │
│  prompt caching for static rules+club context                     │
│  Haiku for high-volume commentary · larger model for debriefs     │
├───────────────────────────────────────────────────────────────────┤
│ Postgres (Supabase) · Redis (queues, PvP pairing) · object storage │
└───────────────────────────────────────────────────────────────────┘
```

Background jobs: season rollover, world rankings recompute, PvP resolution, AI pre-generation.

## 5. Database — first principles

Normalised Postgres, **not a JSON blob**. Modareb's 1.2 MB `localStorage` career is the anti-pattern
we are explicitly correcting: it cannot be queried, shared, leaderboarded, or recovered.

Core tables:
`users` · `managers` · `careers` · `seasons` · `competitions` · `competition_entries` · `clubs` ·
`club_finances` · `facilities` · `players` · `player_attributes` · `player_traits` · `contracts` ·
`squads` · `tactics` · `fixtures` · `matches` · `match_events` · **`match_traces`** · **`decisions`** ·
`transfers` · `negotiations` · `board_objectives` · `board_state` · `staff` · `youth_intakes` ·
`news_items` · `inbox_messages` · `achievements` · `licences` · `ai_conversations` · `pvp_matches` ·
`audit_log`

**`decisions` and `match_traces` are first-class tables, not logs.** They are what explainability,
counterfactuals and the coaching-improvement arc are built on. Every match stores its seed, so any
match in history can be re-simulated or re-explained.

Indexes on `(career_id, season_id)`, `(match_id, minute)`, `(career_id, created_at desc)`.
Historical data is append-only; player attribute history is versioned so progression is inspectable.

## 6. Frontend & UI direction

RTL-native (not a mirrored LTR layout). Arabic type set for real reading, not decoration.
The identity should be **touchline, not SaaS**: the manager's notebook, the team sheet, the
floodlit pitch. Explicitly avoid the generic dark-slate + neon-emerald dashboard look
(which is what Modareb already is).

**The dashboard answers five questions in under three seconds:**
1. What needs my decision *today*? (the only section that can hold a call to action)
2. What changed since I last played?
3. Am I on track against the board's objective?
4. What is my biggest current risk?
5. What does my assistant think I should do — and why?

No card exists to fill space. Every tile either states a fact that changes, or requests a decision.

## 7. MVP — the smallest thing that is a real product

**One league. One season. The full loop, working end to end, with real persistence.**

In: auth + cloud save · one Egyptian 4th-division league (20 clubs, ~500 real-shaped players) ·
squad & tactics (formation, mentality, pressing, tempo, width, roles) · the causal engine ·
live matchday with in-match decisions · derived stats & xG · decision trace · AI debrief in Egyptian
Arabic · counterfactual replay for one decision · board objectives · season end · the dashboard.

Out of MVP: 6,409-player transfer market · PvP · youth academy · world rankings · licences · cups ·
monetisation · multi-nation leagues.

Rationale: breadth is where Modareb already wins and where it is cheap to catch up later.
Depth of the core loop is where it cannot follow us, and it must be right before anything is built on it.

## 8. Versions

- **MVP** — the loop above, provably football-shaped.
- **V1** — transfers + negotiation, training & development, youth, board/press, full season structure, cup, monetisation.
- **V2** — PvP (deterministic server resolution), leagues/divisions pyramid, manager career moves, social & clubs, advanced analytics.
- **Future** — user-generated leagues, real data licensing, community tournaments, coaching-education crossover.

## 9. Risks

| Risk | Mitigation |
|---|---|
| **Engine balance is the hardest problem** | the 10,000-season harness is a merge gate before any UI exists |
| LLM cost per user per match | Haiku for volume, caching, debrief on demand not automatic, hard per-career budget |
| Egyptian-dialect quality | a held-out eval set of real coach language; native review before shipping |
| Licensing of real players/clubs | own dataset + fictionalised elite until properly licensed — never Modareb's exposure |
| Scope creep vs Modareb's breadth | depth-first is the strategy; breadth is scheduled, not opportunistic |
| Offline↔cloud sync conflicts | server is authoritative; client writes are a replayable queue with seeds |

## 10. Open decisions (need the product owner)

1. Product name (`دكة` is a proposal).
2. Arabic-first vs bilingual from day one.
3. PWA-first vs native-first.
4. Supabase vs fully custom backend.
5. Build our own Egyptian dataset vs licence.
6. Monetisation model — it changes core design, so it should be decided before V1.
7. Keep Modareb's breadth in V1, or stay depth-only for longer.
8. LLM budget per active user per month.
