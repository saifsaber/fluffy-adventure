import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { DATA_ROOT, generateFixtures, loadLeague } from '@dakka/content';
import type { ClubId } from '@dakka/engine';
import {
  SUPABASE_AUTH_SHIM,
  loadMigrations,
  migrate,
  seedLeague,
  type SeedCounts,
  type SqlClient,
} from '../src/index.js';

/**
 * `pnpm db:seed`, run for real.
 *
 * Two claims to hold it to. **Idempotent** — a seed is a command people re-run, and the second run
 * has to leave the database exactly as the first did, including the append-only attribute baseline
 * that cannot be reconciled with an UPDATE. And **queryable** — the point of a normalised schema
 * over the competitor's 1.2 MB blob is that a question about the league is a query, so the tests
 * below ask real ones rather than counting rows.
 */

const db = new PGlite();
const client = db as unknown as SqlClient;
const league = loadLeague(DATA_ROOT, 'egy-d4');

let first: SeedCounts;

beforeAll(async () => {
  // 0004's policies resolve `auth.uid()` as they are created, so the stand-in for Supabase's
  // auth schema goes up first — the same order as a real deployment, where it already exists.
  await db.exec(SUPABASE_AUTH_SHIM);
  await migrate(client, loadMigrations());
  first = await seedLeague(client, league.league, league.data);
});

const count = async (table: string): Promise<number> => {
  const rows = await db.query<{ n: number }>(`select count(*)::int as n from ${table}`);
  return rows.rows[0]?.n ?? 0;
};

describe('the league goes in', () => {
  it('loads every club and every player from the files', async () => {
    expect(first.clubs).toBe(20);
    expect(await count('clubs')).toBe(20);
    expect(await count('players')).toBe(league.data.reduce((n, club) => n + club.squad.length, 0));
    expect(first.entries).toBe(20);
  });

  it('gives every player his baseline, keeper attributes included', async () => {
    // A keeper carries five attributes an outfielder does not, and the content leaves them absent
    // rather than zero. The seed has to preserve that difference: absent is not nought.
    const keepers = await db.query<{ slug: string; n: number }>(
      `select p.slug, count(a.id)::int as n
         from players p join player_attributes a on a.player_id = p.id
        where 'GK' = any (p.positions)
        group by p.slug order by n asc limit 1`,
    );
    const outfield = await db.query<{ n: number }>(
      `select count(a.id)::int as n
         from players p join player_attributes a on a.player_id = p.id
        where not ('GK' = any (p.positions))
        group by p.id order by n desc limit 1`,
    );
    expect(keepers.rows[0]?.n).toBeGreaterThan(outfield.rows[0]?.n ?? 0);

    const gkOnly = await db.query<{ n: number }>(
      `select count(*)::int as n from player_attributes a
         join players p on p.id = a.player_id
        where a.attribute = 'reflexes' and not ('GK' = any (p.positions))`,
    );
    expect(gkOnly.rows[0]?.n, 'an outfielder was given a keeper attribute').toBe(0);
  });

  it('marks the baseline as content, owned by no career', async () => {
    const stray = await db.query<{ n: number }>(
      `select count(*)::int as n from player_attributes
        where source <> 'content' or career_id is not null`,
    );
    expect(stray.rows[0]?.n).toBe(0);
  });
});

describe('a partial league is an error, not a smaller league', () => {
  it('refuses a club list that does not match what the league names', async () => {
    // A truncated seed would leave a nineteen-club division that generates an odd round-robin and
    // looks fine until someone tries to play it. Failing loudly is the cheaper outcome.
    await expect(seedLeague(client, league.league, league.data.slice(0, 19))).rejects.toThrow(
      /lists 20 clubs but 19/,
    );
  });
});

describe('running it again changes nothing', () => {
  it('writes no second baseline, and no second club', async () => {
    // `player_attributes` is append-only, so the usual `on conflict do update` is refused by the
    // trigger and a second run would otherwise simply append a duplicate baseline. The partial
    // unique index in 0003 is what makes this pass.
    const before = {
      clubs: await count('clubs'),
      players: await count('players'),
      attributes: await count('player_attributes'),
      entries: await count('competition_entries'),
      competitions: await count('competitions'),
    };

    const again = await seedLeague(client, league.league, league.data);
    expect(again.attributes, 'the second run wrote new attribute rows').toBe(0);

    expect({
      clubs: await count('clubs'),
      players: await count('players'),
      attributes: await count('player_attributes'),
      entries: await count('competition_entries'),
      competitions: await count('competitions'),
    }).toEqual(before);
  });

  it('carries an edited file through on the next run', async () => {
    // Idempotent is not the same as inert. A club whose data changed has to be updated, or the
    // seed is a one-shot import wearing a re-runnable name.
    const edited = league.data.map((club, index) =>
      index === 0 ? { ...club, reputation: 77 } : club,
    );
    await seedLeague(client, league.league, edited);
    const row = await db.query<{ reputation: number }>(
      `select reputation from clubs where slug = $1`,
      [league.data[0]?.slug],
    );
    expect(row.rows[0]?.reputation).toBe(77);
  });
});

describe('the season is queryable', () => {
  it('answers a standings question before a ball is kicked', async () => {
    // What a blob cannot do. Twenty clubs, their competition's own points rules, nothing played.
    const table = await db.query<{
      short_name: string;
      points_win: number;
      played: number;
    }>(
      `select c.short_name, comp.points_win, 0 as played
         from competition_entries e
         join clubs c on c.id = e.club_id
         join competitions comp on comp.id = e.competition_id
        where comp.slug = 'egy-d4'
        order by c.reputation desc, c.slug asc`,
    );
    expect(table.rows).toHaveLength(20);
    expect(table.rows[0]?.points_win).toBe(3);
  });

  it('has the clubs a full season needs, and the rules that shape it', async () => {
    // A season belongs to a career in this product — the league exists as something someone is
    // playing through — so the seed stops at the content and the fixtures are generated when a
    // career starts. What it must guarantee is that they *can* be: the right clubs, and a
    // round-robin count that is a column rather than a branch.
    const entered = await db.query<{ slug: string }>(
      `select c.slug from competition_entries e
         join clubs c on c.id = e.club_id
         join competitions comp on comp.id = e.competition_id
        where comp.slug = 'egy-d4' order by c.slug`,
    );
    const rules = await db.query<{ round_robin: number }>(
      `select round_robin from competitions where slug = 'egy-d4'`,
    );

    const fixtures = generateFixtures(
      league.league,
      entered.rows.map((row) => row.slug as ClubId),
    );
    const rounds = (entered.rows.length - 1) * (rules.rows[0]?.round_robin ?? 0);
    expect(rounds).toBe(38);
    expect(new Set(fixtures.map((fixture) => fixture.round)).size).toBe(rounds);
    expect(fixtures).toHaveLength((rounds * entered.rows.length) / 2);

    // Every club plays every round, and plays each other twice.
    for (const round of new Set(fixtures.map((f) => f.round))) {
      const inRound = fixtures.filter((f) => f.round === round);
      expect(new Set(inRound.flatMap((f) => [f.home, f.away])).size).toBe(20);
    }
  });

  it('carries the competition\u2019s tie-break rules across', async () => {
    // Content gained the field for the season state machine; without it here a table loaded from
    // the database would have to be ordered by a rule in code, and "a league is data" would stop
    // being true the first time that happened.
    //
    // An array of a *custom enum* comes back from this driver as the raw Postgres literal —
    // `{goal_difference,goals_for,wins}` — because there is no registered parser for the type.
    // Worth knowing before somebody reads one of these columns and gets a string where they
    // expected an array.
    const rules = await db.query<{ tie_break: string }>(
      `select tie_break::text from competitions where slug = 'egy-d4'`,
    );
    const stored = (rules.rows[0]?.tie_break ?? '').replace(/^\{|\}$/g, '').split(',');
    expect(stored).toEqual([...league.league.tieBreak]);
  });

  it('keeps the kit colours a screen will read', async () => {
    const kits = await db.query<{ n: number }>(
      `select count(*)::int as n from clubs where kit_primary ~ '^#[0-9a-f]{6}$'`,
    );
    expect(kits.rows[0]?.n).toBe(20);
  });
});
