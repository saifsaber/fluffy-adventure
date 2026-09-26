import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrast } from '@dakka/content/pure';
import {
  CONTRAST_FLOOR,
  CONTRAST_TABLE,
  TOKENS,
  TYPE_ROLES,
  type TokenName,
} from '../src/design/tokens.js';
import { findPhysicalClasses, findPhysicalCss } from './scan-direction.js';

/**
 * `DESIGN.md`, promoted from a specification to a gate.
 *
 * The file has been right and unenforceable: every figure in its §8 table is correct — checked —
 * and nothing stopped the next palette change from quietly invalidating one. The four things the
 * box asks for are here as four groups of tests: **the tokens are one palette**, **the contrast
 * table is arithmetic**, **no styling names a side of the screen**, and — already standing in
 * `strings.test.ts` — no user-facing string lives outside a locale file.
 *
 * Every one of them is the same shape of guard: read what the codebase actually says, compare it
 * with what the design file claims, and fail on the difference. A design system nobody can run is
 * a document, and a document is what the discipline decays into.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');
const THEME = readFileSync(join(SRC, 'styles', 'theme.css'), 'utf8');

function sourceFiles(dir: string, extension: RegExp): readonly string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full, extension);
    return extension.test(entry.name) ? [full] : [];
  });
}

/** Every `--color-x: #hex` the stylesheet declares. */
function stylesheetPalette(): ReadonlyMap<string, string> {
  const found = new Map<string, string>();
  const pattern = /--color-([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g;
  let match = pattern.exec(THEME);
  while (match !== null) {
    found.set(match[1] as string, (match[2] as string).toLowerCase());
    match = pattern.exec(THEME);
  }
  return found;
}

describe('there is one palette, and both languages read the same one', () => {
  it('declares in the stylesheet exactly what TypeScript declares', () => {
    // The anti-drift guard, in both directions. A colour in the stylesheet that TypeScript has
    // never heard of cannot have its contrast checked; a colour in TypeScript that the stylesheet
    // does not have is a value nothing can render.
    const css = stylesheetPalette();
    expect([...css.keys()].sort()).toEqual(Object.keys(TOKENS).sort());
    for (const [name, value] of css) {
      expect(value, `--color-${name}`).toBe(TOKENS[name as TokenName]);
    }
  });

  it('finds a real stylesheet, so a passing run means something', () => {
    // A guard that parsed nothing would also report no disagreement.
    expect(stylesheetPalette().size).toBeGreaterThan(8);
  });

  it('keeps the type scale closed at seven roles', () => {
    // DESIGN.md §3: seven roles, no eighth. The scale is hand-set rather than generated from a
    // ratio, so there is no rule to extrapolate from — an eighth size means the text is wrong.
    const declared = new Set<string>();
    const pattern = /--text-([\w-]+?)(?:--line-height)?\s*:/g;
    let match = pattern.exec(THEME);
    while (match !== null) {
      declared.add(match[1] as string);
      match = pattern.exec(THEME);
    }
    expect([...declared].sort()).toEqual([...TYPE_ROLES].sort());
  });

  it('lets no colour reach a screen except through a token', () => {
    // DESIGN.md §2: a colour that is not a token does not exist. Kit colours are the one exception
    // and they are not literals — they arrive from the club file as data, which is the whole point
    // of "never pick a club's colour at a call site".
    const offences = sourceFiles(SRC, /\.tsx?$/)
      .filter((file) => !file.endsWith(join('design', 'tokens.ts')))
      .flatMap((file) => {
        const hexes = readFileSync(file, 'utf8').match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
        return hexes.map((hex) => `${relative(SRC, file)}: ${hex}`);
      });
    expect(offences).toEqual([]);
  });
});

describe('the contrast table in DESIGN.md §8 is arithmetic, not a claim', () => {
  it('measures every pair at the figure the document prints', () => {
    // Recomputed from the palette on every run. A palette change that moved a ratio would have to
    // move this table too, which is the moment somebody notices what it cost.
    for (const pair of CONTRAST_TABLE) {
      const measured = contrast(TOKENS[pair.fg], TOKENS[pair.bg]);
      expect(Number(measured.toFixed(2)), `${pair.fg} on ${pair.bg}`).toBeCloseTo(pair.ratio, 2);
    }
    expect(CONTRAST_TABLE.length).toBeGreaterThan(10);
  });

  it('clears the floor for every pair the product actually uses', () => {
    for (const pair of CONTRAST_TABLE) {
      if (!pair.used || pair.needs === 'none') continue;
      const floor = CONTRAST_FLOOR[pair.needs];
      expect(
        contrast(TOKENS[pair.fg], TOKENS[pair.bg]),
        `${pair.fg} on ${pair.bg}`,
      ).toBeGreaterThanOrEqual(floor);
    }
  });

  it('keeps the two failing pairs in the table, and failing', () => {
    // They are tabulated **because** they fail: `faint` on `news-deep`, and paper on gold. If a
    // palette change ever made one of them pass, the note beside it — "never used there" — would
    // have quietly become superstition, and this is where that gets noticed.
    const failing = CONTRAST_TABLE.filter((pair) => !pair.used);
    expect(failing.length).toBe(2);
    for (const pair of failing) {
      expect(contrast(TOKENS[pair.fg], TOKENS[pair.bg]), `${pair.fg} on ${pair.bg}`).toBeLessThan(
        CONTRAST_FLOOR.text,
      );
    }
  });
});

describe('nothing in the product names a side of the screen', () => {
  it('finds none in the stylesheet', () => {
    expect(findPhysicalCss('theme.css', THEME)).toEqual([]);
  });

  it('finds none in any component', () => {
    const offences = sourceFiles(SRC, /\.tsx?$/).flatMap((file) =>
      findPhysicalClasses(relative(SRC, file), readFileSync(file, 'utf8')),
    );
    expect(offences).toEqual([]);
  });

  it('scans a real number of files', () => {
    expect(sourceFiles(SRC, /\.tsx?$/).length).toBeGreaterThan(15);
  });

  it('catches a component laid out against one side', () => {
    // Verification by sabotage. Without it the two tests above could be asserting that a broken
    // scanner found nothing, which reads exactly like a clean codebase.
    const found = findPhysicalClasses(
      'sideways.tsx',
      readFileSync(join(HERE, 'fixtures', 'sideways.tsx'), 'utf8'),
    );
    expect(found.map((offence) => offence.what).sort()).toEqual(
      ['-mr-6', 'left-0', 'ml-4', 'pr-2', 'rounded-r-sm', 'text-left', 'border-l'].sort(),
    );
  });

  it('catches a stylesheet written for one direction', () => {
    const found = findPhysicalCss(
      'sideways.css',
      readFileSync(join(HERE, 'fixtures', 'sideways.css'), 'utf8'),
    );
    expect(found.map((offence) => offence.what).sort()).toEqual(
      [
        'margin-left',
        'padding-right',
        'text-align: left',
        'border-right',
        'right:',
        'float: left',
      ].sort(),
    );
  });

  it('leaves geometry and mirroring alone', () => {
    // A pitch is physical on purpose — its coordinates do not flip with the page (DESIGN.md §5) —
    // and `flex-row-reverse` is how a row is mirrored rather than a side being named. A guard with
    // false positives gets switched off within a week.
    const innocent = `
      <svg viewBox="0 0 68 105"><path d="M 0 0 L 68 105" /></svg>
      <div className="flex-row-reverse translate-x-2 ms-4 pe-2 text-start inset-inline-start-0" />
      <p className="normal-case htmlFor-left rightly-2" />
    `;
    expect(findPhysicalClasses('innocent.tsx', innocent)).toEqual([]);
  });
});
