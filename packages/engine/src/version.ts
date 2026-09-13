/**
 * The engine's version, kept in its own module so `simulate()` can stamp a stored match without
 * importing the package barrel and creating a cycle.
 *
 * A stored `MatchResult` records this so a future build knows whether it can safely re-simulate the
 * same seed and expect the same match. Bump it whenever a change alters output for an unchanged
 * input — that is the whole reason it exists.
 */
export const ENGINE_VERSION = '0.0.0';
