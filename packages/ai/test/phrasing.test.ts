import { describe, expect, it } from 'vitest';
import { ALL_CAUSES, CAUSE_REGISTRY } from '@dakka/engine';
import { LOCALES, PHRASINGS, causeLabel, isControllable } from '../src/index.js';
import type { Phrasing } from '../src/index.js';

/**
 * The table the model narrates from.
 *
 * The compiler already refuses a missing cause or a missing locale. These check the things a cast
 * could still get past, and the things that make the difference between a coach talking and a
 * template firing: that the two languages were written separately, that no two causes read the
 * same, that advice is attached only where the manager had a choice, and that the Arabic is
 * Egyptian rather than the news bulletin that `dakka-arabic-voice` exists to prevent.
 */

const every = (fn: (phrasing: Phrasing, where: string) => void): void => {
  for (const cause of ALL_CAUSES) {
    for (const locale of LOCALES) fn(PHRASINGS[cause][locale], `${cause}.${locale}`);
  }
};

describe('the table is complete and closed', () => {
  it('phrases every cause the engine can emit, in both languages', () => {
    expect(Object.keys(PHRASINGS).sort()).toEqual([...ALL_CAUSES].sort());
    every((phrasing, where) => {
      expect(phrasing.label.trim(), `${where}.label`).not.toBe('');
      expect(phrasing.one.trim(), `${where}.one`).not.toBe('');
      expect(phrasing.many.trim(), `${where}.many`).not.toBe('');
    });
  });

  it('gives each cause its own wording, so two reasons never read the same', () => {
    for (const locale of LOCALES) {
      for (const field of ['label', 'one', 'many'] as const) {
        const said = ALL_CAUSES.map((cause) => PHRASINGS[cause][locale][field]);
        expect(new Set(said).size, `${locale}.${field}`).toBe(said.length);
      }
    }
  });

  it('was written twice, not translated once', () => {
    // ADR-003 §2. A shared string means one file was produced from the other, and a debrief
    // translated from Arabic reads like a translation in English.
    for (const cause of ALL_CAUSES) {
      const arabic = PHRASINGS[cause]['ar-EG'];
      const english = PHRASINGS[cause].en;
      for (const field of ['label', 'one', 'many'] as const) {
        expect(arabic[field], `${cause}.${field}`).not.toBe(english[field]);
      }
    }
  });
});

describe('advice only where there was a choice', () => {
  it('carries a lesson for every controllable cause and none of the others', () => {
    // Advice attached to something the manager could not have changed is noise, and worse, it
    // implies a control that does not exist — which is its own kind of fabrication.
    for (const cause of ALL_CAUSES) {
      for (const locale of LOCALES) {
        const lesson = PHRASINGS[cause][locale].lesson;
        expect(lesson !== undefined, `${cause}.${locale}`).toBe(isControllable(cause));
        if (lesson !== undefined) expect(lesson.trim()).not.toBe('');
      }
    }
  });

  it('reads agency from the registry rather than keeping its own copy', () => {
    for (const cause of ALL_CAUSES) {
      expect(isControllable(cause)).toBe(CAUSE_REGISTRY[cause].agency === 'controllable');
    }
  });

  it('writes each lesson once per language', () => {
    for (const locale of LOCALES) {
      const lessons = ALL_CAUSES.map((c) => PHRASINGS[c][locale].lesson).filter(
        (l): l is string => l !== undefined,
      );
      expect(new Set(lessons).size, locale).toBe(lessons.length);
    }
  });
});

describe('the slots', () => {
  const slots = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '');

  it('anchors every single occurrence to a minute', () => {
    // A claim with no minute on it cannot be checked against the trace, which is the only thing
    // that makes a debrief evidence rather than atmosphere.
    every((phrasing, where) => {
      expect(slots(phrasing.one), `${where}.one`).toContain('minute');
    });
  });

  it('uses only slots the evidence can fill', () => {
    every((phrasing, where) => {
      for (const slot of slots(phrasing.one)) {
        expect(['minute', 'actor'], `${where}.one {${slot}}`).toContain(slot);
      }
      expect(slots(phrasing.many), `${where}.many`).toEqual(['count']);
      const lesson = phrasing.lesson;
      if (lesson !== undefined) expect(slots(lesson), `${where}.lesson`).toEqual([]);
    });
  });

  it('never puts a count in a single occurrence, or a minute in a collapsed one', () => {
    every((phrasing, where) => {
      expect(slots(phrasing.one), `${where}.one`).not.toContain('count');
      expect(slots(phrasing.many), `${where}.many`).not.toContain('minute');
    });
  });
});

describe('the Arabic is Egyptian, and both languages use Latin digits', () => {
  it('has no Arabic-Indic digits anywhere', () => {
    every((phrasing, where) => {
      for (const field of ['label', 'one', 'many', 'lesson'] as const) {
        const text = phrasing[field];
        if (text !== undefined) {
          expect(/[٠-٩۰-۹]/.test(text), `${where}.${field}`).toBe(false);
        }
      }
    });
  });

  it('avoids the words that mark Modern Standard Arabic', () => {
    // A heuristic, not a language model: each of these has an everyday Egyptian equivalent that a
    // coach on the touchline would use instead — اللي for التي, ده for هذا, مش for ليس, ه‍ـ for
    // سوف. It catches the obvious drift into a news bulletin, which is the failure mode that
    // `dakka-arabic-voice` opens with. It cannot certify that the rest is good Egyptian.
    const msa = ['التي', 'الذي', 'هذا', 'هذه', 'ذلك', 'ليس', 'سوف', 'يُنصح', 'لم يتم', 'قد تم'];
    for (const cause of ALL_CAUSES) {
      const phrasing = PHRASINGS[cause]['ar-EG'];
      const text = [phrasing.label, phrasing.one, phrasing.many, phrasing.lesson ?? ''].join(' ');
      for (const word of msa) {
        expect(text.includes(word), `${cause} contains MSA marker "${word}"`).toBe(false);
      }
    }
  });

  it('keeps the label short enough to sit beside a minute on a phone', () => {
    every((phrasing, where) => {
      expect(phrasing.label.length, `${where}.label`).toBeLessThanOrEqual(40);
    });
  });
});

describe('what the trace screen asks for', () => {
  it('hands back the label for a cause and a locale', () => {
    expect(causeLabel('RED_CARD', 'ar-EG')).toBe('كارت أحمر');
    expect(causeLabel('RED_CARD', 'en')).toBe('Red card');
  });
});
