import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { SUPABASE_AUTH_SHIM, loadMigrations, migrate, type SqlClient } from '../src/index.js';

/**
 * The schema, run against a real Postgres rather than described.
 *
 * PGlite is PostgreSQL compiled to WebAssembly, so every constraint below is enforced by the same
 * engine that will enforce it in production. That is the whole reason these tests exist: a
 * migration nobody has executed is a plausible-looking artifact, and the tests that matter are not
 * "the table exists" but "the rule bites" — a club cannot play itself, a played match cannot be
 * rewritten, a league's points are a column rather than a branch.
 */

const db = new PGlite();
const client = db as unknown as SqlClient;
const migrations = loadMigrations();

/** Postgres error codes travel on the error object; matching on prose would be matching on a locale. */
const fails = async (sql: string, params: readonly unknown[] = []): Promise<string> => {
  try {
    await db.query(sql, [...params]);
  } catch (error) {
    return String((error as { message?: string }).message ?? error);
  }
  throw new Error(`expected this to be refused, and it was not: ${sql}`);
};

let ids: Record<string, string>;

beforeAll(async () => {
  // 0004's policies resolve `auth.uid()` as they are created, so the stand-in for Supabase's
  // auth schema goes up first — the same order as a real deployment, where it already exists.
  await db.exec(SUPABASE_AUTH_SHIM);
  await migrate(client, migrations);

  const one = async (sql: string, params: readonly unknown[] = []): Promise<string> => {
    const result = await db.query<{ id: string }>(sql, [...params]);
    return result.rows[0]?.id as string;
  };

  const competition = await one(
    `insert into competitions
       (slug, name, short_name, country, tier, round_robin,
        promotion_automatic, promotion_playoff, relegation_automatic,
        points_win, points_draw, points_loss, tie_break)
     values ('egy-d4', 'الدرجة الرابعة', 'د4', 'EGY', 4, 2, 2, 2, 2, 3, 1, 0, '{goal_difference,goals_for}')
     returning id`,
  );
  const club = async (slug: string, primary: string) =>
    one(
      `insert into clubs
         (slug, name, short_name, country, region, latitude, longitude, reputation,
          stadium_name, stadium_slug, stadium_capacity, pitch_quality, kit_primary, kit_secondary)
       values ($1, $1, $1, 'EGY', 'كفر الشيخ', 31.2, 30.8, 41,
               'استاد', $1 || '-ground', 1500, 48, $2, '#f2ede0')
       returning id`,
      [slug, primary],
    );
  const home = await club('matoubas-sporting', '#1f5134');
  const away = await club('ashmoun-youth', '#a41f22');

  const user = await one(`insert into users (id) values (gen_random_uuid()) returning id`);
  const manager = await one(
    `insert into managers (user_id, display_name) values ($1, 'سيف') returning id`,
    [user],
  );
  const career = await one(
    `insert into careers (manager_id, club_id, competition_id, engine_version)
     values ($1, $2, $3, '0.0.0') returning id`,
    [manager, home, competition],
  );
  const season = await one(
    `insert into seasons (career_id, competition_id, ordinal) values ($1, $2, 1) returning id`,
    [career, competition],
  );
  const player = await one(
    `insert into players (club_id, slug, name, short_name, age, nationality, positions, preferred_roles)
     values ($1, 'a-keeper', 'قنديل', 'قنديل', 24, 'EGY', '{GK}', '{shot_stopper}')
     returning id`,
    [home],
  );
  const fixture = await one(
    `insert into fixtures (season_id, competition_id, round, home_club_id, away_club_id)
     values ($1, $2, 1, $3, $4) returning id`,
    [season, competition, home, away],
  );
  ids = { competition, home, away, user, manager, career, season, player, fixture };
});

describe('the migrations run, and run once', () => {
  it('applies every file and records it', async () => {
    const ledger = await db.query<{ name: string }>(
      'select name from schema_migrations order by name',
    );
    expect(ledger.rows.map((row) => row.name)).toEqual(migrations.map((m) => m.name));
    expect(migrations.length).toBeGreaterThan(0);
  });

  it('leaves nothing behind when a file fails halfway', async () => {
    // One transaction per migration, so a half-applied file cannot exist. Without this the next
    // run starts from a state nobody can reason about — a table that exists but is not in the
    // ledger, which the runner will then try to create again.
    const fresh = new PGlite();
    const broken = [
      {
        name: '0001_half',
        sql: `create table survivor (id int primary key); select 1 / 0;`,
      },
    ];
    await expect(migrate(fresh as unknown as SqlClient, broken)).rejects.toThrow(/0001_half/);

    const tables = await fresh.query<{ n: number }>(
      `select count(*)::int as n from information_schema.tables where table_name = 'survivor'`,
    );
    expect(tables.rows[0]?.n, 'the half-created table survived a failed migration').toBe(0);

    const ledger = await fresh.query<{ n: number }>(
      `select count(*)::int as n from schema_migrations`,
    );
    expect(ledger.rows[0]?.n, 'a failed migration was recorded as applied').toBe(0);
  });

  it('is a no-op the second time', async () => {
    // `create type` is not re-runnable, so idempotence has to come from the ledger. If it came from
    // writing every migration defensively, the schema would be shaped by the runner's weakness.
    const again = await migrate(client, migrations);
    expect(again.applied).toEqual([]);
    expect(again.skipped).toEqual(migrations.map((m) => m.name));
  });
});

describe('a league is data, not code', () => {
  it('stores a completely different competition without a schema change', async () => {
    // One round-robin, two points for a win, no promotion. Nothing about this shape is Egyptian,
    // and supporting it took no branch anywhere.
    await db.query(
      `insert into competitions
         (slug, name, short_name, country, tier, round_robin,
          promotion_automatic, promotion_playoff, relegation_automatic,
          points_win, points_draw, points_loss, tie_break)
       values ('xyz-cup', 'Cup', 'Cup', 'XYZ', 1, 1, 0, 0, 0, 2, 1, 0, '{head_to_head}')`,
    );
    const row = await db.query<{ points_win: number }>(
      `select points_win from competitions where slug = 'xyz-cup'`,
    );
    expect(row.rows[0]?.points_win).toBe(2);
  });
});

describe('the rules bite', () => {
  it('refuses two clubs with the same slug', async () => {
    const message = await fails(
      `insert into clubs
         (slug, name, short_name, country, region, latitude, longitude, reputation,
          stadium_name, stadium_slug, stadium_capacity, pitch_quality, kit_primary, kit_secondary)
       values ('matoubas-sporting', 'x', 'x', 'EGY', 'x', 31, 30, 40, 's', 's', 500, 40,
               '#1f5134', '#f2ede0')`,
    );
    expect(message).toMatch(/duplicate key|unique/i);
  });

  it('refuses a kit colour that is not lowercase hex', async () => {
    // The same rule `packages/content` validates, held again at the only other place a colour can
    // enter the product. One spelling, or a colour acquires two.
    const message = await fails(
      `insert into clubs
         (slug, name, short_name, country, region, latitude, longitude, reputation,
          stadium_name, stadium_slug, stadium_capacity, pitch_quality, kit_primary, kit_secondary)
       values ('uppercase-fc', 'x', 'x', 'EGY', 'x', 31, 30, 40, 's', 's', 500, 40,
               '#1F5134', '#f2ede0')`,
    );
    expect(message).toMatch(/kit_primary|check/i);
  });

  it('refuses a player in a club that does not exist', async () => {
    const message = await fails(
      `insert into players (club_id, slug, name, short_name, age, nationality, positions, preferred_roles)
       values (gen_random_uuid(), 'nobody', 'x', 'x', 20, 'EGY', '{ST}', '{poacher}')`,
    );
    expect(message).toMatch(/foreign key|violates/i);
  });

  it('refuses a position the engine does not have', async () => {
    // The database's answer to `Record<Position, …>`: an unlisted position is a violation, not a
    // row nobody notices.
    const message = await fails(
      `insert into players (club_id, slug, name, short_name, age, nationality, positions, preferred_roles)
       values ($1, 'sweeper', 'x', 'x', 20, 'EGY', '{SW}', '{poacher}')`,
      [ids.home],
    );
    expect(message).toMatch(/invalid input value|position_code/i);
  });

  it('refuses a club playing itself', async () => {
    const message = await fails(
      `insert into fixtures (season_id, competition_id, round, home_club_id, away_club_id)
       values ($1, $2, 9, $3, $3)`,
      [ids.season, ids.competition, ids.home],
    );
    expect(message).toMatch(/check|home_club_id/i);
  });

  it('refuses a match with no seed and no engine version', async () => {
    // The two columns the product rests on. A stored result without them is a claim nobody can
    // check, which is the thing this whole codebase exists to not ship.
    const message = await fails(
      `insert into matches (fixture_id, career_id, season_id, seed, engine_version, home_score, away_score)
       values ($1, $2, $3, '', '0.0.0', 1, 0)`,
      [ids.fixture, ids.career, ids.season],
    );
    expect(message).toMatch(/check|seed/i);
  });

  it('refuses a second season with the same ordinal in one career', async () => {
    const message = await fails(
      `insert into seasons (career_id, competition_id, ordinal) values ($1, $2, 1)`,
      [ids.career, ids.competition],
    );
    expect(message).toMatch(/duplicate key|unique/i);
  });
});

describe('history is append-only, and the database says so', () => {
  it('lets a match be written once', async () => {
    await db.query(
      `insert into matches (fixture_id, career_id, season_id, seed, engine_version, home_score, away_score)
       values ($1, $2, $3, 'matoubas-v-ashmoun/balanced', '0.0.0', 1, 0)`,
      [ids.fixture, ids.career, ids.season],
    );
    const row = await db.query<{ seed: string }>(`select seed from matches`);
    expect(row.rows[0]?.seed).toBe('matoubas-v-ashmoun/balanced');
  });

  it('refuses to change a played match', async () => {
    // Editing a result would silently change what the product says happened, and the counterfactual
    // is built on the assumption that it cannot.
    const message = await fails(`update matches set home_score = 5`);
    expect(message).toMatch(/append-only/);
  });

  it('refuses to delete a played match', async () => {
    const message = await fails(`delete from matches`);
    expect(message).toMatch(/append-only/);
  });

  it('keeps attribute history instead of overwriting it', async () => {
    for (const [value, source] of [
      [62, 'content'],
      [64, 'training'],
    ] as const) {
      await db.query(
        `insert into player_attributes (player_id, career_id, attribute, value, source)
         values ($1, $2, 'finishing', $3, $4)`,
        [ids.player, ids.career, value, source],
      );
    }
    const history = await db.query<{ value: number; source: string }>(
      `select value, source from player_attributes
        where player_id = $1 and attribute = 'finishing'
        order by valid_from asc, id asc`,
      [ids.player],
    );
    // "His finishing went 62 → 64, and here is why" is one query. A wide row updated in place
    // answers what he is and destroys how he got there.
    expect(history.rows.map((row) => row.value)).toEqual([62, 64]);
    expect(history.rows.map((row) => row.source)).toEqual(['content', 'training']);
    expect(await fails(`update player_attributes set value = 99`)).toMatch(/append-only/);
  });
});

describe('forgetting a career is different from rewriting one', () => {
  it('refuses to erase an account unless the transaction says that is what it is doing', async () => {
    // The first version of this trigger had no escape hatch, and the cascade from `users` hit it:
    // a person asking to be forgotten would have been told no by a rule meant to stop someone
    // editing a scoreline. Refusal is still the default; erasure has to be declared.
    const message = await fails(`delete from users where id = $1`, [ids.user]);
    expect(message).toMatch(/append-only/);
  });

  it('removes a whole career by cascade once it does', async () => {
    // Deleting an account has to actually delete it. The append-only rule is about editing the
    // record, not about keeping it forever against the person's wishes.
    const before = await db.query<{ n: number }>(`select count(*)::int as n from matches`);
    expect(before.rows[0]?.n).toBeGreaterThan(0);

    await db.exec('begin;');
    await db.exec(`set local dakka.erasing = 'on';`);
    await db.query(`delete from users where id = $1`, [ids.user]);
    await db.exec('commit;');

    for (const table of ['managers', 'careers', 'seasons', 'matches', 'fixtures', 'squads']) {
      const left = await db.query<{ n: number }>(`select count(*)::int as n from ${table}`);
      expect(left.rows[0]?.n, table).toBe(0);
    }
    // The content survives: a club is not a user's to delete.
    const clubs = await db.query<{ n: number }>(`select count(*)::int as n from clubs`);
    expect(clubs.rows[0]?.n).toBe(2);
  });
});
