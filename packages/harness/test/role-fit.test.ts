import { describe, expect, it } from 'vitest';
import { DATA_ROOT, loadLeague } from '@dakka/content';
import {
  ROLE_DEMANDS,
  ROLE_FIT_SPREAD,
  bandCompetence,
  isKeeperRole,
  roleFit,
  type Player,
  type PlayerRole,
} from '@dakka/engine';

/**
 * Role fit, measured on the real league rather than argued about.
 *
 * The engine's own tests prove the three properties on players built to order. These check the two
 * claims that can only be made against real content: that the model is **centred** — no role makes
 * everybody better — and that it is **smaller than squad quality**, which is the line between a
 * tactical choice worth optimising and a second copy of how good your players are.
 *
 * The magnitudes here are the ones that set `ROLE_FIT_SPREAD`. They were measured before the
 * constant was chosen, not after it, which is the only order in which a constant means anything.
 */

const league = loadLeague(DATA_ROOT, 'egy-d4');
const players = league.clubs.flatMap((club) => club.squad);
const ROLES = Object.keys(ROLE_DEMANDS) as readonly PlayerRole[];

const isKeeper = (player: Player): boolean => player.attributes.goalkeeping !== undefined;

/** Every player against every role of his own kind. 6,600 pairs over the Egyptian fourth division. */
const pairs = players.flatMap((player) =>
  ROLES.filter((role) => isKeeperRole(role) === isKeeper(player)).map((role) => ({
    player,
    role,
    fit: roleFit(player, role),
  })),
);

const mean = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

/** The 5th–95th percentile width. The tails of 6,600 pairs are not a typical anything. */
function spread(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (fraction: number): number =>
    sorted[Math.floor(fraction * (sorted.length - 1))] as number;
  return at(0.95) - at(0.05);
}

describe('role fit is centred, so no role is a free uplift', () => {
  it('scans the whole league, so a passing run means something', () => {
    expect(players).toHaveLength(420);
    expect(pairs.length).toBeGreaterThan(6000);
  });

  it('averages 1 across every player and every role of his kind', () => {
    // If this drifts, some role has become better for everybody — which is a bonus wearing a
    // costume, and the thing this whole module is built not to be.
    expect(mean(pairs.map((pair) => pair.fit))).toBeCloseTo(1, 2);
  });

  it('gives a typical player somewhere he is worse as well as somewhere he is better', () => {
    // Two-sidedness on real data rather than on a player built to show it.
    const outfield = players.filter((player) => !isKeeper(player));
    const bothWays = outfield.filter((player) => {
      const fits = ROLES.filter((role) => !isKeeperRole(role)).map((role) => roleFit(player, role));
      return Math.min(...fits) < 1 && Math.max(...fits) > 1;
    });
    expect(bothWays).toHaveLength(outfield.length);
  });
});

describe('role fit is smaller than being a better player', () => {
  it('separates two players less than the players differ from each other', () => {
    // The ordering claim, in the only terms that can be checked: both sides measured on the real
    // league, across the same percentiles. A tactical axis that outranked squad quality would make
    // the team sheet the only thing that mattered — the opposite failure to the one this fixes.
    const band = players
      .filter((player) => !isKeeper(player))
      .map((player) => bandCompetence(player, 'middle'));

    expect(spread(pairs.map((pair) => pair.fit))).toBeLessThan(spread(band));
  });

  it('is bounded by the constant that says how much of the ratio reaches the pitch', () => {
    // Not a clamp. The fit is a ratio of two means of the same player's attributes, so the bound
    // falls out of the arithmetic — which is why there is no floor or ceiling anywhere in the code.
    for (const pair of pairs) {
      expect(pair.fit, `${pair.player.slug}/${pair.role}`).toBeGreaterThan(1 - ROLE_FIT_SPREAD);
    }
    expect(Math.max(...pairs.map((p) => p.fit))).toBeLessThan(1 + ROLE_FIT_SPREAD);
  });
});
