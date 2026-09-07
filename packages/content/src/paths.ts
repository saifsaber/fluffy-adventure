import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path to this package's bundled `data/` directory. */
export const DATA_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
