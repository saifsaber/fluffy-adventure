# Art-direction boards — choose by looking, not by adjective

Three directions for the same two screens, with the same content: **tactics** (the pitch and the
team sheet as one object) and **live matchday**. 390px, Arabic RTL.

Made because the first UI failed its own test. `DESIGN.md` says *"if a screen would look at home in
a B2B analytics product, it is wrong"* — and the stats screen did. There was no pitch, no matchday,
no club identity and nothing moving, so it read as a match report rather than a game.

The six acceptance questions come from the owner's `DESIGN_DIRECTION_G6_1` brief and apply to all
three: football game or finance dashboard at a glance · is the pitch central · is the next match the
story and kickoff the action · during a match can you see score, minute, momentum, your adjustment
and its consequence without hunting tabs · is 390px still useful · does one language cover every
screen.

## The three

| | Direction | The bet |
|---|---|---|
| **A** | **Stadium Control Room** | Dark indigo shell, stadium-lit pitch, grass green for action, gold for achievement. Broadcast scoreboard, one lit overlay for the in-match call. Closest to the owner's brief as written. |
| **B** | **Floodlight split** | Two surfaces. You *decide* on warm paper where the pitch is an ink plan in a notebook; you *watch* on a dark floodlit ground. The contrast between the two screens is the idea. |
| **C** | **Matchday programme** | Warm newsprint, heavy rules, double-struck masthead, huge printed scoreline, the pitch as a two-colour diagram. Egyptian and physical rather than dark-tech. |

## The conflict the boards exist to settle

`DESIGN.md`'s never-list says **"never dark-slate with neon-emerald — that is Modareb."** Direction A
is a dark shell with green accents, which is adjacent to the one thing this product defined itself
against. That may still be the right call: Modareb's problem is that its numbers are invented, not
that its palette is dark. But it is a decision, and it is settled by looking rather than arguing.

## Known placeholders, so nothing here is mistaken for finished

- **Kit colours are invented for these boards.** Club data carries no colours and no crest, so the
  green and red are stand-ins. Real kit identity is a data box and it has to exist before any of
  these three ships.
- The opponent is drawn as *presence* (ghost markers and a threat zone), not as named players — the
  game does not scout individuals yet and the boards must not imply that it does.
- The numbers shown are from a real simulated match, not decoration: 1-0, goal at 61', swings at
  31'/57' with their real deltas.

## Regenerate

```
node <scratch>/shoot-boards.mjs          # screenshots all boards at 2× into the scratchpad
```

Each board is one self-contained HTML file; `_pitch.js` holds the shared pitch geometry and the
sample content so the three differ in art direction only, never in what they show.
