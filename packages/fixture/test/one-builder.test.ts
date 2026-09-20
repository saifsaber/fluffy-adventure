import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * There is one fixture builder, and both apps use it.
 *
 * This guard exists because of a sabotage probe that **did not bite**. Changing `seedOf` was
 * supposed to make the client and the server disagree; it changed both at once, because they share
 * this module. That is the guarantee working — but it means the determinism test cannot catch the
 * failure it is named after. It proves the two *loaders* agree and that JSON survives the trip; it
 * cannot prove nobody wrote a second builder, because a second builder would never reach it.
 *
 * So the property is held structurally instead. `matchId` and `competitionId` are the two
 * constructors you cannot assemble a `MatchInput` without, and no application may import either.
 * An app that wants a fixture asks this package for one.
 */

const ROOT = join(import.meta.dirname, '..', '..', '..');

const FORBIDDEN: ReadonlyArray<{ pattern: RegExp; why: string }> = [
  {
    pattern: /\bmatchId\b/,
    why: 'only @dakka/fixture builds a MatchInput — an app that mints match ids has its own copy',
  },
  {
    pattern: /\bcompetitionId\b/,
    why: 'same: a competition id is part of building a fixture, which apps do not do',
  },
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(path) ? [path] : [];
  });
}

describe('no application builds its own fixture', () => {
  const apps = readdirSync(join(ROOT, 'apps'));
  const files = apps.flatMap((app) => {
    const src = join(ROOT, 'apps', app, 'src');
    return statSync(src).isDirectory() ? sourceFiles(src) : [];
  });

  it('has application sources to check', () => {
    expect(apps.length).toBeGreaterThan(1);
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s asks for a fixture rather than assembling one', (file) => {
    const source = readFileSync(file, 'utf8');
    const violations = FORBIDDEN.filter(({ pattern }) => pattern.test(source)).map(
      ({ pattern, why }) => `${pattern.source} — ${why}`,
    );
    expect(violations, `${file} is building a match of its own`).toEqual([]);
  });
});
