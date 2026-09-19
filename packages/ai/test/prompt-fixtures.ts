import type { MatchTrace, SwingMoment } from '@dakka/engine';
import { pid } from './fixtures.js';
import type { ActorNames } from '../src/index.js';

/**
 * Traces shaped like the ones the engine actually produces.
 *
 * `busy` repeats `WASTEFUL_FINISHING` three times on purpose: the survey (`pnpm causes`) shows the
 * engine doing that in most matches, up to seven times, so a fixture without a repeat would test
 * the prompt on a case that barely occurs.
 */

const swing = (
  minute: number,
  cause: SwingMoment['cause'],
  delta: number,
  favoured: 'home' | 'away',
  actors: readonly string[] = [],
): SwingMoment => ({
  minute,
  cause,
  deltaWinProbability: delta,
  actors: actors.map(pid),
  favoured,
});

const timeline = (final: number): readonly number[] =>
  Array.from({ length: 91 }, (_, i) => (i === 90 ? final : 0.44));

export const busy: MatchTrace = {
  swings: [
    swing(18, 'WASTEFUL_FINISHING', -0.06, 'away', ['striker']),
    swing(31, 'HIGH_LINE_VS_PACE', -0.13, 'away'),
    swing(44, 'WASTEFUL_FINISHING', -0.05, 'away', ['striker']),
    swing(57, 'KEEPER_HEROICS', -0.09, 'away'),
    swing(68, 'WASTEFUL_FINISHING', -0.04, 'away', ['winger']),
    swing(81, 'CLINICAL_FINISHING', 0.38, 'home', ['striker']),
  ],
  winProbabilityTimeline: timeline(1),
};

/** One moment. The prompt must get shorter, not pad. */
export const thin: MatchTrace = {
  swings: [swing(63, 'MIDFIELD_OUTNUMBERED', -0.11, 'away')],
  winProbabilityTimeline: timeline(0),
};

/** Nothing worth naming. A real outcome, not an error. */
export const quiet: MatchTrace = { swings: [], winProbabilityTimeline: timeline(0.5) };

/** A moment whose phrasing wants an actor the trace never named. */
export const unnamed: MatchTrace = {
  swings: [swing(22, 'CLINICAL_FINISHING', 0.3, 'home')],
  winProbabilityTimeline: timeline(1),
};

export const NAMES: ActorNames = new Map([
  [pid('striker'), 'رزق'],
  [pid('winger'), 'الشاذلي'],
]);
