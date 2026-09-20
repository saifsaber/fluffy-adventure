/**
 * One error shape, with a closed set of codes.
 *
 * A client that has to read English prose to find out what went wrong cannot branch on it, so
 * every failure leaves here as `{ error: { code, message } }` and `code` is a union a caller can
 * exhaust. Adding a failure mode means adding a member, which is a compile error everywhere the
 * codes are handled — the same guard `CauseTag` gives the trace.
 *
 * `message` is for a developer reading a log. It is never the thing a player is shown, because a
 * player-facing string lives in a locale file (ADR-003) and this service has no locale.
 */

export type ErrorCode =
  /** The body is not the shape this endpoint accepts — including extra fields. */
  | 'invalid_request'
  /** The service is not configured for that league. */
  | 'unknown_league'
  /** A slug that names no club in the league. */
  | 'unknown_club'
  /** Anything we did not anticipate. Never carries internal detail outward. */
  | 'internal';

export const STATUS: Record<ErrorCode, number> = {
  invalid_request: 400,
  unknown_league: 404,
  unknown_club: 422,
  internal: 500,
};

export interface ErrorBody {
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    /** Field-level detail, only ever about the request the caller sent us. */
    readonly details?: readonly string[];
  };
}

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: readonly string[],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  body(): ErrorBody {
    return {
      error:
        this.details === undefined
          ? { code: this.code, message: this.message }
          : { code: this.code, message: this.message, details: this.details },
    };
  }
}
