import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_CAUSES, CAUSE_REGISTRY, type CauseTag } from '@dakka/engine';
import {
  LOCALES,
  PHRASINGS,
  debriefPrompt,
  evidenceFromTrace,
  numbersInText,
  paragraphsFor,
} from '../src/index.js';
import { goldens, renderGolden } from './golden.js';
import { busy, thin, quiet, unnamed, NAMES } from './prompt-fixtures.js';

/**
 * The three properties the box asks for, each checked rather than asserted in a comment.
 *
 * The golden files are the readable half: a human can open `busy.ar-EG.txt` and see exactly what a
 * model would be handed. The tests below are the half a human cannot do by eye — that no digit in
 * the evidence came from anywhere but the trace, that no cause outside the trace is named, and that
 * a thin trace really does produce less rather than the same prompt with fewer facts in it.
 */

const GOLDEN = join(import.meta.dirname, 'golden');

const promptFor = (trace: Parameters<typeof evidenceFromTrace>[0], locale: 'ar-EG' | 'en') =>
  debriefPrompt(evidenceFromTrace(trace, 'home', locale), NAMES);

describe('the golden prompts', () => {
  it('match what is checked in, exactly', () => {
    for (const { name, text } of goldens()) {
      const onDisk = readFileSync(join(GOLDEN, `${name}.txt`), 'utf8');
      expect(text, `${name}.txt — regenerate with \`pnpm --filter @dakka/ai golden\``).toBe(onDisk);
    }
  });

  it('gives the same prompt every time it is built', () => {
    const run = () => renderGolden(promptFor(busy, 'ar-EG'));
    expect(run()).toBe(run());
  });
});

describe('every number in the evidence came from the trace', () => {
  it('shows only minutes the trace recorded and counts of what it recorded', () => {
    // The competitor's failure in one assertion. A digit in this block that the trace did not
    // produce is a fabricated statistic, whatever sentence it is wearing.
    for (const trace of [busy, thin, quiet, unnamed]) {
      for (const locale of LOCALES) {
        const evidence = evidenceFromTrace(trace, 'home', locale);
        const minutes = new Set(evidence.moments.map((m) => Math.round(m.minute)));
        const counts = new Set(
          [...new Set(evidence.moments.map((m) => m.cause))].map(
            (cause) => evidence.moments.filter((m) => m.cause === cause).length,
          ),
        );
        for (const value of numbersInText(debriefPrompt(evidence, NAMES).evidence)) {
          expect(
            minutes.has(value) || counts.has(value),
            `${locale}: ${value} is neither a minute nor a count from the trace`,
          ).toBe(true);
        }
      }
    }
  });

  it('keeps match facts out of the instructions', () => {
    // If a minute could leak into the system or task block, the assertion above would be checking
    // the wrong part of the prompt and would keep passing while the guarantee failed.
    const prompt = promptFor(busy, 'en');
    const minutes = busy.swings.map((s) => s.minute);
    for (const block of [prompt.system, prompt.task]) {
      for (const value of numbersInText(block)) {
        expect(minutes, `${value} leaked out of the evidence block`).not.toContain(value);
      }
    }
  });
});

describe('every cause named is one the engine emitted', () => {
  it('names no cause the trace does not contain', () => {
    const present = new Set<CauseTag>(busy.swings.map((s) => s.cause));
    for (const locale of LOCALES) {
      const { evidence } = promptFor(busy, locale);
      for (const cause of ALL_CAUSES) {
        if (present.has(cause)) continue;
        const phrasing = PHRASINGS[cause][locale];
        expect(evidence.includes(phrasing.label), `${cause} label`).toBe(false);
        const lesson = phrasing.lesson;
        if (lesson !== undefined) expect(evidence.includes(lesson), `${cause} lesson`).toBe(false);
      }
    }
  });

  it('offers a lesson only for the controllable causes that actually happened', () => {
    for (const locale of LOCALES) {
      const { evidence } = promptFor(busy, locale);
      for (const cause of new Set(busy.swings.map((s) => s.cause))) {
        const lesson = PHRASINGS[cause][locale].lesson;
        const controllable = CAUSE_REGISTRY[cause].agency === 'controllable';
        expect(lesson !== undefined, cause).toBe(controllable);
        if (lesson !== undefined) expect(evidence.includes(lesson), cause).toBe(true);
      }
    }
  });

  it('collapses a repeated cause instead of saying it three times', () => {
    // `WASTEFUL_FINISHING` three times must produce one line. The voice rules forbid the repeat,
    // and the engine does this in most matches.
    for (const locale of LOCALES) {
      const { evidence } = promptFor(busy, locale);
      // The tail after the last slot, because every Arabic `one` form opens with
      // "في الدقيقة" — using the prefix would count the other causes' lines and pass for the
      // wrong reason, which is exactly what it did on the first run.
      const template = PHRASINGS.WASTEFUL_FINISHING[locale].one;
      const tail = template.slice(template.lastIndexOf('}') + 1).trim();
      expect(tail.length, 'the discriminator must be distinctive').toBeGreaterThan(8);
      const repeats = evidence.split(tail).length - 1;
      expect(repeats, `${locale} repeated the single form`).toBeLessThanOrEqual(1);
      expect(evidence).toContain('18, 44, 68');
    }
  });
});

describe('a thin trace makes a short prompt', () => {
  it('asks for less when it has less', () => {
    expect(paragraphsFor(0)).toBe(1);
    expect(paragraphsFor(1)).toBe(2);
    expect(paragraphsFor(6)).toBe(4);
    expect(promptFor(quiet, 'en').maxParagraphs).toBeLessThan(promptFor(busy, 'en').maxParagraphs);
    expect(promptFor(thin, 'en').evidence.length).toBeLessThan(
      promptFor(busy, 'en').evidence.length,
    );
  });

  it('says a quiet match was quiet rather than filling the gap', () => {
    const prompt = promptFor(quiet, 'ar-EG');
    expect(prompt.moments).toBe(0);
    expect(prompt.maxParagraphs).toBe(1);
    expect(prompt.evidence).toContain('ما اتقلبش');
  });
});

describe('nothing is left half-written', () => {
  it('never leaves a slot unfilled anywhere in the prompt', () => {
    for (const trace of [busy, thin, quiet, unnamed]) {
      for (const locale of LOCALES) {
        const prompt = promptFor(trace, locale);
        for (const block of [prompt.system, prompt.evidence, prompt.task]) {
          expect(block, `${locale}`).not.toMatch(/\{\w+\}/);
        }
      }
    }
  });

  it('falls back to the label rather than guessing a name the trace did not give', () => {
    // `CLINICAL_FINISHING` wants an actor. When the trace names nobody, the sentence is not
    // written with an invented subject and not written with a hole in it.
    const { evidence } = promptFor(unnamed, 'en');
    expect(evidence).toContain('22 — Clinical in front of goal');
    expect(evidence).not.toContain('took it first time');
  });

  it('uses the name when the trace does give one', () => {
    expect(promptFor(busy, 'en').evidence).toContain('رزق');
  });
});
