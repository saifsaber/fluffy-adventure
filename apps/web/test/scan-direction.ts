/**
 * Finds physical-direction styling — the rule DESIGN.md §6 calls non-negotiable.
 *
 * *A single `margin-left` in this codebase is a bug: it is correct in one of the two locales we
 * ship and wrong in the other, and it will be found by a user rather than by us.* That is the whole
 * argument, and it is why this is a scanner and not a code review: the failure is invisible to
 * whoever writes it, because they are reading in one direction.
 *
 * It has to cover **two languages**. In CSS the offenders are properties; in a component they are
 * Tailwind class names, which are opaque strings to a linter that understands TypeScript. Missing
 * either half would leave the rule enforced in one place and advisory in the other, which is worse
 * than not enforcing it, because it would look enforced.
 *
 * Deliberately **not** flagged: `flex-row-reverse`, `translate-x`, and anything inside an SVG
 * `viewBox` or a path. A pitch is geometry — its coordinates are physical on purpose and do not
 * flip with the page, which DESIGN.md §5 says in as many words.
 */

export interface Offence {
  readonly file: string;
  readonly line: number;
  readonly what: string;
  readonly instead: string;
}

/** CSS properties that resolve to a side of the screen rather than to a side of the reading. */
const CSS_RULES: readonly { readonly pattern: RegExp; readonly instead: string }[] = [
  { pattern: /\bmargin-(left|right)\b/g, instead: 'margin-inline-start / margin-inline-end' },
  { pattern: /\bpadding-(left|right)\b/g, instead: 'padding-inline-start / padding-inline-end' },
  {
    pattern: /\bborder-(left|right)(-\w+)?\b/g,
    instead: 'border-inline-start / border-inline-end',
  },
  { pattern: /\btext-align\s*:\s*(left|right)\b/g, instead: 'text-align: start / end' },
  { pattern: /(?<![-\w])(left|right)\s*:/g, instead: 'inset-inline-start / inset-inline-end' },
  { pattern: /\bfloat\s*:\s*(left|right)\b/g, instead: 'nothing — the programme has no floats' },
  {
    pattern: /\bborder-radius\s*:[^;]*\b(top|bottom)-(left|right)\b/g,
    instead: 'a logical corner',
  },
];

/**
 * Tailwind class names that mean a side of the screen.
 *
 * Written as whole-class patterns so `ml-2` is caught and `html-2` is not, and so the negative
 * forms (`-ml-4`, used for bleeding a region to the trim) are caught too — they are the commonest
 * way this rule gets broken, because they read as layout rather than as direction.
 */
const CLASS_RULES: readonly { readonly pattern: RegExp; readonly instead: string }[] = [
  { pattern: /(?<![\w-])-?(ml|mr)-[\w.[\]%/-]+/g, instead: 'ms- / me-' },
  { pattern: /(?<![\w-])-?(pl|pr)-[\w.[\]%/-]+/g, instead: 'ps- / pe-' },
  { pattern: /(?<![\w-])-?(left|right)-[\w.[\]%/-]+/g, instead: 'start- / end-' },
  { pattern: /(?<![\w-])text-(left|right)(?![\w-])/g, instead: 'text-start / text-end' },
  { pattern: /(?<![\w-])(border|rounded)-(l|r)(?![\w-])/g, instead: 'the -s / -e form' },
  { pattern: /(?<![\w-])(border|rounded)-(l|r)-[\w.[\]%/-]+/g, instead: 'the -s / -e form' },
];

/**
 * Prose, blanked line by line so the line numbers still point at the right place.
 *
 * Without this the scanner reads its own explanations: the phrase *left-to-right*, written in a
 * comment about bidi, matches a rule looking for `left-…` classes. A guard that flags the sentence
 * describing the rule is a guard somebody switches off, so the comments come out first.
 */
const withoutProse = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/\/\/.*$/gm, (line) => ' '.repeat(line.length));

function scan(
  file: string,
  source: string,
  rules: readonly { readonly pattern: RegExp; readonly instead: string }[],
): readonly Offence[] {
  const found: Offence[] = [];
  withoutProse(source)
    .split('\n')
    .forEach((text, index) => {
      for (const rule of rules) {
        // A fresh regex per line: a shared `g` regex carries `lastIndex` between calls.
        const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
        let match = pattern.exec(text);
        while (match !== null) {
          found.push({ file, line: index + 1, what: match[0], instead: rule.instead });
          match = pattern.exec(text);
        }
      }
    });
  return found;
}

export const findPhysicalCss = (file: string, source: string): readonly Offence[] =>
  scan(file, source, CSS_RULES);

export const findPhysicalClasses = (file: string, source: string): readonly Offence[] =>
  scan(file, source, CLASS_RULES);
