import type { Locale } from './locale.js';

/**
 * How closely a piece of text obeys the voice rules — and, deliberately, nothing more than that.
 *
 * **Read this before trusting the number.** `dakka-arabic-voice` asks for a held-out set of *real*
 * Egyptian coach language and a score against it. This is not that. There is no corpus here, so
 * what this measures is **conformance to our own written rules**, not resemblance to how a coach on
 * a touchline in Kafr El Sheikh actually talks. Those are different claims and only the first one
 * is supported. The missing half is recorded under Blocked because inventing a corpus and calling
 * it real would be the exact failure this product exists to avoid.
 *
 * What it does support is the box's own test: **a number that moves when the writing gets worse.**
 * Every sub-score counts a violation of a rule that is written down, so it falls for a stated
 * reason and `findings` says which.
 */

export interface VoiceScore {
  /** Mean of the applicable violation scores, 0–1. Higher is more obedient, not more Egyptian. */
  readonly overall: number;
  /** Modern Standard Arabic markers. Absent for `en`, which has no equivalent. */
  readonly msa?: number;
  /** Arabic-Indic digits. A hard rule, so this is 1 or 0. Absent for `en`. */
  readonly digits?: number;
  readonly hedging: number;
  readonly repetition: number;
  readonly brevity: number;
  /**
   * Football vernacular found, 0–1. **Reported, never counted into `overall`.**
   *
   * A short honest debrief may legitimately use none of it, and scoring that down would push the
   * writing towards slang for its own sake. It is evidence about register, not a rule.
   */
  readonly vernacular: number;
  readonly findings: readonly string[];
}

/** Each of these has an everyday Egyptian equivalent a coach would use instead. */
const MSA = [
  'التي',
  'الذي',
  'هذا',
  'هذه',
  'ذلك',
  'ليس',
  'سوف',
  'يُنصح',
  'لم يتم',
  'قد تم',
  'يجب أن',
  'لقد',
  'كذلك',
];

/**
 * Padding, not honesty.
 *
 * `ممكن يكون` is **not** here on purpose: "الفرق ده ممكن يكون صدفة" is this product telling the
 * truth about a measurement, and a guard that punished it would be pushing the copy towards false
 * confidence. The same goes for "could be luck" in English.
 */
const HEDGING: Record<Locale, readonly string[]> = {
  'ar-EG': ['قد يكون من الممكن', 'على ما يبدو', 'إلى حد ما', 'نوعا ما', 'نوعاً ما', 'ربما'],
  en: ['it could be argued', 'to some extent', 'arguably', 'somewhat', 'perhaps', 'possibly'],
};

/** From `dakka-arabic-voice`. Presence is a good sign; absence is not a fault. */
const VERNACULAR = [
  'مفيّس',
  'مفيس',
  'اتخض',
  'قافل',
  'واكل الأرض',
  'بيلعب في الفاضي',
  'مقفول عليه',
  'كسّر الخط',
  'شغل بيني',
  'طلعة الظهير',
  'تكتل',
  'مرتد',
  'قفلة',
  'حريف',
  'دكة',
  'صافرة',
  'جولة',
];

/** Beyond this a sentence has stopped sounding like speech. */
const LONG_SENTENCE_WORDS = 14;

const sentencesIn = (text: string): readonly string[] =>
  text
    .split(/[.!?؟\n]+/)
    .map((s) => s.trim())
    .filter((s) => s !== '');

const hits = (text: string, terms: readonly string[]): readonly string[] =>
  terms.filter((term) => text.includes(term));

/** One violation is a real fault, three is the whole register gone. */
const fromHits = (count: number): number => Math.max(0, 1 - count / 3);

export function scoreVoice(text: string, locale: Locale): VoiceScore {
  const findings: string[] = [];
  const sentences = sentencesIn(text);

  const hedged = hits(text, HEDGING[locale]);
  for (const term of hedged) findings.push(`hedging: "${term}"`);
  const hedging = fromHits(hedged.length);

  // Repetition, which the voice rules forbid inside one match and which the competitor does.
  const seen = new Map<string, number>();
  for (const sentence of sentences) {
    const key = sentence.replace(/\d+/g, '#').replace(/\s+/g, ' ');
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const repeats = [...seen.values()].filter((n) => n > 1).reduce((sum, n) => sum + n - 1, 0);
  if (repeats > 0) findings.push(`${repeats} repeated sentence(s)`);
  const repetition = sentences.length === 0 ? 0 : Math.max(0, 1 - repeats / sentences.length);

  const long = sentences.filter((s) => s.split(/\s+/).length > LONG_SENTENCE_WORDS);
  for (const sentence of long) findings.push(`long sentence: "${sentence.slice(0, 32)}…"`);
  const brevity = sentences.length === 0 ? 0 : 1 - long.length / sentences.length;

  const vernacular = Math.min(1, hits(text, VERNACULAR).length / 2);

  const applicable: number[] = [hedging, repetition, brevity];
  let msa: number | undefined;
  let digits: number | undefined;

  if (locale === 'ar-EG') {
    const msaHits = hits(text, MSA);
    for (const term of msaHits) findings.push(`MSA: "${term}"`);
    msa = fromHits(msaHits.length);

    const indic = /[٠-٩۰-۹]/.test(text);
    if (indic) findings.push('Arabic-Indic digits');
    digits = indic ? 0 : 1;

    applicable.push(msa, digits);
  }

  const overall = applicable.reduce((sum, value) => sum + value, 0) / applicable.length;

  return {
    overall,
    ...(msa === undefined ? {} : { msa }),
    ...(digits === undefined ? {} : { digits }),
    hedging,
    repetition,
    brevity,
    vernacular,
    findings,
  };
}
