/**
 * Branded identifiers.
 *
 * A `PlayerId` and a `ClubId` are both strings at runtime, and mixing them up is the kind of bug
 * that produces a plausible-looking wrong answer rather than a crash. Branding makes the compiler
 * refuse the swap at zero runtime cost.
 */

declare const brand: unique symbol;
type Brand<T, B> = T & { readonly [brand]: B };

export type PlayerId = Brand<string, 'PlayerId'>;
export type ClubId = Brand<string, 'ClubId'>;
export type MatchId = Brand<string, 'MatchId'>;
export type CompetitionId = Brand<string, 'CompetitionId'>;

export const playerId = (raw: string): PlayerId => raw as PlayerId;
export const clubId = (raw: string): ClubId => raw as ClubId;
export const matchId = (raw: string): MatchId => raw as MatchId;
export const competitionId = (raw: string): CompetitionId => raw as CompetitionId;

/**
 * Every named entity carries a Latin-script slug alongside its local name.
 *
 * The local name is what an Egyptian player reads; the slug is what makes a share card legible in
 * any locale and what lets the product expand to other football cultures without a rewrite.
 * See docs/01-product/05-global-strategy.md §8.
 */
export interface Named {
  /** Display name in the entity's own script, e.g. "نادي نجم ميت عقبة". */
  readonly name: string;
  /** Short display name, e.g. "ميت عقبة". */
  readonly shortName: string;
  /** Stable Latin-script identifier, e.g. "meet-okba-star". Never localised. */
  readonly slug: string;
}
