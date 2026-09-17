# DESIGN.md — Dakka

> **دكة — a manager's notebook under floodlights.** Warm ruled paper where the thinking happens, a
> dark ground where the match does, and one green so muted it could only be grass. Numbers are set
> like a team sheet: monospaced, aligned, and every one of them answerable.

Attach this before writing any UI. Bound each task to **one screen or one component family**, build
against these rules, then check the result back against them. Broad instructions like "improve the
UI" are what produce generic output; this file exists to remove that freedom.

Direction comes from `docs/01-product/03-technical-blueprint.md` §6. Anything here that contradicts
the blueprint, the blueprint wins.

---

## 1. Principles

1. **Touchline, not SaaS.** The manager's notebook, the team sheet, the floodlit pitch. If a screen
   would look at home in a B2B analytics product, it is wrong.
2. **Paper to decide, floodlight to watch.** Reading, choosing and reviewing happen on warm paper.
   Only the live matchday screen goes dark. This is not a theme toggle — it is where you are.
3. **Every number is answerable.** The product's whole claim is that a figure can be traced to a
   cause. A statistic that cannot be opened is a statistic we should not be showing.
4. **No tile exists to fill space.** Every element either states a fact that changes or asks for a
   decision.
5. **Arabic first, and set for reading.** RTL is the native direction, not a mirrored afterthought.

---

## 2. Colour

Paper — every surface except live matchday.

| Token          | Value     | Use                                        |
| -------------- | --------- | ------------------------------------------ |
| `paper`        | `#F4F0E8` | canvas                                     |
| `paper-raised` | `#FBF8F2` | cards, sheets lying on the canvas          |
| `rule`         | `#DCD3C1` | hairlines, table rules, dividers           |
| `ink`          | `#191512` | primary text                               |
| `ink-soft`     | `#574F45` | secondary text                             |
| `ink-faint`    | `#8A8175` | labels and captions — **never below 14px** |

Floodlight — live matchday only.

| Token          | Value     | Use                     |
| -------------- | --------- | ----------------------- |
| `night`        | `#0D1210` | canvas                  |
| `night-raised` | `#151D18` | cards                   |
| `night-rule`   | `#24302A` | hairlines               |
| `lit`          | `#F2EFE6` | primary text on night   |
| `lit-soft`     | `#A8AFA6` | secondary text on night |

Pitch — the one structural accent.

| Token        | Value     | Use                                                  |
| ------------ | --------- | ---------------------------------------------------- |
| `pitch`      | `#2F6B43` | accent on paper: active state, your own side         |
| `pitch-lit`  | `#4E9A63` | the same accent on night surfaces, for contrast only |
| `pitch-wash` | `#E3EBE2` | tint fill behind your own side's rows                |

Signal — earned, never decorative.

| Token       | Value     | Use                                                        |
| ----------- | --------- | ---------------------------------------------------------- |
| `attention` | `#B96C1E` | **only** "this needs your decision today". One per screen. |
| `caution`   | `#8A6D1F` | yellow card, fitness warning, board confidence falling     |
| `danger`    | `#9E2F26` | red card, sack risk, relegation                            |

**Rules.** `attention` is the scarcest thing in the system: if two elements claim it, one of them is
lying about its urgency. Chromatic colour never carries meaning on its own — a card also gets a
shape, a deficit also gets a sign. Contrast: 4.5:1 for body, 3:1 for large text and UI edges.

---

## 3. Typography

**One family.** `IBM Plex Sans Arabic` (OFL) for everything, `IBM Plex Mono` for figures and Latin
technical terms. One family, two roles — no font soup, and Plex Arabic is deliberately not the Cairo
default that every Arabic app already looks like.

```css
--font-ui: 'IBM Plex Sans Arabic', system-ui, sans-serif;
--font-num: 'IBM Plex Mono', ui-monospace, monospace;
```

| Role    | Size | Line height | Weight | Notes                                   |
| ------- | ---- | ----------- | ------ | --------------------------------------- |
| display | 34   | 1.25        | 600    | screen titles, the scoreline            |
| h1      | 26   | 1.35        | 600    |                                         |
| h2      | 20   | 1.40        | 600    |                                         |
| body    | 16   | **1.70**    | 400    | Arabic needs the leading; do not reduce |
| small   | 14   | 1.60        | 400    |                                         |
| label   | 12   | 1.40        | 600    | `ink-faint`, never uppercase            |
| stat    | 30   | 1.10        | 500    | `--font-num`, tabular                   |

**Arabic rules — these are the ones usually got wrong.**

- **Never `text-transform: uppercase`.** Arabic has no case, so it does nothing to Arabic and mangles
  mixed strings. Hierarchy comes from size and weight only.
- **Never `letter-spacing` on Arabic.** It breaks the joins between letters. Latin-only runs may use
  it; Arabic runs may not.
- **Latin inside Arabic must be isolated**, or `4-3-3` and `2-1` reorder on screen:
  ```css
  .tech {
    direction: ltr;
    unicode-bidi: isolate;
    font-family: var(--font-num);
  }
  ```
  Apply to `xG`, `CDM`, `4-3-3`, `PvP`, scorelines, minutes, percentages.
- **Digits are Latin** (`63`, `2-1`, `78%`), per `dakka-arabic-voice` rule 2. Never Arabic-Indic, never
  spelled out in words.
- **`font-variant-numeric: tabular-nums`** on every number that changes or is compared to another.

---

## 4. Spacing, radius, elevation

Base 4px. Scale: `4 8 12 16 24 32 48 64`. Card padding 20. Section gap 40. Screen gutter 16, rising
to 24 at ≥768px.

Radius is small on purpose — print, not product. `3px` buttons and inputs, `8px` cards, **`0` on
table rows and team-sheet rows**. The only pill in the system is the match-minute chip.

**No shadows.** Separation comes from the `rule` hairline and from `paper-raised` against `paper`.
A drop shadow is the fastest way to look like the dashboard we are not.

---

## 5. Components

**Team-sheet row.** Zero radius, one hairline below, no card. Shirt number in `--font-num` on the
leading edge, name in body, position as a `label`. Your own side's rows take `pitch-wash`.

**Stat.** Number in `stat`, label beneath. **Every stat is a button** that opens its cause — that
affordance is the product. A stat with nothing behind it does not ship.

**Decision card.** The only component permitted `attention`. States what is being asked and what it
costs. One per screen, at the top, and it disappears once answered.

**Trace moment.** Minute in `--font-num`, the cause in Egyptian Arabic from the phrasing table, and
the win-probability change as a signed number (`+0.14`). Never a bare adjective — the number is the
evidence and the phrase is the reading of it.

**Match clock.** `--font-num`, `lit`, top of the matchday screen. The one element allowed to move on
its own.

---

## 6. Layout

`dir="rtl"` on `<html>`. **Logical properties only** — `margin-inline-start`, `padding-inline-end`,
`inset-inline`. A single `margin-left` in this codebase is a bug, because it will be on the wrong
side in the language the product ships in.

Mobile first, 400px baseline, single column. At ≥768px the dashboard may go two columns; nothing else
needs to.

The dashboard answers five questions, in this order (blueprint §6): what needs my decision today ·
what changed since I last played · am I on track against the board · what is my biggest risk · what
does my assistant think, and why.

---

## 7. Motion

120ms for state changes, 200ms for entry, `ease-out`. Matchday events appear in sequence as the clock
reaches them — that is the one place where timing carries meaning. No spring, no parallax, no
skeleton shimmer. Honour `prefers-reduced-motion` by dropping to opacity alone.

---

## 8. Accessibility

Contrast 4.5:1 body, 3:1 large and UI. Touch targets 44px. Focus is always visible: 2px `ink`
outline, 2px offset — never removed. Colour never carries meaning alone. Every stat button has an
accessible name that says what it opens, not "more".

---

## 9. Never

- **Never dark-slate with neon-emerald.** That is Modareb. Being mistaken for it is the one
  unrecoverable outcome, and it is what most football dashboards drift into by default.
- **Never show a number whose cause cannot be reached.** If the engine did not produce it, the screen
  does not claim it.
- **Never a skeleton loader shaped like content.** A grey bar pretending to be a statistic is the
  visual form of a fabricated one. Show what has loaded and name what has not.
- **Never a chart with invented, smoothed, or placeholder data.** No sparkline without a series.
- **Never `uppercase` or `letter-spacing` on Arabic.**
- **Never a physical-direction property** (`margin-left`, `right:`, `text-align: left`).
- **Never a pill-shaped button**, never glassmorphism, blur, or a neon glow.
- **Never a gradient**, except the single floodlight vignette on the matchday canvas.
- **Never a card that exists to fill the grid.**
- **Never Arabic-Indic digits, and never a number spelled out in words.**
- **Never MSA in the interface.** UI copy follows `dakka-arabic-voice` like everything else the player
  reads.
