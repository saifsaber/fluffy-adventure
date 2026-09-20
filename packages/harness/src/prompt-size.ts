import {
  ROUTING,
  briefingPrompt,
  briefingSegments,
  cacheablePrefix,
  ceilingUsd,
  debriefPrompt,
  debriefSegments,
  evidenceFromTrace,
  maxTokens,
  outputCeilingTokens,
  scoutingFrom,
  type AiTask,
  type CachePrefix,
  type Locale,
  type ModelId,
} from '@dakka/ai';
import {
  PRICES,
  competitionId,
  createRng,
  matchId,
  simulate,
  type Club,
  type MatchInput,
  type MatchResult,
} from './prompt-size-deps.js';
import { tacticsFor } from './tactics.js';

/**
 * How big the prompts we send actually are, measured on real matches.
 *
 * This is the honest half of "cost per match". The dishonest half is easy and is the reason this
 * file exists: pick a plausible token count, multiply by a price, print a number. That number would
 * be indistinguishable from a measurement on the page and wrong by an unknown factor.
 *
 * So what gets printed here is two things, and never a third:
 *
 *  - **Bytes**, counted from prompts the package actually built for matches the engine actually
 *    simulated. A real measurement of a real quantity.
 *  - **A ceiling in dollars**, from `tokens ≤ bytes` and the `max_tokens` cap. An inequality that
 *    holds, labelled as a ceiling, loose by a factor only a tokenizer can close.
 *
 * The third thing — the actual cost — needs token counts, which need the API. It is not in here,
 * and no arithmetic in this file can be mistaken for it.
 */

export interface SizeStats {
  readonly n: number;
  readonly min: number;
  readonly median: number;
  readonly p95: number;
  readonly max: number;
}

export interface SurfaceSizes {
  readonly task: AiTask;
  readonly locale: Locale;
  readonly model: ModelId;
  readonly bytes: SizeStats;
  /** The proved worst case for one call of this surface, in USD. */
  readonly ceilingUsd: SizeStats;
  /**
   * The share of that worst case which is the output cap rather than the prompt.
   *
   * Worth splitting out because it decides where the next cost control goes. If the ceiling is
   * mostly `max_tokens`, shortening the prompt is not the lever — tightening the cap is, and the
   * cap is already justified by the length rule that throws long replies away.
   */
  readonly outputShareOfCeiling: number;
}

export interface PromptSizeSurvey {
  readonly matches: number;
  readonly surfaces: readonly SurfaceSizes[];
  readonly prefixes: readonly {
    readonly task: AiTask;
    readonly locale: Locale;
    readonly prefix: CachePrefix;
  }[];
  /** Matches whose trace named nothing, so `authoriseDebrief` refuses before a call is made. */
  readonly quietMatches: number;
  /** Debriefs possible per match: one per side. */
  readonly sidesPerMatch: 2;
}

const stats = (values: readonly number[]): SizeStats => {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number): number =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  return {
    n: sorted.length,
    min: sorted[0] ?? 0,
    median: at(0.5),
    p95: at(0.95),
    max: sorted[sorted.length - 1] ?? 0,
  };
};

const LOCALES: readonly Locale[] = ['ar-EG', 'en'];

export interface SizeOptions {
  readonly matches: number;
  readonly seed: string;
}

/**
 * Plays real fixtures, builds every prompt they would produce, and measures them.
 *
 * Results accumulate as it goes, so the briefing prompts grow the way they grow in a season: the
 * first meeting has nothing to say about the opponent and the tenth has a table. Measuring only
 * the empty case would under-state the volume surface by the amount that actually matters.
 */
export function surveyPromptSizes(clubs: readonly Club[], options: SizeOptions): PromptSizeSurvey {
  if (clubs.length < 2) throw new Error('a survey needs at least two clubs');
  const rng = createRng(options.seed);
  const played: MatchResult[] = [];

  const bytes = new Map<string, number[]>();
  const ceilings = new Map<string, number[]>();
  const outputOnly = new Map<string, number[]>();
  const push = (map: Map<string, number[]>, key: string, value: number): void => {
    const list = map.get(key);
    if (list === undefined) map.set(key, [value]);
    else list.push(value);
  };

  let quiet = 0;

  for (let n = 0; n < options.matches; n++) {
    const i = Math.floor(rng.next() * clubs.length);
    const j = (i + 1 + Math.floor(rng.next() * (clubs.length - 1))) % clubs.length;
    const home = clubs[i] as Club;
    const away = clubs[j] as Club;

    // The briefing is built *before* the match, from what has been seen so far — which is the only
    // thing that makes it a scouting report rather than a leak of the opponent's attributes.
    for (const locale of LOCALES) {
      const record = scoutingFrom(played, away.id);
      // The club's own name in Arabic, its Latin slug in English — the two things the data
      // actually carries. Global strategy §8.3 exists for exactly this: a share card, or an
      // English briefing, has to read without inventing a translation nobody wrote.
      const prompt = briefingPrompt(record, locale === 'en' ? away.slug : away.name, locale);
      const text = [prompt.system, prompt.scouting, prompt.task].join('\n');
      const key = `briefing/${locale}`;
      push(bytes, key, maxTokens(text));
      push(ceilings, key, ceilingUsd(text, BRIEFING_OUTPUT_CAP, { model: ROUTING.briefing }));
      push(outputOnly, key, ceilingUsd('', BRIEFING_OUTPUT_CAP, { model: ROUTING.briefing }));
    }

    const input: MatchInput = {
      id: matchId(`size-${n}`),
      seed: `${options.seed}#${n}`,
      home: { club: home, tactics: tacticsFor(home), decisions: [] },
      away: { club: away, tactics: tacticsFor(away), decisions: [] },
      context: {
        competitionId: competitionId('size'),
        awayTravelKm: Math.floor(rng.next() * 400),
        attendance: 400 + Math.floor(rng.next() * 2000),
        isDerby: false,
      },
    };
    const result = simulate(input);
    played.push(result);
    if (result.trace.swings.length === 0) quiet++;

    for (const locale of LOCALES) {
      for (const side of ['home', 'away'] as const) {
        const evidence = evidenceFromTrace(result.trace, side, locale);
        const prompt = debriefPrompt(evidence);
        const text = [prompt.system, prompt.evidence, prompt.task].join('\n');
        const key = `debrief/${locale}`;
        push(bytes, key, maxTokens(text));
        const cap = outputCeilingTokens(prompt.maxParagraphs);
        push(ceilings, key, ceilingUsd(text, cap, { model: ROUTING.debrief }));
        push(outputOnly, key, ceilingUsd('', cap, { model: ROUTING.debrief }));
      }
    }
  }

  const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);
  const outputShare = new Map<string, number>();
  for (const [key, totals] of ceilings) {
    const total = sum(totals);
    outputShare.set(key, total === 0 ? 0 : sum(outputOnly.get(key) ?? []) / total);
  }

  const surfaces: SurfaceSizes[] = [];
  for (const task of ['debrief', 'briefing'] as const) {
    for (const locale of LOCALES) {
      const key = `${task}/${locale}`;
      surfaces.push({
        task,
        locale,
        model: ROUTING[task],
        bytes: stats(bytes.get(key) ?? []),
        ceilingUsd: stats(ceilings.get(key) ?? []),
        outputShareOfCeiling: outputShare.get(key) ?? 0,
      });
    }
  }

  // Measured on both surfaces, because the briefing is the one that runs every match and is
  // therefore the one where a cache would have been worth having.
  const prefixes = LOCALES.flatMap((locale) => {
    const evidence = evidenceFromTrace((played[0] as MatchResult).trace, 'home', locale);
    const away = clubs[1] as Club;
    const briefing = briefingPrompt(
      scoutingFrom(played, away.id),
      locale === 'en' ? away.slug : away.name,
      locale,
    );
    return [
      {
        task: 'debrief' as AiTask,
        locale,
        prefix: cacheablePrefix(debriefSegments(debriefPrompt(evidence))),
      },
      { task: 'briefing' as AiTask, locale, prefix: cacheablePrefix(briefingSegments(briefing)) },
    ];
  });

  return { matches: options.matches, surfaces, prefixes, quietMatches: quiet, sidesPerMatch: 2 };
}

/**
 * The briefing's output cap.
 *
 * The briefing has no length validator of its own yet — unlike the debrief, whose cap is read from
 * the rule that throws long replies away. Until it has one this is a stated cap rather than a
 * derived one, and it is written here, once, so it is visible as such.
 */
export const BRIEFING_OUTPUT_CAP = 600;

/** Every prefix claim in the report, with the model minimums that decide it. */
const prefixLines = (task: AiTask, locale: Locale, prefix: CachePrefix): readonly string[] => {
  const name = (model: ModelId): string => `${model} (${PRICES[model].minCacheableTokens})`;
  return [
    `  ${task.padEnd(9)} ${locale.padEnd(6)} [${prefix.segments.join(', ') || 'nothing'}]  ${prefix.bytes} bytes ⇒ at most ${prefix.maxTokens} tokens`,
    `      cannot cache on: ${prefix.tooShortFor.map(name).join(', ') || 'none'}`,
    `      undecided:       ${prefix.undecided.map(name).join(', ') || 'none'}`,
  ];
};

const usd = (value: number): string => `$${value.toFixed(5)}`;

export function reportPromptSizes(survey: PromptSizeSurvey): readonly string[] {
  const lines: string[] = [
    `Prompt sizes over ${survey.matches} simulated matches — measured in bytes, priced as a ceiling.`,
    '',
    'surface                            locale   bytes: min / median / p95 / max   ceiling per call (max)',
  ];

  for (const surface of survey.surfaces) {
    const b = surface.bytes;
    lines.push(
      `${`${surface.task} → ${surface.model}`.padEnd(34)} ${surface.locale.padEnd(7)} ` +
        `${String(b.min).padStart(5)} /${String(b.median).padStart(6)} /${String(b.p95).padStart(6)} /${String(b.max).padStart(6)}` +
        `        ${usd(surface.ceilingUsd.max)}  (${(surface.outputShareOfCeiling * 100).toFixed(0)}% of it the output cap)`,
    );
  }

  lines.push('', 'Cacheable prefix — the leading blocks that never change:');
  for (const { task, locale, prefix } of survey.prefixes) {
    lines.push(...prefixLines(task, locale, prefix));
  }

  const quietShare = survey.matches === 0 ? 0 : survey.quietMatches / survey.matches;
  lines.push(
    '',
    `Quiet matches (trace named nothing, so no debrief is bought at all): ${survey.quietMatches} of ${survey.matches} — ${(quietShare * 100).toFixed(1)}%`,
    '',
    'NOT MEASURED, and not guessed: the actual cost of any of this. Bytes bound tokens from above',
    'and nothing bounds them from below, so a real figure needs `usage` from a real response. Until',
    'the API key exists, every number above is either a byte count or a ceiling. See docs/WORKLOG.md.',
  );
  return lines;
}
