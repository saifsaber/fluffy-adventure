# @dakka/content

Leagues, clubs and players as **data files**, plus the schema that validates them and the loader
that turns them into `@dakka/engine` domain objects.

## The contract

> **Adding a country is a data change. It must never require a code change.**

That is not tidiness — it is what makes global expansion a rollout instead of a rewrite, and what
makes community-contributed leagues possible later. See `docs/01-product/05-global-strategy.md` §6-8.

If you find yourself adding an `if (country === 'VNM')` anywhere, the schema is wrong: the thing you
are special-casing belongs in the data file as a field.

## Layout

```
data/
  leagues/<league-slug>.json     competition shape, promotion and relegation, member clubs
  clubs/<country>/<slug>.json    one club, its stadium, its geography, and its squad
```

## Why this package does the I/O

`@dakka/engine` is pure — it reads no files. This package reads and validates, then hands typed
domain objects over. The boundary is deliberate: it is what lets the engine run unchanged in a
browser, on the server, and inside the balance harness.

## Content is authored, not fabricated

The "never fabricate data" invariant is about **statistics describing events that did not happen** —
a shots count assigned rather than counted. Authored game content is a different thing entirely.
Clubs here are fictional sides placed in real Egyptian geography, which is both the authenticity we
are after and the licensing position from `docs/decisions/ADR-001`.
