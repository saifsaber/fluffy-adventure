import { describe, expect, it } from 'vitest';
import {
  baselineTactics,
  competitionId,
  matchId,
  neutralise,
  plusMgr,
  simulate,
  type ManagedMatch,
  type Club,
  type MatchInput,
  type Player,
  type InMatchDecision,
  type PlayerRole,
  type Position,
} from '../src/index.js';
import { makeClub, makePlayer, makeTactics } from './fixtures.js';

/**
 * +MGR is the number the product is meant to be known for, so the tests are mostly about the ways it
 * could be a lie: a baseline that is secretly good or bad, a comparison that is not actually the
 * same fixture, and a headline quoted without the spread that produced it.
 */

/**
 * A squad with a full second eleven, because selection is half of what +MGR prices.
 *
 * `makeClub` fields exactly eleven, so with it the baseline has no choice to make — everyone plays
 * whatever their rating, and a test of "he picked the better player" cannot say anything. A complete
 * reserve side at 22 makes both halves measurable: who the baseline picks, and what it costs to pick
 * the others.
 */
const RESERVES: readonly (readonly [Position, PlayerRole])[] = [
  ['GK', 'shot_stopper'],
  ['RB', 'defensive_fullback'],
  ['CB', 'stopper'],
  ['CB', 'covering_defender'],
  ['LB', 'defensive_fullback'],
  ['RM', 'touchline_winger'],
  ['CM', 'box_to_box'],
  ['CM', 'ball_winner'],
  ['LM', 'touchline_winger'],
  ['ST', 'poacher'],
  ['ST', 'target_man'],
];

function withBench(slug: string, overall: number): Club {
  const club = makeClub(slug, overall);
  const reserves = RESERVES.map(([position, role], i) =>
    makePlayer(`${slug}-res-${i}`, position, role, 22),
  );
  return { ...club, squad: [...club.squad, ...reserves] };
}

const home = withBench('home', 56);
const away = withBench('away', 54);

const fixture = (seed: string, decorate?: (input: MatchInput) => MatchInput): MatchInput => {
  const base: MatchInput = {
    id: matchId(`m-${seed}`),
    seed,
    home: { club: home, tactics: makeTactics(home), decisions: [] },
    away: { club: away, tactics: makeTactics(away), decisions: [] },
    context: {
      competitionId: competitionId('eg-d4'),
      awayTravelKm: 140,
      attendance: 1200,
      isDerby: false,
    },
  };
  return decorate === undefined ? base : decorate(base);
};

/** Something the manager actually does during the match, so there is something to strip. */
const DECISIONS: readonly InMatchDecision[] = [
  { kind: 'line_height', minute: 30, to: 'high' },
  { kind: 'mentality', minute: 60, to: 'attacking' },
  { kind: 'pressing', minute: 75, to: 'high' },
];

const withDecisions = (input: MatchInput): MatchInput => ({
  ...input,
  home: { ...input.home, decisions: DECISIONS },
});

const season = (n: number, decorate?: (input: MatchInput) => MatchInput): ManagedMatch[] =>
  Array.from({ length: n }, (_, i) => ({ input: fixture(`week-${i}`, decorate), side: 'home' }));

describe('the baseline is a control, not another sample', () => {
  it('scores a season managed by the baseline at exactly zero', () => {
    // The single most important property here, and the direct analogue of the counterfactual
    // runner's no-op study. If replaying the baseline against itself produced anything but 0, +MGR
    // would be manufacturing a number out of nothing every time it ran.
    const baselineSeason: ManagedMatch[] = season(20).map(({ input, side }) => ({
      input: neutralise(input, side),
      side,
    }));
    const result = plusMgr(baselineSeason);
    expect(result.points).toBe(0);
    expect(result.perMatch.every((d) => d === 0)).toBe(true);
    expect(result.managed).toEqual(result.baseline);
    expect(result.skill.significant).toBe(false);
  });

  it('gives the same answer every time it is asked', () => {
    const run = () => JSON.stringify(plusMgr(season(10)));
    expect(run()).toBe(run());
  });

  it('changes only the managed side, and leaves the fixture otherwise identical', () => {
    // The fixture carries real in-match decisions on purpose. An earlier version of this test used
    // a side with `decisions: []`, so asserting they had been stripped was asserting nothing — the
    // baseline could have kept every one of them and the whole file still passed.
    const one = fixture('untouched', withDecisions);
    expect(one.home.decisions).toHaveLength(3);

    const stripped = neutralise(one, 'home');
    expect(stripped.away).toEqual(one.away);
    expect(stripped.seed).toBe(one.seed);
    expect(stripped.context).toEqual(one.context);
    expect(stripped.home.club).toEqual(one.home.club);
    expect(stripped.home.decisions).toEqual([]);
    expect(stripped.home.tactics).not.toEqual(one.home.tactics);
  });

  it('prices in-match decisions, not only the team sheet', () => {
    // Two seasons identical in every way except that one manager touches the game after kick-off.
    // If +MGR scored them the same, the number would be about selection alone and the product's
    // whole claim — *your decisions were worth this* — would be false by omission.
    const quiet = plusMgr(season(24));
    const busy = plusMgr(season(24, withDecisions));
    expect(busy.baseline).toEqual(quiet.baseline);
    expect(busy.perMatch).not.toEqual(quiet.perMatch);
  });

  it('leaves the input it was given untouched', () => {
    const one = fixture('pure');
    const before = JSON.stringify(one);
    neutralise(one, 'home');
    plusMgr([{ input: one, side: 'home' }]);
    expect(JSON.stringify(one)).toBe(before);
  });
});

describe('the baseline team sheet', () => {
  const sheet = baselineTactics(home.squad);

  it('fields eleven, nobody twice, and a keeper in goal', () => {
    expect(sheet.startingXI).toHaveLength(11);
    expect(new Set(sheet.startingXI.map((s) => s.playerId)).size).toBe(11);
    expect(sheet.startingXI[0]?.position).toBe('GK');
  });

  it('puts everyone who is not playing on the bench, and nobody in both places', () => {
    const playing = new Set(sheet.startingXI.map((s) => s.playerId));
    expect(sheet.bench.length).toBe(home.squad.length - 11);
    for (const id of sheet.bench) expect(playing.has(id)).toBe(false);
  });

  it('is neutral on every dial it could have an opinion about', () => {
    // A baseline with a tactical preference is not a baseline — its preference would be priced into
    // every player's +MGR as if it were their doing.
    expect(sheet.mentality).toBe('balanced');
    expect(sheet.lineHeight).toBe('normal');
    expect(sheet.tempo).toBe('balanced');
    expect(sheet.width).toBe('balanced');
    expect(sheet.compactness).toBe('balanced');
  });

  it('drops a first-choice player who is no longer the best in his position', () => {
    // `home-1` is the starting right-back and `home-res-2` is his reserve. Ruin the starter's
    // defending and the baseline has to notice — if it did not it would be selecting by squad order,
    // and every club's +MGR would depend on how its data file happened to be written.
    const starter = home.squad[1] as Player;
    const rightBack = (t: typeof sheet) => t.startingXI.find((s) => s.position === 'RB')?.playerId;
    expect(rightBack(sheet)).toBe(starter.id);

    const crippled = home.squad.map((p): Player =>
      p.id === starter.id
        ? {
            ...p,
            attributes: {
              ...p.attributes,
              technical: { ...p.attributes.technical, marking: 1, tackling: 1 },
              mental: { ...p.attributes.mental, positioning: 1, anticipation: 1 },
              physical: { ...p.attributes.physical, strength: 1, jumping: 1 },
            },
          }
        : p,
    );
    // He loses the right-back slot to his reserve. He may still appear elsewhere — the shape has
    // eleven slots to fill and he is otherwise a fine player — so the claim is about the position,
    // not about being dropped from the squad.
    expect(rightBack(baselineTactics(crippled))).toBe(home.squad[12]?.id);
  });
});

describe('what the number means', () => {
  it('goes clearly negative for a manager who fields his reserves', () => {
    // Robust in a way a tactical choice would not be: whatever the balance constants do later, a
    // manager who fields eleven 22-rated reserves must score below one who does not. The shape and
    // every dial are the baseline's here — only the eleven names differ — so this prices selection
    // on its own.
    const reserveXI = baselineTactics(home.squad).startingXI.map((slot, i) => ({
      ...slot,
      playerId: (home.squad[11 + i] as Player).id,
    }));
    const sheet = { ...baselineTactics(home.squad), startingXI: reserveXI };
    const worst = season(24, (input) => ({ ...input, home: { ...input.home, tactics: sheet } }));
    const result = plusMgr(worst);
    expect(result.points).toBeLessThan(0);
    expect(result.managed.goalsAgainst).toBeGreaterThan(result.baseline.goalsAgainst);
  });

  it('adds up: the headline is the difference between the two seasons it reports', () => {
    const result = plusMgr(season(16));
    expect(result.points).toBe(result.managed.points - result.baseline.points);
    expect(result.perMatch).toHaveLength(16);
    expect(result.perMatch.reduce((a, b) => a + b, 0)).toBe(result.points);
    expect(result.matches).toBe(16);
  });

  it('carries the spread that produced it, not just the total', () => {
    // A season is one sample. `points` is exact for it; `skill` is what says whether the run is
    // bigger than the variation inside it, and a caller showing the first without the second is
    // publishing luck as achievement.
    const result = plusMgr(season(24));
    expect(result.skill.mean).toBeCloseTo(result.points / 24, 9);
    expect(Number.isFinite(result.skill.standardError)).toBe(true);
    const earned =
      result.skill.standardError > 0
        ? Math.abs(result.skill.mean) >= 2 * result.skill.standardError
        : result.skill.mean !== 0;
    expect(result.skill.significant).toBe(earned);
  });

  it('refuses to call a single fixture', () => {
    expect(plusMgr(season(1)).skill.significant).toBe(false);
  });

  it('counts points the way a league table does', () => {
    const one = season(30);
    const result = plusMgr(one);
    expect(result.managed.won + result.managed.drawn + result.managed.lost).toBe(30);
    expect(result.managed.points).toBe(result.managed.won * 3 + result.managed.drawn);
    expect(result.baseline.points).toBe(result.baseline.won * 3 + result.baseline.drawn);
  });

  it('reads the managed side from the side it was told, not always home', () => {
    const asAway: ManagedMatch[] = season(12).map(({ input }) => ({ input, side: 'away' }));
    const result = plusMgr(asAway);
    const first = simulate(asAway[0]?.input as MatchInput);
    expect(result.managed.goalsFor).toBeGreaterThanOrEqual(first.awayScore);
    expect(result.managed.won + result.managed.drawn + result.managed.lost).toBe(12);
  });
});
