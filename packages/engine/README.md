# @dakka/engine

The causal match simulation. **Pure TypeScript: no I/O, no clock, no globals, no unseeded
randomness.** It runs byte-identically in a browser and on a Node server, which is what makes
offline play, server-authoritative PvP, the seeded daily challenge, and counterfactual replay
share one codebase.

Read `.claude/skills/dakka-engine-rules/SKILL.md` before changing anything here.

## The three that get a PR rejected

1. A statistic that is assigned rather than counted as the event occurs.
2. Anything impure — `Math.random()`, `Date.now()`, a network call, a filesystem read.
3. A tactic applied as a global scalar instead of resolved through a matchup.

`test/purity.test.ts` enforces (2) mechanically. The other two are on review.
