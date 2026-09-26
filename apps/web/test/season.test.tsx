// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DATA_ROOT, loadLeague } from '@dakka/content';
import { simulate, type ClubId } from '@dakka/engine';
import { roundsIn, standings, startSeason } from '@dakka/season';
import { App } from '../src/App.js';
import { LocaleProvider } from '../src/i18n/context.js';
import type { BrowserLeague } from '../src/data/league.js';
import { OPENING_DIALS, advance, setupFor, startCareer } from '../src/career.js';
import { buildMatch } from '../src/match.js';

/**
 * A whole season, played through the screens, once.
 *
 * `app.test.tsx` asks whether each screen is right about the state it is handed. This file asks the
 * question no per-screen test can: whether the **loop** is right — whether playing a match and
 * recording it leaves the product in a state the next match can be played from, thirty-eight times,
 * and whether the thing that comes out the far end is the season the model says it is.
 *
 * The three seams that only exist here:
 *
 * 1. **The loop closes.** A screen that renders correctly can still be part of a career that never
 *    ends, or one that ends four rounds early because something stopped advancing. The calendar
 *    says how many rounds there are; the walk has to consume exactly that many and then stop.
 * 2. **The React layer adds nothing.** Every match is replayed headlessly through the same
 *    functions with the same choices, and the two seasons are compared whole — seeds and
 *    scorelines, in order. **What this reaches is the client's state, not the model:** the mirror
 *    calls the same `setupFor`/`advance`/`buildMatch`, so a bug inside those is invisible to it and
 *    belongs to their own packages' tests. What it does reach is everything React owns — stale
 *    memo dependencies, a reset that did not happen, a handler wired to the wrong value — which is
 *    exactly the layer no other test in this repo drives for more than one round.
 * 3. **A decision does not outlive its match.** The dials reset between rounds. Nothing else tests
 *    that, and the failure would be silent: a call the manager made in August quietly still being
 *    made in April, in a match he never made it in.
 */

const league = loadLeague(DATA_ROOT, 'egy-d4') as BrowserLeague;

/**
 * Read from the league rather than written down.
 *
 * `38` is a fact about a twenty-club double round-robin, not about this product. A test that hard
 * codes it passes for the wrong reason the day somebody adds a competition, which is the whole
 * point of a league being data.
 */
const ROUNDS = roundsIn(
  startSeason(
    league.league,
    league.clubs.map((club) => club.id),
  ),
);

const nameOf = (id: ClubId): string => {
  const club = league.clubs.find((entry) => entry.id === id);
  if (club === undefined) throw new Error(`no club in this league with id ${id}`);
  return club.shortName;
};

const TAKE = 'Take the job';
const SET_UP = 'Set up the match';
const PLAY = 'Play the match';
const SKIP = 'Take me to full time';
const RECORD = 'Record it and carry on';

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const offered = () => screen.queryByRole('button', { name: SET_UP }) !== null;

/** One match, as the two screens that report it describe it. */
interface Watched {
  readonly seed: string;
  readonly home: readonly [string, number];
  readonly away: readonly [string, number];
}

/**
 * Reads the full-time panel.
 *
 * Deliberately read as name-and-number pairs rather than as a `2-1` string: the panel is built the
 * way it is because a bare scoreline reverses against the club names when `dir` flips, and a test
 * that reassembled the two numbers into one string would be unable to see that bug.
 */
function watched(): Watched {
  const panel = screen.getByText('Full time').closest('section');
  if (panel === null) throw new Error('the full-time panel has no section around it');
  const [home, away] = [...panel.querySelectorAll('.row')].map((row): readonly [string, number] => [
    row.querySelector('span')?.textContent ?? '',
    Number(row.querySelector('.num')?.textContent),
  ]);
  if (home === undefined || away === undefined) throw new Error('full time without two rows');

  const seedPanel = screen.getByText('Seed').closest('section');
  const seed = seedPanel?.querySelector('.tech')?.textContent;
  if (seed === undefined || seed === null) throw new Error('a result with no seed on it');
  return { seed, home, away };
}

/** Plays rounds through the screens until the product stops offering one. */
function playUntilItStops(): readonly Watched[] {
  render(
    <LocaleProvider initial="en">
      <App league={league} />
    </LocaleProvider>,
  );
  click(TAKE);

  const season: Watched[] = [];
  while (offered()) {
    click(SET_UP);
    click(PLAY);
    click(SKIP);
    season.push(watched());
    click(RECORD);
    // Without this the test hangs rather than failing, and a hang says nothing about what broke.
    if (season.length > ROUNDS) throw new Error(`still being offered a match after ${ROUNDS}`);
  }
  return season;
}

/**
 * The same season, driven straight through the functions the screens call.
 *
 * Pure, so it is computed once and shared: two tests need the same mirror and it costs a couple of
 * seconds to build.
 */
let mirror: ReturnType<typeof runHeadless> | undefined;
const playHeadless = () => (mirror ??= runHeadless());

function runHeadless() {
  let career = startCareer(league, league.clubs[0]?.slug ?? '');
  const season: Watched[] = [];
  for (;;) {
    const setup = setupFor(league, career, OPENING_DIALS);
    if (setup === undefined) break;
    const result = simulate(buildMatch(league, setup, true));
    season.push({
      seed: result.seed,
      home: [nameOf(result.homeClubId), result.homeScore],
      away: [nameOf(result.awayClubId), result.awayScore],
    });
    career = advance(league, career, setup, result);
  }
  return { season, career };
}

const factNamed = (label: string): string | undefined =>
  screen.getByText(label).closest('.row')?.querySelector('.num')?.textContent ?? undefined;

const drawnTiles = (): readonly string[] =>
  [...document.querySelectorAll('[data-tile]')].map((node) => node.getAttribute('data-tile') ?? '');

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.dir = '';
});

describe('a season, played through the screens', () => {
  it('plays every round the calendar has, and is the season the model says it is', () => {
    const onScreen = playUntilItStops();
    const { season: inTheModel } = playHeadless();

    // The loop consumed the calendar exactly: not one short, and it did not keep going.
    expect(onScreen).toHaveLength(ROUNDS);

    // The headline. Same seeds in the same order means the screens fed the engine exactly what
    // the model would have, every round; same scorelines means they then showed what came back.
    expect(onScreen).toEqual(inTheModel);

    // And every match was a different match.
    // Not redundant, and a probe proved it: making `seedOf` return a constant leaves the two
    // seasons *equal* — both equally wrong — so the line above passes and only this one fails.
    // A comparison cannot see a fault its two sides share.
    expect(new Set(onScreen.map((match) => match.seed)).size).toBe(ROUNDS);
  }, 120_000);

  it('ends by withdrawing the offer, on a screen that still has a season on it', () => {
    playUntilItStops();
    const { career } = playHeadless();

    // No fixture left, so no action. A disabled red block is still a red block (DESIGN.md §7),
    // and a blank screen would be worse than either.
    expect(offered()).toBe(false);
    const tiles = drawnTiles();
    expect(tiles).not.toContain('decision');
    expect(tiles.length).toBeGreaterThan(0);

    // The last screen states a finished season, and the numbers on it are the model's.
    const mine = standings(career.season).find((row) => row.club === career.club);
    if (mine === undefined) throw new Error('the final table has no row for this club');
    expect(factNamed('Matches left')).toBe('0');
    expect(factNamed('You are')).toBe(String(mine.position));
  }, 120_000);

  it('does not carry a call from one match into the next', () => {
    render(
      <LocaleProvider initial="en">
        <App league={league} />
      </LocaleProvider>,
    );
    click(TAKE);

    click(SET_UP);
    const calls = screen.getByRole('group', { name: 'One call in the match' });
    fireEvent.click(within(calls).getByRole('button', { name: 'Approach' }));
    // A call has a minute the moment it has a kind, so the shape is never half-built.
    expect(screen.queryByText('Minute')).not.toBeNull();
    click(PLAY);
    click(SKIP);
    expect(screen.queryByText(/nothing to take out/)).toBeNull();
    click(RECORD);

    // Next match, same manager, no call — unless something kept it.
    click(SET_UP);
    expect(screen.queryByText('Minute')).toBeNull();
    click(PLAY);
    click(SKIP);
    expect(screen.getByText(/nothing to take out/)).toBeTruthy();
  }, 60_000);
});
