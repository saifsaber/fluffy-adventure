import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { ALL_CAUSES, ALL_DECISION_KINDS, baselineTactics, simulate } from '@dakka/engine';
import type { MatchResult } from '@dakka/engine';
import { DATA_ROOT, loadLeague, playerSchema, positionSchema, roleSchema } from '@dakka/content';
import { buildFixture } from '@dakka/fixture';
import { SUPABASE_AUTH_SHIM, loadMigrations, migrate, type SqlClient } from '../src/index.js';

/**
 * The trace and the decisions, stored as rows you can ask questions of.
 *
 * Two tests carry this box. The **enum agreement** one holds the database to the engine: a cause
 * the engine emits but the schema refuses is a match that cannot be saved, and two lists that must
 * agree and cannot be compared are two lists that will drift. The **round trip** one proves the
 * claim in the box's own words — first-class, not a log — by rebuilding a real trace out of rows
 * and requiring it to equal the one the engine produced.
 */

const db = new PGlite();
const client = db as unknown as SqlClient;
const league = loadLeague(DATA_ROOT, 'egy-d4');

const fails = async (sql: string, params: readonly unknown[] = []): Promise<string> => {
  try {
    await db.query(sql, [...params]);
  } catch (error) {
    return String((error as { message?: string }).message ?? error);
  }
  throw new Error(`expected this to be refused, and it was not: ${sql}`);
};

let ids: Record<string, string>;
let played: MatchResult;

beforeAll(async () => {
  // 0004's policies resolve `auth.uid()` as they are created, so the stand-in for Supabase's
  // auth schema goes up first — the same order as a real deployment, where it already exists.
  await db.exec(SUPABASE_AUTH_SHIM);
  await migrate(client, loadMigrations());

  const one = async (sql: string, params: readonly unknown[] = []): Promise<string> => {
    const result = await db.query<{ id: string }>(sql, [...params]);
    return result.rows[0]?.id as string;
  };

  const competition = await one(
    `insert into competitions (slug, name, short_name, country, tier, round_robin,
       promotion_automatic, promotion_playoff, relegation_automatic, points_win, points_draw, points_loss, tie_break)
     values ('egy-d4', 'د4', 'د4', 'EGY', 4, 2, 2, 2, 2, 3, 1, 0, '{goal_difference,goals_for}') returning id`,
  );
  const clubIds = new Map<string, string>();
  for (const club of league.data.slice(0, 2)) {
    clubIds.set(
      club.slug,
      await one(
        `insert into clubs (slug, name, short_name, country, region, latitude, longitude, reputation,
           stadium_name, stadium_slug, stadium_capacity, pitch_quality, kit_primary, kit_secondary)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) returning id`,
        [
          club.slug,
          club.name,
          club.shortName,
          club.country,
          club.region,
          club.location.lat,
          club.location.lon,
          club.reputation,
          club.stadium.name,
          club.stadium.slug,
          club.stadium.capacity,
          club.stadium.pitchQuality,
          club.kit.primary,
          club.kit.secondary,
        ],
      ),
    );
  }

  const playerIds = new Map<string, string>();
  for (const club of league.data.slice(0, 2)) {
    for (const player of club.squad) {
      playerIds.set(
        player.slug,
        await one(
          `insert into players (club_id, slug, name, short_name, age, nationality, positions, preferred_roles)
           values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
          [
            clubIds.get(club.slug),
            player.slug,
            player.name,
            player.shortName,
            player.age,
            player.nationality,
            `{${player.positions.join(',')}}`,
            `{${player.preferredRoles.join(',')}}`,
          ],
        ),
      );
    }
  }

  const user = await one(`insert into users (id) values (gen_random_uuid()) returning id`);
  const manager = await one(
    `insert into managers (user_id, display_name) values ($1, 'م') returning id`,
    [user],
  );
  const home = league.data[0]?.slug as string;
  const away = league.data[1]?.slug as string;
  const career = await one(
    `insert into careers (manager_id, club_id, competition_id, engine_version)
     values ($1, $2, $3, '0.0.0') returning id`,
    [manager, clubIds.get(home), competition],
  );
  const season = await one(
    `insert into seasons (career_id, competition_id, ordinal) values ($1, $2, 1) returning id`,
    [career, competition],
  );
  const fixture = await one(
    `insert into fixtures (season_id, competition_id, round, home_club_id, away_club_id)
     values ($1, $2, 1, $3, $4) returning id`,
    [season, competition, clubIds.get(home), clubIds.get(away)],
  );

  played = simulate(
    buildFixture(league as never, {
      yourSlug: home,
      opponentSlug: away,
      venue: 'home',
      approach: 'attacking',
      line: 'high',
      press: 'high',
      call: { kind: 'pressing', minute: 60, to: 'high' },
    }),
  );
  const match = await one(
    `insert into matches (fixture_id, career_id, season_id, seed, engine_version, home_score, away_score)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [
      fixture,
      career,
      season,
      played.seed,
      played.engineVersion,
      played.homeScore,
      played.awayScore,
    ],
  );

  ids = { competition, career, season, fixture, match, user };
  ids.playerA = playerIds.get(league.data[0]?.squad[0]?.slug as string) as string;
  ids.playerB = playerIds.get(league.data[0]?.squad[1]?.slug as string) as string;
  void baselineTactics;
});

describe('every enum in the schema agrees with the code it mirrors', () => {
  const labels = async (type: string): Promise<string[]> => {
    const rows = await db.query<{ label: string }>(
      `select unnest(enum_range(null::${type}))::text as label`,
    );
    return rows.rows.map((row) => row.label).sort();
  };

  it('names the same roles the content does', async () => {
    // This test exists because the first version of `role_code` was written from memory: it
    // invented four roles and omitted `touchline_winger`, and the very first insert of real
    // content rejected it. An enum nobody compares is an enum that has already drifted.
    expect(await labels('role_code')).toEqual([...roleSchema.options].sort());
  });

  it('names the same positions', async () => {
    expect(await labels('position_code')).toEqual([...positionSchema.options].sort());
  });

  it('names the same attributes, keeper attributes included', async () => {
    // `goalkeeping` is optional — only a keeper carries those values — so it arrives wrapped and
    // has to be unwrapped to read its keys. The attribute *names* exist either way, which is why
    // the enum carries them: a column that cannot name `reflexes` cannot store a keeper's history.
    const shapeOf = (schema: unknown): Record<string, unknown> => {
      const direct = (schema as { shape?: Record<string, unknown> }).shape;
      if (direct !== undefined) return direct;
      const inner = (schema as { unwrap: () => { shape: Record<string, unknown> } }).unwrap();
      return inner.shape;
    };
    const groups = playerSchema.shape;
    const named = [
      ...Object.keys(shapeOf(groups.technical)),
      ...Object.keys(shapeOf(groups.physical)),
      ...Object.keys(shapeOf(groups.mental)),
      ...Object.keys(shapeOf(groups.goalkeeping)),
    ];
    expect(await labels('attribute_code')).toEqual([...named].sort());
  });
});

describe('the database and the engine name the same causes', () => {
  it('has exactly the engine causes, spelled the same way', async () => {
    // A cause the engine emits but the schema refuses is a match that cannot be saved — and it
    // would fail at the worst moment, after the match was played.
    const rows = await db.query<{ label: string }>(
      `select unnest(enum_range(null::cause_tag))::text as label`,
    );
    expect([...rows.rows.map((row) => row.label)].sort()).toEqual([...ALL_CAUSES].sort());
  });

  it('has exactly the engine decision kinds', async () => {
    const rows = await db.query<{ label: string }>(
      `select unnest(enum_range(null::decision_kind))::text as label`,
    );
    expect([...rows.rows.map((row) => row.label)].sort()).toEqual([...ALL_DECISION_KINDS].sort());
  });
});

describe('a real trace survives as rows', () => {
  it('goes in and comes back out identical', async () => {
    // The box's claim, tested rather than asserted: first-class, not a log. If this were a JSON
    // blob the test would pass trivially and none of the queries below would be possible.
    expect(played.trace.swings.length).toBeGreaterThan(0);

    for (const swing of played.trace.swings) {
      await db.query(
        `insert into match_traces (match_id, minute, cause, delta_win_probability, favoured)
         values ($1, $2, $3, $4, $5)`,
        [ids.match, swing.minute, swing.cause, swing.deltaWinProbability, swing.favoured],
      );
    }
    played.trace.winProbabilityTimeline.forEach(() => undefined);
    for (const [minute, probability] of played.trace.winProbabilityTimeline.entries()) {
      await db.query(
        `insert into match_win_probability (match_id, minute, home_probability) values ($1, $2, $3)`,
        [ids.match, minute, probability],
      );
    }

    const swings = await db.query<{
      minute: number;
      cause: string;
      delta_win_probability: number;
      favoured: string;
    }>(
      `select minute, cause, delta_win_probability, favoured
         from match_traces where match_id = $1 order by minute asc, id asc`,
      [ids.match],
    );
    const timeline = await db.query<{ home_probability: number }>(
      `select home_probability from match_win_probability where match_id = $1 order by minute asc`,
      [ids.match],
    );

    const rebuilt = {
      swings: swings.rows.map((row) => ({
        minute: row.minute,
        cause: row.cause,
        deltaWinProbability: row.delta_win_probability,
        favoured: row.favoured,
      })),
      winProbabilityTimeline: timeline.rows.map((row) => row.home_probability),
    };
    expect(rebuilt.swings).toEqual(
      played.trace.swings.map((swing) => ({
        minute: swing.minute,
        cause: swing.cause,
        deltaWinProbability: swing.deltaWinProbability,
        favoured: swing.favoured,
      })),
    );
    expect(rebuilt.winProbabilityTimeline).toEqual([...played.trace.winProbabilityTimeline]);
  });

  it('answers a question a log could not', async () => {
    // The reason this is a table. "Which cause moved the odds most against me" is a query here and
    // an impossibility if the trace were a blob on the match row.
    const worst = await db.query<{ cause: string; total: number }>(
      `select cause, sum(delta_win_probability) as total
         from match_traces where match_id = $1
        group by cause order by total asc limit 1`,
      [ids.match],
    );
    expect(worst.rows).toHaveLength(1);
    expect(ALL_CAUSES).toContain(worst.rows[0]?.cause);
  });

  it('refuses a probability outside zero and one', async () => {
    // At a legal minute, so only the probability rule can be what refuses this. The first version
    // of this test used minute 200 as well, and passed while the probability check was deleted.
    expect(
      await fails(
        `insert into match_win_probability (match_id, minute, home_probability) values ($1, 119, 1.4)`,
        [ids.match],
      ),
    ).toMatch(/home_probability/);
  });

  it('refuses a minute outside a football match', async () => {
    expect(
      await fails(
        `insert into match_win_probability (match_id, minute, home_probability) values ($1, 200, 0.5)`,
        [ids.match],
      ),
    ).toMatch(/minute/);
  });

  it('refuses a trace moment with no match behind it', async () => {
    expect(
      await fails(
        `insert into match_traces (match_id, minute, cause, delta_win_probability, favoured)
         values (gen_random_uuid(), 10, 'RED_CARD', -0.1, 'home')`,
      ),
    ).toMatch(/foreign key|violates/i);
  });
});

describe('a decision is stored whole or not at all', () => {
  it('stores a dial change', async () => {
    await db.query(
      `insert into decisions (match_id, career_id, side, minute, kind, to_value)
       values ($1, $2, 'home', 60, 'pressing', 'high')`,
      [ids.match, ids.career],
    );
    const rows = await db.query<{ to_value: string }>(`select to_value from decisions`);
    expect(rows.rows[0]?.to_value).toBe('high');
  });

  it('refuses a substitution missing its players', async () => {
    // Half a substitution is a row nobody can read back into an `InMatchDecision`.
    expect(
      await fails(
        `insert into decisions (match_id, career_id, side, minute, kind, to_value)
         values ($1, $2, 'home', 70, 'substitution', 'x')`,
        [ids.match, ids.career],
      ),
    ).toMatch(/decision_shape_matches_its_kind/);
  });

  it('refuses a dial change carrying players', async () => {
    expect(
      await fails(
        `insert into decisions (match_id, career_id, side, minute, kind, to_value, player_off, player_on)
         values ($1, $2, 'home', 70, 'mentality', 'attacking', $3, $4)`,
        [ids.match, ids.career, ids.playerA, ids.playerB],
      ),
    ).toMatch(/decision_shape_matches_its_kind/);
  });

  it('accepts a whole substitution', async () => {
    await db.query(
      `insert into decisions (match_id, career_id, side, minute, kind, player_off, player_on, position, role)
       values ($1, $2, 'home', 75, 'substitution', $3, $4, 'ST', 'poacher')`,
      [ids.match, ids.career, ids.playerA, ids.playerB],
    );
    const rows = await db.query<{ n: number }>(
      `select count(*)::int as n from decisions where kind = 'substitution'`,
    );
    expect(rows.rows[0]?.n).toBe(1);
  });
});

describe('what a decision was worth is measured, not concluded', () => {
  it('stores the delta and its error, and no verdict', async () => {
    // Significance is a conclusion drawn from the delta and the error at a chosen threshold. A
    // stored conclusion drifts away from the numbers it came from, so there is no column for it.
    const columns = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_name = 'decision_valuations'`,
    );
    const names = columns.rows.map((row) => row.column_name);
    expect(names).toContain('points_stderr');
    expect(names).not.toContain('significant');
    expect(names).toContain('engine_version');
  });

  it('refuses a negative standard error', async () => {
    const decision = await db.query<{ id: string }>(`select id from decisions limit 1`);
    expect(
      await fails(
        `insert into decision_valuations (decision_id, runs, engine_version,
           points_delta, points_stderr, goals_for_delta, goals_for_stderr,
           goals_against_delta, goals_against_stderr)
         values ($1, 200, '0.0.0', -0.06, -0.12, 0, 0, 0, 0)`,
        [decision.rows[0]?.id],
      ),
    ).toMatch(/check|stderr/i);
  });
});

describe('history is history here too', () => {
  it('refuses to rewrite a trace moment or a decision', async () => {
    expect(await fails(`update match_traces set cause = 'RED_CARD'`)).toMatch(/append-only/);
    expect(await fails(`delete from match_traces`)).toMatch(/append-only/);
    expect(await fails(`update decisions set minute = 1`)).toMatch(/append-only/);
  });
});
