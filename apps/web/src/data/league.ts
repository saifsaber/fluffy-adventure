/**
 * The league in the browser.
 *
 * The assembly moved to `@dakka/fixture` so the server runs the same code — that is what makes
 * "the same seed resolves identically on client and server" structural rather than a coincidence
 * between two copies. What is left here is the browser's name for it.
 */
export { buildLeague, clubBySlug, dataBySlug } from '@dakka/fixture';
export type { LeagueView as BrowserLeague } from '@dakka/fixture';
