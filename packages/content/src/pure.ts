import { clubId, playerId, type Club, type Player } from '@dakka/engine';
import type { ClubData } from './schema.js';

export { clubSchema, leagueSchema, playerSchema } from './schema.js';

/**
 * Validation and data-to-domain transforms, with no I/O of any kind.
 *
 * `load.ts` reads files; this module turns what was read into engine types. The split exists so the
 * browser can import the league through exactly the same schema and the same `toClub` as the
 * harness and the API, instead of a generated bundle that would quietly become a second source of
 * truth. Keeping "a league is data, not code" true on the client is worth one file boundary.
 */

export class ContentError extends Error {
  constructor(
    public readonly file: string,
    message: string,
  ) {
    super(`${file}: ${message}`);
    this.name = 'ContentError';
  }
}

/** Turns a Zod failure into something a community contributor can actually act on. */
export function parseOrThrow<T>(
  schema: {
    safeParse: (v: unknown) =>
      | { success: true; data: T }
      | {
          success: false;
          error: { issues: readonly { path: readonly (string | number)[]; message: string }[] };
        };
  },
  raw: unknown,
  file: string,
): T {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  const details = result.error.issues
    .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  throw new ContentError(file, `failed validation\n${details}`);
}

function toPlayer(data: ClubData['squad'][number], club: ClubData): Player {
  const [first, ...rest] = data.positions;
  /* c8 ignore next */
  if (first === undefined)
    throw new ContentError(club.slug, `player ${data.slug} has no positions`);
  return {
    id: playerId(`${club.slug}:${data.slug}`),
    clubId: club.slug,
    name: data.name,
    shortName: data.shortName,
    slug: data.slug,
    age: data.age,
    nationality: data.nationality,
    positions: [first, ...rest],
    preferredRoles: data.preferredRoles,
    attributes: {
      technical: data.technical,
      physical: data.physical,
      mental: data.mental,
      ...(data.goalkeeping ? { goalkeeping: data.goalkeeping } : {}),
    },
    // Everyone starts a season fresh; condition is match state, not content.
    condition: { fitness: 100, morale: 75, form: 70 },
    ...(data.nickname ? { nickname: data.nickname } : {}),
  };
}

export function toClub(data: ClubData): Club {
  return {
    id: clubId(data.slug),
    name: data.name,
    shortName: data.shortName,
    slug: data.slug,
    country: data.country,
    region: data.region,
    reputation: data.reputation,
    stadium: data.stadium,
    squad: data.squad.map((player) => toPlayer(player, data)),
  };
}
