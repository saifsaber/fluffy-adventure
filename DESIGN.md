# DESIGN.md — Dakka

> **Dakka (دكة) — the matchday programme.** Warm newsprint, black rules, one second ink in red, and
> the pitch printed as a two-colour diagram. The masthead is small and the fixture is huge, because
> that is the way round a programme has it. Numbers are set like a team sheet: monospaced, aligned,
> and every one of them answerable.

Attach this before writing any UI. Bound each task to **one screen or one component family**, build
against these rules, then check the result back against them. Broad instructions like "improve the
UI" are what produce generic output; this file exists to remove that freedom.

Direction comes from `docs/01-product/03-technical-blueprint.md` §6 and from the art-direction
decision in §10. Anything here that contradicts the blueprint, the blueprint wins.

---

## 1. Principles

1. **A printed programme, not a dashboard.** The masthead, the fixture bar, the team sheet, the
   pitch as a diagram. If a screen would look at home in a B2B analytics product, it is wrong.
2. **One surface, two inks.** Everything is printed on the same warm stock — there is no dark mode
   and no second theme. Emphasis is **reversed ink**: a black block with the paper colour knocked
   out of it. That is how a programme shouts, and it costs no new surface.
3. **Every number is answerable.** The product's whole claim is that a figure can be traced to a
   cause. A statistic that cannot be opened is a statistic we should not be showing.
4. **No tile exists to fill space.** Every element either states a fact that changes or asks for a
   decision.
5. **Two locales, one layout.** `ar-EG` and `en` ship together (ADR-003). Direction comes from the
   locale at runtime; there is no RTL build and no LTR build. Arabic is set for real reading, not
   mirrored from a Latin layout.

---

## 2. Colour

**The stock.** Three tones of the same paper. A step along this list is the only depth there is.

| Token       | Value     | Use                                                          |
| ----------- | --------- | ------------------------------------------------------------ |
| `news`      | `#EFE7D6` | the page                                                     |
| `card`      | `#F7F1E4` | a panel lying on the page — the pitch box, a highlighted row |
| `news-deep` | `#E5DBC5` | a recessed field — the score box, an inset                   |

**The first ink.** Black, and the two greys the press can hold.

| Token      | Value     | Use                                                          |
| ---------- | --------- | ------------------------------------------------------------ |
| `ink`      | `#17140F` | text, every rule, every control border, reversed blocks      |
| `ink-soft` | `#4A4235` | secondary text                                               |
| `faint`    | `#6A6252` | labels and captions. **Never on `news-deep`** — see §8       |
| `hair`     | `#C9BDA3` | the light separator between rows. **Never a control border** |

**The second ink.** Red is one ink doing four jobs, and it is legible only because each job also has
a shape:

| Job                 | Form                             | Example                  |
| ------------------- | -------------------------------- | ------------------------ |
| the live clock      | reversed — red block, paper text | `67'`                    |
| the one action      | **solid** red block, paper text  | إبدأ الماتش              |
| the opposition      | outline only                     | their kit, their markers |
| a swing against you | red glyph with a `−` sign        | `-0.13`                  |

**Solid red means act. Outlined red means beware.** That distinction is the whole discipline — a red
fill is a thing you press, a red rule is a thing you watch. Never a red fill on something inert.

| Token | Value     | Use                                |
| ----- | --------- | ---------------------------------- |
| `red` | `#B3261E` | the second ink, as tabulated above |

**The pitch mark and the third ink.**

| Token      | Value     | Use                                                                                 |
| ---------- | --------- | ----------------------------------------------------------------------------------- |
| `green`    | `#1F5134` | your own side — shirt discs, your half of the fixture bar, a swing towards you      |
| `gold`     | `#A8772A` | **fill only**, rare: the keeper, a notable figure. Text on it is `ink`, never paper |
| `gold-lit` | `#E8C36A` | the same ink **on a reversed block only**                                           |

Club kit colours override `green` and `red` on the fixture bar and the pitch once the data carries
them. Until then those two are stand-ins and the screens say so — see §9.

**Rules.** Chromatic colour never carries meaning on its own: a card also gets a shape, a deficit
also gets a sign, the opposition is also on the other side of the bar. Contrast minimums and the
measured figures are in §8; none of them is asserted without a number.

**The surface ladder.** These are all the surfaces there are. Depth is a step along this list — never
a shadow, never a new tone. If a screen seems to need a fifth, it needs fewer layers.

| Level | Surface                 | What lives there                                                          |
| ----- | ----------------------- | ------------------------------------------------------------------------- |
| 0     | `news`                  | the page                                                                  |
| 1     | `card`                  | a panel: the pitch box, the goal in a list                                |
| 2     | `news-deep`             | a recessed field: the score box                                           |
| 3     | **reversed** `ink` fill | the emphasis device: minute chips, the pressure band, the pressed segment |

Level 3 is not a colour, it is an inversion. It may appear several times on a screen — a programme is
full of black bars — but each one must be a _label or a figure_, never a paragraph.

**The one action** is the exception to all of it: a solid `red` block, once per screen, at the bottom.
Two of them and the screen has no priority, only colour.

---

## 3. Typography

**One family, both scripts.** `IBM Plex Sans Arabic` (OFL) covers Arabic _and_ Latin — its Latin is
IBM Plex Sans — so both locales are set in one voice rather than two typefaces pretending to match.
`IBM Plex Mono` for figures and Latin technical terms. Plex Arabic is also deliberately not the Cairo
default that every Arabic app already looks like.

```css
--font-ui: 'IBM Plex Sans Arabic', system-ui, sans-serif;
--font-num: 'IBM Plex Mono', ui-monospace, monospace;
```

| Role      | Size | Line height     | Weight | Family  | Notes                                                      |
| --------- | ---- | --------------- | ------ | ------- | ---------------------------------------------------------- |
| scoreline | 40   | 1.00            | 700    | **num** | the printed score, and nothing else                        |
| h1        | 24   | 1.30            | 700    | ui      | a club name on the fixture bar, a screen's subject         |
| h2        | 19   | 1.35            | 700    | ui      | the masthead, a section that owns a screen                 |
| body      | 16   | **1.70 / 1.55** | 400    | ui      | Arabic / Latin. Arabic needs the leading; do not reduce it |
| small     | 14   | 1.55            | 500    | ui      | list lines, the team sheet, secondary copy                 |
| label     | 12   | 1.40            | 600    | ui      | section heads and captions. `faint` or reversed            |
| figure    | 13   | 1.20            | 700    | **num** | a minute, a delta, a percentage, a shirt number            |

**The scale is closed.** Seven roles, no eighth. Every reference system studied generates its sizes
from a ratio and a base; ours is hand-set and deliberately shorter, so there is no rule to
extrapolate from. If a piece of text fits none of these seven, it is the wrong text, not a missing
size.

**The masthead is small and the score is enormous.** That inversion is the direction's signature and
the fastest way to tell this apart from a dashboard, which always opens with a big page title. `h2`
is the largest thing the product's own name is ever set in. `scoreline` is `--font-num` because a
score is a figure, not a word, and because two of them have to align either side of the dash.

**Where the hierarchy comes from.** The reference systems buy display hierarchy with negative
tracking, −0.02em to −0.04em, tightening as the size grows. That device is closed to us — it breaks
the joins between Arabic letters, so it cannot touch a string that gets localised, which is nearly
every string we have. Size, weight, **rule weight** and reversal carry the whole load instead. That
is also why nothing here opens at the 44–90px those systems use: an untracked 90px line of Plex
Arabic is a wall, not a headline. The one large size we do have is set in Latin figures, where
tracking was never needed.

**Bidirectional rules — these are the ones usually got wrong.**

- **`dir` comes from the locale**, set once on `<html>`. Never hardcode `rtl`, never build a second
  layout, never mirror one design into the other.
- **Never `text-transform: uppercase` on a string that can be Arabic.** Arabic has no case, so it
  does nothing there and mangles mixed strings. Since almost every string in this product is
  localised, treat uppercase as banned outright; hierarchy comes from size and weight.
- **Never `letter-spacing` on Arabic.** It breaks the joins between letters. A Latin-only run — a
  `--font-num` label that is never localised — may use it; anything localised may not.
- **Isolating each run is not enough — an ordered _sequence_ of runs needs its own isolation.**
  `.num` keeps `-0.06` from becoming `0.06-`, but three inline pieces still order right-to-left
  around each other, so `1.42 → 1.48` reads as `1.48 → 1.42` and a scoreline attaches to the wrong
  club. Either wrap the whole expression (`.seq`), or pair each number with its own subject inside
  one element so no direction can separate them. This shipped wrong once: a 1-0 home win rendered
  as 0-1 in Arabic and correctly in English, from the same markup.
- **Never put a number inside a translated sentence.** A substituted `+0.42` renders as `0.42+` in
  Arabic — the sign detaches and lands on the wrong end, turning a swing towards you into one
  against you. The number is its own element; the sentence goes around it.
- **Never put `.num` and a logical padding on the same element.** `.num` sets `direction: ltr`, so
  `padding-inline-end` on that element resolves to its _right_ regardless of the page — the gap
  lands on the wrong side of the column. Padding belongs on the container, isolation on the number.
- **Latin inside Arabic must be isolated**, or `4-3-3` and `2-1` reorder on screen:
  ```css
  .tech {
    direction: ltr;
    unicode-bidi: isolate;
    font-family: var(--font-num);
  }
  ```
  Apply to `xG`, `CDM`, `4-3-3`, `PvP`, scorelines, minutes, percentages.
- **Digits are Latin in both locales** (`63`, `2-1`, `78%`), per `dakka-arabic-voice` rule 2. Never
  Arabic-Indic, never spelled out in words. This is what lets one number component serve both.
- **`font-variant-numeric: tabular-nums`** on every number that changes or is compared to another.

---

## 4. Rules, spacing, radius

**The rule-weight ladder.** A programme is built out of rules, not shadows, and the weight says what
kind of boundary it is. These four are all there are.

| Weight             | Token    | Means                                                 |
| ------------------ | -------- | ----------------------------------------------------- |
| `1px` `hair`       | `--hair` | one row from the next, inside a list                  |
| `1.5px` `ink`      | `--rule` | a control's edge — a segmented bar, a field           |
| `2px` `ink`        | `--rule` | one region of the page from the next; a boxed diagram |
| `3px double` `ink` | `--rule` | the masthead, and nothing else                        |

A boundary that is not one of these four does not exist. In particular there is no light-grey
_region_ rule: regions are separated by black, lists by hair, and the difference is the point.

**Spacing.** Base 4px. Scale: `4 8 12 16 24 32 48 64`. Screen gutter 14, rising to 24 at ≥768px.
Panel padding 12–16 — a programme is set tight; it is not a settings page. Section gap 24.

**Radius is zero.** A printed page has no rounded corners. The exceptions are the two solid ink
marks where a small radius reads as ink spread rather than as a UI affordance: the kit swatch (`2px`)
and the player disc (`3px`). Buttons, panels, fields, rows, chips and bands are all `0`.

**No shadows, and no elevation at all.** Separation comes from a rule and a step on the surface
ladder. The previous system allowed one shadow for a floating modal; the programme does not — a
bottom sheet arrives on `card` above a `2px` ink rule, which is how a page insert would be printed.

**Texture.** One, and only the one: a halftone screen at ~1% black on a 3px grid across the page.
It is paper tooth, not decoration; it must never be perceptible as dots at normal reading distance,
and it never appears on a reversed block.

**What earns a panel.** A panel is a boundary around something that can be opened or acted on as a
unit. Unrelated facts sharing an edge are not a panel, they are a rectangle. Prefer a `label` head
with a `1px ink` underline — the section head in §5 — and reach for level 1 only when the thing
inside is a target.

---

## 5. Components

**Masthead.** The product name at `h2`, the competition at `label`, the round in a `figure` inside a
`1px ink` box, all on one baseline, closed by the `3px double` rule. Appears once, at the top, and is
the smallest type on the screen that is not a caption.

**Fixture bar.** The object the whole product hangs off. Two clubs facing each other across a
`news-deep` score box, each with its kit swatch on its own outer edge, the club at `h1` and its
governorate at `label`. Before kickoff the box holds the date and time; during and after, the
`scoreline`. Closed top and bottom by `2px ink`. **Each club's name and its number live in one
element** — that is the bidi rule in §3 made structural, and it is why the scoreline cannot detach
from the wrong side.

**Match clock.** A full-width reversed **red** strip under the fixture bar, `figure`, centred,
letter-spaced (Latin-only, so tracking is allowed). The one element permitted to change on its own.

**Pitch diagram.** Ink lines on `card`, inside a `2px ink` box. Your eleven are `green` discs with
the shirt number in `news` and the name at `label` beneath. **The opposition is drawn as presence,
never as identity** — outlined `red` diamonds and, where the trace supports it, one outlined-red
annotation stamp naming where the threat is. The game does not scout individuals, and the diagram
must not imply that it does.

**Team-sheet row.** Zero radius, one `hair` below, no panel. Shirt number in `figure` on the leading
edge, name at `small`, position at `label`. Your own side's rows take `card`.

**Section head.** `label`, ink, with an optional `faint` note pushed to the far edge, closed by a
`1px ink` underline. This is the default way to introduce anything; it replaces most of what would
otherwise become a panel.

**Segmented control.** One `1.5px ink` box divided by `hair`. The pressed segment is **reversed**.
Minimum 42px tall, and every segment carries a word — never an icon alone.

**Trace moment.** A reversed minute chip in `figure`, the cause in Egyptian Arabic from the phrasing
table at `small`, and the win-probability change as a signed `figure`, `green` towards you and `red`
against. Separated by `hair`; the goal takes `card`, full-bleed to the gutter, and a `green` chip.
Never a bare adjective — the number is the evidence and the phrase is the reading of it.

**Pressure band.** A reversed strip carrying one `label` and one `gold-lit` `figure`. For a
continuously changing quantity that has a cause behind it. At most one per screen.

**Stat.** Figure in `scoreline` or `figure` depending on whether it is the subject, label beneath.
**Every stat is a button** that opens its cause — that affordance is the product. A stat with
nothing behind it does not ship.

**The action.** A solid `red` block, full width, bottom of the screen, a verb at `h2` in `news`. One
per screen. It is the only solid red in the product.

---

## 6. Layout

`dir` on `<html>`, from the active locale. **Logical properties only** — `margin-inline-start`,
`padding-inline-end`, `inset-inline`. A single `margin-left` in this codebase is a bug: it is correct
in one of the two locales we ship and wrong in the other, and it will be found by a user rather than
by us. This rule is what makes one layout serve both directions, so it is not negotiable.

Mobile first, **390px baseline**, single column. At ≥768px the dashboard may go two columns; nothing
else needs to. **Measure caps at 640px for prose and 960px for the shell.** The reference systems run
to 1200–1440px, but those are marketing pages; a line of Arabic that long loses the reader between
the end of one line and the start of the next.

A screen is a stack of full-bleed regions separated by `2px ink`, with the gutter applied _inside_
each region rather than around it. Rules that stop short of the edge look like a web page; rules that
run to the trim look like print.

The dashboard answers five questions, in this order (blueprint §6): what needs my decision today ·
what changed since I last played · am I on track against the board · what is my biggest risk · what
does my assistant think, and why.

---

## 7. Motion

120ms for state changes, 200ms for entry, `ease-out`. Matchday events appear in sequence as the clock
reaches them — that is the one place where timing carries meaning. No spring, no parallax, no
skeleton shimmer. Honour `prefers-reduced-motion` by dropping to opacity alone.

Ink does not animate. A reversed block appears; it does not fade up through grey.

---

## 8. Accessibility

Contrast **4.5:1 for body and label**, 3:1 for large text and UI edges. Touch targets 44px, except
the segmented control at 42 where the segment is one of four across 390px. Focus is always visible:
2px `ink` outline, 2px offset — never removed. Colour never carries meaning alone. Every stat button
has an accessible name that says what it opens, not "more".

**Measured, not asserted.** The board these tokens came from failed three of these and the palette
was changed rather than the rule:

| Pair                           | Ratio     |                                             |
| ------------------------------ | --------- | ------------------------------------------- |
| `ink` on `news`                | **14.93** |                                             |
| `ink-soft` on `news`           | **8.05**  |                                             |
| `faint` on `news`              | **4.90**  | was `#8C8371` at 3.05 — **failed**          |
| `faint` on `news-deep`         | 4.39      | below the floor, so **never used there**    |
| `red` on `news`                | **5.31**  |                                             |
| `green` on `news`              | **7.47**  |                                             |
| `news` on `ink` (reversed)     | **14.93** |                                             |
| `news` on `red` (the action)   | **5.31**  |                                             |
| `news` on `green` (shirt disc) | **7.47**  |                                             |
| `ink` on `gold` (keeper disc)  | **4.67**  | paper on gold is 3.20 — **fails**, so ink   |
| `gold-lit` on `ink`            | **10.88** |                                             |
| `hair` on `news`               | 1.51      | a separator only — **never a control edge** |

A new token gets its ratio computed and added to this table before it is used, the same way a
statistic gets a cause before it is shown.

---

## 9. Never

- **Never a dark screen.** There is no night mode, no floodlit matchday, no theme toggle. Emphasis is
  reversed ink on the same paper. A dark-slate screen with a green accent is Modareb, and being
  mistaken for it is the one unrecoverable outcome.
- **Never a second solid red on a screen.** One action. A second one means the screen has no
  priority, only colour.
- **Never a red fill on something inert.** Solid red is a thing you press; outlined red is a thing
  you watch.
- **Never show a number whose cause cannot be reached.** If the engine did not produce it, the screen
  does not claim it.
- **Never a skeleton loader shaped like content.** A grey bar pretending to be a statistic is the
  visual form of a fabricated one. Show what has loaded and name what has not.
- **Never a chart with invented, smoothed, or placeholder data.** No sparkline without a series.
- **Never name an opposition player on the pitch diagram.** The game does not scout individuals; the
  opposition is presence, not identity.
- **Never ship a stand-in kit colour without saying it is one.** Club data carries no colours yet
  (§2), and a fabricated club identity is a fabricated fact like any other.
- **Never a shadow, never a gradient** — the halftone screen in §4 is the one texture and it is not a
  gradient anything is separated by.
- **Never a rounded corner** except the two ink marks named in §4.
- **Never `uppercase` or `letter-spacing` on Arabic.**
- **Never a physical-direction property** (`margin-left`, `right:`, `text-align: left`).
- **Never a pill-shaped button**, never glassmorphism, blur, or a neon glow.
- **Never a panel that exists to fill the grid.**
- **Never Arabic-Indic digits, and never a number spelled out in words.**
- **Never MSA in the interface.** `ar-EG` copy follows `dakka-arabic-voice` like everything else the
  player reads.
- **Never a user-facing string outside a locale file** — not a label, not a placeholder, not an
  error, not an `aria-label`. A test fails on it (ADR-003 §4), because two locales enforced by good
  intentions become one locale within a month.
- **Never translate the English from the Arabic.** Same rules, own register: a blunt assistant coach
  in English, not a rendering of an Egyptian one. A translated debrief reads like a translation.

---

## 10. Where this came from

**The direction was chosen by looking.** Three boards were built at 390px in Arabic RTL, showing the
same two screens with the same real simulated match: **A — Stadium Control Room** (dark indigo shell,
lit pitch, broadcast scoreboard), **B — Floodlight split** (warm paper to decide, dark ground to
watch) and **C — Matchday programme**. They are kept in `docs/design/boards/` and are the record of
the decision.

**C was chosen**, and this file is now C. The consequences are larger than a palette:

1. **The dark half of the product is gone.** A and B both split the product into a paper mode and a
   night mode, which meant two of every token, two contrast audits and a rule — "level 2 is a fill on
   paper and an edge on night" — that existed only to manage the split. C is one stock throughout,
   and emphasis is an inversion rather than a second theme. That is a smaller system, not just a
   different one.
2. **It settles the Modareb conflict by removing it** rather than by arguing about it. The previous
   never-list said "never dark-slate with neon-emerald"; A was a dark shell with green accents, which
   is adjacent to the one thing this product defined itself against. C cannot be mistaken for it.
3. **It is Egyptian and physical rather than dark-tech**, which is the recognition the content is
   already trading on — the fourth division, fourteen real governorates, a ground someone has driven
   past.

**What the boards got wrong, corrected here rather than copied.** A board is drawn to be looked at;
this file has to be built from. Three of C's values did not survive:

- Its captions run at 9.5–11px and its `faint` is `#8C8371`, which measures **3.05** on the page —
  below the body floor. `faint` is now `#6A6252` and `label` holds at 12px.
- Its keeper disc sets paper on gold at **3.20**. Text on a gold fill is `ink`.
- Its kit colours are invented. They stay stand-ins, named as such, until the data carries real ones.

**The form of this file** — a descriptor in one line, then concrete values instead of mood words,
then a list of nevers — is taken from `styles.refero.design`, which catalogues design systems written
for coding agents to build from. Four were read closely: **Steep**, **Hyer Aviation**, **Notion** and
**Column**. They converge on three things, all rules above: one accent used at most once per page;
hierarchy from surface contrast rather than decoration; and no shadow on a content card. They
converge on a fourth device — negative tracking — and that one we cannot have, which is what §3 is
about.
