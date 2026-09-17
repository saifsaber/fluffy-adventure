import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findHardcodedStrings } from './scan.js';

/**
 * The mechanical guard ADR-003 §4 asks for.
 *
 * "Two locales" enforced by good intentions is one locale within a month: someone in a hurry types
 * a label straight into a component, nobody notices because it renders fine in the language they
 * happen to be reading, and the second locale is quietly half a product. This test is the thing
 * that notices.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');

/** The locale files are where strings are *supposed* to be. */
const EXEMPT = join(SRC, 'i18n');

function sourceFiles(dir: string): readonly string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return full.startsWith(EXEMPT) ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe('every user-facing string lives in a locale file', () => {
  it('finds none anywhere in the app', () => {
    const offences = sourceFiles(SRC).flatMap((file) =>
      findHardcodedStrings(relative(SRC, file), readFileSync(file, 'utf8')),
    );
    expect(offences).toEqual([]);
  });

  it('scans a real number of files, so a passing run means something', () => {
    // A guard that silently scanned nothing would also report zero offences.
    expect(sourceFiles(SRC).length).toBeGreaterThan(8);
  });

  it('catches a component that hardcodes its strings', () => {
    // Verification by sabotage. Without this the test above could be asserting that a broken
    // scanner found nothing, which is the same output as a clean codebase.
    const fixture = join(HERE, 'fixtures', 'sabotage.tsx');
    const found = findHardcodedStrings('sabotage.tsx', readFileSync(fixture, 'utf8'));
    expect(found.map((f) => f.text).sort()).toEqual(
      ['Full time', 'Minute', 'Open shots', 'نهاية الماتش'].sort(),
    );
  });

  it('leaves punctuation and markup alone', () => {
    // An em dash is not a string anyone needs translated, and a guard that flagged it would be
    // switched off inside a week.
    const found = findHardcodedStrings(
      'punctuation.tsx',
      'export const A = () => (\n  <p className="num">\n    —{" / "}\n  </p>\n);\n',
    );
    expect(found).toEqual([]);
  });
});
