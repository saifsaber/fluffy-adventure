/**
 * Migrations: ordered SQL files, applied once, recorded.
 *
 * No ORM and no schema DSL. The schema *is* the SQL — a constraint written in a query language the
 * database enforces is worth more than one described in a TypeScript object and hoped for, and
 * `packages/db/migrations` reads as the thing a reviewer needs to review.
 *
 * The runner takes anything with `exec` and `query`, so the same code applies migrations to a
 * server in production and to an in-process Postgres in a test. That matters more than it sounds:
 * a migration nobody has run is a plausible-looking artifact, which is the one kind of thing this
 * project refuses to ship.
 */

export interface SqlClient {
  exec(sql: string): Promise<unknown>;
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
}

export interface Migration {
  /** Sort key and identity. `0001_core` — ordered by name, so the prefix is not decoration. */
  readonly name: string;
  readonly sql: string;
}

const LEDGER = `
  create table if not exists schema_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  );
`;

export interface Applied {
  readonly applied: readonly string[];
  readonly skipped: readonly string[];
}

/**
 * Applies whatever has not been applied, in name order.
 *
 * Idempotent by the ledger rather than by writing every migration defensively: a migration that has
 * to be safe to re-run is a migration that cannot use `create type`, and the schema would end up
 * shaped by the runner's weakness.
 */
export async function migrate(
  client: SqlClient,
  migrations: readonly Migration[],
): Promise<Applied> {
  await client.exec(LEDGER);
  const done = await client.query<{ name: string }>('select name from schema_migrations');
  const already = new Set(done.rows.map((row) => row.name));

  const applied: string[] = [];
  const skipped: string[] = [];
  for (const migration of [...migrations].sort((a, b) => a.name.localeCompare(b.name))) {
    if (already.has(migration.name)) {
      skipped.push(migration.name);
      continue;
    }
    // One transaction per migration, and the ledger insert is inside it — so a file that fails
    // halfway leaves nothing behind, and a file that applies is always recorded.
    //
    // **A sabotage probe for this stays silent, and that is worth knowing.** Removing these
    // `begin`/`rollback` calls breaks no test, because both PGlite and node-postgres run a
    // multi-statement `exec` in an implicit transaction of their own. What this guards is the
    // seam: `SqlClient` is any client with `exec` and `query`, and one that sent statements
    // individually would apply half a file without it. Kept deliberately, not by habit.
    await client.exec('begin;');
    try {
      await client.exec(migration.sql);
      await client.query('insert into schema_migrations (name) values ($1)', [migration.name]);
      await client.exec('commit;');
    } catch (error) {
      await client.exec('rollback;');
      throw new Error(`migration ${migration.name} failed — ${(error as Error).message}`, {
        cause: error,
      });
    }
    applied.push(migration.name);
  }
  return { applied, skipped };
}
