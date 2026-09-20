/**
 * Colour arithmetic for club identity.
 *
 * Kit colours are the one piece of content in this product that is **authored rather than
 * derived**, and the distinction matters enough to write down. A statistic is counted from
 * something that happened; a club's colours are not counted from anything, the same way its name
 * is not. These clubs are fictional — Matoubas Sporting is not a club, it is a club placed in a
 * real town — so giving one a green shirt is writing content, not inventing a fact about the world.
 *
 * What would be fabrication is the version this replaces: a colour chosen at a call site because a
 * screen needed one, or generated from a hash of the slug. Those are invented at render time,
 * unreviewable, and change when the renderer does. These live in the club file, get read by a human,
 * and get overwritten the day a real league is licensed.
 *
 * One design token reaches in here — the colour a shirt number is printed in — and it is named
 * rather than disguised. See `SHIRT_NUMBER_INK` for why that is the right coupling and not a leak.
 */

/** `#RRGGBB`, the only form a kit colour may take on disk. */
export const HEX = /^#[0-9a-f]{6}$/;

const channel = (hex: string, at: number): number => Number.parseInt(hex.slice(at, at + 2), 16);

const toLinear = (value: number): number => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const r = toLinear(channel(hex, 1));
  const g = toLinear(channel(hex, 3));
  const b = toLinear(channel(hex, 5));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 to 21. Order does not matter. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Whichever of the candidates is most readable on this background. Never a guess at a call site. */
export function readableOn(background: string, candidates: readonly string[]): string {
  let best = candidates[0] as string;
  for (const candidate of candidates) {
    if (contrast(background, candidate) > contrast(background, best)) best = candidate;
  }
  return best;
}

/* ---------------------------------------------------------------------------------------- *
 * Perceptual distance — for the one question contrast cannot answer
 * ---------------------------------------------------------------------------------------- */

/**
 * CIE L*a*b* under D65.
 *
 * Contrast ratio is a luminance measure, so it says two kits are identical when a red and a green
 * of the same darkness sit side by side — which is exactly the pair a football fixture must never
 * print together. Lab separates lightness from hue, so a distance in it answers "are these two
 * clubs telling apart?" where a ratio cannot.
 */
function lab(hex: string): readonly [number, number, number] {
  // sRGB → XYZ (D65), then XYZ → Lab against the D65 white point.
  const r = toLinear(channel(hex, 1));
  const g = toLinear(channel(hex, 3));
  const b = toLinear(channel(hex, 5));
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/**
 * ΔE*76 — Euclidean distance in Lab.
 *
 * Named as 76 rather than "colour difference" because it is the 1976 formula and it is known to
 * overstate differences in the blues. CIEDE2000 is the better metric and is roughly ten times the
 * code; the threshold below is set high enough that the difference between the two does not decide
 * any pair we ship. If that stops being true, this is the function to replace.
 */
export function deltaE76(a: string, b: string): number {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/* ---------------------------------------------------------------------------------------- *
 * The rules a kit must satisfy
 * ---------------------------------------------------------------------------------------- */

/**
 * The colour a shirt number is printed in.
 *
 * This is `DESIGN.md`'s `news`, and it is the one design token this package knows. It is here
 * rather than in the app because a club file that validates must be *renderable*: a shirt nobody
 * can print a number on is broken content, and finding that out in a browser is finding it out too
 * late. The coupling is named rather than hidden behind a proxy like "contrast against white",
 * which would be a looser rule pretending to be a universal one.
 */
export const SHIRT_NUMBER_INK = '#efe7d6';

/**
 * A shirt number has to be readable on the shirt.
 *
 * One rule, two guarantees, because the number's ink and the page are the same colour: a primary
 * that carries a number at 4.5:1 is also 4.5:1 against the page it sits on — comfortably past the
 * 3:1 a UI object owes its background. Full text contrast rather than the large-text 3:1, because
 * a number on a 28px disc is small bold text, not a heading.
 */
export const MIN_NUMBER_ON_SHIRT = 4.5;

/** A trim that does not separate from the shirt is not a second colour, it is a rumour. */
export const MIN_TRIM_ON_PRIMARY = 3;

/**
 * How far apart two clubs' primaries must be, and why it is 22 rather than a rounder number.
 *
 * 25 is the usual line for "different colours rather than shades of one" and was the first
 * threshold here. It is not reachable. A farthest-point search over the 75,069 sRGB colours that
 * are both plausible as a kit (Lab chroma 10–52: no mud, no neon) and dark enough to satisfy
 * `MIN_NUMBER_ON_SHIRT` puts the best achievable separation for twenty clubs at **ΔE 24.8** — and
 * a gate set at its own ceiling is a gate nothing can pass, so the twenty-first club could never
 * be added.
 *
 * 22 is what that measurement leaves, with the margin on the side of the rule rather than the
 * data. What it protects is worth stating exactly, because it is less than it sounds: colour never
 * carries meaning alone in this product — on the pitch your side is a filled disc and theirs an
 * outlined diamond, and a swatch always sits beside its own club's name. So two clubs printing
 * alike costs polish, not correctness. This is a quality gate, and it is honest about being one.
 */
export const MIN_CLUB_SEPARATION = 22;

export interface Kit {
  readonly primary: string;
  readonly secondary: string;
}

/** Everything wrong with one kit, in the words a contributor needs. Empty means it is fine. */
export function kitProblems(kit: Kit): readonly string[] {
  const problems: string[] = [];
  for (const [role, value] of [
    ['primary', kit.primary],
    ['secondary', kit.secondary],
  ] as const) {
    if (!HEX.test(value)) problems.push(`${role} "${value}" is not a lowercase #rrggbb colour`);
  }
  if (problems.length > 0) return problems;

  const number = contrast(kit.primary, SHIRT_NUMBER_INK);
  if (number < MIN_NUMBER_ON_SHIRT) {
    problems.push(
      `primary ${kit.primary} is too light: a shirt number reaches only ${number.toFixed(2)}:1 on it and needs ${MIN_NUMBER_ON_SHIRT}:1`,
    );
  }
  const trim = contrast(kit.secondary, kit.primary);
  if (trim < MIN_TRIM_ON_PRIMARY) {
    problems.push(
      `secondary ${kit.secondary} reaches only ${trim.toFixed(2)}:1 against the primary and needs ${MIN_TRIM_ON_PRIMARY}:1 to read as trim`,
    );
  }
  return problems;
}

export interface KitClash {
  readonly a: string;
  readonly b: string;
  readonly distance: number;
}

/**
 * Pairs of clubs in one league whose primaries are too close to tell apart.
 *
 * Every pair, not just the ones that meet — in a double round-robin every pair meets, and in a cup
 * any pair can. A league that validates here can print any fixture it is capable of producing.
 */
export function kitClashes(clubs: readonly { slug: string; kit: Kit }[]): readonly KitClash[] {
  const clashes: KitClash[] = [];
  for (let i = 0; i < clubs.length; i++) {
    for (let j = i + 1; j < clubs.length; j++) {
      const a = clubs[i] as { slug: string; kit: Kit };
      const b = clubs[j] as { slug: string; kit: Kit };
      const distance = deltaE76(a.kit.primary, b.kit.primary);
      if (distance < MIN_CLUB_SEPARATION) clashes.push({ a: a.slug, b: b.slug, distance });
    }
  }
  return clashes.sort((x, y) => x.distance - y.distance);
}
