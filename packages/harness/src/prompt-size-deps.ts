/**
 * The engine imports `prompt-size.ts` needs, in one place.
 *
 * `@dakka/ai` re-exports `PRICES` and the engine re-exports the simulation; importing both directly
 * from one file reads as though the harness is reaching into two layers at once, which it is. This
 * keeps that in one visible place rather than spread over an import block.
 */
export { PRICES } from '@dakka/ai';
export { competitionId, createRng, matchId, simulate } from '@dakka/engine';
export type { Club, MatchInput, MatchResult } from '@dakka/engine';
