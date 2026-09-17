/**
 * The two locales, closed (ADR-003).
 *
 * `ar-EG` and `en` ship together from the first screen, and neither is a translation of the other.
 * The union is closed so that every table keyed by locale — cause labels, dictionaries, anything
 * added later — fails the build rather than silently missing a language.
 */
export const LOCALES = ['ar-EG', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'ar-EG';

/** Direction is a property of the locale, read at runtime. There is no RTL build and no LTR build. */
export const DIRECTION: Record<Locale, 'rtl' | 'ltr'> = {
  'ar-EG': 'rtl',
  en: 'ltr',
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}
