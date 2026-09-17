import { describe, expect, it } from 'vitest';
import { ALL_CAUSES, CAUSE_REGISTRY } from '@dakka/engine';
import {
  CAUSE_LABEL,
  DICTIONARIES,
  DIRECTION,
  LOCALES,
  isLocale,
  translator,
} from '../src/i18n/index.js';

/**
 * ADR-003 is a structural decision, so these are structural tests.
 *
 * The compiler already refuses a dictionary that is missing a key and a cause that is missing a
 * locale. These check the things a cast could still get past — an empty string, a phrasing shared
 * between the two languages, an Arabic-Indic digit — and they check that the second locale is a
 * real second locale rather than the first one wearing a label.
 */

describe('both locales, from the first screen', () => {
  it('has exactly two, closed', () => {
    expect(LOCALES).toEqual(['ar-EG', 'en']);
    expect(isLocale('ar-EG')).toBe(true);
    expect(isLocale('fr')).toBe(false);
  });

  it('reads direction from the locale, not from a build', () => {
    expect(DIRECTION['ar-EG']).toBe('rtl');
    expect(DIRECTION.en).toBe('ltr');
  });

  it('gives every key a value in both languages', () => {
    const arabic = Object.keys(DICTIONARIES['ar-EG']).sort();
    const english = Object.keys(DICTIONARIES.en).sort();
    expect(arabic).toEqual(english);
    expect(arabic.length).toBeGreaterThan(50);
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(DICTIONARIES[locale])) {
        expect(value.trim(), `${locale}.${key}`).not.toBe('');
      }
    }
  });

  it('writes the English rather than translating it', () => {
    // Not a style note — ADR-003 §2. If the two files agree on a sentence, one of them was produced
    // from the other, and a translated debrief reads like a translation. Names of things that are
    // the same in both scripts are the exception, and they are listed rather than inferred.
    const sameOnPurpose = new Set(['locale.ar-EG', 'locale.en', 'stat.xg']);
    const shared = Object.keys(DICTIONARIES.en).filter(
      (key) =>
        !sameOnPurpose.has(key) &&
        DICTIONARIES.en[key as keyof typeof DICTIONARIES.en] ===
          DICTIONARIES['ar-EG'][key as keyof typeof DICTIONARIES.en],
    );
    expect(shared).toEqual([]);
  });

  it('keeps digits Latin in both locales', () => {
    // `dakka-arabic-voice` rule 2. Arabic-Indic digits would also break `tabular-nums` alignment
    // against the Latin ones, so a single stray digit is visible as well as wrong.
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(DICTIONARIES[locale])) {
        expect(/[٠-٩۰-۹]/.test(value), `${locale}.${key}`).toBe(false);
      }
    }
  });
});

describe('the cause table', () => {
  it('names every cause the engine can emit, in both languages', () => {
    expect(Object.keys(CAUSE_LABEL).sort()).toEqual([...ALL_CAUSES].sort());
    for (const cause of ALL_CAUSES) {
      for (const locale of LOCALES) {
        expect(CAUSE_LABEL[cause][locale].trim(), `${cause}.${locale}`).not.toBe('');
      }
    }
  });

  it('gives each cause its own phrasing, so two reasons never read the same', () => {
    for (const locale of LOCALES) {
      const phrasings = Object.values(CAUSE_LABEL).map((entry) => entry[locale]);
      expect(new Set(phrasings).size, locale).toBe(phrasings.length);
    }
  });

  it('covers the registry exactly — an unregistered cause cannot be narrated', () => {
    expect(Object.keys(CAUSE_LABEL).sort()).toEqual(Object.keys(CAUSE_REGISTRY).sort());
  });
});

describe('numbers stay out of sentences', () => {
  it('interpolates only what is on this list, and nothing signed', () => {
    // A signed number substituted into Arabic prose renders as `0.42+` — the sign detaches and
    // lands on the wrong end of the value. `+0.42` shown as `0.42+` is not a typographic nit: it
    // is a swing towards you displayed as one against you. The fix is that such numbers are their
    // own isolated element, so every new placeholder has to justify itself here first.
    const allowed: Record<string, string> = {
      'stat.open': 'a translated word, no digits',
      'cf.runs': 'an unsigned count, no sign to misplace',
    };
    const interpolating = LOCALES.flatMap((locale) =>
      Object.entries(DICTIONARIES[locale])
        .filter(([, value]) => /\{\w+\}/.test(value))
        .map(([key]) => key),
    );
    expect([...new Set(interpolating)].sort()).toEqual(Object.keys(allowed).sort());
  });
});

describe('the translator', () => {
  it('substitutes parameters and leaves unknown ones visible', () => {
    const t = translator('en');
    expect(t('cf.runs', { n: 200 })).toBe('200 replays');
    expect(t('stat.open', { stat: 'Shots' })).toBe('Open Shots and see where it came from');
    // A placeholder left on screen is a bug someone will report. A silently empty one is not.
    expect(t('cf.runs')).toContain('{n}');
  });

  it('answers in the locale it was built for', () => {
    expect(translator('ar-EG')('result.fullTime')).toBe('نهاية الماتش');
    expect(translator('en')('result.fullTime')).toBe('Full time');
  });
});
