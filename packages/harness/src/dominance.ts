import {
  competitionId,
  matchId,
  pairedDifference,
  simulate,
  type Club,
  type MatchInput,
  type Tactics,
} from '@dakka/engine';
import { tacticsFor } from './tactics.js';

/**
 * Is any tactical choice strictly better than another, whatever the opponent does?
 *
 * `dakka-engine-rules` §4 is the rule this exists to check: *the same choice must be able to help in
 * one context and hurt in another, or it is a scalar wearing a costume.* That is a claim about the
 * whole matrix of choice against counter-choice, and nothing else in the project looks at it.
 *
 * **The balance harness structurally cannot see this.** It plays each club's own fixed tactical
 * identity, so it measures the league *as played* — never the decision space a player can actually
 * explore. A dial where one setting beats every other setting against every opponent would leave all
 * seven thresholds green while making the game a single correct answer, which is the same failure as
 * a fabricated statistic wearing different clothes: the screen offers a choice the engine does not
 * really have.
 *
 * So this is a probe, not a gate. It reports; it does not fail a build. Making it a gate is for
 * after the dials it currently indicts have been fixed — a permanently red check teaches everyone to
 * ignore the check.
 */

export type Dial =
  'lineHeight' | 'mentality' | 'pressingIntensity' | 'tempo' | 'width' | 'compactness';

export const DIALS: Record<Dial, readonly string[]> = {
  lineHeight: ['deep', 'normal', 'high', 'very_high'],
  mentality: ['ultra_defensive', 'defensive', 'balanced', 'attacking', 'ultra_attacking'],
  pressingIntensity: ['contain', 'moderate', 'high', 'gegenpress'],
  tempo: ['slow', 'balanced', 'fast'],
  width: ['narrow', 'balanced', 'wide'],
  compactness: ['tight', 'balanced', 'loose'],
};

export interface Cell {
  readonly own: string;
  readonly against: string;
  readonly goalsFor: number;
  readonly goalsAgainst: number;
  readonly matches: number;
  /**
   * Goal difference per match, in fixture-then-seed order.
   *
   * Kept rather than summed away because dominance is a claim about *differences* between cells, and
   * two cells measured on the same fixtures and the same seeds can be compared pair by pair. That
   * pairing is what makes the error bars tight enough to be worth having — the same trick the
   * counterfactual runner uses, for the same reason.
   */
  readonly perMatch: readonly number[];
}

export const goalDifference = (cell: Cell): number => cell.goalsFor - cell.goalsAgainst;

export interface DominanceVerdict {
  /** For each opponent setting, the setting that answers it best. */
  readonly bestResponses: ReadonlyMap<string, string>;
  /** Settings that are the best answer to nothing. A smell, not yet a failure. */
  readonly neverBest: readonly string[];
  /**
   * `setting` is beaten by `by` against **every** opponent setting, and strictly beaten by at least
   * one. This is the §4 violation proper: there is no context in which the choice is worth making.
   */
  readonly dominated: readonly { readonly setting: string; readonly by: string }[];
  readonly healthy: boolean;
}

/**
 * The verdict, from a matrix that is already measured.
 *
 * Split from the measuring so it can be tested on matrices written by hand, in milliseconds, rather
 * than only on the output of several thousand simulated matches.
 */
export function verdictOf(settings: readonly string[], cells: readonly Cell[]): DominanceVerdict {
  const at = new Map(cells.map((cell) => [`${cell.own}|${cell.against}`, cell]));
  const opponents = [...new Set(cells.map((cell) => cell.against))];

  const bestResponses = new Map<string, string>();
  for (const against of opponents) {
    let best: string | undefined;
    let bestValue = Number.NEGATIVE_INFINITY;
    for (const own of settings) {
      const cell = at.get(`${own}|${against}`);
      if (cell === undefined) continue;
      const value = goalDifference(cell);
      if (value > bestValue) {
        bestValue = value;
        best = own;
      }
    }
    if (best !== undefined) bestResponses.set(against, best);
  }

  const chosen = new Set(bestResponses.values());
  const neverBest = settings.filter((setting) => !chosen.has(setting));

  /**
   * Is `by` better than `setting` against this opponent by more than the noise in the comparison?
   *
   * Paired match by match, so the spread being measured is the spread of the *difference* and not
   * the spread of football. Returns `undefined` when the two cells cannot be paired — different
   * lengths mean they were not measured over the same fixtures, and comparing them anyway would
   * quietly turn a methodology error into a finding.
   */
  const beats = (setting: string, by: string, against: string): boolean | undefined => {
    const mine = at.get(`${setting}|${against}`);
    const theirs = at.get(`${by}|${against}`);
    if (mine === undefined || theirs === undefined) return undefined;
    if (mine.perMatch.length !== theirs.perMatch.length || mine.perMatch.length === 0) {
      return undefined;
    }
    const differences = theirs.perMatch.map((value, i) => value - (mine.perMatch[i] ?? 0));
    const measured = pairedDifference(differences);
    return measured.significant && measured.mean > 0;
  };

  const dominated: { setting: string; by: string }[] = [];
  for (const setting of settings) {
    for (const by of settings) {
      if (by === setting) continue;
      let neverWorse = true;
      let betterSomewhere = false;
      let compared = 0;
      for (const against of opponents) {
        const mine = at.get(`${setting}|${against}`);
        const theirs = at.get(`${by}|${against}`);
        if (mine === undefined || theirs === undefined) continue;
        const byWins = beats(setting, by, against);
        if (byWins === undefined) continue;
        compared += 1;
        // Two conditions, and both are needed.
        //
        // The raw average must never be worse, because that is what "beaten in every column" means
        // in plain language — a setting that is ahead in some column has a context where it is worth
        // choosing, whether or not the sample can prove it.
        //
        // Requiring only "never *significantly* better" is the version this replaced, and it
        // over-declares badly: with small true gaps most columns come back tied, so one significant
        // column was enough to convict. It reported `attacking` as dominated by `ultra_defensive`
        // while attacking was plainly ahead against a balanced opponent, and it flipped the
        // direction of the `compactness` verdict between two sample sizes.
        if (goalDifference(theirs) < goalDifference(mine)) neverWorse = false;
        if (byWins) betterSomewhere = true;
      }
      // And the gap has to be real somewhere, or a dial where every setting is identical to within
      // luck would be reported as a ladder.
      if (compared > 0 && neverWorse && betterSomewhere) dominated.push({ setting, by });
    }
  }

  return { bestResponses, neverBest, dominated, healthy: dominated.length === 0 };
}

export interface MeasureInput {
  readonly dial: Dial;
  readonly clubs: readonly Club[];
  /** Fixtures to average each cell over. More pairs cancels club quality; more seeds cancels luck. */
  readonly pairs: number;
  readonly seeds: number;
}

/** The club pairings a run uses. Spread across the table so one cell is not two mid-table sides. */
function fixtures(clubs: readonly Club[], pairs: number): readonly (readonly [Club, Club])[] {
  const out: (readonly [Club, Club])[] = [];
  for (let i = 0; i < pairs; i++) {
    const home = clubs[(i * 3) % clubs.length];
    const away = clubs[(i * 3 + 1 + i) % clubs.length];
    if (home === undefined || away === undefined || home.id === away.id) continue;
    out.push([home, away]);
  }
  return out;
}

export function measure(input: MeasureInput): readonly Cell[] {
  const settings = DIALS[input.dial];
  const pairings = fixtures(input.clubs, input.pairs);
  const cells: Cell[] = [];

  for (const own of settings) {
    for (const against of settings) {
      let goalsFor = 0;
      let goalsAgainst = 0;
      let matches = 0;
      const perMatch: number[] = [];
      for (const [home, away] of pairings) {
        // Everything except the dial under test is the club's own identity, so a cell differs from
        // its neighbour in exactly one field.
        const homeTactics = { ...tacticsFor(home), [input.dial]: own } as Tactics;
        const awayTactics = { ...tacticsFor(away), [input.dial]: against } as Tactics;
        for (let seed = 0; seed < input.seeds; seed++) {
          const match: MatchInput = {
            id: matchId('dominance'),
            seed: `${input.dial}/${own}/${against}/${home.slug}/${seed}`,
            home: { club: home, tactics: homeTactics, decisions: [] },
            away: { club: away, tactics: awayTactics, decisions: [] },
            context: {
              competitionId: competitionId('eg-d4'),
              awayTravelKm: 120,
              attendance: 2000,
              isDerby: false,
            },
          };
          const result = simulate(match);
          goalsFor += result.homeScore;
          goalsAgainst += result.awayScore;
          perMatch.push(result.homeScore - result.awayScore);
          matches += 1;
        }
      }
      cells.push({
        own,
        against,
        goalsFor: matches === 0 ? 0 : goalsFor / matches,
        goalsAgainst: matches === 0 ? 0 : goalsAgainst / matches,
        matches,
        perMatch,
      });
    }
  }
  return cells;
}

export function report(
  dial: Dial,
  cells: readonly Cell[],
  verdict: DominanceVerdict,
  log: (line: string) => void,
): void {
  const settings = DIALS[dial];
  const at = new Map(cells.map((cell) => [`${cell.own}|${cell.against}`, cell]));

  log(`${dial} — goal difference, from the side making the choice`);
  log('');
  log('own \\ opponent'.padEnd(18) + settings.map((s) => s.padStart(12)).join(''));
  for (const own of settings) {
    let row = own.padEnd(18);
    for (const against of settings) {
      const cell = at.get(`${own}|${against}`);
      const value = cell === undefined ? '—' : goalDifference(cell).toFixed(2);
      const mark = verdict.bestResponses.get(against) === own ? '*' : ' ';
      row += `${mark}${value}`.padStart(12);
    }
    log(row);
  }
  log('');
  log('* is the best answer to that column, on the raw average.');
  log('Dominance below is judged on *significant* paired differences, not on these averages, so a');
  log('column where neither setting is measurably ahead does not rescue the one with the better');
  log('number in it.');
  log('');

  if (verdict.dominated.length === 0) {
    log('No setting is dominated: every choice is worth making against something.');
  } else {
    log(`${verdict.dominated.length} dominated setting(s) — no context makes them worth choosing:`);
    for (const { setting, by } of verdict.dominated) {
      log(`  - ${setting} is beaten by ${by} against every opponent setting`);
    }
  }
  if (verdict.neverBest.length > 0) {
    log(`Never the best answer to anything: ${verdict.neverBest.join(', ')}`);
  }
}
