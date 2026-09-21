import {
  FORM_WINDOW,
  assess,
  pointsPerGame,
  type Assessment,
  type BoardBrief,
  type Patience,
  type Standing,
} from '@dakka/board';
import {
  nextRound,
  standings,
  status,
  type RecordedResult,
  type Season,
  type TableRow,
} from '@dakka/season';
import {
  ALL_CAUSES,
  CAUSE_REGISTRY,
  type CauseTag,
  type ClubId,
  type MatchTrace,
  type Side,
} from '@dakka/engine';

/**
 * The five questions the dashboard answers, and nothing else.
 *
 * Blueprint §6 names them: what needs my decision today · what changed since I last played · am I
 * on track against the board · what is my biggest risk · what does my assistant think, and why.
 * The same section carries the rule that shapes this whole module: **no card exists to fill space.
 * Every tile either states a fact that changes, or requests a decision.**
 *
 * That rule is only enforceable if "I have nothing to say" is a value rather than an empty render,
 * so every question returns an `Answer`: either a value derived from the career, or a named
 * `Silence`. A silent question is **not drawn** — `tiles()` leaves it out — and the reason it was
 * silent is data a test can assert on, not prose to apologise with. The failure this prevents is
 * the one the product exists to avoid, wearing a layout: a tile that must be filled every visit
 * ends up filled with something invented.
 *
 * Pure and deterministic, like everything under `packages/`: no clock, no randomness, no I/O. The
 * same career gives the same dashboard, which is what lets a server and a client agree about what a
 * manager is being shown.
 */

/** One match the manager's own club played, and the trace it emitted. */
export interface PlayedMatch {
  readonly round: number;
  readonly seed: string;
  /** Which side of the fixture the manager's club was, so the trace can be re-signed to him. */
  readonly side: Side;
  readonly trace: MatchTrace;
}

/**
 * What was on screen the last time the manager looked.
 *
 * A count, and deliberately nothing else. `season.results` is append-only, so the results present
 * at that moment are exactly its first `resultsSeen` entries — which means *what changed since*
 * can be **re-derived** rather than remembered. Storing a snapshot of the table instead would put
 * a second copy of the standings in the save file, and the first time a result was corrected the
 * two would disagree about a manager's own season.
 */
export interface Visit {
  readonly resultsSeen: number;
}

export interface Career {
  readonly season: Season;
  readonly club: ClubId;
  readonly brief: BoardBrief;
  /** The manager's own matches, oldest first. */
  readonly played: readonly PlayedMatch[];
  /** Absent until the manager has looked once. A first visit has no *before* to compare with. */
  readonly lastVisit: Visit | undefined;
}

/**
 * Why a question has no tile this visit.
 *
 * A closed union rather than a message, for the same reason `CauseTag` is: it can be phrased per
 * locale, it can be asserted in a test, and nobody can write a new one at a call site.
 */
export type Silence =
  /** Nothing left to play, so there is no decision to take today. */
  | 'season_complete'
  /** The next round does not contain this club — a bye, in a competition with an odd count. */
  | 'no_fixture'
  /** The manager has never looked before. Not "nothing changed": there is no before. */
  | 'first_visit'
  /** Looked, and not a single match has been played anywhere since. */
  | 'nothing_changed'
  /** Not one match played in the competition. A table where every club is level says nothing. */
  | 'nothing_played'
  /** Nothing is going wrong that the numbers can name. Silence is the honest answer. */
  | 'no_live_risk'
  /** Nothing the manager could have changed cost him anything over the window. */
  | 'no_controllable_cause';

export type Answer<T> =
  | { readonly answered: true; readonly value: T }
  | { readonly answered: false; readonly silent: Silence };

const answered = <T>(value: T): Answer<T> => ({ answered: true, value });
const silent = <T>(reason: Silence): Answer<T> => ({ answered: false, silent: reason });

/* --------------------------------------------------------------------------------------------
 * 1. What needs my decision today?
 * ------------------------------------------------------------------------------------------ */

export interface NextDecision {
  readonly round: number;
  readonly opponent: ClubId;
  readonly venue: 'home' | 'away';
  /**
   * Where the two clubs stand right now, or nothing before a ball has been kicked.
   *
   * A table over an unplayed competition puts all twenty clubs on position 1 — true, and useless.
   * Printing "1st vs 1st" would be a fact that describes the sort order rather than the season.
   */
  readonly standing: { readonly you: TableRow; readonly opponent: TableRow } | undefined;
}

/* --------------------------------------------------------------------------------------------
 * 2. What changed since I last played?
 * ------------------------------------------------------------------------------------------ */

export interface SinceLastVisit {
  /** Matches played anywhere in the competition since the manager last looked. */
  readonly matchesPlayed: number;
  /** The ones his own club played, oldest first. */
  readonly yours: readonly RecordedResult[];
  readonly positionBefore: number;
  readonly positionNow: number;
  readonly pointsBefore: number;
  readonly pointsNow: number;
}

/* --------------------------------------------------------------------------------------------
 * 4. What is my biggest risk?
 * ------------------------------------------------------------------------------------------ */

/**
 * The board's own rule, approaching or crossed.
 *
 * Nothing here models a board's temper. `assess` evaluates the patience the brief *states*, and
 * this turns that verdict into a distance in points, so the answer to "what would have to change"
 * is arithmetic rather than a mood.
 */
export interface SackRisk {
  readonly kind: 'sack';
  readonly standing: Exclude<Standing, 'safe'>;
  /** The rule being judged against, structured — the locale phrases it, this module does not. */
  readonly patience: Patience;
  /** Points behind the objective line. Zero when the line is being held. */
  readonly adrift: number;
  /** Points of slack before the rule is crossed. Negative means it already has been. */
  readonly slack: number;
  /** Matches before the rule starts to apply at all. Zero once it does. */
  readonly gamesBeforeWindow: number;
}

/**
 * Going slower than the club your objective turns on.
 *
 * **Both rates are counted, over the same window, and neither is a projection.** The club is the
 * one `assess` already identifies: chasing, the club holding the line; holding it, the best club
 * below. When it is taking more points a game than you are, the gap is moving the wrong way — and
 * that is a fact about two counted rates rather than a forecast about where either finishes.
 *
 * The rate `assess` calls `neededPerGame` is deliberately *not* what this measures against. It
 * assumes the club on the line takes nothing more, which is honest where it is printed with its
 * assumption attached, and absurd as a risk: it told a club sitting nineteenth that it needed 0.2 a
 * game, so nothing was wrong. A real rival taking real points is the comparison that means
 * something.
 */
export interface PaceRisk {
  readonly kind: 'pace';
  /** Matches counted on both sides of the comparison. The same window `assess` uses. */
  readonly window: number;
  /** Your points per game over the window. */
  readonly yours: number;
  readonly against: {
    /** `chasing` — the club you are trying to reach. `chased` — the one trying to reach you. */
    readonly kind: 'chasing' | 'chased';
    readonly club: ClubId;
    readonly perGame: number;
  };
  /** Points per game you are behind that measure. Always positive — otherwise there is no risk. */
  readonly behindBy: number;
}

export type Risk = SackRisk | PaceRisk;
export type RiskKind = Risk['kind'];

/**
 * The order in which risks are worse, worst first.
 *
 * This is the one authored judgement in the module, and it is deliberately a claim about
 * **consequence** rather than a weighting: losing the job ends the career, where a rate you are
 * behind is the thing you can still do something about. Whether each risk is *live* is arithmetic;
 * only their ranking is a claim, and a claim with two named outcomes is answerable — a score with
 * tuned coefficients is not, which is why there isn't one.
 */
export const RISKS_BY_CONSEQUENCE: readonly RiskKind[] = ['sack', 'pace'];

/* --------------------------------------------------------------------------------------------
 * 5. What does my assistant think, and why?
 * ------------------------------------------------------------------------------------------ */

export interface Occurrence {
  readonly round: number;
  readonly minute: number;
  /** Signed for the manager. Always negative here: this is what the cause cost him. */
  readonly delta: number;
}

/**
 * The one thing worth raising, chosen by counting rather than by wording.
 *
 * **Code decides what to raise; the model only says it.** That is the product's second rule made
 * concrete: the assistant's opinion is the `controllable` cause that has cost this manager the most
 * win probability over his recent matches, summed from the traces. A model is not asked what went
 * wrong, and cannot be — it never sees anything but the causes the engine emitted.
 *
 * `circumstantial` causes are excluded on purpose. Advice attached to something the manager could
 * not have changed is noise, and worse, it implies a control that does not exist — the same reason
 * `PHRASINGS` carries a `lesson` for exactly the controllable causes and for nothing else.
 */
export interface AssistantView {
  readonly cause: CauseTag;
  /** Matches in the window where this cause cost him something. */
  readonly matches: number;
  /** Win probability it cost him in total, summed. Negative. */
  readonly cost: number;
  /** Every occurrence, most recent match first and by minute inside a match. The evidence. */
  readonly occurrences: readonly Occurrence[];
  /** How many of his matches were read to get here. */
  readonly matchesRead: number;
}

/* ------------------------------------------------------------------------------------------ */

export interface Dashboard {
  readonly decision: Answer<NextDecision>;
  readonly since: Answer<SinceLastVisit>;
  readonly onTrack: Answer<Assessment>;
  readonly risk: Answer<Risk>;
  readonly assistant: Answer<AssistantView>;
}

export type Question = keyof Dashboard;

/**
 * The five, in the order blueprint §6 asks them.
 *
 * `keyof Dashboard` makes a misspelling a build error, and the order is data so a screen renders
 * the questions rather than choosing them. A dashboard that lets a layout pick which questions to
 * ask is a dashboard whose fifth question quietly disappears.
 */
export const QUESTIONS: readonly Question[] = ['decision', 'since', 'onTrack', 'risk', 'assistant'];

/** The questions with an answer, in order. What gets drawn — and nothing else does. */
export function tiles(view: Dashboard): readonly Question[] {
  return QUESTIONS.filter((question) => view[question].answered);
}

/* ------------------------------------------------------------------------------------------ */

function decisionToday(career: Career): Answer<NextDecision> {
  const round = nextRound(career.season);
  if (round.length === 0) return silent('season_complete');
  const fixture = round.find((f) => f.home === career.club || f.away === career.club);
  if (fixture === undefined) return silent('no_fixture');

  const atHome = fixture.home === career.club;
  const opponent = atHome ? fixture.away : fixture.home;
  const table = status(career.season) === 'scheduled' ? undefined : standings(career.season);
  const rowFor = (club: ClubId): TableRow => {
    const row = table?.find((entry) => entry.club === club);
    if (row === undefined) throw new Error(`the table has no row for ${club}`);
    return row;
  };

  return answered({
    round: fixture.round,
    opponent,
    venue: atHome ? 'home' : 'away',
    standing:
      table === undefined ? undefined : { you: rowFor(career.club), opponent: rowFor(opponent) },
  });
}

function sinceLastVisit(career: Career): Answer<SinceLastVisit> {
  const { lastVisit, season, club } = career;
  if (lastVisit === undefined) return silent('first_visit');
  if (lastVisit.resultsSeen > season.results.length) {
    // Results are append-only, so a marker ahead of them is not a stale view — it is a marker from
    // some other season. Answering anyway would report a change that never happened.
    throw new Error(
      `a visit marker at ${lastVisit.resultsSeen} is ahead of ${season.results.length} results`,
    );
  }
  if (lastVisit.resultsSeen === season.results.length) return silent('nothing_changed');

  const seen = season.results.slice(0, lastVisit.resultsSeen);
  const before = standings({ ...season, results: seen }).find((row) => row.club === club);
  const now = standings(season).find((row) => row.club === club);
  if (before === undefined || now === undefined)
    throw new Error(`the table has no row for ${club}`);

  return answered({
    matchesPlayed: season.results.length - lastVisit.resultsSeen,
    yours: season.results
      .slice(lastVisit.resultsSeen)
      .filter((result) => result.home === club || result.away === club),
    positionBefore: before.position,
    positionNow: now.position,
    pointsBefore: before.points,
    pointsNow: now.points,
  });
}

function biggestRisk(season: Season, assessment: Assessment, patience: Patience): Answer<Risk> {
  const live: Risk[] = [];

  if (assessment.standing !== 'safe') {
    const adrift = assessment.margin < 0 ? -assessment.margin : 0;
    const played = roundsPlayed(season, assessment.club);
    live.push({
      kind: 'sack',
      standing: assessment.standing,
      patience,
      adrift,
      // Each rule's own distance, in its own terms. `until_impossible` is crossed when the
      // objective cannot be reached even winning out, so the slack is the gap still absorbable.
      slack:
        patience.kind === 'until_impossible'
          ? assessment.margin + assessment.available
          : patience.points - adrift,
      gamesBeforeWindow:
        patience.kind === 'until_impossible' ? 0 : Math.max(0, patience.afterGames - played),
    });
  }

  const yours = assessment.recentPerGame;
  const rival = assessment.rival;
  if (yours !== undefined && rival !== undefined) {
    const theirs = pointsPerGame(season, rival, FORM_WINDOW);
    if (theirs !== undefined && theirs > yours) {
      live.push({
        kind: 'pace',
        window: FORM_WINDOW,
        yours,
        against: {
          kind: assessment.position <= assessment.line ? 'chased' : 'chasing',
          club: rival,
          perGame: theirs,
        },
        behindBy: theirs - yours,
      });
    }
  }

  for (const kind of RISKS_BY_CONSEQUENCE) {
    const found = live.find((risk) => risk.kind === kind);
    if (found !== undefined) return answered(found);
  }
  return silent('no_live_risk');
}

const roundsPlayed = (season: Season, club: ClubId): number =>
  season.results.filter((result) => result.home === club || result.away === club).length;

function assistant(career: Career): Answer<AssistantView> {
  // The same window the form figure uses. One window, named once: a second number here would be a
  // second thing to tune, and the point of this module is that there is nothing to tune in it.
  const recent = career.played.slice(-FORM_WINDOW);
  if (recent.length === 0) return silent('nothing_played');

  const found = new Map<CauseTag, { cost: number; matches: Set<number>; where: Occurrence[] }>();
  // Most recent match first, so the evidence reads the way a coach would give it.
  for (const match of [...recent].reverse()) {
    for (const swing of match.trace.swings) {
      if (CAUSE_REGISTRY[swing.cause].agency !== 'controllable') continue;
      // The engine signs a swing for the home side. A manager reading an away trace unflipped gets
      // an explanation that is confident, specific and exactly backwards.
      const delta = match.side === 'home' ? swing.deltaWinProbability : -swing.deltaWinProbability;
      if (delta >= 0) continue;
      const entry = found.get(swing.cause) ?? { cost: 0, matches: new Set<number>(), where: [] };
      entry.cost += delta;
      entry.matches.add(match.round);
      entry.where.push({ round: match.round, minute: swing.minute, delta });
      found.set(swing.cause, entry);
    }
  }
  if (found.size === 0) return silent('no_controllable_cause');

  // Most costly first; ties settled by how many matches it spans, then by the registry's own order
  // — a declared order, so the same career never produces two different answers.
  const ranked = [...found.entries()].sort((a, b) => {
    if (a[1].cost !== b[1].cost) return a[1].cost - b[1].cost;
    if (a[1].matches.size !== b[1].matches.size) return b[1].matches.size - a[1].matches.size;
    return ALL_CAUSES.indexOf(a[0]) - ALL_CAUSES.indexOf(b[0]);
  });
  const [cause, entry] = ranked[0] as [
    CauseTag,
    { cost: number; matches: Set<number>; where: Occurrence[] },
  ];

  return answered({
    cause,
    matches: entry.matches.size,
    cost: entry.cost,
    occurrences: entry.where,
    matchesRead: recent.length,
  });
}

/** The five answers, derived. Nothing here is stored and nothing is remembered but the visit. */
export function dashboard(career: Career): Dashboard {
  const started = status(career.season) !== 'scheduled';
  const assessment = started ? assess(career.season, career.club, career.brief) : undefined;

  return {
    decision: decisionToday(career),
    since: sinceLastVisit(career),
    onTrack: assessment === undefined ? silent('nothing_played') : answered(assessment),
    risk:
      assessment === undefined
        ? silent('no_live_risk')
        : biggestRisk(career.season, assessment, career.brief.patience),
    assistant: assistant(career),
  };
}

/**
 * Marks the career as seen, at exactly the point the manager saw it.
 *
 * The whole of "what changed since I last played" rests on this one number, which is why it is
 * taken from the results themselves rather than from a clock: a timestamp would answer *when* he
 * looked, and the question is *what he has not seen*.
 */
export function seen(career: Career): Career {
  return { ...career, lastVisit: { resultsSeen: career.season.results.length } };
}
