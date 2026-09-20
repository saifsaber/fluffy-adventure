import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { InjectOptions, Response as InjectResponse } from 'light-my-request';
import { DATA_ROOT, loadLeague } from '@dakka/content';
import { ENGINE_VERSION, simulate } from '@dakka/engine';
import { buildFixture, buildLeague, seedOf, type Setup } from '@dakka/fixture';
import { buildServer } from '../src/server.js';
import { readConfig } from '../src/config.js';
import type { ErrorBody } from '../src/errors.js';

/**
 * The service, and the one property it exists to have.
 *
 * Server-authoritative resolution is worth nothing if the server and the client disagree about
 * what the match was. The test that matters below plays the same fixture twice — once through the
 * browser's assembly path and once through the service, over HTTP — and requires the two results
 * to be identical after a JSON round trip. That catches the three ways this breaks in practice:
 * two copies of the fixture logic drifting, two loaders producing different content, and floating
 * point surviving serialisation differently than it survives memory.
 */

const config = readConfig({ LEAGUE: 'egy-d4', LOG_LEVEL: 'silent' });
const loaded = loadLeague(DATA_ROOT, config.league);
const league = { league: loaded.league, clubs: loaded.clubs, data: loaded.data };
const app = buildServer({ config, league });

/** The same files, assembled the way the browser assembles them — a different path to the same league. */
function leagueAsTheClientBuildsIt() {
  const clubDir = join(DATA_ROOT, 'clubs', 'egy');
  const raw = new Map<string, unknown>(
    readdirSync(clubDir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => [
        file.slice(0, -'.json'.length),
        JSON.parse(readFileSync(join(clubDir, file), 'utf8')) as unknown,
      ]),
  );
  const leagueFile = JSON.parse(
    readFileSync(join(DATA_ROOT, 'leagues', `${config.league}.json`), 'utf8'),
  ) as unknown;
  return buildLeague(leagueFile, raw);
}

const CHOICES = {
  league: 'egy-d4',
  yourSlug: 'matoubas-sporting',
  opponentSlug: 'ashmoun-youth',
  venue: 'home' as const,
  approach: 'attacking' as const,
  line: 'high' as const,
  press: 'moderate' as const,
  call: { kind: 'pressing' as const, minute: 62, to: 'high' as const },
};

const setup: Setup = {
  yourSlug: CHOICES.yourSlug,
  opponentSlug: CHOICES.opponentSlug,
  venue: CHOICES.venue,
  approach: CHOICES.approach,
  line: CHOICES.line,
  press: CHOICES.press,
  call: CHOICES.call,
};

/**
 * `inject` is overloaded — callback, promise, and chainable — and TypeScript resolves the bare
 * call to an intersection of all three, which has none of the response's own properties. Naming
 * the response type is what makes these tests read as tests rather than as casts.
 */
const send = (opts: InjectOptions): Promise<InjectResponse> =>
  app.inject(opts) as Promise<InjectResponse>;

// `unknown` on purpose: several tests send bodies this endpoint must refuse, and a signature
// that only accepted valid ones would make those tests unwritable.
const post = (body: unknown): Promise<InjectResponse> =>
  send({ method: 'POST', url: '/match', payload: body as object });

describe('the service is up and says what it is', () => {
  it('reports the engine it will resolve with', async () => {
    const response = await send({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      engineVersion: ENGINE_VERSION,
      league: 'egy-d4',
      clubs: 20,
    });
  });
});

describe('the same seed resolves identically on client and server', () => {
  it('produces the same match, byte for byte, through two loaders and a JSON round trip', async () => {
    const clientResult = simulate(buildFixture(leagueAsTheClientBuildsIt(), setup));
    const response = await post(CHOICES);

    expect(response.statusCode).toBe(200);
    // Compared as JSON on both sides: the client's result has to survive serialisation too, and a
    // float that renders differently is a different match to anyone reading the wire.
    expect(response.payload).toBe(JSON.stringify(clientResult));
  });

  it('answers the same way twice, because nothing here reads a clock', async () => {
    const first = await post(CHOICES);
    const second = await post(CHOICES);
    expect(first.payload).toBe(second.payload);
  });

  it('returns the seed the choices derive, so any answer can be replayed', async () => {
    const response = await post(CHOICES);
    expect(response.json<{ seed: string }>().seed).toBe(seedOf(setup));
  });

  it('resolves a different call to a different match', async () => {
    // If the call made no difference the determinism above would be trivially true.
    const other = await post({ ...CHOICES, call: { ...CHOICES.call, minute: 20 } });
    const base = await post(CHOICES);
    expect(other.payload).not.toBe(base.payload);
  });
});

describe('choices cross the line, capabilities never do', () => {
  const refusal = async (body: unknown, expected: string) => {
    const response = await post(body);
    expect(response.statusCode).toBe(400);
    const { error } = response.json<ErrorBody>();
    expect(error.code).toBe('invalid_request');
    expect(error.details?.join(' ')).toContain(expected);
  };

  it('refuses a body carrying a squad', async () => {
    // The whole point of the boundary. Accepted-and-ignored would read, to whoever wrote the
    // client, as though sending an eleven did something.
    await refusal({ ...CHOICES, squad: [{ name: 'x', technical: { finishing: 99 } }] }, 'squad');
  });

  it('refuses a body carrying an attribute of any kind', async () => {
    await refusal({ ...CHOICES, reputation: 99 }, 'reputation');
  });

  it('refuses a whole club object in place of a slug', async () => {
    const response = await post({
      ...CHOICES,
      yourSlug: { slug: 'matoubas-sporting', reputation: 99 },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<ErrorBody>().error.code).toBe('invalid_request');
  });

  it('refuses a dial set to a value from a different dial', async () => {
    // `high` is a real pressing intensity and a real line height. The pairing is what is checked.
    await refusal({ ...CHOICES, call: { kind: 'mentality', minute: 30, to: 'high' } }, 'call.to');
  });

  it('refuses a club playing itself', async () => {
    await refusal({ ...CHOICES, opponentSlug: CHOICES.yourSlug }, 'cannot play itself');
  });

  it('refuses a call outside the ninety minutes', async () => {
    await refusal({ ...CHOICES, call: { ...CHOICES.call, minute: 0 } }, 'call.minute');
  });
});

describe('every failure leaves in the same shape', () => {
  it('names a league this service does not resolve', async () => {
    const response = await post({ ...CHOICES, league: 'eng-pl' });
    expect(response.statusCode).toBe(404);
    expect(response.json<ErrorBody>().error.code).toBe('unknown_league');
  });

  it('names a club the league does not contain', async () => {
    const response = await post({ ...CHOICES, opponentSlug: 'real-madrid' });
    expect(response.statusCode).toBe(422);
    expect(response.json<ErrorBody>().error.code).toBe('unknown_club');
  });

  it('answers an unknown route in the same envelope, not in HTML', async () => {
    const response = await send({ method: 'GET', url: '/nope' });
    expect(response.statusCode).toBe(400);
    expect(response.json<ErrorBody>().error.code).toBe('invalid_request');
  });

  it('never puts internal detail on the wire', async () => {
    const response = await post('not json at all');
    const body = response.payload;
    expect(body).not.toMatch(/at Object|node_modules|\/home\//);
  });
});

describe('configuration', () => {
  it('has usable defaults and no secrets', () => {
    const config = readConfig({});
    expect(config.port).toBe(8787);
    expect(config.host).toBe('127.0.0.1');
    expect(config.league).toBe('egy-d4');
  });

  it('refuses to start on a value it cannot use, rather than falling back', () => {
    // A service that boots with half its configuration missing fails later, somewhere less obvious.
    expect(() => readConfig({ PORT: 'eight thousand' })).toThrow(/PORT/);
    expect(() => readConfig({ LOG_LEVEL: 'chatty' })).toThrow(/LOG_LEVEL/);
    expect(() => readConfig({ PORT: '99999' })).toThrow(/PORT/);
  });
});
