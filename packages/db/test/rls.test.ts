import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { DATA_ROOT, loadLeague } from '@dakka/content';
import { loadMigrations, migrate, seedLeague, type SqlClient } from '../src/index.js';
import { SUPABASE_AUTH_SHIM, signIn, signOut } from '../src/local-auth.js';

/**
 * One career cannot read another's rows — and the database is what refuses.
 *
 * Every query below runs **without a `where` clause on ownership**. That is the whole test. A
 * handler that remembers to filter is a rule that holds until somebody writes the one query that
 * forgets, and the person who forgets will not be the person who wrote the rule. Here the rows are
 * simply not returned.
 *
 * Two things make this a real test rather than a comfortable one. It runs as the `authenticated`
 * role, because a table's owner — and PGlite's default superuser — bypasses row-level security and
 * would make every policy below look like it worked. And it checks the negative both ways: what
 * the other manager cannot see, and what a caller with no session at all cannot see.
 */

const db = new PGlite();
const client = db as unknown as SqlClient;
const league = loadLeague(DATA_ROOT, 'egy-d4');

/** Runs a statement as somebody, in a transaction, so `set local` unwinds afterwards. */
async function asUser<T>(who: string, sql: string, params: readonly unknown[] = []): Promise<T[]> {
  await db.exec('begin;');
  try {
    await db.exec(who);
    const result = await db.query<T>(sql, [...params]);
    return result.rows;
  } finally {
    await db.exec('rollback;');
  }
}

const refusedAs = async (who: string, sql: string, params: readonly unknown[] = []) => {
  try {
    await asUser(who, sql, params);
  } catch (error) {
    return String((error as { message?: string }).message ?? error);
  }
  throw new Error('expected this to be refused, and it was not');
};

let a: Record<string, string>;
let b: Record<string, string>;

beforeAll(async () => {
  // Before the migrations: the policies in 0004 call `auth.uid()`, and Postgres resolves it when
  // the policy is created. On Supabase the `auth` schema is already there; here it has to be.
  await db.exec(SUPABASE_AUTH_SHIM);
  await migrate(client, loadMigrations());
  await seedLeague(client, league.league, league.data);

  const one = async (sql: string, params: readonly unknown[] = []): Promise<string> => {
    const rows = await db.query<{ id: string }>(sql, [...params]);
    return rows.rows[0]?.id as string;
  };
  const club = await one(`select id from clubs order by slug limit 1`);
  const competition = await one(`select id from competitions limit 1`);

  const build = async (name: string) => {
    const user = await one(`insert into users (id) values (gen_random_uuid()) returning id`);
    const manager = await one(
      `insert into managers (user_id, display_name) values ($1, $2) returning id`,
      [user, name],
    );
    const career = await one(
      `insert into careers (manager_id, club_id, competition_id, engine_version)
       values ($1, $2, $3, '0.0.0') returning id`,
      [manager, club, competition],
    );
    const season = await one(
      `insert into seasons (career_id, competition_id, ordinal) values ($1, $2, 1) returning id`,
      [career, competition],
    );
    const away = await one(`select id from clubs order by slug offset 1 limit 1`);
    const fixture = await one(
      `insert into fixtures (season_id, competition_id, round, home_club_id, away_club_id)
       values ($1, $2, 1, $3, $4) returning id`,
      [season, competition, club, away],
    );
    const match = await one(
      `insert into matches (fixture_id, career_id, season_id, seed, engine_version,
         home_score, away_score)
       values ($1, $2, $3, $4, '0.0.0', 1, 0) returning id`,
      [fixture, career, season, `seed-for-${name}`],
    );
    await db.query(
      `insert into match_traces (match_id, minute, cause, delta_win_probability, favoured)
       values ($1, 61, 'CLINICAL_FINISHING', 0.42, 'home')`,
      [match],
    );
    await db.query(
      `insert into decisions (match_id, career_id, side, minute, kind, to_value)
       values ($1, $2, 'home', 60, 'pressing', 'high')`,
      [match, career],
    );
    return { user, manager, career, season, fixture, match };
  };

  a = await build('manager-a');
  b = await build('manager-b');
});

describe('a manager sees his own career and no other', () => {
  it('returns only your matches from a query with no ownership filter', async () => {
    // No `where career_id = ...` anywhere. If this passed with the filter, it would be testing the
    // query rather than the database.
    const mine = await asUser<{ seed: string }>(
      signIn(a.user as string),
      `select seed from matches`,
    );
    expect(mine.map((row) => row.seed)).toEqual(['seed-for-manager-a']);

    const theirs = await asUser<{ seed: string }>(
      signIn(b.user as string),
      `select seed from matches`,
    );
    expect(theirs.map((row) => row.seed)).toEqual(['seed-for-manager-b']);
  });

  it('hides the other career itself, and its seasons and decisions', async () => {
    for (const [table, expected] of [
      ['careers', 1],
      ['seasons', 1],
      ['fixtures', 1],
      ['decisions', 1],
      ['match_traces', 1],
      ['managers', 1],
    ] as const) {
      const rows = await asUser<{ n: number }>(
        signIn(a.user as string),
        `select count(*)::int as n from ${table}`,
      );
      expect(rows[0]?.n, table).toBe(expected);
    }
  });

  it('cannot reach the other career even by naming its id', async () => {
    // The row is not hidden by a filter that a clever query could route around; it is not visible.
    const rows = await asUser<{ n: number }>(
      signIn(a.user as string),
      `select count(*)::int as n from matches where career_id = $1`,
      [b.career],
    );
    expect(rows[0]?.n).toBe(0);
  });

  it("refuses to write into somebody else's career", async () => {
    // Reading is half of it. A `with check` on every policy is what stops one manager appending a
    // match, or a decision, to another's history.
    const message = await refusedAs(
      signIn(a.user as string),
      `insert into decisions (match_id, career_id, side, minute, kind, to_value)
       values ($1, $2, 'home', 80, 'mentality', 'attacking')`,
      [b.match, b.career],
    );
    expect(message).toMatch(/row-level security|policy/i);
  });

  it('refuses to invent a manager for somebody else', async () => {
    const message = await refusedAs(
      signIn(a.user as string),
      `insert into managers (user_id, display_name) values ($1, 'impostor')`,
      [b.user],
    );
    expect(message).toMatch(/row-level security|policy/i);
  });
});

describe('a caller with no session sees the league and nothing personal', () => {
  it('reads the content', async () => {
    const clubs = await asUser<{ n: number }>(signOut(), `select count(*)::int as n from clubs`);
    expect(clubs[0]?.n).toBe(20);
    const players = await asUser<{ n: number }>(
      signOut(),
      `select count(*)::int as n from players`,
    );
    expect(players[0]?.n).toBe(420);
  });

  it('reads the attribute baseline but no career history', async () => {
    // The same table, split by the policy: the dataset baseline is the league, a career's
    // progression is that career's alone.
    const baseline = await asUser<{ n: number }>(
      signOut(),
      `select count(*)::int as n from player_attributes`,
    );
    expect(baseline[0]?.n).toBe(10380);

    await db.query(
      `insert into player_attributes (player_id, career_id, attribute, value, source)
       select id, $1, 'finishing', 71, 'training' from players order by slug limit 1`,
      [a.career],
    );
    const stillBaseline = await asUser<{ n: number }>(
      signOut(),
      `select count(*)::int as n from player_attributes`,
    );
    expect(stillBaseline[0]?.n, "a career's history leaked to a signed-out caller").toBe(10380);

    const owner = await asUser<{ n: number }>(
      signIn(a.user as string),
      `select count(*)::int as n from player_attributes where source = 'training'`,
    );
    expect(owner[0]?.n).toBe(1);
  });

  it('is refused the personal tables outright, not merely filtered to nothing', async () => {
    // Two defences, and this asserts the outer one. `anon` holds no SELECT grant on these tables
    // at all, so the query is refused before any policy is consulted — stronger than returning
    // zero rows, because it does not depend on a policy being right. The policies are the inner
    // defence and are tested above, signed in.
    for (const table of ['careers', 'matches', 'match_traces', 'decisions', 'managers', 'users']) {
      const message = await refusedAs(signOut(), `select count(*)::int as n from ${table}`);
      expect(message, table).toMatch(/permission denied/i);
    }
  });
});

describe('the guard is the database, not the role we happen to run as', () => {
  it('is forced, so even the table owner obeys it', async () => {
    // Without `force row level security` the owner bypasses every policy above, and this whole
    // file would pass while protecting nothing in a deployment that connects as the owner.
    const rows = await db.query<{ relname: string }>(
      `select relname from pg_class
        where relnamespace = 'public'::regnamespace and relrowsecurity and not relforcerowsecurity
          and relname in ('matches','careers','decisions','seasons','managers','users',
                          'match_traces','player_attributes')`,
    );
    expect(rows.rows.map((row) => row.relname)).toEqual([]);
  });

  it('has row-level security on every table that holds a career', async () => {
    const unprotected = await db.query<{ relname: string }>(
      `select relname from pg_class
        where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity
          and relname not in ('schema_migrations')`,
    );
    expect(unprotected.rows.map((row) => row.relname)).toEqual([]);
  });
});
