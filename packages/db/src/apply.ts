import { ENGINE_VERSION, simulate } from '@dakka/engine';
import { buildFixture, type LeagueView } from '@dakka/fixture';
import type { Applied, Intent } from '@dakka/sync';
import type { SqlClient } from './migrate.js';

/**
 * The server taking a client's intents.
 *
 * **It replays; it does not accept.** An intent carries the choices a manager made, and the server
 * runs them through the same deterministic engine and keeps its own result. The client's
 * `predicted` score is compared and then discarded — so there is no version to choose between, and
 * "last write wins" never becomes a question anyone has to answer.
 *
 * Three outcomes and no fourth. **Applied**: replayed and stored. **Already**: this id has been
 * seen, so a retry after a lost acknowledgement costs nothing and plays nothing twice. **Diverged**:
 * the replay disagreed with the client. That last one is not a conflict to merge — with a
 * deterministic engine it can only mean the two sides ran different engine versions or different
 * content, which is a bug that wants a person, so the server keeps its own answer and says so.
 */

export interface ApplyDeps {
  readonly client: SqlClient;
  readonly league: LeagueView;
  /** The career row these intents belong to, resolved by the caller from the session. */
  readonly careerId: string;
  readonly seasonId: string;
}

const scoreline = (home: number, away: number, seed: string): string => `${home}-${away}@${seed}`;

async function alreadyApplied(client: SqlClient, id: string): Promise<boolean> {
  const rows = await client.query<{ id: string }>(`select id from applied_intents where id = $1`, [
    id,
  ]);
  return rows.rows.length > 0;
}

export async function applyIntent(deps: ApplyDeps, intent: Intent): Promise<Applied> {
  const { client, league, careerId, seasonId } = deps;

  if (await alreadyApplied(client, intent.id)) return { id: intent.id, outcome: 'already' };

  if (intent.kind === 'career_started') {
    // The career already exists — it is created when the session starts one. Recording the intent
    // is what makes re-sending it harmless.
    await client.query(`insert into applied_intents (id, career_id, kind) values ($1, $2, $3)`, [
      intent.id,
      careerId,
      intent.kind,
    ]);
    return { id: intent.id, outcome: 'applied' };
  }

  if (intent.engineVersion !== ENGINE_VERSION) {
    // Refused rather than diverged: replaying under a different engine would produce a different
    // match and storing it would silently rewrite what the player saw. It stays queued until the
    // client updates, which is the honest outcome of an engine that moved underneath somebody.
    return {
      id: intent.id,
      outcome: 'rejected',
      reason: `played on engine ${intent.engineVersion}, this server runs ${ENGINE_VERSION}`,
    };
  }

  let result;
  try {
    result = simulate(buildFixture(league, intent.choices));
  } catch (error) {
    return { id: intent.id, outcome: 'rejected', reason: (error as Error).message };
  }

  const homeSlug =
    intent.choices.venue === 'home' ? intent.choices.yourSlug : intent.choices.opponentSlug;
  const awaySlug =
    intent.choices.venue === 'home' ? intent.choices.opponentSlug : intent.choices.yourSlug;

  const fixture = await client.query<{ id: string }>(
    `insert into fixtures (season_id, competition_id, round, home_club_id, away_club_id, status)
     select $1, s.competition_id, $2,
            (select id from clubs where slug = $3), (select id from clubs where slug = $4), 'played'
       from seasons s where s.id = $1
     returning id`,
    [seasonId, intent.round, homeSlug, awaySlug],
  );
  const fixtureId = fixture.rows[0]?.id as string;

  const match = await client.query<{ id: string }>(
    `insert into matches (fixture_id, career_id, season_id, seed, engine_version,
       home_score, away_score)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [
      fixtureId,
      careerId,
      seasonId,
      result.seed,
      result.engineVersion,
      result.homeScore,
      result.awayScore,
    ],
  );
  const matchId = match.rows[0]?.id as string;

  for (const swing of result.trace.swings) {
    await client.query(
      `insert into match_traces (match_id, minute, cause, delta_win_probability, favoured)
       values ($1, $2, $3, $4, $5)`,
      [matchId, swing.minute, swing.cause, swing.deltaWinProbability, swing.favoured],
    );
  }
  for (const [minute, probability] of result.trace.winProbabilityTimeline.entries()) {
    await client.query(
      `insert into match_win_probability (match_id, minute, home_probability) values ($1, $2, $3)`,
      [matchId, minute, probability],
    );
  }
  if (intent.choices.call !== null) {
    const call = intent.choices.call;
    await client.query(
      `insert into decisions (match_id, career_id, side, minute, kind, to_value)
       values ($1, $2, $3, $4, $5, $6)`,
      [matchId, careerId, intent.choices.venue, call.minute, call.kind, call.to],
    );
  }

  await client.query(`insert into applied_intents (id, career_id, kind) values ($1, $2, $3)`, [
    intent.id,
    careerId,
    intent.kind,
  ]);

  const derived = scoreline(result.homeScore, result.awayScore, result.seed);
  const predicted = scoreline(
    intent.predicted.homeScore,
    intent.predicted.awayScore,
    intent.predicted.seed,
  );
  // Stored either way. The server's answer is the record; the divergence is the report.
  return derived === predicted
    ? { id: intent.id, outcome: 'applied' }
    : { id: intent.id, outcome: 'diverged', predicted, derived };
}

/** Applies a batch in the order the client queued it. */
export async function applyIntents(
  deps: ApplyDeps,
  intents: readonly Intent[],
): Promise<readonly Applied[]> {
  const results: Applied[] = [];
  for (const intent of intents) results.push(await applyIntent(deps, intent));
  return results;
}
