import type { CauseTag, MatchTrace, PlayerId, Side, SwingMoment } from '@dakka/engine';
import type { Locale } from './locale.js';

/**
 * Everything a prompt is allowed to know about a match.
 *
 * `dakka-engine-rules` §6: the trace is the *only* input the debrief model gets. That rule is what
 * makes a debrief evidence instead of fluent guessing — a model handed a `MatchResult` can talk
 * about possession, shot counts and xG, none of which it was given a reason for, and the result
 * reads exactly like the competitor's invented statistics. So the constructor here takes a
 * `MatchTrace` and the compiler refuses a `MatchResult`, which is a different shape.
 *
 * The moments are re-signed to the manager's point of view before the model ever sees them. The
 * engine's `deltaWinProbability` is signed for the home side; a model reasoning about an away
 * manager would have to remember to flip it, and a model that forgets produces a debrief that is
 * confident, specific and exactly backwards — the failure this product exists to avoid.
 */
export interface EvidenceMoment {
  readonly minute: number;
  readonly cause: CauseTag;
  /** Signed for the manager being spoken to: positive helped him. */
  readonly delta: number;
  readonly actors: readonly PlayerId[];
  readonly favoured: 'you' | 'them';
}

export interface MatchEvidence {
  readonly locale: Locale;
  readonly side: Side;
  readonly moments: readonly EvidenceMoment[];
  /** Win probability from this manager's point of view, at kickoff and at the whistle. */
  readonly kickoff: number;
  readonly final: number;
}

const orient = (value: number, side: Side): number => (side === 'home' ? value : -value);
const orientProbability = (value: number, side: Side): number =>
  side === 'home' ? value : 1 - value;

export function evidenceFromTrace(trace: MatchTrace, side: Side, locale: Locale): MatchEvidence {
  const moments = trace.swings.map((swing: SwingMoment): EvidenceMoment => {
    const delta = orient(swing.deltaWinProbability, side);
    return {
      minute: swing.minute,
      cause: swing.cause,
      delta,
      actors: swing.actors,
      favoured: swing.favoured === side ? 'you' : 'them',
    };
  });

  const timeline = trace.winProbabilityTimeline;
  const first = timeline[0] ?? 0.5;
  const last = timeline[timeline.length - 1] ?? 0.5;

  return {
    locale,
    side,
    moments,
    kickoff: orientProbability(first, side),
    final: orientProbability(last, side),
  };
}

/**
 * Every number in the evidence, for a caller that wants to check a generated prompt against it.
 *
 * The next box's golden-file test needs to assert that a prompt contains no figure the trace did
 * not produce. Building that list here, beside the evidence, is what keeps the two from drifting.
 */
export function numbersIn(evidence: MatchEvidence): readonly number[] {
  return [
    evidence.kickoff,
    evidence.final,
    ...evidence.moments.flatMap((moment) => [moment.minute, moment.delta]),
  ];
}
