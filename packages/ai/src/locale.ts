/**
 * The languages this product speaks (ADR-003).
 *
 * One closed union, defined here and imported everywhere — the UI re-exports it rather than
 * declaring its own. Two unions would be two lists that drift, and every guard built on
 * `Record<Locale, …>` is only as closed as the union it keys on.
 *
 * It lives in the AI package because this is the layer that *produces* language: the debrief, the
 * press conference, the commentary. Everything else consumes a locale; this is what has to be able
 * to write in one.
 */
export const LOCALES = ['ar-EG', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'ar-EG';

/** Direction is a property of the locale, read at runtime. No RTL build, no LTR build. */
export const DIRECTION: Record<Locale, 'rtl' | 'ltr'> = {
  'ar-EG': 'rtl',
  en: 'ltr',
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}
