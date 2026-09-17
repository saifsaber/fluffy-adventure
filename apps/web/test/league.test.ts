import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DATA_ROOT, loadLeague } from '@dakka/content';
import { buildLeague } from '../src/data/league.js';

/**
 * The browser reads the same league as the server, or the client is playing a different game.
 *
 * `loadLeague` reads from disk with Node; `buildLeague` takes whatever a bundler found and runs it
 * through the same schema and the same `toClub`. The important claim is that the two produce an
 * identical league — not a similar one — because the moment they diverge, a match simulated on the
 * client stops being reproducible on the server and determinism buys nothing.
 */

const rawClubs = (): ReadonlyMap<string, unknown> => {
  const dir = join(DATA_ROOT, 'clubs', 'egy');
  return new Map(
    readdirSync(dir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => [
        file.replace(/\.json$/, ''),
        JSON.parse(readFileSync(join(dir, file), 'utf8')),
      ]),
  );
};

const rawLeague = (): unknown =>
  JSON.parse(readFileSync(join(DATA_ROOT, 'leagues', 'egy-d4.json'), 'utf8'));

const built = () => buildLeague(rawLeague(), rawClubs());

describe('the league in the browser', () => {
  it('is the same league the server loads, club for club and player for player', () => {
    expect(buildLeague(rawLeague(), rawClubs())).toEqual(loadLeague(DATA_ROOT, 'egy-d4'));
  });

  it('keeps the clubs in the order the league file names them', () => {
    const built = buildLeague(rawLeague(), rawClubs());
    expect(built.clubs.map((club) => club.slug)).toEqual(built.league.clubs);
  });

  it('refuses a league naming a club it has no data for, rather than skipping it', () => {
    // Silently dropping a club would produce a league that is short a team and looks fine.
    const clubs = new Map(rawClubs());
    clubs.delete(built().league.clubs[0] as string);
    expect(() => buildLeague(rawLeague(), clubs)).toThrow(/no data file/);
  });

  it('validates through the same schema, so a malformed file fails loudly', () => {
    const clubs = new Map(rawClubs());
    const first = built().league.clubs[0] as string;
    clubs.set(first, { ...(clubs.get(first) as object), reputation: 'very good' });
    expect(() => buildLeague(rawLeague(), clubs)).toThrow();
  });
});
