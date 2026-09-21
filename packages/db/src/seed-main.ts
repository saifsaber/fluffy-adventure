/* eslint-disable no-console */
import { mkdirSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { DATA_ROOT, loadLeague } from '@dakka/content';
import { SUPABASE_AUTH_SHIM } from './local-auth.js';
import { loadMigrations, migrate } from './migrate-entry.js';
import { seedLeague } from './seed.js';
import type { SqlClient } from './migrate.js';

/**
 * `pnpm db:seed` — migrate, then load the content.
 *
 * **Where it writes.** With no `DATABASE_URL` it uses a file-backed Postgres under `.dakka/db`,
 * which is a real database a developer can query today and which every test here exercises. With a
 * `DATABASE_URL` it **refuses**, and says so: connecting to a server needs a client this repository
 * has never run against one, and a code path nobody has executed is exactly the plausible-looking
 * artifact this project does not ship. That path arrives with the Supabase box, tested against
 * something real.
 */

const url = process.env.DATABASE_URL;
if (url !== undefined && url !== '') {
  console.error(
    'DATABASE_URL is set, and seeding a server is not built yet.\n' +
      'The server client arrives with the Supabase box, tested against a real database rather\n' +
      'than written and hoped for. Unset DATABASE_URL to seed the local file-backed database.',
  );
  process.exit(1);
}

const league = process.argv.slice(2).find((arg) => !arg.startsWith('-')) ?? 'egy-d4';
// Resolved against the repository root, not the shell's working directory: `pnpm db:seed` runs
// from the package, and a database that lands in a different place depending on where you typed
// the command is a database you will seed twice and query once.
const root = resolve(import.meta.dirname, '..', '..', '..');
const configured = process.env.DAKKA_DB_DIR ?? '.dakka/db';
const dir = isAbsolute(configured) ? configured : join(root, configured);
// PGlite's node filesystem does not create parents, and the first run has none.
mkdirSync(dir, { recursive: true });

const db = new PGlite(dir);
const client = db as unknown as SqlClient;

// Supabase's `auth` schema exists before any migration runs there; the local database has to be
// given one, because 0004's policies resolve `auth.uid()` the moment they are created. This is the
// only place the stand-in is applied, and it is never part of a migration.
await db.exec(SUPABASE_AUTH_SHIM);

const applied = await migrate(client, loadMigrations());
console.log(
  applied.applied.length === 0
    ? `schema already current (${applied.skipped.length} migrations)`
    : `applied ${applied.applied.join(', ')}`,
);

const loaded = loadLeague(DATA_ROOT, league);
const counts = await seedLeague(client, loaded.league, loaded.data);
console.log(
  `seeded ${league} into ${dir}: ${counts.clubs} clubs, ${counts.players} players, ` +
    `${counts.attributes} new attribute rows, ${counts.entries} entries`,
);
await db.close();
