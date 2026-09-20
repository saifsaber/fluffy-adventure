import type { MatchEvent, MatchResult, Side, SwingMoment } from '@dakka/engine';
import type { Call } from './match.js';

/**
 * The match, replayed.
 *
 * The engine resolves a whole match in one call and returns everything that happened. This module
 * does not re-decide any of it — it reads the finished result and works out **what a clock at
 * minute N would have shown**. Every number below is counted from `result`; nothing here can invent
 * a goal, a swing or a scoreline, because nothing here has a source of randomness or an opinion.
 *
 * That is also why the replay is honest about pace: a match is not being played while you watch, it
 * is being read back. Skipping to the end changes nothing about the result, which is the give-away
 * that the screen is showing you a record rather than performing one.
 */

export type Beat =
  | { readonly kind: 'goal'; readonly minute: number; readonly side: Side; readonly yours: boolean }
  | {
      readonly kind: 'card';
      readonly minute: number;
      readonly side: Side;
      readonly colour: 'yellow' | 'red';
      readonly yours: boolean;
    }
  | {
      readonly kind: 'swing';
      readonly minute: number;
      readonly moment: SwingMoment;
      readonly delta: number;
    }
  | { readonly kind: 'call'; readonly minute: number; readonly call: Call };

export interface Scoreline {
  readonly home: number;
  readonly away: number;
}

/** The score at the end of a given minute, counted from the goals that had happened by then. */
export function scoreAt(result: MatchResult, minute: number): Scoreline {
  let home = 0;
  let away = 0;
  for (const event of result.events) {
    if (event.kind !== 'goal' || event.minute > minute) continue;
    if (event.side === 'home') home++;
    else away++;
  }
  return { home, away };
}

/**
 * Win probability from your point of view at this minute, as the engine sampled it.
 *
 * Read off `winProbabilityTimeline`, which is one value per minute and is the only continuously
 * changing quantity in the match that has a derivation behind it. `undefined` before the timeline
 * starts or past its end, rather than a clamped guess — a band with nothing to show says nothing.
 */
export function pressureAt(result: MatchResult, minute: number, you: Side): number | undefined {
  const sampled = result.trace.winProbabilityTimeline[Math.max(0, Math.floor(minute))];
  if (sampled === undefined) return undefined;
  return you === 'home' ? sampled : 1 - sampled;
}

const yoursTo = (side: 'home' | 'away', you: Side): boolean => side === you;

/**
 * Everything the clock will reach, in the order it reaches it.
 *
 * Substitutions, injuries and chances are deliberately absent: the player's own side makes no
 * substitutions in this build, and a chance is already counted in the statistics and in any swing
 * it produced. A feed that lists every touch is how a match report becomes noise.
 */
export function beatsFor(result: MatchResult, you: Side, call: Call | null): readonly Beat[] {
  const beats: Beat[] = [];

  for (const event of result.events as readonly MatchEvent[]) {
    if (event.kind === 'goal') {
      beats.push({
        kind: 'goal',
        minute: event.minute,
        side: event.side,
        yours: yoursTo(event.side, you),
      });
    } else if (event.kind === 'card') {
      beats.push({
        kind: 'card',
        minute: event.minute,
        side: event.side,
        colour: event.colour,
        yours: yoursTo(event.side, you),
      });
    }
  }

  for (const moment of result.trace.swings) {
    // `deltaWinProbability` is signed for the home side; the manager is not always home.
    beats.push({
      kind: 'swing',
      minute: moment.minute,
      moment,
      delta: you === 'home' ? moment.deltaWinProbability : -moment.deltaWinProbability,
    });
  }

  if (call !== null) beats.push({ kind: 'call', minute: call.minute, call });

  // Ties resolve to the thing that caused the other: a goal is why the odds moved, so it is read
  // first, and the call is read before the swing it may have produced.
  const rank: Record<Beat['kind'], number> = { goal: 0, card: 1, call: 2, swing: 3 };
  return [...beats].sort((a, b) => a.minute - b.minute || rank[a.kind] - rank[b.kind]);
}

/** The beats a clock at this minute has reached, most recent first. */
export function reached(beats: readonly Beat[], minute: number): readonly Beat[] {
  return beats.filter((beat) => beat.minute <= minute).reverse();
}

/** Ninety minutes, and the engine samples one value per minute up to and including the last. */
export const FULL_TIME = 90;
