import Fastify, { type FastifyInstance } from 'fastify';
import { ENGINE_VERSION, simulate } from '@dakka/engine';
import { buildFixture, clubBySlug, type LeagueView } from '@dakka/fixture';
import type { Config } from './config.js';
import { ApiError, STATUS, type ErrorBody } from './errors.js';
import { matchRequestSchema, toSetup } from './request.js';

/**
 * The service.
 *
 * **Server-authoritative means the server builds the match, not that it checks one.** The client
 * sends what it decided; the fixture is assembled here from content this process loaded, by the
 * same `@dakka/fixture` code the client runs offline. That shared builder is what makes the
 * determinism claim structural: the two sides cannot drift, because there is only one of them.
 *
 * Built as a function returning an instance rather than a module that listens, so a test drives it
 * through `inject` with no socket, no port and no teardown to forget.
 */

export interface Deps {
  readonly config: Config;
  /** Loaded once by the caller. The server does no I/O of its own. */
  readonly league: LeagueView;
}

export function buildServer({ config, league }: Deps): FastifyInstance {
  const app = Fastify({ logger: { level: config.logLevel } });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      void reply.status(STATUS[error.code]).send(error.body());
      return;
    }
    // Anything unanticipated is logged in full and reported as nothing in particular. An internal
    // message on the wire is how a stack trace reaches a stranger.
    request.log.error({ err: error }, 'unhandled');
    const body: ErrorBody = { error: { code: 'internal', message: 'something went wrong here' } };
    void reply.status(STATUS.internal).send(body);
  });

  app.setNotFoundHandler((_request, reply) => {
    const body: ErrorBody = { error: { code: 'invalid_request', message: 'no such route' } };
    void reply.status(STATUS.invalid_request).send(body);
  });

  app.get('/health', async () => ({
    status: 'ok' as const,
    engineVersion: ENGINE_VERSION,
    league: league.league.slug,
    clubs: league.clubs.length,
  }));

  app.post('/match', async (request) => {
    const parsed = matchRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ApiError(
        'invalid_request',
        'the body is not a set of choices this endpoint accepts',
        parsed.error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`),
      );
    }

    if (parsed.data.league !== league.league.slug) {
      throw new ApiError('unknown_league', `this service resolves ${league.league.slug} only`);
    }

    for (const slug of [parsed.data.yourSlug, parsed.data.opponentSlug]) {
      try {
        clubBySlug(league, slug);
      } catch {
        throw new ApiError('unknown_club', `no club in ${league.league.slug} with slug ${slug}`);
      }
    }

    // The one line that matters: the fixture is built here, from our content, by the code the
    // client also runs. Nothing the client sent is used except the choices it is entitled to make.
    return simulate(buildFixture(league, toSetup(parsed.data)));
  });

  return app;
}
