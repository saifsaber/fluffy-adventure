import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Mechanical guard for the engine's purity contract.
 *
 * This is not style linting. Determinism is the property that makes counterfactual
 * replay, the seeded daily challenge, honest PvP, and reproducible bugs possible —
 * a single unseeded `Math.random()` breaks all four at once, silently, and the
 * failure only shows up as "the same match gave two different results".
 */

const SRC = join(import.meta.dirname, '..', 'src');

const FORBIDDEN: ReadonlyArray<{ pattern: RegExp; why: string }> = [
  {
    pattern: /\bMath\s*\.\s*random\b/,
    why: 'unseeded randomness — take the injected PRNG instead',
  },
  { pattern: /\bDate\s*\.\s*now\b/, why: 'reads the clock — pass time in as an argument' },
  { pattern: /\bnew\s+Date\b/, why: 'reads the clock — pass time in as an argument' },
  {
    pattern: /\bcrypto\s*\.\s*randomUUID\b/,
    why: 'unseeded randomness — derive ids from the seed',
  },
  { pattern: /\bperformance\s*\.\s*now\b/, why: 'reads the clock' },
  {
    pattern: /\bprocess\s*\.\s*env\b/,
    why: 'reads the environment — the engine takes no config from outside',
  },
  { pattern: /\bfrom\s+'node:/, why: 'node builtin — the engine must also run in a browser' },
  {
    pattern: /\brequire\s*\(\s*'node:/,
    why: 'node builtin — the engine must also run in a browser',
  },
  { pattern: /\bfetch\s*\(/, why: 'network call — the engine performs no I/O' },
  { pattern: /\bglobalThis\b/, why: 'global state — the engine is a pure function of its inputs' },
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

describe('engine purity', () => {
  const files = sourceFiles(SRC);

  it('has source files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s stays pure', (file) => {
    const source = readFileSync(file, 'utf8');
    const violations = FORBIDDEN.filter(({ pattern }) => pattern.test(source)).map(
      ({ pattern, why }) => `${pattern.source} — ${why}`,
    );
    expect(violations, `${file} breaks the engine purity contract`).toEqual([]);
  });
});
