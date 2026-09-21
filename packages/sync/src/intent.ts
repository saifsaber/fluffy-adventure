import type { Setup } from '@dakka/fixture';

/**
 * What the client did — never what it computed.
 *
 * This is the whole design, and it is why "last-write-wins" is not even a temptation here. A
 * generic app queues *state*: two clients edit a row, both send their version, and somebody has to
 * lose. This queues **intents** — the choices a manager made — and the server replays them through
 * the same deterministic engine. There is no version to pick between, because the server does not
 * take anyone's result; it derives its own.
 *
 * `predicted` is the one piece of the client's own arithmetic that travels, and it is **a claim,
 * not data**. The server stores what it derived and compares. When they disagree the server's
 * stands and the divergence is reported, because with a deterministic engine a disagreement can
 * only mean the two sides ran different engine versions or different content — a bug worth
 * surfacing loudly, not a conflict to quietly merge.
 */

export type IntentId = string & { readonly __intent: unique symbol };

export interface CareerStarted {
  readonly kind: 'career_started';
  readonly id: IntentId;
  /** Client clock, for ordering within one device only. Never used to decide who wins. */
  readonly at: number;
  readonly careerId: string;
  readonly clubSlug: string;
  readonly competitionSlug: string;
  readonly engineVersion: string;
}

export interface MatchPlayed {
  readonly kind: 'match_played';
  readonly id: IntentId;
  readonly at: number;
  readonly careerId: string;
  readonly seasonOrdinal: number;
  readonly round: number;
  /** Everything the server needs to rebuild the fixture. Choices, never capabilities. */
  readonly choices: Setup;
  readonly engineVersion: string;
  /**
   * What the client got when it played this offline. Checked, never trusted: the server replays
   * the choices and keeps its own answer.
   */
  readonly predicted: {
    readonly seed: string;
    readonly homeScore: number;
    readonly awayScore: number;
  };
}

export type Intent = CareerStarted | MatchPlayed;

export const ALL_INTENT_KINDS: readonly Intent['kind'][] = ['career_started', 'match_played'];

/** An id the client mints, so a retry after a lost acknowledgement is the same intent. */
export const intentId = (value: string): IntentId => value as IntentId;
