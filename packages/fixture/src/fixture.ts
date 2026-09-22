import { estimatedRoadKm } from '@dakka/content/travel';
import {
  baselineManager,
  baselineTactics,
  competitionId,
  matchId,
  type InMatchDecision,
  type LineHeight,
  type MatchInput,
  type Mentality,
  type PressingIntensity,
  type Side,
} from '@dakka/engine';
import { clubBySlug, dataBySlug, type LeagueView } from './league.js';

/**
 * Turning a manager's choices into a fixture the engine can resolve.
 *
 * This package exists because **the server must not take a `MatchInput` from a client.** A
 * `MatchInput` carries squads and attributes; accepting one over the wire lets the client field an
 * eleven it invented. What a client may send is what it is entitled to decide — which clubs, where,
 * and which way the three dials point — and the server builds the fixture from its own copy of the
 * content. The same distinction the AI boundary makes with effects: choices cross the line,
 * capabilities never do.
 *
 * It is shared rather than duplicated for the other half of the same guarantee. The client plays
 * offline and the server is authoritative; if they built fixtures from two copies of this logic,
 * "same seed, same match" would hold until the day one copy changed.
 */

/**
 * The three dials this screen offers, as subsets of the engine's own unions.
 *
 * Narrower than the engine on purpose: `ultra_defensive`, `very_high` and `gegenpress` are real
 * settings that the thin UI has no room to explain, and an unexplained extreme is a dial the player
 * turns without knowing what it costs. They are not removed from the engine, only from this screen.
 */
export type Approach = Extract<Mentality, 'defensive' | 'balanced' | 'attacking'>;
export type Line = Extract<LineHeight, 'deep' | 'normal' | 'high'>;
export type Press = Extract<PressingIntensity, 'contain' | 'moderate' | 'high'>;

export const APPROACHES: readonly Approach[] = ['defensive', 'balanced', 'attacking'];
export const LINES: readonly Line[] = ['deep', 'normal', 'high'];
export const PRESSES: readonly Press[] = ['contain', 'moderate', 'high'];

/** One change made after kickoff. The thing the counterfactual takes back out. */
export type Call = Extract<InMatchDecision, { kind: 'mentality' | 'line_height' | 'pressing' }>;

export interface Setup {
  readonly yourSlug: string;
  readonly opponentSlug: string;
  readonly venue: 'home' | 'away';
  readonly approach: Approach;
  readonly line: Line;
  readonly press: Press;
  readonly call: Call | null;
}

export const yourSide = (setup: Setup): Side => (setup.venue === 'home' ? 'home' : 'away');

/**
 * The seed, derived from the choices rather than from a clock.
 *
 * This is determinism made visible: the same fixture with the same tactics is the same match, every
 * time, on any machine. That is not a convenience — it is the property the counterfactual, the
 * daily challenge and honest PvP all rest on, so the screen shows the seed rather than hiding it.
 */
export function seedOf(setup: Setup): string {
  const home = setup.venue === 'home' ? setup.yourSlug : setup.opponentSlug;
  const away = setup.venue === 'home' ? setup.opponentSlug : setup.yourSlug;
  const call =
    setup.call === null ? 'none' : `${setup.call.kind}@${setup.call.minute}=${setup.call.to}`;
  return `${home}-v-${away}/${setup.approach}/${setup.line}/${setup.press}/${call}`;
}

/**
 * Builds the fixture both arms of the counterfactual share.
 *
 * `withCall` is the only difference between the match as played and the match as it would have gone
 * without the decision — same squads, same seed, same context, same opponent instructions.
 */
export function buildFixture(
  league: LeagueView,
  setup: Setup,
  withCall: boolean = true,
): MatchInput {
  const homeSlug = setup.venue === 'home' ? setup.yourSlug : setup.opponentSlug;
  const awaySlug = setup.venue === 'home' ? setup.opponentSlug : setup.yourSlug;
  const homeClub = clubBySlug(league, homeSlug);
  const homeData = dataBySlug(league, homeSlug);
  const awayData = dataBySlug(league, awaySlug);

  const yours = {
    ...baselineTactics(clubBySlug(league, setup.yourSlug).squad),
    mentality: setup.approach,
    lineHeight: setup.line,
    pressingIntensity: setup.press,
  };
  // The opponent sets up on the neutral baseline and then **manages**: `baselineManager` is asked
  // once a minute and answers through the same `InMatchDecision` union the player does. He is
  // attached here, server-side, and never travels — a manager is a capability, and capabilities do
  // not cross the wire.
  const theirs = baselineTactics(clubBySlug(league, setup.opponentSlug).squad);
  const decisions: readonly InMatchDecision[] = withCall && setup.call !== null ? [setup.call] : [];

  const you = { club: clubBySlug(league, setup.yourSlug), tactics: yours, decisions };
  const them = {
    club: clubBySlug(league, setup.opponentSlug),
    tactics: theirs,
    decisions: [],
    manager: baselineManager,
  };

  return {
    id: matchId(seedOf(setup)),
    seed: seedOf(setup),
    home: setup.venue === 'home' ? you : them,
    away: setup.venue === 'home' ? them : you,
    context: {
      competitionId: competitionId(league.league.slug),
      // Real distance between the two clubs' towns, from their data files.
      awayTravelKm: Math.round(estimatedRoadKm(homeData.location, awayData.location)),
      // A full ground. Attendance is an input to the match, not a statistic derived from it, and a
      // one-off fixture has no season behind it to model a crowd from.
      attendance: homeClub.stadium.capacity,
      isDerby: homeData.region === awayData.region,
    },
  };
}
