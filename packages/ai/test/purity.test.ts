import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The AI package holds no keys and makes no calls.
 *
 * It builds prompts and validates replies; the thing that actually talks to a model lives behind
 * the API, where a key can be kept server-side. This guard exists because the tempting shortcut —
 * one `fetch` and `process.env.ANTHROPIC_API_KEY` right here — also ships that key to every browser
 * that loads the client, and does it in a commit that otherwise looks like progress.
 */

const SRC = join(import.meta.dirname, '..', 'src');

const FORBIDDEN: ReadonlyArray<{ pattern: RegExp; why: string }> = [
  { pattern: /\bfetch\s*\(/, why: 'network call — the model is reached from the API, not here' },
  { pattern: /\bprocess\s*\.\s*env\b/, why: 'reads the environment — no keys in this package' },
  { pattern: /\bAPI_KEY\b/i, why: 'a key has no business in a package the client can import' },
  { pattern: /\bfrom\s+'node:/, why: 'node builtin — this package also runs in a browser' },
  { pattern: /\bMath\s*\.\s*random\b/, why: 'unseeded randomness — nothing here should need it' },
  { pattern: /\bDate\s*\.\s*now\b/, why: 'reads the clock — pass time in as an argument' },
  { pattern: /\bnew\s+Date\b/, why: 'reads the clock — pass time in as an argument' },
  { pattern: /\bglobalThis\b/, why: 'global state' },
  {
    pattern: /https?:\/\/(?!docs)/,
    why: 'an endpoint — the transport belongs behind the API',
  },
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

describe('the AI package stays a boundary, not a client', () => {
  const files = sourceFiles(SRC);

  it('has source files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s holds no keys and makes no calls', (file) => {
    const source = readFileSync(file, 'utf8');
    const violations = FORBIDDEN.filter(({ pattern }) => pattern.test(source)).map(
      ({ pattern, why }) => `${pattern.source} — ${why}`,
    );
    expect(violations, `${file} is reaching outside the boundary`).toEqual([]);
  });
});
