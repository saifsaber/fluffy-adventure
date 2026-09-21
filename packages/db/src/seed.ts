import type { ClubData, LeagueData } from '@dakka/content';
import type { SqlClient } from './migrate.js';

/**
 * The content, into Postgres.
 *
 * Idempotent, because a seed is a command people re-run: clubs and players reconcile on their
 * natural key (`slug`, which the content schema already makes unique), and the attribute baseline
 * relies on a partial unique index rather than an UPDATE, since that table is append-only.
 *
 * **It seeds content and nothing else.** No user, no manager, no career. A season in this product
 * belongs to a career — the league only exists as something someone is playing through — so
 * creating one here would mean inventing a player nobody signed up as. What the seed leaves behind
 * is a competition whose season can be generated the moment a career starts.
 *
 * Takes a client rather than opening a connection, so the same function seeds a server and an
 * in-process database in a test, and the test is the thing that proves the command works.
 */

export interface SeedCounts {
  readonly competitions: number;
  readonly clubs: number;
  readonly players: number;
  readonly attributes: number;
  readonly entries: number;
}

/** The attribute groups as the content carries them. `goalkeeping` is absent for an outfielder. */
type Groups = Pick<ClubData['squad'][number], 'technical' | 'physical' | 'mental' | 'goalkeeping'>;

function attributesOf(player: Groups): ReadonlyArray<readonly [string, number]> {
  // Spelled exactly as the content spells them, because the database enum is the same list — a
  // test holds the two to each other, so a rename here fails loudly rather than silently dropping
  // an attribute on the floor.
  return [
    ...Object.entries(player.technical),
    ...Object.entries(player.physical),
    ...Object.entries(player.mental),
    ...Object.entries(player.goalkeeping ?? {}),
  ] as ReadonlyArray<readonly [string, number]>;
}

export async function seedLeague(
  client: SqlClient,
  league: LeagueData,
  clubs: readonly ClubData[],
): Promise<SeedCounts> {
  if (clubs.length !== league.clubs.length) {
    throw new Error(
      `league "${league.slug}" lists ${league.clubs.length} clubs but ${clubs.length} were supplied`,
    );
  }

  const competition = await client.query<{ id: string }>(
    `insert into competitions (slug, name, short_name, country, tier, round_robin,
       promotion_automatic, promotion_playoff, relegation_automatic,
       points_win, points_draw, points_loss, tie_break)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     on conflict (slug) do update set
       name = excluded.name, short_name = excluded.short_name, country = excluded.country,
       tier = excluded.tier, round_robin = excluded.round_robin,
       promotion_automatic = excluded.promotion_automatic,
       promotion_playoff = excluded.promotion_playoff,
       relegation_automatic = excluded.relegation_automatic,
       points_win = excluded.points_win, points_draw = excluded.points_draw,
       points_loss = excluded.points_loss, tie_break = excluded.tie_break
     returning id`,
    [
      league.slug,
      league.name,
      league.shortName,
      league.country,
      league.tier,
      league.roundRobin,
      league.promotion.automatic,
      league.promotion.playoff,
      league.relegation.automatic,
      league.points.win,
      league.points.draw,
      league.points.loss,
      `{${league.tieBreak.join(',')}}`,
    ],
  );
  const competitionId = competition.rows[0]?.id as string;

  let players = 0;
  let attributes = 0;

  for (const club of clubs) {
    const inserted = await client.query<{ id: string }>(
      `insert into clubs (slug, name, short_name, country, region, latitude, longitude, reputation,
         stadium_name, stadium_slug, stadium_capacity, pitch_quality, kit_primary, kit_secondary)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       on conflict (slug) do update set
         name = excluded.name, short_name = excluded.short_name, country = excluded.country,
         region = excluded.region, latitude = excluded.latitude, longitude = excluded.longitude,
         reputation = excluded.reputation, stadium_name = excluded.stadium_name,
         stadium_slug = excluded.stadium_slug, stadium_capacity = excluded.stadium_capacity,
         pitch_quality = excluded.pitch_quality, kit_primary = excluded.kit_primary,
         kit_secondary = excluded.kit_secondary
       returning id`,
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
    );
    const clubId = inserted.rows[0]?.id as string;

    await client.query(
      `insert into competition_entries (competition_id, club_id) values ($1, $2)
       on conflict do nothing`,
      [competitionId, clubId],
    );

    for (const player of club.squad) {
      const row = await client.query<{ id: string }>(
        `insert into players (club_id, slug, name, short_name, nickname, age, nationality,
           positions, preferred_roles)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         on conflict (slug) do update set
           club_id = excluded.club_id, name = excluded.name, short_name = excluded.short_name,
           nickname = excluded.nickname, age = excluded.age, nationality = excluded.nationality,
           positions = excluded.positions, preferred_roles = excluded.preferred_roles
         returning id`,
        [
          clubId,
          player.slug,
          player.name,
          player.shortName,
          player.nickname ?? null,
          player.age,
          player.nationality,
          `{${player.positions.join(',')}}`,
          `{${player.preferredRoles.join(',')}}`,
        ],
      );
      const playerId = row.rows[0]?.id as string;
      players++;

      for (const [attribute, value] of attributesOf(player)) {
        // `do nothing`, never `do update`: this table is append-only, and the baseline is the one
        // row per attribute that a career's history is measured against.
        const written = await client.query(
          `insert into player_attributes (player_id, career_id, attribute, value, source)
           values ($1, null, $2, $3, 'content')
           on conflict do nothing
           returning id`,
          [playerId, attribute, value],
        );
        attributes += written.rows.length;
      }
    }
  }

  const entries = await client.query<{ n: number }>(
    `select count(*)::int as n from competition_entries where competition_id = $1`,
    [competitionId],
  );

  return {
    competitions: 1,
    clubs: clubs.length,
    players,
    attributes,
    entries: entries.rows[0]?.n ?? 0,
  };
}
