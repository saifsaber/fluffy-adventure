import { simulate, type ClubId, type MatchResult } from '@dakka/engine';
import { buildMatch, type Setup } from './match.js';
import type { BoardBrief } from '@dakka/board';
import type { Career } from '@dakka/dashboard';
import { nextRound, record, startSeason, type Season } from '@dakka/season';
import { clubBySlug, type BrowserLeague } from './data/league.js';

/**
 * A career in the browser: one season, one club, and the matches that have actually been played.
 *
 * Nothing here is invented. The table is the season's own results, every one of which came out of
 * the engine — including the fifty-odd matches the manager was not at, which are **simulated**
 * rather than generated. That is the difference the whole product turns on: a league table filled
 * in by a plausible-looking random draw would look identical on screen and mean nothing.
 */

const idOf = (league: BrowserLeague, slug: string): ClubId => clubBySlug(league, slug).id;

function slugOf(league: BrowserLeague, id: ClubId): string {
  const club = league.clubs.find((entry) => entry.id === id);
  if (club === undefined) throw new Error(`no club in this league with id ${id}`);
  return club.slug;
}

/**
 * What the board asked for, read off the competition rather than assigned per club.
 *
 * The promotion places are a fact of the league file: a fourth-division board wants to go up, and
 * how many go up is data. What does *not* exist yet is a brief authored per club — a bottom side
 * asked for promotion is a harsh season, but the alternative today would be deriving an objective
 * from a squad rating, which is a number nobody wrote down pretending to be a decision somebody
 * made. When per-club briefs become content, they come from the file and this goes away.
 */
export function briefFrom(league: BrowserLeague): BoardBrief {
  return {
    objective: { kind: 'finish_at_or_above', position: league.league.promotion.automatic },
    patience: { kind: 'until_impossible' },
  };
}

export function startCareer(league: BrowserLeague, yourSlug: string): Career {
  return {
    season: startSeason(
      league.league,
      league.clubs.map((club) => club.id),
    ),
    club: idOf(league, yourSlug),
    brief: briefFrom(league),
    played: [],
    lastVisit: undefined,
  };
}

/** The fixture this manager is in, in the next round with anything left to play. */
export function yourNextFixture(career: Career) {
  return nextRound(career.season).find(
    (fixture) => fixture.home === career.club || fixture.away === career.club,
  );
}

/** The manager's choices for his next fixture, with the fixture's own facts filled in. */
export function setupFor(league: BrowserLeague, career: Career, dials: Dials): Setup | undefined {
  const fixture = yourNextFixture(career);
  if (fixture === undefined) return undefined;
  const atHome = fixture.home === career.club;
  return {
    yourSlug: slugOf(league, career.club),
    opponentSlug: slugOf(league, atHome ? fixture.away : fixture.home),
    // Not a choice. Where a fixture is played is decided by the calendar, and offering it as a
    // dial would be a control that does nothing — the costume a fake product wears.
    venue: atHome ? 'home' : 'away',
    ...dials,
  };
}

/** The three things a manager actually decides, kept apart from the facts of the fixture. */
export interface Dials {
  readonly approach: Setup['approach'];
  readonly line: Setup['line'];
  readonly press: Setup['press'];
  readonly call: Setup['call'];
}

export const OPENING_DIALS: Dials = {
  approach: 'balanced',
  line: 'normal',
  press: 'moderate',
  call: null,
};

function must(recorded: ReturnType<typeof record>): Season {
  if (!recorded.ok) throw new Error(recorded.problem);
  return recorded.season;
}

/**
 * Plays the rest of the round and records everything, the manager's own match included.
 *
 * The other nine fixtures are resolved by the same `simulate` with both sides on the neutral
 * baseline — the identical tactics the opponent already gets on the setup screen, and the reason
 * that screen says so out loud. Two clubs, one engine, one seed derived from the pairing: the rest
 * of the division plays a real match rather than being handed a plausible scoreline.
 *
 * The manager's own result is recorded from the ids the engine returned, so a screen that had the
 * venue the wrong way round is refused by `record` instead of quietly entering the table backwards.
 */
export function advance(
  league: BrowserLeague,
  career: Career,
  setup: Setup,
  result: MatchResult,
): Career {
  const round = nextRound(career.season);
  const mine = round.find(
    (fixture) => fixture.home === career.club || fixture.away === career.club,
  );
  if (mine === undefined) throw new Error('this club has no fixture in the next round');

  let season = must(
    record(career.season, {
      round: mine.round,
      home: result.homeClubId,
      away: result.awayClubId,
      homeGoals: result.homeScore,
      awayGoals: result.awayScore,
      seed: result.seed,
    }),
  );

  for (const fixture of round) {
    if (fixture === mine) continue;
    const played = simulate(
      buildMatch(league, {
        yourSlug: slugOf(league, fixture.home),
        opponentSlug: slugOf(league, fixture.away),
        venue: 'home',
        ...OPENING_DIALS,
      }),
    );
    season = must(
      record(season, {
        round: fixture.round,
        home: fixture.home,
        away: fixture.away,
        homeGoals: played.homeScore,
        awayGoals: played.awayScore,
        seed: played.seed,
      }),
    );
  }

  return {
    ...career,
    season,
    played: [
      ...career.played,
      {
        round: mine.round,
        seed: result.seed,
        side: setup.venue === 'home' ? 'home' : 'away',
        trace: result.trace,
      },
    ],
  };
}
