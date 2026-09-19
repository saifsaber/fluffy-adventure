import { arEG } from './ar-EG.js';
import { en } from './en.js';
import type { Dictionary, MessageKey } from './messages.js';
import type { Locale } from './locale.js';

export { DEFAULT_LOCALE, DIRECTION, LOCALES, isLocale } from './locale.js';
export type { Locale } from './locale.js';
export type { Dictionary, MessageKey, Messages } from './messages.js';

export const DICTIONARIES: Record<Locale, Dictionary> = {
  'ar-EG': arEG,
  en,
};

/** Substituted into a message value where it appears as `{name}`. */
export type MessageParams = Readonly<Record<string, string | number>>;

export type Translate = (key: MessageKey, params?: MessageParams) => string;

/**
 * The only way a string reaches the screen.
 *
 * Deliberately tiny: no plural rules, no date formats, no fallback chain. Arabic plurals are a real
 * problem and will need a real answer, but inventing one before a single screen needs it would be
 * guessing at the shape. When a message needs a plural, that is the moment to add it.
 */
export function translator(locale: Locale): Translate {
  const dictionary = DICTIONARIES[locale];
  return (key, params) => {
    const value = dictionary[key];
    if (params === undefined) return value;
    return value.replace(/\{(\w+)\}/g, (whole, name: string) => {
      const replacement = params[name];
      return replacement === undefined ? whole : String(replacement);
    });
  };
}
