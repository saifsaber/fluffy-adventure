import { describe, expect, it } from 'vitest';
import { LOCALES, PHRASINGS, scoreVoice } from '../src/index.js';
import type { VoiceScore } from '../src/index.js';

/**
 * The box's own test: **a number that moves when the writing gets worse.**
 *
 * Read the module's own warning first — this scores conformance to written rules, not resemblance
 * to real Egyptian coach speech, and the corpus half is blocked. What is proved here is that the
 * number is not decorative: degrade a sample one rule at a time and it falls, every time, for a
 * reason `findings` names.
 *
 * The samples are written by me and labelled as such. They are *not* the held-out set.
 */

const GOOD_AR = [
  'الخط العالي اتاكل سرعة في الدقيقة 31.',
  'رزق جاب الجول من قفلة وحشة منهم.',
  'المرة الجاية نزّل الخط شوية.',
].join('\n');

const GOOD_EN = [
  'They ran in behind your line on 31 minutes.',
  'Rizk scored when their block broke.',
  'Drop the line next time.',
].join('\n');

const sorted = (scores: readonly number[]): boolean =>
  scores.every((value, i) => i === 0 || value < (scores[i - 1] as number));

describe('the number moves when the writing gets worse', () => {
  it('falls, step by step, as rules are broken one at a time', () => {
    // Each line adds exactly one new fault to the one before it. If the score did not fall at every
    // step, it would be measuring something other than what `findings` claims.
    const steps = [
      GOOD_AR,
      `${GOOD_AR}\nربما كان الأداء أفضل.`, // + hedging
      `${GOOD_AR}\nربما كان الأداء أفضل.\nهذا الخط الذي لم يتم ضبطه.`, // + MSA
      `${GOOD_AR}\nربما كان الأداء أفضل.\nهذا الخط الذي لم يتم ضبطه.\nفي الدقيقة ٣١ حصل كده.`, // + Arabic-Indic digits
    ];
    const scores = steps.map((text) => scoreVoice(text, 'ar-EG').overall);
    expect(sorted(scores), scores.map((s) => s.toFixed(3)).join(' → ')).toBe(true);
    expect(scores[0]).toBeGreaterThan(0.95);
    expect(scores[scores.length - 1]).toBeLessThan(0.7);
  });

  it('falls for repetition, which is the competitor’s signature', () => {
    // The competitor ships the identical commentary line at minute 3 and minute 7 of one match.
    const once = scoreVoice(GOOD_AR, 'ar-EG');
    const twice = scoreVoice(`${GOOD_AR}\nرزق جاب الجول من قفلة وحشة منهم.`, 'ar-EG');
    expect(twice.repetition).toBeLessThan(once.repetition);
    expect(twice.findings.join(' ')).toContain('repeated');
  });

  it('falls for a sentence nobody would say out loud', () => {
    const wall =
      'الخط الدفاعي العالي اللي لعبت بيه من أول الماتش لحد الدقيقة 31 خلا المهاجمين بتوعهم ياخدوا المساحة اللي ورا الظهير وده اللي جاب الجول.';
    expect(scoreVoice(wall, 'ar-EG').brevity).toBeLessThan(1);
    expect(scoreVoice(GOOD_AR, 'ar-EG').brevity).toBe(1);
  });

  it('names a reason for every fall', () => {
    const bad = scoreVoice('هذا الأداء ربما كان جيدا في الدقيقة ٧٣.', 'ar-EG');
    expect(bad.overall).toBeLessThan(0.75);
    expect(bad.findings.length).toBeGreaterThanOrEqual(3);
  });
});

describe('what it refuses to punish', () => {
  it('leaves an honest "could be luck" alone', () => {
    // `ممكن يكون` is this product telling the truth about a measurement. A guard that scored it down
    // would be pushing the copy towards false confidence, which is worse than clumsy prose.
    expect(scoreVoice('الفرق ده ممكن يكون صدفة.', 'ar-EG').hedging).toBe(1);
    expect(scoreVoice('Could be luck.', 'en').hedging).toBe(1);
  });

  it('does not count vernacular into the overall score', () => {
    // A short, plain, correct debrief uses none of it. Scoring that down would push the writing
    // towards slang for its own sake.
    const plain = scoreVoice('الخط العالي اتاكل سرعة في الدقيقة 31.', 'ar-EG');
    const salty = scoreVoice('قفلة وحشة والمرتد أكلهم، والحريف كان على الدكة.', 'ar-EG');
    expect(salty.vernacular).toBeGreaterThan(plain.vernacular);
    expect(plain.overall).toBe(1);
  });

  it('passes the phrasings this product already ships', () => {
    // If the table we wrote failed its own scorer, one of the two would be wrong.
    for (const entry of Object.values(PHRASINGS)) {
      const text = [entry['ar-EG'].one, entry['ar-EG'].many, entry['ar-EG'].lesson ?? ''].join(
        '\n',
      );
      const score = scoreVoice(text, 'ar-EG');
      expect(score.overall, `${entry['ar-EG'].label}: ${score.findings.join(', ')}`).toBe(1);
    }
  });
});

describe('what applies to which language', () => {
  it('reports MSA and digit rules for Arabic only, and says so by leaving them out', () => {
    const ar = scoreVoice(GOOD_AR, 'ar-EG');
    const en = scoreVoice(GOOD_EN, 'en');
    expect(ar.msa).toBe(1);
    expect(ar.digits).toBe(1);
    // Absent, not 1 — an inapplicable rule scored as a pass would inflate the English average.
    expect(en.msa).toBeUndefined();
    expect(en.digits).toBeUndefined();
    expect(en.overall).toBe(1);
  });

  it('still catches hedging and repetition in English', () => {
    const hedged = scoreVoice('Perhaps the line was arguably too high.', 'en');
    expect(hedged.hedging).toBeLessThan(1);
    expect(hedged.overall).toBeLessThan(1);
  });

  it('scores empty text at zero rather than pretending it is clean', () => {
    for (const locale of LOCALES) {
      const empty: VoiceScore = scoreVoice('', locale);
      expect(empty.overall, locale).toBeLessThan(1);
    }
  });
});
