# ADR-003 — Two locales from the first screen

**Status:** decided · **Date:** 2026-09-17 · **Supersedes:** ADR-001 §2 ("ship one locale")

## The decision

The interface, the cause phrasings and the debrief ship in **two locales from the first screen**:
`ar-EG` (Egyptian colloquial) and `en`. Neither is a translation of the other.

**The content does not change.** The Egyptian fourth division remains the only league, and the
expansion order in global-strategy §6 stands.

## Why ADR-001 was half right

ADR-001 said: *"i18n structure costs nothing on day 1 and everything on day 200 — so we build for it
and ship one locale."* The first clause is correct and is why this change is cheap. The second clause
is the part that does not survive contact with how software actually rots.

**A single locale lets hardcoded strings hide.** Structure that is never exercised is structure you
believe you have. You discover the forty strings baked into components on the day you add the second
locale — which, under the old plan, is the day the whole UI already exists. Two locales is not
double the work; it is the only way to know the first one was built correctly.

The cost of this is near zero **today**, because not one screen has been written yet. It rises with
every box of Steps 6–12. This is the last cheap moment.

## The distinction that makes this coherent

**Interface language is not content locale.** Global-strategy §6 warns against one specific move:

> "**Wrong:** add the Premier League. That puts us against Football Manager, OSM and 38-0 on their
> turf, with worse licensing and no differentiation."

That warning is about *content* — which clubs, which league, which market we compete in. It is
untouched. An English interface over the Egyptian fourth division is a different thing entirely: it
lets someone in Jakarta or São Paulo read the argument the engine makes, while the recognition moat
(§1, "you have driven past that stadium") keeps doing its work for the Egyptian career.

It also serves the plan we already had. Global-strategy §3 says the daily challenge and the share
card *are* the global product. Both are unreadable outside Egypt in an Arabic-only build.

## Consequences

1. **`Locale` is a closed union** — `'ar-EG' | 'en'` — and cause phrasings are
   `Record<CauseTag, Record<Locale, Phrasing>>`, so an unregistered cause **or an unlocalised one** is
   a build error. Same guard the engine already uses for `CauseTag` and `Position`.
2. **English is written, not translated.** `dakka-arabic-voice` governs `ar-EG`; English gets the
   same rules in its own register — a blunt assistant coach, football vernacular, no MSA-equivalent
   stiffness, no hedging. A debrief translated from Arabic will read like a translation.
3. **The UI is bidirectional from the same code**, not two layouts. `DESIGN.md`'s logical-properties
   rule was already doing this work; the Arabic typography rules stay and become conditional on
   locale rather than global.
4. **A test fails on any user-facing string that is not in a locale file.** Without a mechanical
   guard this decision decays back into English-with-an-Arabic-file within a month. Structure nobody
   checks is structure nobody has.
5. Adding a third locale stays a lookup table, which was the point of the four invariants in
   global-strategy §8 and remains true.

## What this does not license

Adding a second **league**. Data is the blocker for every market (§7), we have exactly one dataset,
and a second one is not cheap. Two locales over one league is the decision; two leagues is not.
