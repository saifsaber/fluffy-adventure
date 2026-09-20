import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Migration } from './migrate.js';

/** Where the SQL lives. The only I/O in this package. */
export const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'migrations');

/** Reads the migration files in name order. */
export function loadMigrations(dir: string = MIGRATIONS_DIR): readonly Migration[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => ({
      name: file.slice(0, -'.sql'.length),
      sql: readFileSync(join(dir, file), 'utf8'),
    }));
}
