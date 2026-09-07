# Build Plan, Skills & Agent Team

## A. Skills inventory (Phase 0.1 / 0.2)

Rule applied: **nothing installed without a job.** The environment already carries a strong toolchain —
the honest answer is that almost nothing needs installing, and pretending otherwise would be theatre.

| Skill / Tool | Why we need it | Source | Status |
|---|---|---|---|
| `claude-api` | LLM integration: model choice, structured outputs, tool use, prompt caching, cost control | built-in skill | ✅ available |
| `artifact-design` / `artifact-diagramming` | design-quality gate for docs & the blueprint deliverable | built-in skill | ✅ used for this deliverable |
| `dataviz` | the analytics & dashboard surfaces — the heart of the product | built-in skill | ✅ available |
| `web-artifacts-builder` | rapid React/Tailwind/shadcn prototypes for UX validation | built-in skill | ✅ available |
| `code-review` / `security-review` / `simplify` | quality gates before merge | built-in skills | ✅ available |
| `skill-creator` | to author the two project-specific skills below | built-in skill | ✅ available |
| `mcp-builder` | only if we expose the engine as an MCP tool for internal agents | built-in skill | ✅ available, not yet needed |
| `doc-coauthoring` | specs and decision records | built-in skill | ✅ available |
| Figma MCP · Magic Patterns MCP · v0 MCP | design system & UI generation options — **evaluate one, do not adopt three** | MCP servers | ⚠️ evaluate |
| GitHub MCP | PRs, CI, review workflow | MCP server | ✅ available |
| Playwright + Chromium | E2E testing (already proven — it ran this entire audit) | preinstalled | ✅ verified working |
| **`dakka-engine-rules`** (new) | the engine's invariants so no agent silently reintroduces fabricated stats | to author | ⬜ pending approval |
| **`dakka-arabic-voice`** (new) | Egyptian-dialect tone, football vernacular, forbidden phrasings | to author | ⬜ pending approval |

**Open source evaluated, and the verdict:**

| Candidate | Verdict |
|---|---|
| `openfootball/awesome-football` | **Reject as primary.** 248★, but Eurocentric — **no Egyptian or African leagues**, per-dataset licences vary. Useless for our core setting. |
| `ZOXEXIVO/open-football` (Rust FM-like engine) | **Reject.** Rust; we need the engine to run in-browser *and* on our Node server from one codebase. Worth reading for design ideas only. |
| Poisson/xG simulators (`match-outcome-simulation`, `Soccer-xG-Simulator`) | **Reject as engine.** They predict scorelines from pre-existing xG. We need the opposite: generate xG from causes. Useful as *validation baselines* in the harness. |
| `seedrandom` / `pure-rand` | **Adopt.** Small, mature, deterministic PRNG — exactly the one dependency the engine needs. |

Building our own engine is not reinventing the wheel; no existing wheel produces a decision trace,
and that is the entire product.

## B. Agent team (Phase 0.3 / 0.4)

Seven agents, not fourteen. Each earns its place or it isn't built.

| Agent | Mission | Owns | Must NOT do |
|---|---|---|---|
| **Engine** | the causal simulation & its math | `@dakka/engine`, xG model, matchup resolution, trace emission | touch UI; add any I/O to the engine package; ever back-fill a statistic |
| **Balance QA** | prove the game is football-shaped | the 10k-season harness, drift reports, the merge gate | change engine code to make its own tests pass |
| **AI Systems** | everything the model says | prompts, effect schemas, trace→language contract, cost & latency, dialect evals | let model output become a game number outside a validated effect schema |
| **Data** | the Egyptian football dataset | schema, migrations, seed data, licensing safety | ship any unlicensed real-player data |
| **Backend** | API, auth, persistence, PvP | Fastify service, Postgres, RLS, jobs | put game rules in the API layer — rules live in the engine |
| **Frontend** | the product people touch | RTL design system, screens, dashboard, matchday | invent numbers the API doesn't return |
| **Code Review** | quality gate | reviews every PR before merge | approve its own work |

**Flow (not a straight line — the harness is a loop, and it gates):**

```
Data ──▶ Engine ──▶ Balance QA ──┐
                       ▲          │ fails → back to Engine
                       └──────────┘
                                  │ passes
        Backend ◀── Engine ───────┴──▶ AI Systems
             └──────▶ Frontend ◀───────┘
                          │
                    Code Review ──▶ merge
```

**Shared source of truth (Phase 0.5)** — `/docs`, versioned in git, and no agent may contradict it
without an ADR: the audit, the matrix, the technical blueprint, the schema, API contracts, the
engine invariants, the AI effect schemas, coding standards, and `docs/decisions/` (ADRs).

## C. The exact build plan

### Week 1 — the engine and its proof. Nothing else.

| Step | What | Done means |
|---|---|---|
| **1** | Monorepo (pnpm workspaces), TS strict, CI, CLAUDE.md, the `/docs` source of truth, agent definitions | `pnpm test` green on an empty repo; docs committed |
| **2** | Domain model + Postgres schema + migrations; seed the Egyptian 4th division — 20 clubs, ~500 players, real fixture list | `pnpm db:seed` produces a queryable season |
| **3** | `@dakka/engine` v0 — seeded PRNG, possession-chain state machine, shot/xG-from-context model, fitness, the tactical matchup matrix | pure package, zero I/O, 90 %+ unit coverage on the state machine |
| **4** | **The balance harness** — simulate 10,000 seasons headlessly | goals/game ≈ 2.5–2.8 · home advantage ≈ +0.3–0.4 goals · xG↔goals correlation r > 0.9 · realistic points spread · stronger side wins ~55–65 %, never ~100 % · **every tactical option has a measurable, context-dependent effect** |
| **5** | Decision-trace emission + the counterfactual runner | a match returns 5–8 causally-tagged swing moments; changing one decision measurably shifts the outcome distribution |
| **6** | The thinnest possible UI: pick tactics → play the match → derived stats → the trace → run one counterfactual | a human can play one match and see what their decision changed |

**Step 4 is a gate, not a task.** If the numbers aren't football-shaped, we do not proceed to UI.
This is the mechanism that prevents us from shipping the exact thing we criticised.

**End of week 1, you can:** play one real match, change one decision, re-run it, and see precisely
what that decision changed — with every number derived, none invented, and no AI involved yet.

### Weeks 2–5

- **Week 2** — AI layer: trace→debrief in Egyptian Arabic, opponent briefing, dialect eval set, cost controls. Real dashboard.
- **Week 3** — season loop: board objectives, confidence, sack risk, season end; cloud save + offline sync; auth.
- **Week 4** — squad depth (roles, traits, personality), training & development, adaptive opponent managers.
- **Week 5** — polish, RTL design system consolidation, E2E tests, performance, MVP release candidate.

### Why this order

The engine is the only component everything else depends on and the only one that cannot be
retrofitted. Its correctness is also the entire competitive claim. UI built on a bad engine is
wasted work; UI built on a proven one is straightforward. AI comes second because the debrief is
worthless until there is a real trace to explain — generating explanations for a dice roll would
make us exactly what we are trying to beat.
