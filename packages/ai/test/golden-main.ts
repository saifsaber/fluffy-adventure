/* eslint-disable no-console */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { goldens } from './golden.js';

/** `pnpm --filter @dakka/ai golden` — rewrites the checked-in prompts. Read the diff before committing it. */
for (const { name, text } of goldens()) {
  writeFileSync(join(import.meta.dirname, 'golden', `${name}.txt`), text, 'utf8');
  console.log(`wrote ${name}.txt`);
}
