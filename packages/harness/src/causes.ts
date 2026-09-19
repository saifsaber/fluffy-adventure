import {
  ALL_CAUSES,
  CAUSE_REGISTRY,
  competitionId,
  createRng,
  matchId,
  simulate,
  type CauseTag,
  type Club,
  type Compactness,
  type InMatchDecision,
  type LineHeight,
  type MatchInput,
  type Mentality,
  type PressingIntensity,
  type TeamWidth,
  type Tempo,
} from '@dakka/engine';
import { tacticsFor } from './tactics.js';

/**
 * Which causes the engine can actually emit.
 *
 * `CAUSE_REGISTRY` lists what the trace is *allowed* to say. This measures what it ever *does* say,
 * which is a different number and turned out to be a much smaller one. It matters because every
 * cause that never fires is a phrasing nobody will read, a lesson nobody will get, and — for the
 * `decision` domain — a claim the product makes that the engine cannot currently support.
 *
 * Deliberately harsher than the balance harness's league: tactics vary across the whole dial space
 * and both sides make in-match decisions, because a survey run on neutral setups cannot emit a
 * shape, pressing or decision cause at all and would report them missing for the wrong reason.
 */

export interface CauseCoverage {
  readonly cause: CauseTag;
  readonly agency: 'controllable' | 'circumstantial';
  readonly domain: string;
  /** Matches in which the cause appeared at least once. */
  readonly matches: number;
  readonly occurrences: number;
  /** The most times it appeared in a single match — what sizes the phrasing's `many` form. */
  readonly maxPerMatch: number;
}

export interface CauseSurvey {
  readonly matches: number;
  readonly swingsPerMatch: number;
  readonly seen: readonly CauseCoverage[];
  readonly never: readonly CauseTag[];
}

const MENTALITIES: readonly Mentality[] = [
  'ultra_defensive',
  'defensive',
  'balanced',
  'attacking',
  'ultra_attacking',
];
const LINES: readonly LineHeight[] = ['deep', 'normal', 'high', 'very_high'];
const PRESSES: readonly PressingIntensity[] = ['contain', 'moderate', 'high', 'gegenpress'];
const TEMPOS: readonly Tempo[] = ['slow', 'balanced', 'fast'];
const WIDTHS: readonly TeamWidth[] = ['narrow', 'balanced', 'wide'];
const COMPACTNESS: readonly Compactness[] = ['tight', 'balanced', 'loose'];

export interface SurveyOptions {
  readonly matches: number;
  readonly seed: string;
}

export function surveyCauses(clubs: readonly Club[], options: SurveyOptions): CauseSurvey {
  if (clubs.length < 2) throw new Error('a survey needs at least two clubs');
  const engine = createRng(options.seed);
  const draw = (): number => engine.next();
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(draw() * xs.length)] as T;

  const matchesWith = new Map<CauseTag, number>();
  const occurrences = new Map<CauseTag, number>();
  const maxPerMatch = new Map<CauseTag, number>();
  let swings = 0;

  const dials = () => ({
    mentality: pick(MENTALITIES),
    lineHeight: pick(LINES),
    pressingIntensity: pick(PRESSES),
    tempo: pick(TEMPOS),
    width: pick(WIDTHS),
    compactness: pick(COMPACTNESS),
  });

  for (let n = 0; n < options.matches; n++) {
    const i = Math.floor(draw() * clubs.length);
    const j = (i + 1 + Math.floor(draw() * (clubs.length - 1))) % clubs.length;
    const home = clubs[i] as Club;
    const away = clubs[j] as Club;

    const sideOf = (club: Club) => {
      const tactics = { ...tacticsFor(club), ...dials() };
      const decisions: InMatchDecision[] = [];
      if (draw() < 0.7)
        decisions.push({
          kind: 'mentality',
          minute: 20 + Math.floor(draw() * 60),
          to: pick(MENTALITIES),
        });
      if (draw() < 0.5)
        decisions.push({
          kind: 'line_height',
          minute: 20 + Math.floor(draw() * 60),
          to: pick(LINES),
        });
      if (draw() < 0.5)
        decisions.push({
          kind: 'pressing',
          minute: 20 + Math.floor(draw() * 60),
          to: pick(PRESSES),
        });
      const on = tactics.bench[Math.floor(draw() * tactics.bench.length)];
      const off = tactics.startingXI[1 + Math.floor(draw() * 10)];
      if (on !== undefined && off !== undefined && draw() < 0.8) {
        decisions.push({
          kind: 'substitution',
          minute: 45 + Math.floor(draw() * 40),
          off: off.playerId,
          on,
          position: off.position,
          role: off.role,
        });
      }
      return { club, tactics, decisions: decisions.sort((a, b) => a.minute - b.minute) };
    };

    const input: MatchInput = {
      id: matchId(`survey-${n}`),
      seed: `${options.seed}#${n}`,
      home: sideOf(home),
      away: sideOf(away),
      context: {
        competitionId: competitionId('survey'),
        awayTravelKm: Math.floor(draw() * 400),
        attendance: 400 + Math.floor(draw() * 2000),
        isDerby: draw() < 0.15,
      },
    };

    const trace = simulate(input).trace;
    swings += trace.swings.length;
    const perMatch = new Map<CauseTag, number>();
    for (const swing of trace.swings)
      perMatch.set(swing.cause, (perMatch.get(swing.cause) ?? 0) + 1);
    for (const [cause, count] of perMatch) {
      matchesWith.set(cause, (matchesWith.get(cause) ?? 0) + 1);
      occurrences.set(cause, (occurrences.get(cause) ?? 0) + count);
      maxPerMatch.set(cause, Math.max(maxPerMatch.get(cause) ?? 0, count));
    }
  }

  const seen = [...matchesWith.keys()]
    .map((cause): CauseCoverage => ({
      cause,
      agency: CAUSE_REGISTRY[cause].agency,
      domain: CAUSE_REGISTRY[cause].domain,
      matches: matchesWith.get(cause) ?? 0,
      occurrences: occurrences.get(cause) ?? 0,
      maxPerMatch: maxPerMatch.get(cause) ?? 0,
    }))
    .sort((a, b) => b.matches - a.matches || a.cause.localeCompare(b.cause));

  return {
    matches: options.matches,
    swingsPerMatch: options.matches === 0 ? 0 : swings / options.matches,
    seen,
    never: ALL_CAUSES.filter((cause) => !matchesWith.has(cause)),
  };
}

export function reportCauses(survey: CauseSurvey): readonly string[] {
  const lines: string[] = [
    `Cause coverage — ${survey.matches} matches, ${survey.swingsPerMatch.toFixed(2)} swings per match`,
    '',
    `  ${'cause'.padEnd(30)} ${'agency'.padEnd(15)} ${'seen%'.padStart(7)} ${'max'.padStart(4)}`,
  ];
  for (const row of survey.seen) {
    const pct = ((row.matches / survey.matches) * 100).toFixed(1);
    lines.push(
      `  ${row.cause.padEnd(30)} ${row.agency.padEnd(15)} ${pct.padStart(7)} ${String(row.maxPerMatch).padStart(4)}`,
    );
  }
  lines.push('');
  if (survey.never.length === 0) {
    lines.push('Every registered cause was emitted at least once.');
  } else {
    lines.push(`NEVER EMITTED (${survey.never.length} of ${ALL_CAUSES.length}):`);
    for (const cause of survey.never) {
      const meta = CAUSE_REGISTRY[cause];
      lines.push(`  ${cause.padEnd(30)} ${meta.agency.padEnd(15)} ${meta.domain}`);
    }
    lines.push('');
    lines.push('A cause that never fires is a phrasing nobody reads and a lesson nobody gets.');
  }
  return lines;
}
