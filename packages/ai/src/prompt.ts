import { CAUSE_REGISTRY, type CauseTag, type PlayerId } from '@dakka/engine';
import type { Locale } from './locale.js';
import type { EvidenceMoment, MatchEvidence } from './evidence.js';
import { PHRASINGS } from './phrasing.js';

/**
 * The debrief prompt, built from a trace and nothing else.
 *
 * Three properties hold, and each has a test rather than a comment promising it:
 *
 *  - **Every number in the evidence block comes from the trace.** Nothing is computed, rounded into
 *    existence, or carried over from a `MatchResult` — the type system already refuses the last of
 *    those, and a test walks the rendered text digit by digit for the first two.
 *  - **Every cause named is one the engine emitted**, phrased from the closed table. The model is
 *    handed sentences, not a licence to write its own reasons.
 *  - **A thin trace makes a short prompt.** `dakka-engine-rules` §6: if the trace is thin, the
 *    debrief is short, and the model does not fill the gap. That is enforced by asking for fewer
 *    paragraphs, and by the evidence block simply having less in it — not by hoping.
 *
 * The prompt is a structured object rather than one string so the evidence can be tested on its
 * own. Mixing the instructions in would make "every number here came from the trace" untestable,
 * since the instructions legitimately contain numbers of their own.
 */

export interface DebriefPrompt {
  readonly locale: Locale;
  /** Who the assistant is and how he talks. Carries no match facts. */
  readonly system: string;
  /** The only part that says anything about the match. */
  readonly evidence: string;
  /** What to do with it. Carries no match facts. */
  readonly task: string;
  readonly moments: number;
  readonly maxParagraphs: number;
}

/** Resolved display names for the players a trace names. Never invented: absent means unnamed. */
export type ActorNames = ReadonlyMap<PlayerId, string>;

const SYSTEM: Record<Locale, string> = {
  'ar-EG': [
    'إنت مساعد مدرب مصري. بتتكلم مصري، مش فصحى، ومش ترجمة من إنجليزي.',
    'بتحترم المدرب بس مابتجاملوش، ولما يغلط بتقوله غلط.',
    'قواعد ماتكسرهاش:',
    '- ماتقولش حاجة مش مكتوبة تحت في "اللي حصل". مفيش دقايق ولا أسامي ولا أرقام من عندك.',
    '- الأرقام بأرقام لاتينية، والمصطلحات اللاتينية زي xG و CDM تفضل زي ما هي.',
    '- مفيش لف ودوران. قول الكلام على طول.',
    '- لو خسر، ماتواسيهوش. قوله جه منين.',
    '- ماتكررش نفس الجملة مرتين.',
  ].join('\n'),
  en: [
    'You are an assistant coach. You talk like one: short sentences, football words, no padding.',
    'You respect the manager and you do not flatter him. When he got it wrong, you say so.',
    'Rules you do not break:',
    '- Say nothing that is not listed under "What happened". No minutes, names or numbers of your own.',
    '- Keep technical terms as they are: xG, CDM, 4-3-3.',
    '- No hedging. Say it.',
    '- After a defeat, do not console. Explain where it went.',
    '- Do not use the same sentence twice.',
  ].join('\n'),
};

const HEADINGS: Record<Locale, { evidence: string; lessons: string; quiet: string }> = {
  'ar-EG': {
    evidence: 'اللي حصل:',
    lessons: 'اللي ينفع يتعمل المرة الجاية:',
    quiet: 'الماتش ما اتقلبش. مفيش لحظة حركت الحسبة بما فيه الكفاية.',
  },
  en: {
    evidence: 'What happened:',
    lessons: 'What to do next time:',
    quiet: 'Nothing turned this match. No moment moved the odds far enough to name.',
  },
};

const TASK: Record<Locale, (paragraphs: number) => string> = {
  'ar-EG': (paragraphs) =>
    paragraphs === 1
      ? 'إكتب جملة أو اتنين بس عن الماتش ده. لو مفيش حاجة تتقال، قول كده وخلاص.'
      : `إكتب ${paragraphs} فقرات قصيرة عن الماتش ده، كل واحدة سطرين على الأكتر.`,
  en: (paragraphs) =>
    paragraphs === 1
      ? 'Write one or two sentences about this match. If there is nothing to say, say that and stop.'
      : `Write ${paragraphs} short paragraphs about this match, two lines each at most.`,
};

/**
 * How long a debrief is allowed to be, from how much the trace actually contains.
 *
 * The competitor's failure is a confident paragraph about a match nothing is known about. Here the
 * ceiling falls out of the evidence: one moment cannot support four paragraphs, so the prompt does
 * not ask for them.
 */
export function paragraphsFor(moments: number): number {
  if (moments === 0) return 1;
  if (moments <= 2) return 2;
  if (moments <= 5) return 3;
  return 4;
}

const fill = (template: string, values: Readonly<Record<string, string>>): string =>
  template.replace(/\{(\w+)\}/g, (whole, name: string) => values[name] ?? whole);

/** A minute, as the trace stored it. */
const minuteOf = (moment: EvidenceMoment): string => String(Math.round(moment.minute));

/**
 * Renders one occurrence, or falls back to the bare label.
 *
 * A phrasing with `{actor}` needs a name the trace supplied. When there is none — the moment has no
 * actors, or nobody resolved them — the sentence is not written with a guessed subject and it is
 * not written with an empty hole. The label and the minute are both true, so that is what goes in.
 */
function renderOne(moment: EvidenceMoment, locale: Locale, names: ActorNames): string {
  const phrasing = PHRASINGS[moment.cause][locale];
  const actor = moment.actors.map((id) => names.get(id)).find((name) => name !== undefined);
  if (phrasing.one.includes('{actor}') && actor === undefined) {
    return `${minuteOf(moment)} — ${phrasing.label}`;
  }
  // Never `actor ?? ''`. Filling the slot with nothing produces "On 22 minutes  took it first
  // time" — a headless sentence with no visible hole, which reads like a bug in the model rather
  // than a bug here, and which the unfilled-slot guard cannot see. Leaving the slot in place makes
  // the mistake impossible to miss, so the fallback above is the only way past it.
  return fill(
    phrasing.one,
    actor === undefined ? { minute: minuteOf(moment) } : { minute: minuteOf(moment), actor },
  );
}

function renderMany(cause: CauseTag, group: readonly EvidenceMoment[], locale: Locale): string {
  const phrasing = PHRASINGS[cause][locale];
  const minutes = group.map(minuteOf).join(', ');
  return `${fill(phrasing.many, { count: String(group.length) })} (${minutes})`;
}

/**
 * Builds the prompt.
 *
 * Moments are grouped by cause before rendering: the same cause three times becomes one collapsed
 * line with its three minutes beside it, not three near-identical sentences. That is both what the
 * voice rules require and what a coach actually says — and it is load-bearing, because the engine
 * emits `WASTEFUL_FINISHING` up to seven times in a single match.
 */
export function debriefPrompt(
  evidence: MatchEvidence,
  names: ActorNames = new Map(),
): DebriefPrompt {
  const { locale } = evidence;
  const headings = HEADINGS[locale];

  const byCause = new Map<CauseTag, EvidenceMoment[]>();
  for (const moment of evidence.moments) {
    const group = byCause.get(moment.cause);
    if (group === undefined) byCause.set(moment.cause, [moment]);
    else group.push(moment);
  }

  const lines: string[] = [headings.evidence];
  if (evidence.moments.length === 0) {
    lines.push(`- ${headings.quiet}`);
  } else {
    for (const [cause, group] of byCause) {
      const first = group[0] as EvidenceMoment;
      lines.push(
        `- ${group.length === 1 ? renderOne(first, locale, names) : renderMany(cause, group, locale)}`,
      );
    }
  }

  const lessons = [...byCause.keys()]
    .filter((cause) => CAUSE_REGISTRY[cause].agency === 'controllable')
    .map((cause) => PHRASINGS[cause][locale].lesson)
    .filter((lesson): lesson is string => lesson !== undefined);

  if (lessons.length > 0) {
    lines.push('', headings.lessons, ...lessons.map((lesson) => `- ${lesson}`));
  }

  const maxParagraphs = paragraphsFor(evidence.moments.length);
  return {
    locale,
    system: SYSTEM[locale],
    evidence: lines.join('\n'),
    task: TASK[locale](maxParagraphs),
    moments: evidence.moments.length,
    maxParagraphs,
  };
}

/** Every number that appears in the evidence block, for the test that checks they all came from the trace. */
export function numbersInText(text: string): readonly number[] {
  return [...text.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
}
