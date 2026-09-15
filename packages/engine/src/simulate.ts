import { createRng } from './rng.js';
import {
  simulateChain,
  type ChainEvent,
  type ChainSide,
  type ShotContext,
  type Side,
} from './chain.js';
import { indexSquad } from './space.js';
import { crowdIntensity, pitchUnfamiliarity } from './condition.js';
import { isOnTarget, resolveShot } from './xg.js';
import { ENGINE_VERSION } from './version.js';
import type { PlayerId } from './types/ids.js';
import type { Player, PlayerCondition } from './types/player.js';
import type {
  MatchEvent,
  MatchInput,
  MatchResult,
  MatchSide,
  PlayerMatchOutcome,
  Shot,
  SideStats,
} from './types/match.js';
import type { MatchTrace } from './types/trace.js';

/**
 * `simulate(input) → MatchResult`. The whole engine, assembled.
 *
 * Nothing here decides anything. Every number it returns was produced somewhere else and is being
 * collected: possessions and shot contexts by the chain, xG by a curve that cannot see the shooter,
 * outcomes by a resolver that cannot see the future. This file counts what happened and writes it
 * down, which is why it is short and why there is nowhere in it to invent a statistic.
 *
 * The one thing it adds is the **score**, which no earlier stage was allowed to know. Shots are
 * resolved the instant they are struck, so the running score reaches the chain in time to change
 * what happens next — a side a goal down in the last ten minutes throws bodies forward, and gets
 * caught on the break for it. What the score never does is reach backwards: a shot's context is
 * frozen before it is resolved, so no chance is ever shaped by its own outcome.
 */

const MINUTES = 90;

/** A statistics row with only the things this engine actually counts. */
function emptyStats(): SideStats {
  return {
    shots: 0,
    shotsOnTarget: 0,
    blocked: 0,
    corners: 0,
    fouls: 0,
    yellowCards: 0,
    redCards: 0,
    xg: 0,
    possessionTicks: 0,
    // `passesCompleted`, `passesAttempted` and `offsides` are deliberately absent. Nothing simulates
    // a pass or an offside line, so there is no honest moment to increment them, and absent has to
    // stay distinguishable from zero.
  };
}

const toChainSide = (side: MatchSide): ChainSide => ({
  tactics: side.tactics,
  players: indexSquad(side.club.squad),
  decisions: side.decisions,
});

/** How long each player was on the pitch, from the events that took them on and off. */
function minutesPlayed(
  side: MatchSide,
  which: Side,
  events: readonly ChainEvent[],
): ReadonlyMap<PlayerId, number> {
  const on = new Map<PlayerId, number>();
  for (const selection of side.tactics.startingXI) on.set(selection.playerId, 0);

  const off = new Map<PlayerId, number>();
  for (const event of events) {
    if (event.side !== which) continue;
    if (event.kind === 'substitution') {
      off.set(event.off, event.minute);
      on.set(event.on, MINUTES - event.minute);
    } else if (event.kind === 'card' && event.colour === 'red') {
      off.set(event.player, event.minute);
    }
  }

  const played = new Map<PlayerId, number>();
  for (const [id, fromSub] of on) {
    const leftAt = off.get(id);
    // A starter plays until he is taken off or sent off; a substitute plays what is left.
    played.set(id, fromSub > 0 ? fromSub : (leftAt ?? MINUTES));
  }
  for (const [id, minute] of off) if (!played.has(id)) played.set(id, minute);
  return played;
}

const clamp = (value: number, low: number, high: number): number =>
  value < low ? low : value > high ? high : value;

interface Contribution {
  goals: number;
  shots: number;
  xg: number;
  saves: number;
  conceded: number;
  fouls: number;
  yellows: number;
  reds: number;
}

const blankContribution = (): Contribution => ({
  goals: 0,
  shots: 0,
  xg: 0,
  saves: 0,
  conceded: 0,
  fouls: 0,
  yellows: 0,
  reds: 0,
});

/**
 * A rating out of ten, built only from things that were counted.
 *
 * Every term below points at a recorded event. There is no "form" fudge and no random jitter, so a
 * player who did nothing gets the same 6.0 every time — which is correct, and is also why a rating
 * here can be explained to the player rather than merely displayed to them.
 */
function ratePlayer(c: Contribution, minutes: number): number {
  if (minutes <= 0) return 6;
  const rating =
    6 +
    c.goals * 1.2 +
    c.xg * 0.8 +
    c.saves * 0.15 -
    c.conceded * 0.3 -
    c.fouls * 0.05 -
    c.yellows * 0.3 -
    c.reds * 1.5;
  return Math.round(clamp(rating, 1, 10) * 10) / 10;
}

/**
 * The trace is Step 5's.
 *
 * Emitted empty on purpose rather than filled with something plausible. `dakka-engine-rules` §6 is
 * explicit that a thin trace means a short debrief and the model does not fill the gap — so an
 * empty one has to be a legible state, not a hole someone patches later.
 */
const EMPTY_TRACE: MatchTrace = { swings: [], winProbabilityTimeline: [] };

export function simulate(input: MatchInput): MatchResult {
  const rng = createRng(input.seed);
  const shotRng = rng.fork('shots');

  const clubs: Record<Side, MatchSide> = { home: input.home, away: input.away };
  const squads: Record<Side, ReadonlyMap<PlayerId, Player>> = {
    home: indexSquad(input.home.club.squad),
    away: indexSquad(input.away.club.squad),
  };

  const resolved: Shot[] = [];
  const contributions = new Map<PlayerId, Contribution>();
  const contributionFor = (id: PlayerId): Contribution => {
    const existing = contributions.get(id);
    if (existing !== undefined) return existing;
    const fresh = blankContribution();
    contributions.set(id, fresh);
    return fresh;
  };

  const chain = simulateChain(
    {
      home: toChainSide(input.home),
      away: toChainSide(input.away),
      minutes: MINUTES,
      awayTravelKm: input.context.awayTravelKm,
      // The home side's own ground, its own crowd. Nothing here reads either club's reputation:
      // a crowd is a crowd, and treating a big club's support as intrinsically worth more would be
      // the multiplier this engine refuses everywhere else.
      crowd: crowdIntensity(
        input.context.attendance,
        input.home.club.stadium.capacity,
        input.context.isDerby,
      ),
      isDerby: input.context.isDerby,
      // The away side has to work the surface out; the home side trains on it every week.
      awayUnfamiliarity: pitchUnfamiliarity(input.home.club.stadium.pitchQuality),
      resolve: (context: ShotContext, keeper: PlayerId | undefined) => {
        const shooterSide: Side = context.side;
        const shot = resolveShot(
          context,
          squads[shooterSide].get(context.shooter),
          keeper === undefined
            ? undefined
            : squads[shooterSide === 'home' ? 'away' : 'home'].get(keeper),
          shotRng,
        );
        resolved.push(shot);

        const shooter = contributionFor(context.shooter);
        shooter.shots += 1;
        shooter.xg += shot.xg;
        if (shot.outcome === 'goal') shooter.goals += 1;

        if (keeper !== undefined) {
          const gk = contributionFor(keeper);
          if (shot.outcome === 'goal') gk.conceded += 1;
          else if (shot.outcome === 'saved') gk.saves += 1;
        }
        return shot.outcome;
      },
    },
    rng,
  );

  // Every statistic below is a tally of something the chain or the resolver already recorded.
  const stats: Record<Side, SideStats> = { home: emptyStats(), away: emptyStats() };
  for (const which of ['home', 'away'] as const) {
    const own = chain[which];
    const mine = resolved.filter((shot) => shot.side === which);
    stats[which] = {
      ...emptyStats(),
      shots: own.shots,
      shotsOnTarget: mine.filter((shot) => isOnTarget(shot.outcome)).length,
      blocked: mine.filter((shot) => shot.outcome === 'blocked').length,
      corners: own.corners,
      fouls: own.fouls,
      yellowCards: own.yellowCards,
      redCards: own.redCards,
      xg: mine.reduce((sum, shot) => sum + shot.xg, 0),
      possessionTicks: own.possessionTicks,
    };
  }

  for (const event of chain.events) {
    if (event.kind !== 'foul' && event.kind !== 'card') continue;
    const c = contributionFor(event.player);
    if (event.kind === 'foul') c.fouls += 1;
    else if (event.colour === 'yellow') c.yellows += 1;
    else c.reds += 1;
  }

  const events: MatchEvent[] = [];
  for (const shot of resolved) {
    events.push({ kind: 'chance', minute: shot.minute, side: shot.side, shot });
    if (shot.outcome === 'goal') {
      events.push({ kind: 'goal', minute: shot.minute, side: shot.side, scorer: shot.shooter });
    }
  }
  for (const event of chain.events) {
    if (event.kind === 'card') {
      events.push({
        kind: 'card',
        minute: event.minute,
        side: event.side,
        player: event.player,
        colour: event.colour,
      });
    } else if (event.kind === 'substitution') {
      events.push({
        kind: 'substitution',
        minute: event.minute,
        side: event.side,
        off: event.off,
        on: event.on,
      });
    }
    // Fouls, tactical changes and penalty awards have no `MatchEvent` kind. They are counted in the
    // statistics and kept in the chain's own event list rather than invented a shape here.
  }
  // Stable by minute: two things in the same minute keep the order they were recorded in.
  events.sort((a, b) => a.minute - b.minute);

  const players: PlayerMatchOutcome[] = [];
  for (const which of ['home', 'away'] as const) {
    const minutes = minutesPlayed(clubs[which], which, chain.events);
    const after = chain.conditionAfter[which];
    for (const player of clubs[which].club.squad) {
      const played = minutes.get(player.id);
      if (played === undefined) continue;
      const condition: PlayerCondition = after.get(player.id) ?? player.condition;
      players.push({
        playerId: player.id,
        minutesPlayed: played,
        goals: contributions.get(player.id)?.goals ?? 0,
        rating: ratePlayer(contributions.get(player.id) ?? blankContribution(), played),
        conditionAfter: condition,
        // `assists` is absent, not zero: nothing models the pass before the shot.
      });
    }
  }

  return {
    id: input.id,
    seed: input.seed,
    homeClubId: input.home.club.id,
    awayClubId: input.away.club.id,
    homeScore: chain.score.home,
    awayScore: chain.score.away,
    events,
    shots: resolved,
    stats: { home: stats.home, away: stats.away },
    players,
    trace: EMPTY_TRACE,
    engineVersion: ENGINE_VERSION,
  };
}
