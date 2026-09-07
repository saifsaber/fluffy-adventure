# ADR-002 — Content format before database schema, and how squads are authored

**Status:** decided · **Date:** 2026-09-07 · **Supersedes:** the ordering inside Step 2 of the worklog

## 1. Content format comes before the Postgres schema

The worklog listed "Postgres schema + migrations" as the first task of Step 2, with seed data after.
That order is backwards, for two reasons:

1. **A schema derived from real content is right; a schema guessed in advance is a migration debt.**
   We do not yet know what an Egyptian lower-league club record actually needs until we have written
   twenty of them.
2. **It unblocks the engine.** With content as files, the engine and the 10,000-season balance
   harness — Steps 3 and 4, and the hardest part of the project — can run against real Egyptian data
   with **no database at all**. Making the gate depend on Postgres would be self-inflicted.

So: content format → real data → engine → harness → *then* Postgres, whose schema is by then a
transcription of a known shape rather than a guess.

## 2. Leagues are data, not code

`packages/content` holds `data/leagues/*.json` and `data/clubs/<country>/*.json`, validated by a Zod
schema, loaded into `@dakka/engine` domain types.

Everything that differs between football cultures is a **field**: round-robin count, automatic and
playoff promotion slots, relegation slots, points for a win. `loadLeague()` contains no knowledge of
any specific country. Adding Vietnam is a league file plus club files, and zero code.

This is the mechanism behind global-strategy §6-8. If a future change wants
`if (country === 'VNM')`, the schema is missing a field — add the field.

## 3. Generated-then-committed squads are authored content, not fabricated data

Twenty clubs at ~20 players with ~24 attributes each is roughly ten thousand numbers. Hand-typing
them is neither feasible nor better: the result would be less internally consistent, not more.

**The decision:** a club's *identity* is authored by hand — real Egyptian geography, coordinates,
stadium, capacity, pitch quality, reputation, playing style. Its *squad* is produced by a
deterministic seeded generator from that identity, and **the output is committed as data** and is
freely hand-editable afterwards.

This is explicitly not the pattern the project exists to be better than. The distinction matters, so
state it precisely:

| | |
|---|---|
| **Fabricated data (banned)** | A statistic describing a match event that never happened — `shots = max(shots, goals + random())`. It is presented to the player as evidence, and it is not. |
| **Authored content (this)** | Fictional players for fictional clubs, generated once at build time, reviewed, committed, and stable. Nobody is told it is a record of anything. |

Three properties keep it honest:

- **Deterministic.** Same seed, same squads — so the output is reviewable in a diff.
- **Committed.** The data file is the source of truth; the generator can be deleted and nothing breaks.
- **Build-time only.** The game never generates a player at runtime.

## 4. Clubs are fictional sides in real geography

Real coordinates, real governorates, real travel distances — invented club names. That is the
authenticity the product is built on and the licensing position from ADR-001 §5 at the same time.
Real travel distance is a genuine lower-league fatigue input, so the coordinates earn their place.
