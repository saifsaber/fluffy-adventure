# Going global — and the contradiction we have to solve first

## 1. The contradiction, stated honestly

The previous document concluded that Modareb works because of **recognition**: you know ميت عقبة,
you have driven past that stadium, the nicknames are the ones your friends use. Ownership is created
before any mechanic runs.

**But recognition is local by definition.** A Brazilian player does not recognise مغاغة. The exact
mechanism that wins Egypt is the mechanism that cannot cross a border.

So "keep the Egyptian moat" and "go global" appear to be opposites. They are not — but only if we
are precise about *which layer* is local.

## 2. What travels and what does not

| Does not cross borders | Crosses borders untranslated |
|---|---|
| Local club recognition | **Football itself** — 4-3-3, a high line, a counter-attack mean the same thing in Cairo, São Paulo and Jakarta |
| Language-specific humour and vernacular | **The underdog climb** — the *specific* clubs are local, the *shape* of the story is universal |
| Local economic texture (player savings, late wages) | **Arguments about decisions** — universal |
| Arabic prose | **Numbers** — `2-1`, `63'`, `xG 1.4` need no translation |
| | **A diagram** — a pitch with a red arrow at minute 63 is legible everywhere |

## 3. The answer: local content, global mechanism

> **The career is the local product. The mechanism — and the daily challenge built on it — is the
> global product. Same engine, same codebase, two audiences.**

This works because of a decision already made: **the engine emits structured causes, not prose.**

```ts
{ minute: 63, cause: "HIGH_LINE_VS_PACE", deltaWinProb: -0.14, actors: [...] }
```

`cause` is a **closed enum**. Rendering it into any language is a lookup table plus one model pass.
The *evidence* is universal; only the *narration* is localised. That is not a lucky accident — it is
what makes global expansion a translation problem rather than a rebuild.

## 4. Our "38-0": the number that travels

38-0's entire brand is a number. Ours has to be too — and because the engine is deterministic and we
already have a counterfactual runner, we can compute one nobody else can:

> ### **+MGR — «فرق المدرب» — how many points *your decisions* were worth**
>
> Re-simulate the same season, same seed, same squad, same fixtures, with a neutral baseline manager
> making default decisions. The difference in points is **you**, with squad quality factored out.

Why this is the right number:

- **One integer.** `+11` is a headline.
- **Comparable across every player on earth**, regardless of club, league or division — because squad
  strength has been divided out. An Egyptian fourth-division manager and a Brazilian Série D manager
  are on the same axis.
- **It is a pure skill claim.** Not "my club is big", not "my taste in players is good" — *"my
  decisions were worth eleven points."*
- **It is literally the argument football fans already have:** is the manager any good, or is it the
  players? We are the first product that can answer it with a number.
- **No competitor can compute it.** It requires a deterministic engine plus counterfactual
  re-simulation. 38-0 has no simulation; Modareb's is random, so a baseline comparison is noise;
  Football Manager has no shared seed.

**+MGR is to us what 38-0 is to them** — except it is a claim about skill rather than taste, which is
the one kind of claim that does not go stale.

## 5. Two products, one engine

| | **Career mode** | **Daily challenge** |
|---|---|---|
| Audience | local, deep | **global, casual** |
| Content | your Egyptian club, your story | one fixture, one seed, identical for everyone on earth |
| Session | months | ~5 minutes |
| Requires caring about Egyptian football | yes | **no** |
| The claim | "I took ميت عقبة to the Premier League" | "**+7 where you got +2**, same squad, same opponent" |
| Leaderboard | your league | **global** |

The daily challenge is the border crossing. It asks nothing of the player except that they care about
making the right decisions in ninety minutes — which every football fan on earth does.

## 6. Expansion along the underdog axis, not the big-league axis

When we add content beyond Egypt, the obvious move is the wrong one.

**Wrong:** add the Premier League. That puts us against Football Manager, OSM and 38-0 on their turf,
with worse licensing and no differentiation. Our advantage in Egypt — *no competitor exists* — does
not exist in English.

**Right:** add the other football cultures the entire industry ignores, where the "climb from nothing"
story is culturally live and no management game speaks to them:

| Wave | Markets | Why |
|---|---|---|
| 1 | **Egypt** | beachhead; largest and fastest-growing MENA-3 market; zero competition in the niche |
| 2 | Morocco · Algeria · Tunisia · Saudi | same language, same lower-league shape, adjacent communities |
| 3 | Nigeria · Ghana · rest of Africa | football-mad, entirely unserved by management games |
| 4 | Indonesia · Vietnam · Philippines | enormous football audiences, no manager game speaks their leagues |
| 5 | **Brazil Série C / D** · Argentina lower divisions | romantic, massive, and ignored by every simulation |

> **Position: the football manager for the 90 % of football the industry ignores.**

We repeat the Egypt playbook in each market. We never repeat the Football Manager playbook.

## 7. The content engine: community leagues

Data is the blocker for expansion — there is no open dataset for any of these leagues (we established
this for Egypt already). Building each one in-house does not scale.

**Solution:** moderated community-contributed leagues. A Vietnamese player submits the V.League;
we verify and ship it. Hattrick and Football Manager's editor community both prove this works.

This converts the expansion cost from a blocker into a growth loop: **the people who most want their
league in the game are the people who will build it.**

## 8. What must be true from day 1 to keep this option open

None of this is week-1 work. But four things must be *structurally* true from the first commit, or
global becomes a rewrite instead of a rollout:

1. **Causes are a closed enum, never generated prose.** (Already an engine invariant.)
2. **i18n structure from day 1, one locale shipped.** (Already ADR-001 #2.)
3. **Every club and player carries a Latin-script slug** alongside its local name, so a share card is
   legible in any locale.
4. **Content is data, not code.** A league is a seed file. Adding Vietnam must never require a code
   change. This is a schema decision made in Step 2, and it is expensive to retrofit.

Item 4 is new and goes into the Step 2 brief.

## 9. Risks

| Risk | Response |
|---|---|
| **Going global too early kills the depth that makes it good** | Egypt is the beachhead, and it ships alone. A game nobody loves anywhere does not go global — it goes nowhere. |
| English-language competition is brutal | We do not enter it head-on. The daily challenge and +MGR enter it; the career mode does not compete with FM. |
| Data cost per market | Community leagues, moderated. Wave 2 is deliberately Arabic-adjacent, so the cost is low before the loop exists. |
| +MGR is only meaningful if the engine is good | Same gate as everything else: the harness. A skill number computed from a bad simulation is a confident lie. |
| Localising the AI debrief per language is a real cost | The trace is language-independent; only the narration layer is per-locale, and it is one prompt plus an eval set per language, not a rebuild. |

## 10. What changes in the plan

- **Week 1: nothing changes.** The engine already emits enum causes.
- **Step 2 (schema) gains one requirement:** leagues are data, not code — Latin slugs on every entity.
- **+MGR joins the MVP.** It is a counterfactual run we already built the machinery for, and it is
  the share number. Without it the share card has no headline.
- **The daily challenge is promoted** from "distribution layer" to **the global product**, and its
  leaderboard is global from launch rather than a V2 feature.
