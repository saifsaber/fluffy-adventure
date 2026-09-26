/**
 * The palette, as values TypeScript can read.
 *
 * `styles/theme.css` is where these reach the screen; this is where they reach arithmetic. Two
 * copies of a colour is normally the thing to avoid, and the answer here is not to have one copy —
 * it is to have a **test that fails when they differ** (`test/design.test.ts` parses the stylesheet
 * and compares). CSS custom properties cannot be handed to a contrast function and a TS constant
 * cannot be handed to Tailwind, so one of the two has to be derived or checked; checking is the
 * smaller machine.
 *
 * What this buys is the thing DESIGN.md §8 asks for and could not previously have: **the contrast
 * table is executable**. Every figure in that section is recomputed from these values on every test
 * run, so a palette change that quietly drops a pair below its floor fails the build instead of
 * reaching a reader.
 */

export const TOKENS = {
  /* The stock. Three tones of one paper. */
  news: '#efe7d6',
  card: '#f7f1e4',
  'news-deep': '#e5dbc5',

  /* The first ink. */
  ink: '#17140f',
  'ink-soft': '#4a4235',
  faint: '#6a6252',
  hair: '#c9bda3',

  /* The second ink: solid means act, outlined means beware. */
  red: '#b3261e',

  /* The pitch mark and the third ink. */
  green: '#1f5134',
  gold: '#a8772a',
  'gold-lit': '#e8c36a',
} as const;

export type TokenName = keyof typeof TOKENS;

/** The floors from DESIGN.md §8. Not preferences — the reason the palette is what it is. */
export const CONTRAST_FLOOR = {
  /** Body and label text. */
  text: 4.5,
  /** Large text and the edge of a control. */
  large: 3,
} as const;

/**
 * Every pair DESIGN.md §8 tabulates, with the figure it claims and what it is for.
 *
 * `used: false` is the interesting column. Two pairs are in the table precisely because they
 * **fail** — `faint` on `news-deep` at 4.39 and paper on `gold` at 3.20 — and the note beside each
 * says it is therefore never used there. A table that listed only the passing pairs would be a
 * table that forgot why the rules exist.
 */
export interface Measured {
  readonly fg: TokenName;
  readonly bg: TokenName;
  readonly ratio: number;
  /** Which floor this pair has to clear, or `none` where it is a separator rather than a reading. */
  readonly needs: 'text' | 'large' | 'none';
  readonly used: boolean;
  readonly note?: string;
}

export const CONTRAST_TABLE: readonly Measured[] = [
  { fg: 'ink', bg: 'news', ratio: 14.93, needs: 'text', used: true },
  { fg: 'ink-soft', bg: 'news', ratio: 8.05, needs: 'text', used: true },
  {
    fg: 'faint',
    bg: 'news',
    ratio: 4.9,
    needs: 'text',
    used: true,
    note: 'was #8C8371 at 3.05 — the palette changed rather than the rule',
  },
  {
    fg: 'faint',
    bg: 'news-deep',
    ratio: 4.39,
    needs: 'text',
    used: false,
    note: 'below the floor, so never used there',
  },
  { fg: 'red', bg: 'news', ratio: 5.31, needs: 'text', used: true },
  { fg: 'green', bg: 'news', ratio: 7.47, needs: 'text', used: true },
  { fg: 'news', bg: 'ink', ratio: 14.93, needs: 'text', used: true, note: 'reversed' },
  { fg: 'news', bg: 'red', ratio: 5.31, needs: 'text', used: true, note: 'the one action' },
  { fg: 'news', bg: 'green', ratio: 7.47, needs: 'text', used: true, note: 'shirt disc' },
  { fg: 'ink', bg: 'gold', ratio: 4.67, needs: 'text', used: true, note: 'keeper disc' },
  {
    fg: 'news',
    bg: 'gold',
    ratio: 3.2,
    needs: 'text',
    used: false,
    note: 'fails, which is why the keeper disc takes ink and not paper',
  },
  { fg: 'gold-lit', bg: 'ink', ratio: 10.88, needs: 'text', used: true },
  {
    fg: 'hair',
    bg: 'news',
    ratio: 1.51,
    needs: 'none',
    used: true,
    note: 'a separator only — never a control edge',
  },
];

/**
 * The seven type roles, closed.
 *
 * DESIGN.md §3: *seven roles, no eighth.* Every reference system generates its sizes from a ratio
 * and a base; this one is hand-set and deliberately shorter, so there is no rule to extrapolate
 * from and an eighth size is a sign the text is wrong rather than the scale.
 */
export const TYPE_ROLES = ['label', 'figure', 'small', 'body', 'h2', 'h1', 'scoreline'] as const;
