import { debriefPrompt, evidenceFromTrace, LOCALES } from '../src/index.js';
import type { DebriefPrompt } from '../src/index.js';
import { busy, thin, quiet, unnamed, NAMES } from './prompt-fixtures.js';

/**
 * The golden files, and the one function that writes them.
 *
 * Shared by the test and the regeneration script so a golden can never be "updated" into agreeing
 * with a bug by being rendered a slightly different way.
 */

export const CASES = { busy, thin, quiet, unnamed } as const;

export const renderGolden = (prompt: DebriefPrompt): string =>
  ['# system', prompt.system, '', '# evidence', prompt.evidence, '', '# task', prompt.task].join(
    '\n',
  ) + '\n';

export function* goldens(): Generator<{ name: string; text: string }> {
  for (const [name, trace] of Object.entries(CASES)) {
    for (const locale of LOCALES) {
      const prompt = debriefPrompt(evidenceFromTrace(trace, 'home', locale), NAMES);
      yield { name: `${name}.${locale}`, text: renderGolden(prompt) };
    }
  }
}
