import type { ClubId } from '@dakka/engine';
import type { LeagueData } from './schema.js';

/**
 * Schedule generation.
 *
 * Everything about the shape of the season comes from the league file: how many clubs, and how many
 * times each pair meets. Nothing here knows about Egypt, and nothing here knows the number 38 —
 * that falls out of `(clubs - 1) × roundRobin`. Adding a country with a single round-robin, or with
 * four meetings, needs no change to this file. See docs/decisions/ADR-002 §2.
 */

export interface Fixture {
  readonly round: number;
  readonly home: ClubId;
  readonly away: ClubId;
}

/**
 * Round-robin by the circle method: pin one club, rotate the rest.
 *
 * With an odd number of clubs a `null` bye is added, and the club drawn against it simply does not
 * play that round — which is the correct behaviour, not an error to guard against.
 *
 * Home and away alternate by round parity so no club is handed a long run of either. Real leagues
 * balance this more carefully; this is honest about being a simple, even split rather than
 * pretending to a sophistication it does not have.
 */
export function roundRobinRounds<T>(entries: readonly T[]): readonly (readonly [T, T])[][] {
  const field: (T | null)[] = [...entries];
  if (field.length % 2 === 1) field.push(null);

  const half = field.length / 2;
  const rotating = field.slice(1);
  const rounds: (readonly [T, T])[][] = [];

  for (let round = 0; round < field.length - 1; round++) {
    const lineup = [field[0], ...rotating];
    const pairs: (readonly [T, T])[] = [];

    for (let i = 0; i < half; i++) {
      const a = lineup[i];
      const b = lineup[lineup.length - 1 - i];
      if (a === null || a === undefined || b === null || b === undefined) continue; // the bye
      // Alternate which side is listed first, so home and away spread across the season.
      pairs.push(round % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    rotating.unshift(rotating.pop() as T);
  }
  return rounds;
}

/**
 * The full season schedule for a league.
 *
 * On the second and later meetings the fixture is reversed, so a two-leg season gives every pair
 * one match at each ground.
 */
export function generateFixtures(
  league: LeagueData,
  clubIds: readonly ClubId[],
): readonly Fixture[] {
  if (clubIds.length !== league.clubs.length) {
    throw new Error(
      `league "${league.slug}" lists ${league.clubs.length} clubs but ${clubIds.length} were supplied`,
    );
  }

  const base = roundRobinRounds(clubIds);
  const fixtures: Fixture[] = [];

  for (let leg = 0; leg < league.roundRobin; leg++) {
    base.forEach((pairs, index) => {
      const round = leg * base.length + index + 1;
      for (const [a, b] of pairs) {
        const [home, away] = leg % 2 === 0 ? [a, b] : [b, a];
        fixtures.push({ round, home, away });
      }
    });
  }
  return fixtures;
}

/** How many rounds this league's season runs to. Derived, never a constant. */
export function roundsInSeason(league: LeagueData): number {
  const clubs = league.clubs.length;
  const perLeg = clubs % 2 === 0 ? clubs - 1 : clubs;
  return perLeg * league.roundRobin;
}
