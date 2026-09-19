import { describe, expect, it, vi } from 'vitest';
import { ENGINE_VERSION } from '@dakka/engine';
import {
  checkDebrief,
  debriefCacheKey,
  debriefPrompt,
  evidenceFromTrace,
  requestDebrief,
  type DebriefTransport,
} from '../src/index.js';
import { busy, quiet, NAMES } from './prompt-fixtures.js';

/**
 * The return trip.
 *
 * A prompt containing only trace facts does not guarantee a reply containing only trace facts. A
 * model will add a plausible number, or mention possession because debriefs usually do — which is
 * the competitor's failure arriving through the back door, in better prose. Every test here is a
 * reply that must be refused.
 */

const evidence = evidenceFromTrace(busy, 'home', 'ar-EG');
const prompt = debriefPrompt(evidence, NAMES);
const english = evidenceFromTrace(busy, 'home', 'en');
const englishPrompt = debriefPrompt(english, NAMES);

/**
 * Uses only minutes `busy` actually carries: 18, 31, 44, 57, 68, 81 — and the count 3.
 *
 * The first version of this constant said the goal came at 61, copied from a mock-up rather than
 * from the fixture, and the guard refused it. That is the guard doing its job on its own test.
 */
const GOOD = 'الخط العالي اتاكل سرعة في الدقيقة 31 وراحوا من وراك.\n\nرزق جاب الجول في 81.';

const problemsOf = (text: string, ev = evidence, pr = prompt): readonly string[] => {
  const outcome = checkDebrief(text, ev, pr);
  return outcome.ok ? [] : outcome.problems;
};

describe('a reply that only says what happened', () => {
  it('passes, so the guard is a door and not a wall', () => {
    const outcome = checkDebrief(GOOD, evidence, prompt);
    expect(outcome.ok, outcome.ok ? '' : outcome.problems.join(' | ')).toBe(true);
    if (outcome.ok) expect(outcome.text).toBe(GOOD);
  });
});

describe('a reply that invents', () => {
  it('refuses a number the trace never produced', () => {
    // The whole product in one assertion. `73` is a plausible minute and a complete fabrication.
    expect(problemsOf('ضغطت عليهم من الدقيقة 73 لحد الآخر.')).toContainEqual(
      expect.stringContaining('73'),
    );
  });

  it('refuses a statistic the trace does not carry, even with no number on it', () => {
    // The trace has no possession, no xG and no passing. "They had most of the possession" is
    // invented whether or not a percentage is attached.
    expect(problemsOf('كان الاستحواذ معاهم أغلب الماتش.')).toContainEqual(
      expect.stringContaining('الاستحواذ'),
    );
    expect(problemsOf('Their xG was the story.', english, englishPrompt)).toContainEqual(
      expect.stringContaining('xG'),
    );
  });

  it('refuses a cause that did not happen in this match', () => {
    // `busy` contains no red card. A debrief that names one has invented a reason.
    expect(problemsOf('كارت أحمر غيّر الماتش.')).toContainEqual(
      expect.stringContaining('RED_CARD'),
    );
  });

  it('refuses a reply longer than the evidence supports', () => {
    const wall = Array.from({ length: 9 }, () => 'كلام كتير من غير أي رقم.').join('\n\n');
    expect(problemsOf(wall)).toContainEqual(expect.stringContaining('paragraphs'));
  });

  it('refuses an empty reply rather than showing a blank debrief', () => {
    expect(problemsOf('   \n  ')).toEqual(['the model returned nothing']);
  });

  it('holds a quiet match to the tightest ceiling of all', () => {
    // Nothing turned the match, so there is nothing to write four paragraphs about.
    const quietEvidence = evidenceFromTrace(quiet, 'home', 'ar-EG');
    const quietPrompt = debriefPrompt(quietEvidence, NAMES);
    expect(quietPrompt.maxParagraphs).toBe(1);
    const two = 'الماتش عدى هادي.\n\nمفيش حاجة تتقال أكتر من كده.';
    expect(problemsOf(two, quietEvidence, quietPrompt).length).toBeGreaterThan(0);
  });
});

describe('asking for one', () => {
  it('returns the checked text when the transport behaves', async () => {
    const transport: DebriefTransport = async () => GOOD;
    await expect(requestDebrief(transport, prompt, evidence)).resolves.toEqual({
      ok: true,
      text: GOOD,
    });
  });

  it('turns a transport failure into an outcome, never an exception', async () => {
    // The network is allowed to be down. The screen's answer is the same as for a bad reply: show
    // the trace, say the debrief is not available, do not guess.
    const transport: DebriefTransport = async () => {
      throw new Error('upstream refused');
    };
    const outcome = await requestDebrief(transport, prompt, evidence);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.problems.join(' ')).toContain('upstream refused');
  });

  it('never hands back text it has not checked', async () => {
    const transport: DebriefTransport = async () => 'ضغطت من الدقيقة 73.';
    const outcome = await requestDebrief(transport, prompt, evidence);
    expect(outcome.ok).toBe(false);
  });

  it('asks the transport exactly once, with the prompt it was given', async () => {
    const transport = vi.fn<DebriefTransport>(async () => GOOD);
    await requestDebrief(transport, prompt, evidence);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledWith(prompt);
  });
});

describe('the cache key', () => {
  it('is the same for the same match and different for anything that changes it', () => {
    const base = {
      engineVersion: ENGINE_VERSION,
      seed: 'matoubas-v-ashmoun',
      side: 'home',
      locale: 'ar-EG',
    } as const;
    expect(debriefCacheKey(base)).toBe(debriefCacheKey({ ...base }));
    const keys = new Set([
      debriefCacheKey(base),
      debriefCacheKey({ ...base, seed: 'other' }),
      debriefCacheKey({ ...base, side: 'away' }),
      debriefCacheKey({ ...base, locale: 'en' }),
      debriefCacheKey({ ...base, engineVersion: '99.0.0' }),
    ]);
    expect(keys.size).toBe(5);
  });

  it('includes the engine version, because a rebalanced engine changes the match', () => {
    // Without it, last week's debrief describes a match that no longer happens for this seed.
    expect(
      debriefCacheKey({
        engineVersion: ENGINE_VERSION,
        seed: 's',
        side: 'home',
        locale: 'en',
      }),
    ).toContain(ENGINE_VERSION);
  });
});
