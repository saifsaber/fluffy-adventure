import { buildLeague, type BrowserLeague } from './league.js';

/**
 * Finds the content files at build time and hands them to the pure builder.
 *
 * This is the only module in the app that knows a bundler exists. `@content` is aliased to the
 * content package's `data/` directory in `vite.config.ts`, so these are the same files the harness
 * and the API read — not a copy, and not a generated bundle that could drift.
 */
const clubModules = import.meta.glob('@content/clubs/*/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

const leagueModules = import.meta.glob('@content/leagues/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

const slugOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1, -'.json'.length);

const clubsBySlug = new Map(
  Object.entries(clubModules).map(([path, raw]) => [slugOf(path), raw] as const),
);

export function loadLeagueBundle(leagueSlug: string): BrowserLeague {
  const entry = Object.entries(leagueModules).find(([path]) => slugOf(path) === leagueSlug);
  if (entry === undefined) throw new Error(`no league file named ${leagueSlug}`);
  return buildLeague(entry[1], clubsBySlug);
}
